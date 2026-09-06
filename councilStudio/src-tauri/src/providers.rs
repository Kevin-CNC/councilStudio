//! Provider API layer.
//!
//! Two public methods, each written once and usable for every provider:
//! - `chat_completion` — one chat call to any provider (anthropic, openai,
//!   openrouter, ollama). The provider is a parameter, not a separate function.
//! - `judge_call` — the judge synthesis call. Reuses `chat_completion` and
//!   parses the structured JSON verdict.

use crate::cmds::{Citation, Diagram, JudgeResult, PersonaResult, RunAttachment, Table};
use crate::pricing;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Request / response wire shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    system: String,
    messages: Vec<Message>,
    max_tokens: i64,
    temperature: f64,
}

#[derive(Serialize)]
struct OpenAiRequest {
    // Same shape for OpenAI and OpenRouter
    model: String,
    messages: Vec<Message>,
    max_tokens: i64,
    temperature: f64,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    messages: Vec<Message>,
    stream: bool,
    options: OllamaOptions,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f64,
    num_predict: i64,
}

/// Message content: a plain string in the text-only path (byte-for-byte
/// identical to the original wire format), or an array of provider-specific
/// content blocks when image attachments are present.
#[derive(Serialize, Clone)]
#[serde(untagged)]
enum UserMessageContent {
    Text(String),
    Blocks(Vec<serde_json::Value>),
}

#[derive(Serialize, Clone)]
struct Message {
    role: String,
    content: UserMessageContent,
    /// Ollama-only: bare base64 image data. Omitted entirely when empty, so
    /// Anthropic/OpenAI/OpenRouter request bodies are unaffected.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    images: Vec<String>,
}

impl Message {
    fn text(role: &str, content: &str) -> Self {
        Message {
            role: role.to_string(),
            content: UserMessageContent::Text(content.to_string()),
            images: Vec::new(),
        }
    }
}

/// Strip a "data:<mime>;base64,<data>" prefix if present, returning bare base64.
fn bare_base64(data: &str) -> &str {
    match data.find(',') {
        Some(idx) if data.starts_with("data:") => &data[idx + 1..],
        _ => data,
    }
}

/// Ensure a full "data:<mime>;base64,<data>" URL, building one if given bare base64.
fn to_data_url(mime: &str, data: &str) -> String {
    if data.starts_with("data:") {
        data.to_string()
    } else {
        format!("data:{mime};base64,{data}")
    }
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContent>,
    usage: AnthropicUsage,
}

#[derive(Deserialize)]
struct AnthropicContent {
    text: String,
}

#[derive(Deserialize)]
struct AnthropicUsage {
    input_tokens: u64,
    output_tokens: u64,
    #[serde(default)]
    cache_read_input_tokens: u64,
    #[serde(default)]
    cache_creation_input_tokens: u64,
}

#[derive(Deserialize)]
struct OpenAiResponse {
    choices: Vec<OpenAiChoice>,
    usage: OpenAiUsage,
}

#[derive(Deserialize)]
struct OpenAiChoice {
    message: MessageContent,
}

#[derive(Deserialize)]
struct MessageContent {
    content: String,
}

/// Deserialize an optional f64 from either a JSON number or numeric string.
fn f64_opt<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum NumberOrString {
        F(f64),
        S(String),
    }
    Ok(match Option::<NumberOrString>::deserialize(deserializer)? {
        None => None,
        Some(NumberOrString::F(f)) => Some(f),
        Some(NumberOrString::S(s)) => s.parse::<f64>().ok(),
    })
}

#[derive(Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
    #[allow(dead_code)]
    #[serde(default)]
    total_tokens: u64,
    /// OpenRouter reports `usage.cost`; OpenAI omits it.
    #[serde(default, deserialize_with = "f64_opt")]
    cost: Option<f64>,
}

#[derive(Deserialize)]
struct OllamaResponse {
    message: OllamaMessage,
    prompt_eval_count: Option<u64>,
    eval_count: Option<u64>,
}

#[derive(Deserialize)]
struct OllamaMessage {
    content: String,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// One provider-independent chat call. Everything the call needs comes in
/// through this struct — the caller never branches on provider.
pub struct ChatRequest<'a> {
    pub provider: &'a str,
    /// API key. Required for anthropic/openai/openrouter, ignored for ollama.
    pub api_key: Option<&'a str>,
    /// Base URL. Ollama only; defaults to http://localhost:11434.
    pub base_url: Option<&'a str>,
    pub model: &'a str,
    pub system_prompt: &'a str,
    pub user_prompt: &'a str,
    pub temperature: f64,
    pub max_tokens: i64,
    /// Image attachments for this call. Empty by default — the request body
    /// is byte-for-byte identical to the text-only path when empty.
    pub attachments: &'a [RunAttachment],
}

/// Make one chat completion call to any supported provider.
/// Returns a PersonaResult with `persona_id`/`persona_name` empty — the
/// orchestrator fills those in.
pub async fn chat_completion(
    client: &reqwest::Client,
    req: ChatRequest<'_>,
) -> Result<PersonaResult, String> {
    let started_at = now_millis();

    let (content, usage, raw_response) = match req.provider {
        "anthropic" => {
            let key = req
                .api_key
                .ok_or("No Anthropic API key configured".to_string())?;
            call_anthropic_wire(client, key, &req).await?
        }
        "openai" => {
            let key = req
                .api_key
                .ok_or("No OpenAI API key configured".to_string())?;
            call_openai_wire(
                client,
                key,
                "https://api.openai.com/v1/chat/completions",
                &req,
            )
            .await?
        }
        "openrouter" => {
            let key = req
                .api_key
                .ok_or("No OpenRouter API key configured".to_string())?;
            call_openai_wire(
                client,
                key,
                "https://openrouter.ai/api/v1/chat/completions",
                &req,
            )
            .await?
        }
        "ollama" => {
            let url = req
                .base_url
                .unwrap_or("http://localhost:11434")
                .trim_end_matches('/')
                .to_string();
            call_ollama_wire(client, &url, &req).await?
        }
        other => return Err(format!("Unknown provider: {other}")),
    };

    let completed_at = now_millis();
    let cost = pricing::resolve_cost(client, req.provider, req.model, &usage).await;

    // Harness: strip the trailing ```references fence into typed citations and
    // ```table fences into typed tables, leaving mermaid fences and
    // `[{n}]`/`{{@Name}}`/`{{table:n}}` markers in the content.
    let (content, citations, tables) = crate::harness::parse_persona_response(&content);

    Ok(PersonaResult {
        persona_id: String::new(),   // filled by orchestrator
        persona_name: String::new(), // filled by orchestrator
        provider: req.provider.to_string(),
        model: req.model.to_string(),
        status: "completed".to_string(),
        content,
        error: None,
        tokens_in: usage.prompt_tokens,
        tokens_out: usage.completion_tokens,
        latency_ms: completed_at - started_at,
        cost: cost.total,
        input_cost: cost.input_cost,
        output_cost: cost.output_cost,
        started_at,
        completed_at: Some(completed_at),
        raw_response: Some(raw_response),
        citations, // persona_id filled by orchestrator
        tables,    // persona_id filled by orchestrator
    })
}

const JUDGE_SYSTEM_PROMPT: &str = "You are a council judge. Your job is to synthesize multiple AI persona responses into a structured evaluation. Respond with ONLY a single JSON object. Begin with `{`, end with `}`. No markdown, no code fences, no prose. Minimal example: {\"summary\":\"…\",\"consensus\":[],\"disagreements\":[],\"minority_views\":[],\"recommendations\":[],\"confidence_score\":50,\"synthesis\":\"…\",\"diagrams\":[],\"citations\":[],\"tables\":[],\"missing_personas\":[]}. Always output valid JSON with the fields: summary, consensus, disagreements, minority_views, recommendations, confidence_score, synthesis, diagrams, citations, tables, missing_personas. Never omit a field. `diagrams` is an array of {\"id\",\"code\",\"caption\"} where `code` is raw mermaid source (no fences) — only include a diagram if one genuinely helps. `citations` is an array of {\"id\",\"source\",\"url\",\"excerpt\"} for external sources referenced in your text via [{n}] markers. `tables` is an array of {\"id\",\"caption\",\"columns\":[\"...\"],\"rows\":[[\"...\"]]} for structured comparison data (each row has one cell per column) — emit [] when nothing tabular helps. `missing_personas` is an array of the persona names that failed or produced no usable response. `summary` and `synthesis` are markdown and may contain ```mermaid fences, [{n}] citation markers and ```table fenced blocks (a ```table fence holds ONE JSON object {\"caption\",\"columns\",\"rows\"}). Never emit raw HTML.";

/// Tolerant wire shape for the judge's JSON verdict. The judge model emits
/// snake_case keys and no token/latency fields, so this is kept separate from
/// the camelCase `JudgeResult` sent to the frontend. Every field defaults so
/// a partial response still parses.
#[derive(Deserialize, Default)]
struct JudgeVerdict {
    #[serde(default, alias = "summary")]
    summary: String,
    #[serde(default, alias = "consensus")]
    consensus: Vec<String>,
    #[serde(default, alias = "disagreements")]
    disagreements: Vec<String>,
    #[serde(default, alias = "minorityViews")]
    minority_views: Vec<String>,
    #[serde(default, alias = "recommendations")]
    recommendations: Vec<String>,
    #[serde(default, alias = "confidenceScore")]
    confidence_score: f64,
    #[serde(default, alias = "synthesis")]
    synthesis: String,
    #[serde(default, alias = "diagrams")]
    diagrams: Vec<Diagram>,
    #[serde(default, alias = "citations")]
    citations: Vec<Citation>,
    #[serde(default, alias = "tables")]
    tables: Vec<Table>,
    #[serde(default, alias = "missingPersonas")]
    missing_personas: Vec<String>,
}

/// Extract the first {...} block — judges often add prose around the JSON.
fn extract_json_object(s: &str) -> &str {
    let cleaned = strip_code_fences(s);
    match (cleaned.find('{'), cleaned.rfind('}')) {
        (Some(start), Some(end)) if end > start => &cleaned[start..=end],
        _ => cleaned,
    }
}

/// Parse the judge's JSON verdict out of possibly fenced/prose-wrapped content.
fn parse_judge_json(content: &str) -> Result<JudgeVerdict, serde_json::Error> {
    serde_json::from_str::<JudgeVerdict>(extract_json_object(content))
}

/// Build a structured JudgeResult from a parsed verdict. ```references fence
/// citations and ```table fences in `summary`/`synthesis` are captured (not
/// discarded) and merged with the JSON arrays; citations are deduped by
/// (id, source) because duplicate ids break the frontend `#cit-{id}` chip
/// mapping. `{{table:n}}` markers are renumbered across both fields.
#[allow(clippy::too_many_arguments)]
fn assemble_structured_judge(
    v: JudgeVerdict,
    tokens_in: u64,
    tokens_out: u64,
    cost: f64,
    raw_response: Option<String>,
    started_at: u64,
    completed_at: u64,
) -> JudgeResult {
    let (summary, summary_citations, mut summary_tables) =
        crate::harness::parse_persona_response(&v.summary);
    let (synthesis_raw, synthesis_citations, synthesis_tables) =
        crate::harness::parse_persona_response(&v.synthesis);
    let synthesis = crate::harness::shift_table_markers(&synthesis_raw, summary_tables.len());
    let mut tables = Vec::new();
    tables.append(&mut summary_tables);
    tables.extend(synthesis_tables);
    tables.extend(v.tables);
    for t in tables.iter_mut() {
        t.persona_id = "judge".to_string();
    }
    let mut citations = v.citations;
    citations.extend(summary_citations);
    citations.extend(synthesis_citations);
    let mut seen = std::collections::HashSet::new();
    citations.retain(|c| seen.insert((c.id.clone(), c.source.clone())));
    for c in citations.iter_mut() {
        c.persona_id = "judge".to_string();
    }
    JudgeResult {
        summary,
        consensus: v.consensus,
        disagreements: v.disagreements,
        minority_views: v.minority_views,
        recommendations: v.recommendations,
        confidence_score: v.confidence_score.round().clamp(0.0, 100.0) as u32,
        synthesis,
        tokens_in,
        tokens_out,
        latency_ms: completed_at.saturating_sub(started_at),
        cost,
        raw_response,
        diagrams: v.diagrams,
        citations,
        tables,
        missing_personas: v.missing_personas,
        started_at,
        completed_at: Some(completed_at),
        structured: true,
    }
}

/// Headings the salvage heuristic recognizes (case-insensitive), plus their
/// structured-field target.
#[derive(PartialEq, Clone, Copy)]
enum SalvageSection {
    None,
    Summary,
    Synthesis,
    Consensus,
    Disagreements,
    Minority,
    Recommendations,
    Confidence,
}

fn salvage_section_for(heading: &str) -> SalvageSection {
    let h = heading
        .trim()
        .trim_start_matches('#')
        .trim()
        .trim_matches('*')
        .trim()
        .trim_end_matches(':')
        .to_lowercase();
    match h.as_str() {
        "summary" => SalvageSection::Summary,
        "synthesis" => SalvageSection::Synthesis,
        "consensus" | "agreement" | "agreements" | "areas of agreement" => {
            SalvageSection::Consensus
        }
        "disagreements" | "disagreement" | "differences" | "points of disagreement" => {
            SalvageSection::Disagreements
        }
        "minority views" | "minority view" => SalvageSection::Minority,
        "recommendations" | "recommendation" => SalvageSection::Recommendations,
        "confidence" | "confidence score" => SalvageSection::Confidence,
        _ => SalvageSection::None,
    }
}

/// Split accumulated section lines into list items: strip `-`/`*`/`•` bullets,
/// `N.`/`N)` numbering, and blank lines.
fn split_list_items(lines: &[&str]) -> Vec<String> {
    let mut items = Vec::new();
    for line in lines {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        let stripped = if let Some(rest) = t
            .strip_prefix("- ")
            .or_else(|| t.strip_prefix("* "))
            .or_else(|| t.strip_prefix("• "))
        {
            rest.trim()
        } else {
            let bytes = t.as_bytes();
            let mut i = 0;
            while i < bytes.len() && bytes[i].is_ascii_digit() {
                i += 1;
            }
            if i > 0
                && i + 1 < bytes.len()
                && (bytes[i] == b'.' || bytes[i] == b')')
                && bytes[i + 1] == b' '
            {
                t[i + 2..].trim()
            } else {
                t
            }
        };
        if !stripped.is_empty() {
            items.push(stripped.to_string());
        }
    }
    items
}

/// First `NN%` found in the accumulated confidence lines, clamped to 0–100.
fn parse_salvage_confidence(lines: &[&str]) -> Option<u32> {
    for line in lines {
        let bytes = line.as_bytes();
        for (i, &b) in bytes.iter().enumerate() {
            if b == b'%' {
                let mut start = i;
                while start > 0 && bytes[start - 1].is_ascii_digit() {
                    start -= 1;
                }
                if start < i {
                    if let Ok(n) = line[start..i].parse::<u32>() {
                        return Some(n.min(100));
                    }
                }
            }
        }
    }
    None
}

/// Fallback when the judge never produces valid JSON: run the standard
/// persona harness (harvesting ```table fences and citations), then
/// heuristically split markdown headings into the structured fields. With no
/// recognizable headings the raw text lands in `synthesis` and the result is
/// flagged `structured: false` so the UI can show a banner.
#[allow(clippy::too_many_arguments)]
fn salvage_unstructured_judge(
    content: &str,
    tokens_in: u64,
    tokens_out: u64,
    cost: f64,
    raw_response: Option<String>,
    started_at: u64,
    completed_at: u64,
) -> JudgeResult {
    let (text, mut citations, mut tables) = crate::harness::parse_persona_response(content);
    for c in citations.iter_mut() {
        c.persona_id = "judge".to_string();
    }
    for t in tables.iter_mut() {
        t.persona_id = "judge".to_string();
    }

    let mut summary_lines: Vec<&str> = Vec::new();
    let mut synthesis_lines: Vec<&str> = Vec::new();
    let mut consensus_lines: Vec<&str> = Vec::new();
    let mut disagreement_lines: Vec<&str> = Vec::new();
    let mut minority_lines: Vec<&str> = Vec::new();
    let mut recommendation_lines: Vec<&str> = Vec::new();
    let mut confidence_lines: Vec<&str> = Vec::new();

    let mut current = SalvageSection::None;
    let mut matched = false;
    for line in text.lines() {
        let trimmed = line.trim();
        let looks_like_heading = trimmed.starts_with('#')
            || (trimmed.starts_with("**") && trimmed.ends_with("**") && trimmed.len() > 4);
        if looks_like_heading {
            let section = salvage_section_for(trimmed);
            if section != SalvageSection::None {
                matched = true;
                current = section;
                continue;
            }
        }
        match current {
            SalvageSection::Summary => summary_lines.push(line),
            SalvageSection::Synthesis => synthesis_lines.push(line),
            SalvageSection::Consensus => consensus_lines.push(line),
            SalvageSection::Disagreements => disagreement_lines.push(line),
            SalvageSection::Minority => minority_lines.push(line),
            SalvageSection::Recommendations => recommendation_lines.push(line),
            SalvageSection::Confidence => confidence_lines.push(line),
            SalvageSection::None => {}
        }
    }

    if !matched {
        // No recognizable headings — keep the whole raw text in synthesis.
        return JudgeResult {
            summary: "Judge response (unstructured)".to_string(),
            consensus: vec![],
            disagreements: vec![],
            minority_views: vec![],
            recommendations: vec![],
            confidence_score: 50,
            synthesis: text,
            tokens_in,
            tokens_out,
            latency_ms: completed_at.saturating_sub(started_at),
            cost,
            raw_response,
            diagrams: vec![],
            citations,
            tables,
            missing_personas: vec![],
            started_at,
            completed_at: Some(completed_at),
            structured: false,
        };
    }

    let synthesis = synthesis_lines.join("\n").trim().to_string();
    let mut summary = summary_lines.join("\n").trim().to_string();
    if summary.is_empty() && !synthesis.is_empty() {
        // Fall back to a shortened synthesis so the summary card renders.
        summary = synthesis.chars().take(200).collect();
    }
    JudgeResult {
        summary,
        consensus: split_list_items(&consensus_lines),
        disagreements: split_list_items(&disagreement_lines),
        minority_views: split_list_items(&minority_lines),
        recommendations: split_list_items(&recommendation_lines),
        confidence_score: parse_salvage_confidence(&confidence_lines).unwrap_or(50),
        synthesis,
        tokens_in,
        tokens_out,
        latency_ms: completed_at.saturating_sub(started_at),
        cost,
        raw_response,
        diagrams: vec![],
        citations,
        tables,
        missing_personas: vec![],
        started_at,
        completed_at: Some(completed_at),
        // Sections recovered ⇒ structured, even though the raw judge output
        // was not JSON.
        structured: true,
    }
}

/// Judge call — provider-independent like `chat_completion`, with the judge
/// system prompt applied and the response parsed into a JudgeResult. A
/// non-JSON first response is retried once with a stricter instruction
/// (usage summed across both calls, retry raw response kept); a heuristic
/// salvage runs on the best content if the retry also fails. Timestamps and
/// latency reflect the total wall time including the retry.
pub async fn judge_call(
    client: &reqwest::Client,
    req: ChatRequest<'_>,
) -> Result<JudgeResult, String> {
    let started_at = now_millis();

    let first = chat_completion(
        client,
        ChatRequest {
            system_prompt: JUDGE_SYSTEM_PROMPT,
            ..req
        },
    )
    .await?;

    let mut tokens_in = first.tokens_in;
    let mut tokens_out = first.tokens_out;
    let mut cost = first.cost;
    let mut content = first.content.clone();
    let mut raw_response = first.raw_response.clone();
    let mut verdict = parse_judge_json(&first.content).ok();

    if verdict.is_none() {
        let retry_prompt = format!(
            "Your previous response was not valid JSON. Return ONLY a single valid JSON object beginning with '{{' and ending with '}}'. No markdown, no code fences, no prose.\n\n{}",
            req.user_prompt
        );
        if let Ok(second) = chat_completion(
            client,
            ChatRequest {
                system_prompt: JUDGE_SYSTEM_PROMPT,
                user_prompt: &retry_prompt,
                ..req
            },
        )
        .await
        {
            tokens_in += second.tokens_in;
            tokens_out += second.tokens_out;
            cost += second.cost;
            content = second.content;
            raw_response = second.raw_response;
            verdict = parse_judge_json(&content).ok();
        }
    }

    let completed_at = now_millis();

    Ok(match verdict {
        Some(v) => assemble_structured_judge(
            v,
            tokens_in,
            tokens_out,
            cost,
            raw_response,
            started_at,
            completed_at,
        ),
        None => salvage_unstructured_judge(
            &content,
            tokens_in,
            tokens_out,
            cost,
            raw_response,
            started_at,
            completed_at,
        ),
    })
}

// ---------------------------------------------------------------------------
// Wire-level helpers (private — the public surface stays provider-independent)
// ---------------------------------------------------------------------------

async fn call_anthropic_wire(
    client: &reqwest::Client,
    api_key: &str,
    req: &ChatRequest<'_>,
) -> Result<(String, pricing::Usage, String), String> {
    let user_message = if req.attachments.is_empty() {
        Message::text("user", req.user_prompt)
    } else {
        let mut blocks = vec![serde_json::json!({ "type": "text", "text": req.user_prompt })];
        for a in req.attachments {
            blocks.push(serde_json::json!({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": a.mime_type,
                    "data": bare_base64(&a.data_base64),
                }
            }));
        }
        Message {
            role: "user".to_string(),
            content: UserMessageContent::Blocks(blocks),
            images: Vec::new(),
        }
    };

    let body = AnthropicRequest {
        model: req.model.to_string(),
        system: req.system_prompt.to_string(),
        messages: vec![user_message],
        max_tokens: req.max_tokens,
        temperature: req.temperature,
    };

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Anthropic request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic HTTP {status}: {text}"));
    }

    let raw = resp
        .text()
        .await
        .map_err(|e| format!("Anthropic read body: {e}"))?;
    let data: AnthropicResponse =
        serde_json::from_str(&raw).map_err(|e| format!("Anthropic parse: {e}"))?;
    let content = data
        .content
        .first()
        .map(|c| c.text.clone())
        .unwrap_or_default();
    Ok((
        content,
        pricing::Usage {
            prompt_tokens: data.usage.input_tokens,
            completion_tokens: data.usage.output_tokens,
            cache_read_tokens: data.usage.cache_read_input_tokens,
            cache_write_tokens: data.usage.cache_creation_input_tokens,
            reported_cost: None,
        },
        raw.trim().to_string(),
    ))
}

async fn call_openai_wire(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
    req: &ChatRequest<'_>,
) -> Result<(String, pricing::Usage, String), String> {
    let user_message = if req.attachments.is_empty() {
        Message::text("user", req.user_prompt)
    } else {
        let mut blocks = vec![serde_json::json!({ "type": "text", "text": req.user_prompt })];
        for a in req.attachments {
            blocks.push(serde_json::json!({
                "type": "image_url",
                "image_url": { "url": to_data_url(&a.mime_type, &a.data_base64) }
            }));
        }
        Message {
            role: "user".to_string(),
            content: UserMessageContent::Blocks(blocks),
            images: Vec::new(),
        }
    };

    let body = OpenAiRequest {
        model: req.model.to_string(),
        messages: vec![Message::text("system", req.system_prompt), user_message],
        max_tokens: req.max_tokens,
        temperature: req.temperature,
    };

    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {api_key}"))
        .header("HTTP-Referer", "http://localhost")
        .header("X-Title", "AI Council")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("{} request failed: {e}", req.provider))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("{} HTTP {status}: {text}", req.provider));
    }

    let raw = resp
        .text()
        .await
        .map_err(|e| format!("{} read body: {e}", req.provider))?;
    let data: OpenAiResponse =
        serde_json::from_str(&raw).map_err(|e| format!("{} parse: {e}", req.provider))?;
    let content = data
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_default();
    Ok((
        content,
        pricing::Usage {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reported_cost: data.usage.cost,
        },
        raw.trim().to_string(),
    ))
}

async fn call_ollama_wire(
    client: &reqwest::Client,
    base_url: &str,
    req: &ChatRequest<'_>,
) -> Result<(String, pricing::Usage, String), String> {
    let user_message = if req.attachments.is_empty() {
        Message::text("user", req.user_prompt)
    } else {
        Message {
            role: "user".to_string(),
            content: UserMessageContent::Text(req.user_prompt.to_string()),
            images: req
                .attachments
                .iter()
                .map(|a| bare_base64(&a.data_base64).to_string())
                .collect(),
        }
    };

    let body = OllamaRequest {
        model: req.model.to_string(),
        messages: vec![Message::text("system", req.system_prompt), user_message],
        stream: false,
        options: OllamaOptions {
            temperature: req.temperature,
            num_predict: req.max_tokens,
        },
    };

    let url = format!("{base_url}/api/chat");
    let resp = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Ollama request failed: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Ollama HTTP {status}: {text}"));
    }

    let raw = resp
        .text()
        .await
        .map_err(|e| format!("Ollama read body: {e}"))?;
    let data: OllamaResponse =
        serde_json::from_str(&raw).map_err(|e| format!("Ollama parse: {e}"))?;
    Ok((
        data.message.content,
        pricing::Usage {
            prompt_tokens: data.prompt_eval_count.unwrap_or(0),
            completion_tokens: data.eval_count.unwrap_or(0),
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reported_cost: None,
        },
        raw.trim().to_string(),
    ))
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

fn now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn strip_code_fences(s: &str) -> &str {
    let trimmed = s.trim();
    let without_open = trimmed
        .strip_prefix("```json")
        .or_else(|| trimmed.strip_prefix("```"))
        .unwrap_or(trimmed);
    let without_close = without_open.strip_suffix("```").unwrap_or(without_open);
    without_close.trim()
}

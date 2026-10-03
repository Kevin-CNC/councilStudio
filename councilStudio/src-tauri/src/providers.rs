//! Provider API layer.
//!
//! Two public methods, each written once and usable for every provider:
//! - `chat_completion` — one chat call to any provider (anthropic, openai,
//!   openrouter, ollama). The provider is a parameter, not a separate function.
//! - `judge_call` — the judge synthesis call. Reuses `chat_completion` and
//!   parses the structured JSON verdict.

use crate::cmds::{Citation, Diagram, JudgeResult, PersonaResult, RunAttachment, Table};
use crate::mcp::McpTool;
use crate::pricing;
use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Request / response wire shapes
// ---------------------------------------------------------------------------

#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    system: String,
    messages: Vec<serde_json::Value>,
    max_tokens: i64,
    temperature: f64,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<serde_json::Value>,
}

#[derive(Serialize)]
struct OpenAiRequest {
    // Same shape for OpenAI and OpenRouter
    model: String,
    messages: Vec<serde_json::Value>,
    max_tokens: i64,
    temperature: f64,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_choice: Option<String>,
}

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    messages: Vec<serde_json::Value>,
    stream: bool,
    options: OllamaOptions,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tools: Vec<serde_json::Value>,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f64,
    num_predict: i64,
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

/// Anthropic content block: `text` blocks carry prose, `tool_use` blocks carry
/// a call the model wants made.
#[derive(Deserialize)]
#[serde(tag = "type")]
enum AnthropicContent {
    #[serde(rename = "text")]
    Text { text: String },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        input: serde_json::Value,
    },
    #[serde(other)]
    Other,
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
    /// Null when the model only emitted tool calls.
    #[serde(default)]
    content: Option<String>,
    #[serde(default)]
    tool_calls: Vec<OpenAiToolCall>,
}

#[derive(Deserialize)]
struct OpenAiToolCall {
    id: String,
    function: OpenAiToolCallFunction,
}

#[derive(Deserialize)]
struct OpenAiToolCallFunction {
    name: String,
    /// JSON-encoded arguments string (OpenAI wire format).
    arguments: String,
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
    #[serde(default)]
    content: String,
    #[serde(default)]
    tool_calls: Vec<OllamaToolCall>,
}

#[derive(Deserialize)]
struct OllamaToolCall {
    function: OllamaToolCallFunction,
}

#[derive(Deserialize)]
struct OllamaToolCallFunction {
    name: String,
    /// Ollama returns arguments as a JSON object (not a string).
    arguments: serde_json::Value,
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
    /// MCP tools the model may call. Empty by default — the request body is
    /// byte-for-byte identical to the no-tools path when empty.
    pub tools: &'a [McpTool],
}

// ---------------------------------------------------------------------------
// Multi-turn tool-call conversation types
// ---------------------------------------------------------------------------

/// One tool call the model requested in an assistant turn.
#[derive(Debug, Clone)]
pub struct ToolUseReq {
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

/// A conversation message for the tool-call loop. The single-shot path
/// (`chat_completion`) builds `[System, User]` exactly as before.
#[derive(Debug, Clone)]
pub enum ChatMsg {
    System(String),
    /// `include_attachments` marks the one user message that carries the run's
    /// image attachments (the first user message in practice).
    User {
        text: String,
        include_attachments: bool,
    },
    /// Assistant turn that asked for tools: its text (may be empty) and the
    /// calls it wants made.
    AssistantToolUse {
        text: String,
        calls: Vec<ToolUseReq>,
    },
    /// Result of one tool call, keyed by the call id.
    ToolResult {
        call_id: String,
        name: String,
        content: String,
        is_error: bool,
    },
}

/// One step of the tool-call loop: either final text (no tool calls) or a set
/// of calls to execute before the next step.
#[derive(Debug)]
pub struct ToolStep {
    pub text: String,
    pub tool_calls: Vec<ToolUseReq>,
    pub usage: pricing::Usage,
    pub raw_response: String,
}

/// Make one chat completion call to any supported provider.
/// Returns a PersonaResult with `persona_id`/`persona_name` empty — the
/// orchestrator fills those in.
pub async fn chat_completion(
    client: &reqwest::Client,
    req: ChatRequest<'_>,
) -> Result<PersonaResult, String> {
    let started_at = now_millis();

    let messages = vec![
        ChatMsg::System(req.system_prompt.to_string()),
        ChatMsg::User {
            text: req.user_prompt.to_string(),
            include_attachments: true,
        },
    ];
    let step = chat_step(client, &req, &messages).await?;

    let completed_at = now_millis();
    let cost = pricing::resolve_cost(client, req.provider, req.model, &step.usage).await;

    // Harness: strip the trailing ```references fence into typed citations and
    // ```table fences into typed tables, leaving mermaid fences and
    // `[{n}]`/`{{@Name}}`/`{{table:n}}` markers in the content.
    let (content, citations, tables) = crate::harness::parse_persona_response(&step.text);

    Ok(PersonaResult {
        persona_id: String::new(),   // filled by orchestrator
        persona_name: String::new(), // filled by orchestrator
        provider: req.provider.to_string(),
        model: req.model.to_string(),
        status: "completed".to_string(),
        content,
        error: None,
        note: None,
        tokens_in: step.usage.prompt_tokens,
        tokens_out: step.usage.completion_tokens,
        latency_ms: completed_at - started_at,
        cost: cost.total,
        input_cost: cost.input_cost,
        output_cost: cost.output_cost,
        started_at,
        completed_at: Some(completed_at),
        raw_response: Some(step.raw_response),
        citations, // persona_id filled by orchestrator
        tables,    // persona_id filled by orchestrator
    })
}

/// One step of the tool-call loop: send `messages` plus the request's tools to
/// the provider, return the model's text and any tool calls it wants made.
/// The caller appends results and calls again until `tool_calls` is empty.
pub async fn chat_step(
    client: &reqwest::Client,
    req: &ChatRequest<'_>,
    messages: &[ChatMsg],
) -> Result<ToolStep, String> {
    match req.provider {
        "anthropic" => {
            let key = req
                .api_key
                .ok_or("No Anthropic API key configured".to_string())?;
            call_anthropic_wire(client, key, req, messages).await
        }
        "openai" => {
            let key = req
                .api_key
                .ok_or("No OpenAI API key configured".to_string())?;
            call_openai_wire(
                client,
                key,
                "https://api.openai.com/v1/chat/completions",
                req,
                messages,
            )
            .await
        }
        "openrouter" => {
            let key = req
                .api_key
                .ok_or("No OpenRouter API key configured".to_string())?;
            call_openai_wire(
                client,
                key,
                "https://openrouter.ai/api/v1/chat/completions",
                req,
                messages,
            )
            .await
        }
        "ollama" => {
            let url = req
                .base_url
                .unwrap_or("http://localhost:11434")
                .trim_end_matches('/')
                .to_string();
            call_ollama_wire(client, &url, req, messages).await
        }
        other => Err(format!("Unknown provider: {other}")),
    }
}

const JUDGE_SYSTEM_PROMPT: &str = "You are a council judge. Your job is to synthesize multiple AI persona responses into a structured evaluation. Respond with ONLY a single JSON object. Begin with `{`, end with `}`. No markdown, no code fences, no prose. Minimal example: {\"summary\":\"…\",\"consensus\":[],\"disagreements\":[],\"minority_views\":[],\"recommendations\":[],\"confidence_score\":50,\"synthesis\":\"…\",\"diagrams\":[],\"citations\":[],\"tables\":[],\"missing_personas\":[]}. Always output valid JSON with the fields: summary, consensus, disagreements, minority_views, recommendations, confidence_score, synthesis, diagrams, citations, tables, missing_personas. Never omit a field. `diagrams` is an array of {\"id\",\"code\",\"caption\"} where `code` is raw mermaid source (no fences) — only include a diagram if one genuinely helps. `citations` is an array of {\"id\",\"source\",\"url\",\"excerpt\"} for external sources referenced in your text via [{n}] markers. `tables` is an array of {\"id\",\"caption\",\"columns\":[\"...\"],\"rows\":[[\"...\"]]} for structured comparison data (each row has one cell per column) — emit [] when nothing tabular helps. `missing_personas` is an array of the persona names that failed or produced no usable response. `summary` and `synthesis` are markdown and may contain ```mermaid fences, [{n}] citation markers and ```table fenced blocks (a ```table fence holds ONE JSON object {\"caption\",\"columns\",\"rows\"}). Never emit raw HTML.";

/// serde helper: judge models emit `"85%"`, `"85"`, or plain numbers for
/// confidence_score — accept all, fall back to 0.
fn coerce_confidence<'de, D>(d: D) -> Result<f64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let v: serde_json::Value = serde::Deserialize::deserialize(d)?;
    Ok(match v {
        serde_json::Value::Number(n) => n.as_f64().unwrap_or(0.0),
        serde_json::Value::String(s) => s.trim().trim_end_matches('%').parse().unwrap_or(0.0),
        _ => 0.0,
    })
}

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
    #[serde(
        default,
        alias = "confidenceScore",
        deserialize_with = "coerce_confidence"
    )]
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

/// Concatenated text of the conversation's system messages (one in practice).
fn system_text(messages: &[ChatMsg]) -> String {
    messages
        .iter()
        .filter_map(|m| match m {
            ChatMsg::System(t) => Some(t.as_str()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Anthropic-flavored tool definitions.
fn anthropic_tools(tools: &[McpTool]) -> Vec<serde_json::Value> {
    tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "name": t.name,
                "description": t.description,
                "input_schema": t.input_schema,
            })
        })
        .collect()
}

/// OpenAI/Ollama-flavored tool definitions (function wrapper).
fn openai_tools(tools: &[McpTool]) -> Vec<serde_json::Value> {
    tools
        .iter()
        .map(|t| {
            serde_json::json!({
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.input_schema,
                }
            })
        })
        .collect()
}

/// Build Anthropic `messages`. Consecutive tool results merge into a single
/// user message of `tool_result` blocks, as the API requires.
fn anthropic_messages(req: &ChatRequest<'_>, messages: &[ChatMsg]) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    let mut pending_results: Vec<serde_json::Value> = Vec::new();

    let flush = |out: &mut Vec<serde_json::Value>, pending: &mut Vec<serde_json::Value>| {
        if !pending.is_empty() {
            out.push(serde_json::json!({ "role": "user", "content": pending }));
            pending.clear();
        }
    };

    for msg in messages {
        match msg {
            ChatMsg::System(_) => {} // hoisted into the `system` field
            ChatMsg::User {
                text,
                include_attachments,
            } => {
                flush(&mut out, &mut pending_results);
                if *include_attachments && !req.attachments.is_empty() {
                    let mut blocks = vec![serde_json::json!({ "type": "text", "text": text })];
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
                    out.push(serde_json::json!({ "role": "user", "content": blocks }));
                } else {
                    out.push(serde_json::json!({ "role": "user", "content": text }));
                }
            }
            ChatMsg::AssistantToolUse { text, calls } => {
                flush(&mut out, &mut pending_results);
                let mut blocks = Vec::new();
                if !text.is_empty() {
                    blocks.push(serde_json::json!({ "type": "text", "text": text }));
                }
                for c in calls {
                    blocks.push(serde_json::json!({
                        "type": "tool_use",
                        "id": c.id,
                        "name": c.name,
                        "input": c.args,
                    }));
                }
                out.push(serde_json::json!({ "role": "assistant", "content": blocks }));
            }
            ChatMsg::ToolResult {
                call_id,
                content,
                is_error,
                ..
            } => {
                pending_results.push(serde_json::json!({
                    "type": "tool_result",
                    "tool_use_id": call_id,
                    "content": content,
                    "is_error": is_error,
                }));
            }
        }
    }
    flush(&mut out, &mut pending_results);
    out
}

async fn call_anthropic_wire(
    client: &reqwest::Client,
    api_key: &str,
    req: &ChatRequest<'_>,
    messages: &[ChatMsg],
) -> Result<ToolStep, String> {
    let body = AnthropicRequest {
        model: req.model.to_string(),
        system: system_text(messages),
        messages: anthropic_messages(req, messages),
        max_tokens: req.max_tokens,
        temperature: req.temperature,
        tools: anthropic_tools(req.tools),
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
    let mut text_parts = Vec::new();
    let mut calls = Vec::new();
    for block in data.content {
        match block {
            AnthropicContent::Text { text } => text_parts.push(text),
            AnthropicContent::ToolUse { id, name, input } => {
                calls.push(ToolUseReq {
                    id,
                    name,
                    args: input,
                });
            }
            AnthropicContent::Other => {}
        }
    }
    Ok(ToolStep {
        text: text_parts.join(""),
        tool_calls: calls,
        usage: pricing::Usage {
            prompt_tokens: data.usage.input_tokens,
            completion_tokens: data.usage.output_tokens,
            cache_read_tokens: data.usage.cache_read_input_tokens,
            cache_write_tokens: data.usage.cache_creation_input_tokens,
            reported_cost: None,
        },
        raw_response: raw.trim().to_string(),
    })
}

/// Build OpenAI/OpenRouter `messages`. System messages are inline (OpenAI
/// style), tool results are standalone `tool` messages.
fn openai_messages(req: &ChatRequest<'_>, messages: &[ChatMsg]) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    for msg in messages {
        match msg {
            ChatMsg::System(text) => {
                out.push(serde_json::json!({ "role": "system", "content": text }));
            }
            ChatMsg::User {
                text,
                include_attachments,
            } => {
                if *include_attachments && !req.attachments.is_empty() {
                    let mut blocks = vec![serde_json::json!({ "type": "text", "text": text })];
                    for a in req.attachments {
                        blocks.push(serde_json::json!({
                            "type": "image_url",
                            "image_url": { "url": to_data_url(&a.mime_type, &a.data_base64) }
                        }));
                    }
                    out.push(serde_json::json!({ "role": "user", "content": blocks }));
                } else {
                    out.push(serde_json::json!({ "role": "user", "content": text }));
                }
            }
            ChatMsg::AssistantToolUse { text, calls } => {
                let tool_calls: Vec<serde_json::Value> = calls
                    .iter()
                    .map(|c| {
                        serde_json::json!({
                            "id": c.id,
                            "type": "function",
                            "function": {
                                "name": c.name,
                                "arguments": c.args.to_string(),
                            }
                        })
                    })
                    .collect();
                out.push(serde_json::json!({
                    "role": "assistant",
                    "content": if text.is_empty() { serde_json::Value::Null } else { serde_json::json!(text) },
                    "tool_calls": tool_calls,
                }));
            }
            ChatMsg::ToolResult {
                call_id, content, ..
            } => {
                out.push(serde_json::json!({
                    "role": "tool",
                    "tool_call_id": call_id,
                    "content": content,
                }));
            }
        }
    }
    out
}

async fn call_openai_wire(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
    req: &ChatRequest<'_>,
    messages: &[ChatMsg],
) -> Result<ToolStep, String> {
    let tools = openai_tools(req.tools);
    let body = OpenAiRequest {
        model: req.model.to_string(),
        messages: openai_messages(req, messages),
        max_tokens: req.max_tokens,
        temperature: req.temperature,
        tool_choice: if tools.is_empty() {
            None
        } else {
            Some("auto".to_string())
        },
        tools,
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
    let (text, calls) = match data.choices.into_iter().next() {
        Some(choice) => {
            let calls = choice
                .message
                .tool_calls
                .into_iter()
                .map(|c| ToolUseReq {
                    id: c.id,
                    name: c.function.name,
                    args: serde_json::from_str(&c.function.arguments)
                        .unwrap_or(serde_json::Value::Object(Default::default())),
                })
                .collect();
            (choice.message.content.unwrap_or_default(), calls)
        }
        None => (String::new(), Vec::new()),
    };
    Ok(ToolStep {
        text,
        tool_calls: calls,
        usage: pricing::Usage {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reported_cost: data.usage.cost,
        },
        raw_response: raw.trim().to_string(),
    })
}

/// Build Ollama `messages`: like OpenAI but images ride as bare base64
/// `images` arrays and tool calls/results carry no ids.
fn ollama_messages(req: &ChatRequest<'_>, messages: &[ChatMsg]) -> Vec<serde_json::Value> {
    let mut out: Vec<serde_json::Value> = Vec::new();
    for msg in messages {
        match msg {
            ChatMsg::System(text) => {
                out.push(serde_json::json!({ "role": "system", "content": text }));
            }
            ChatMsg::User {
                text,
                include_attachments,
            } => {
                let mut m = serde_json::json!({ "role": "user", "content": text });
                if *include_attachments && !req.attachments.is_empty() {
                    m["images"] = serde_json::json!(req
                        .attachments
                        .iter()
                        .map(|a| bare_base64(&a.data_base64).to_string())
                        .collect::<Vec<_>>());
                }
                out.push(m);
            }
            ChatMsg::AssistantToolUse { text, calls } => {
                let tool_calls: Vec<serde_json::Value> = calls
                    .iter()
                    .map(|c| {
                        serde_json::json!({
                            "function": { "name": c.name, "arguments": c.args }
                        })
                    })
                    .collect();
                out.push(serde_json::json!({
                    "role": "assistant",
                    "content": text,
                    "tool_calls": tool_calls,
                }));
            }
            ChatMsg::ToolResult { name, content, .. } => {
                out.push(serde_json::json!({
                    "role": "tool",
                    "name": name,
                    "content": content,
                }));
            }
        }
    }
    out
}

async fn call_ollama_wire(
    client: &reqwest::Client,
    base_url: &str,
    req: &ChatRequest<'_>,
    messages: &[ChatMsg],
) -> Result<ToolStep, String> {
    let body = OllamaRequest {
        model: req.model.to_string(),
        messages: ollama_messages(req, messages),
        stream: false,
        options: OllamaOptions {
            temperature: req.temperature,
            num_predict: req.max_tokens,
        },
        tools: openai_tools(req.tools),
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
    // Ollama tool calls carry no ids — synthesize positional ones so results
    // can be paired back.
    let calls = data
        .message
        .tool_calls
        .into_iter()
        .enumerate()
        .map(|(i, c)| ToolUseReq {
            id: format!("call_{i}"),
            name: c.function.name,
            args: c.function.arguments,
        })
        .collect();
    Ok(ToolStep {
        text: data.message.content,
        tool_calls: calls,
        usage: pricing::Usage {
            prompt_tokens: data.prompt_eval_count.unwrap_or(0),
            completion_tokens: data.eval_count.unwrap_or(0),
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            reported_cost: None,
        },
        raw_response: raw.trim().to_string(),
    })
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

// ---------------------------------------------------------------------------
// Tests — wire-shape coverage for the tool-call loop (no live providers).
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn tool(name: &str) -> McpTool {
        McpTool {
            name: name.to_string(),
            description: format!("{name} tool"),
            input_schema: serde_json::json!({ "type": "object" }),
        }
    }

    fn bare_req<'a>(tools: &'a [McpTool]) -> ChatRequest<'a> {
        ChatRequest {
            provider: "anthropic",
            api_key: None,
            base_url: None,
            model: "m",
            system_prompt: "sys",
            user_prompt: "hi",
            temperature: 0.7,
            max_tokens: 100,
            attachments: &[],
            tools,
        }
    }

    #[test]
    fn judge_parse_survives_numeric_ids_and_table_cells() {
        // Judge models ignore the "each cell is a string" contract and emit
        // bare numbers for ids/rows/confidence. Those verdicts must still
        // parse instead of falling to the unstructured salvage path.
        let content = r#"{"summary":"s","consensus":[],"disagreements":[],"minority_views":[],"recommendations":[],"confidence_score":"85%","synthesis":"syn","diagrams":[],"citations":[{"id":1,"source":"web","excerpt":"e"}],"tables":[{"id":2,"caption":"t","columns":["A","B"],"rows":[["x",5],[3,"y"]]}],"missing_personas":[]}"#;
        let v =
            parse_judge_json(content).expect("numeric ids/cells in judge JSON should still parse");
        assert_eq!(v.tables[0].rows[0][1], "5");
        assert_eq!(v.tables[0].rows[1][0], "3");
        assert_eq!(v.tables[0].id, "2");
        assert_eq!(v.citations[0].id, "1");
        assert_eq!(v.confidence_score, 85.0);
    }

    #[test]
    fn empty_tools_omits_tools_field() {
        // Regression guard: no tools → byte-identical no-tools wire body.
        let req = bare_req(&[]);
        let body = AnthropicRequest {
            model: "m".to_string(),
            system: "sys".to_string(),
            messages: anthropic_messages(
                &req,
                &[ChatMsg::User {
                    text: "hi".to_string(),
                    include_attachments: false,
                }],
            ),
            max_tokens: 100,
            temperature: 0.7,
            tools: anthropic_tools(req.tools),
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(!json.contains("tools"), "tools key leaked: {json}");

        let body = OpenAiRequest {
            model: "m".to_string(),
            messages: vec![],
            max_tokens: 100,
            temperature: 0.7,
            tools: vec![],
            tool_choice: None,
        };
        let json = serde_json::to_string(&body).unwrap();
        assert!(!json.contains("tools"));
        assert!(!json.contains("tool_choice"));
    }

    #[test]
    fn anthropic_tool_definitions_shape() {
        let tools = anthropic_tools(&[tool("echo")]);
        assert_eq!(tools[0]["name"], "echo");
        assert_eq!(tools[0]["input_schema"]["type"], "object");
        let openai = openai_tools(&[tool("echo")]);
        assert_eq!(openai[0]["type"], "function");
        assert_eq!(openai[0]["function"]["name"], "echo");
        assert_eq!(openai[0]["function"]["parameters"]["type"], "object");
    }

    #[test]
    fn anthropic_merges_consecutive_tool_results() {
        let tools = [tool("echo")];
        let req = bare_req(&tools);
        let messages = vec![
            ChatMsg::System("sys".to_string()),
            ChatMsg::User {
                text: "hi".to_string(),
                include_attachments: false,
            },
            ChatMsg::AssistantToolUse {
                text: "checking".to_string(),
                calls: vec![
                    ToolUseReq {
                        id: "t1".to_string(),
                        name: "echo".to_string(),
                        args: serde_json::json!({}),
                    },
                    ToolUseReq {
                        id: "t2".to_string(),
                        name: "echo".to_string(),
                        args: serde_json::json!({}),
                    },
                ],
            },
            ChatMsg::ToolResult {
                call_id: "t1".to_string(),
                name: "echo".to_string(),
                content: "one".to_string(),
                is_error: false,
            },
            ChatMsg::ToolResult {
                call_id: "t2".to_string(),
                name: "echo".to_string(),
                content: "boom".to_string(),
                is_error: true,
            },
        ];
        let out = anthropic_messages(&req, &messages);
        // user, assistant(tool_use x2), ONE merged user with 2 tool_results
        assert_eq!(out.len(), 3);
        assert_eq!(out[1]["role"], "assistant");
        assert_eq!(out[1]["content"][1]["type"], "tool_use");
        assert_eq!(out[2]["role"], "user");
        let results = out[2]["content"].as_array().unwrap();
        assert_eq!(results.len(), 2);
        assert_eq!(results[0]["tool_use_id"], "t1");
        assert_eq!(results[1]["is_error"], true);
        // Assistant text block precedes tool_use blocks.
        assert_eq!(out[1]["content"][0]["type"], "text");
    }

    #[test]
    fn openai_tool_messages_shape() {
        let tools = [tool("echo")];
        let req = bare_req(&tools);
        let messages = vec![
            ChatMsg::System("sys".to_string()),
            ChatMsg::User {
                text: "hi".to_string(),
                include_attachments: false,
            },
            ChatMsg::AssistantToolUse {
                text: String::new(),
                calls: vec![ToolUseReq {
                    id: "call_0".to_string(),
                    name: "echo".to_string(),
                    args: serde_json::json!({ "a": 1 }),
                }],
            },
            ChatMsg::ToolResult {
                call_id: "call_0".to_string(),
                name: "echo".to_string(),
                content: "done".to_string(),
                is_error: false,
            },
        ];
        let out = openai_messages(&req, &messages);
        assert_eq!(out[0]["role"], "system");
        assert_eq!(out[2]["role"], "assistant");
        assert_eq!(out[2]["tool_calls"][0]["function"]["name"], "echo");
        assert_eq!(
            out[2]["tool_calls"][0]["function"]["arguments"],
            "{\"a\":1}"
        );
        assert!(out[2]["content"].is_null());
        assert_eq!(out[3]["role"], "tool");
        assert_eq!(out[3]["tool_call_id"], "call_0");
    }

    #[test]
    fn ollama_tool_messages_shape() {
        let tools = [tool("echo")];
        let req = bare_req(&tools);
        let messages = vec![
            ChatMsg::AssistantToolUse {
                text: "looking".to_string(),
                calls: vec![ToolUseReq {
                    id: "call_0".to_string(),
                    name: "echo".to_string(),
                    args: serde_json::json!({ "a": 1 }),
                }],
            },
            ChatMsg::ToolResult {
                call_id: "call_0".to_string(),
                name: "echo".to_string(),
                content: "done".to_string(),
                is_error: false,
            },
        ];
        let out = ollama_messages(&req, &messages);
        assert_eq!(out[0]["tool_calls"][0]["function"]["arguments"]["a"], 1);
        assert_eq!(out[1]["role"], "tool");
        assert_eq!(out[1]["name"], "echo");
    }

    #[test]
    fn anthropic_response_parses_tool_use_blocks() {
        let raw = r#"{
            "content": [
                { "type": "text", "text": "Let me check." },
                { "type": "tool_use", "id": "tu_1", "name": "echo",
                  "input": { "text": "hi" } }
            ],
            "usage": { "input_tokens": 10, "output_tokens": 5 }
        }"#;
        let data: AnthropicResponse = serde_json::from_str(raw).unwrap();
        let mut texts = Vec::new();
        let mut calls = Vec::new();
        for block in data.content {
            match block {
                AnthropicContent::Text { text } => texts.push(text),
                AnthropicContent::ToolUse { id, name, input } => calls.push((id, name, input)),
                AnthropicContent::Other => {}
            }
        }
        assert_eq!(texts, vec!["Let me check."]);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].1, "echo");
        assert_eq!(calls[0].2["text"], "hi");
    }

    #[test]
    fn openai_response_parses_tool_calls_with_null_content() {
        let raw = r#"{
            "choices": [{
                "message": {
                    "content": null,
                    "tool_calls": [{
                        "id": "call_1",
                        "type": "function",
                        "function": { "name": "echo", "arguments": "{\"text\":\"hi\"}" }
                    }]
                }
            }],
            "usage": { "prompt_tokens": 3, "completion_tokens": 2 }
        }"#;
        let data: OpenAiResponse = serde_json::from_str(raw).unwrap();
        let msg = &data.choices[0].message;
        assert!(msg.content.is_none());
        assert_eq!(msg.tool_calls[0].function.name, "echo");
    }
}

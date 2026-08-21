//! Provider API layer.
//!
//! Two public methods, each written once and usable for every provider:
//! - `chat_completion` — one chat call to any provider (anthropic, openai,
//!   openrouter, ollama). The provider is a parameter, not a separate function.
//! - `judge_call` — the judge synthesis call. Reuses `chat_completion` and
//!   parses the structured JSON verdict.

use crate::cmds::{JudgeResult, PersonaResult, RunAttachment};
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
    })
}

const JUDGE_SYSTEM_PROMPT: &str = "You are a council judge. Your job is to synthesize multiple AI persona responses into a structured evaluation. Always output valid JSON with the fields: summary, consensus, disagreements, minority_views, recommendations, confidence_score, synthesis. Never omit a field.";

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
}

/// Extract the first {...} block — judges often add prose around the JSON.
fn extract_json_object(s: &str) -> &str {
    let cleaned = strip_code_fences(s);
    match (cleaned.find('{'), cleaned.rfind('}')) {
        (Some(start), Some(end)) if end > start => &cleaned[start..=end],
        _ => cleaned,
    }
}

/// Judge call — provider-independent like `chat_completion`, with the judge
/// system prompt applied and the response parsed into a JudgeResult.
pub async fn judge_call(
    client: &reqwest::Client,
    req: ChatRequest<'_>,
) -> Result<JudgeResult, String> {
    let started_at = now_millis();

    let result = chat_completion(
        client,
        ChatRequest {
            system_prompt: JUDGE_SYSTEM_PROMPT,
            ..req
        },
    )
    .await?;

    let completed_at = now_millis();
    let latency_ms = completed_at - started_at;

    // Judges wrap JSON in code fences or prose — extract the object first.
    let json_str = extract_json_object(&result.content);
    match serde_json::from_str::<JudgeVerdict>(json_str) {
        Ok(v) => Ok(JudgeResult {
            summary: v.summary,
            consensus: v.consensus,
            disagreements: v.disagreements,
            minority_views: v.minority_views,
            recommendations: v.recommendations,
            confidence_score: v.confidence_score.round().clamp(0.0, 100.0) as u32,
            synthesis: v.synthesis,
            tokens_in: result.tokens_in,
            tokens_out: result.tokens_out,
            latency_ms,
            cost: result.cost,
            raw_response: result.raw_response.clone(),
        }),
        Err(_) => {
            // Judge didn't return valid JSON; keep raw content as synthesis.
            Ok(JudgeResult {
                summary: "Judge response (unstructured)".to_string(),
                consensus: vec![],
                disagreements: vec![],
                minority_views: vec![],
                recommendations: vec![],
                confidence_score: 50,
                synthesis: result.content,
                tokens_in: result.tokens_in,
                tokens_out: result.tokens_out,
                latency_ms,
                cost: result.cost,
                raw_response: result.raw_response.clone(),
            })
        }
    }
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

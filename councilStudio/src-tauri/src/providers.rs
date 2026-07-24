//! Provider API layer.
//!
//! Two public methods, each written once and usable for every provider:
//! - `chat_completion` — one chat call to any provider (anthropic, openai,
//!   openrouter, ollama). The provider is a parameter, not a separate function.
//! - `judge_call` — the judge synthesis call. Reuses `chat_completion` and
//!   parses the structured JSON verdict.

use crate::cmds::{JudgeResult, PersonaResult};
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

#[derive(Serialize, Clone)]
struct Message {
    role: String,
    content: String,
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

#[derive(Deserialize)]
struct OpenAiUsage {
    prompt_tokens: u64,
    completion_tokens: u64,
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
}

/// Make one chat completion call to any supported provider.
/// Returns a PersonaResult with `persona_id`/`persona_name` empty — the
/// orchestrator fills those in.
pub async fn chat_completion(
    client: &reqwest::Client,
    req: ChatRequest<'_>,
) -> Result<PersonaResult, String> {
    let started_at = now_millis();

    let (content, tokens_in, tokens_out) = match req.provider {
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
            call_openai_wire(client, key, "https://api.openai.com/v1/chat/completions", &req)
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

    Ok(PersonaResult {
        persona_id: String::new(),  // filled by orchestrator
        persona_name: String::new(), // filled by orchestrator
        provider: req.provider.to_string(),
        model: req.model.to_string(),
        status: "completed".to_string(),
        content,
        error: None,
        tokens_in,
        tokens_out,
        latency_ms: completed_at - started_at,
        cost: cost_calc(req.provider, req.model, tokens_in, tokens_out),
        started_at,
        completed_at: Some(completed_at),
    })
}

const JUDGE_SYSTEM_PROMPT: &str = "You are a council judge. Your job is to synthesize multiple AI persona responses into a structured evaluation. Always output valid JSON with the fields: summary, consensus, disagreements, minority_views, recommendations, confidence_score, synthesis. Never omit a field.";

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

    // Judges often wrap JSON in code fences — strip before parsing.
    let cleaned = strip_code_fences(&result.content);
    match serde_json::from_str::<JudgeResult>(cleaned) {
        Ok(mut jr) => {
            jr.tokens_in = result.tokens_in;
            jr.tokens_out = result.tokens_out;
            jr.latency_ms = latency_ms;
            Ok(jr)
        }
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
) -> Result<(String, u64, u64), String> {
    let body = AnthropicRequest {
        model: req.model.to_string(),
        system: req.system_prompt.to_string(),
        messages: vec![Message {
            role: "user".to_string(),
            content: req.user_prompt.to_string(),
        }],
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

    let data: AnthropicResponse = resp
        .json()
        .await
        .map_err(|e| format!("Anthropic parse: {e}"))?;
    let content = data.content.first().map(|c| c.text.clone()).unwrap_or_default();
    Ok((content, data.usage.input_tokens, data.usage.output_tokens))
}

async fn call_openai_wire(
    client: &reqwest::Client,
    api_key: &str,
    url: &str,
    req: &ChatRequest<'_>,
) -> Result<(String, u64, u64), String> {
    let body = OpenAiRequest {
        model: req.model.to_string(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: req.system_prompt.to_string(),
            },
            Message {
                role: "user".to_string(),
                content: req.user_prompt.to_string(),
            },
        ],
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

    let data: OpenAiResponse = resp
        .json()
        .await
        .map_err(|e| format!("{} parse: {e}", req.provider))?;
    let content = data
        .choices
        .first()
        .map(|c| c.message.content.clone())
        .unwrap_or_default();
    Ok((content, data.usage.prompt_tokens, data.usage.completion_tokens))
}

async fn call_ollama_wire(
    client: &reqwest::Client,
    base_url: &str,
    req: &ChatRequest<'_>,
) -> Result<(String, u64, u64), String> {
    let body = OllamaRequest {
        model: req.model.to_string(),
        messages: vec![
            Message {
                role: "system".to_string(),
                content: req.system_prompt.to_string(),
            },
            Message {
                role: "user".to_string(),
                content: req.user_prompt.to_string(),
            },
        ],
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

    let data: OllamaResponse = resp
        .json()
        .await
        .map_err(|e| format!("Ollama parse: {e}"))?;
    Ok((
        data.message.content,
        data.prompt_eval_count.unwrap_or(0),
        data.eval_count.unwrap_or(0),
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
    let without_close = without_open
        .strip_suffix("```")
        .unwrap_or(without_open);
    without_close.trim()
}

/// Cost per call in USD. MVP: pricing table not wired up yet — always 0.0.
fn cost_calc(_provider: &str, _model: &str, _tokens_in: u64, _tokens_out: u64) -> f64 {
    0.0
}

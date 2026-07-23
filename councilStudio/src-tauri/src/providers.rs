// Structs for the requests
#[derive(Serialize)]
struct AnthropicRequest {
    model: String,
    system: String,
    messages: Vec<Message>,
    max_tokens: i64,
    temperature: f64,
}

#[derive(Serialize)]
struct OpenAiRequest { // Same for OpenAI and OpenRouter
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



// Structs for the responses
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


// Calc Costs for each provider
fn costCalc(provider: &str, model: &str, token_i: u64, token_o: u64) -> f64 {
    if provider == "anthropic" {
        if model.contains("sonnet"){
            return 0.0;
        }else if model.contains("opus") {
            return 0.0;
        }else if model.contains("haiku") {
            return 0.0;
        }
    } else if provider == "openai" {
        return 0.0;
    } else if provider == "ollama" {
        // Ollama pricing is not publicly available, so we can't calculate it here.
        return 0.0;
    }
}


// Unilateral function to make a call to the provider's API
pub async fn makeCall(provider: &str, client: &reqwest::Client, api_k: &str, model: &str, sys_prompt: &str, prompt:&str, temp: f64, max_tkns: f64 ) -> Result<PersonaResult, String> {
    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    
    if provider == "anthropic" {
        let body = AnthropicRequest {
            model: model.to_string(),
            system: system_prompt.to_string(),
            messages: vec![Message {
                role: "user".to_string(),
                content: user_prompt.to_string(),
            }],
            max_tokens,
            temperature,
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

        let data: AnthropicResponse = resp.json().await.map_err(|e| format!("Anthropic parse: {e}"))?;
        let content = data.content.first().map(|c| c.text.clone()).unwrap_or_default();
        let tokens_in = data.usage.input_tokens;
        let tokens_out = data.usage.output_tokens;
        let completed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Ok(PersonaResult {
            persona_id: String::new(), // filled by orchestrator
            persona_name: String::new(),
            provider: "anthropic".to_string(),
            model: model.to_string(),
            status: "ok".to_string(),
            content,
            error: None,
            tokens_in,
            tokens_out,
            latency_ms: completed_at - started_at,
            cost: cost_anthropic(model, tokens_in, tokens_out),
            started_at,
            completed_at: Some(completed_at),
        })

    }else if provider == "openai" || provider == "openrouter" {
         let body = OpenAiRequest {
            model: model.to_string(),
            messages: vec![
                Message { role: "system".to_string(), content: system_prompt.to_string() },
                Message { role: "user".to_string(), content: user_prompt.to_string() },
            ],
            max_tokens,
            temperature,
        };

        let resp = client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {api_key}"))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("OpenAI request failed: {e}"))?;

        if !resp.status().is_success() {
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            return Err(format!("OpenAI HTTP {status}: {text}"));
        }

        let data: OpenAiResponse = resp.json().await.map_err(|e| format!("OpenAI parse: {e}"))?;
        let content = data.choices.first().map(|c| c.message.content.clone()).unwrap_or_default();
        let tokens_in = data.usage.prompt_tokens;
        let tokens_out = data.usage.completion_tokens;
        let completed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Ok(PersonaResult {
            persona_id: String::new(),
            persona_name: String::new(),
            provider: "openai".to_string(),
            model: model.to_string(),
            status: "ok".to_string(),
            content,
            error: None,
            tokens_in,
            tokens_out,
            latency_ms: completed_at - started_at,
            cost: cost_openai(model, tokens_in, tokens_out),
            started_at,
            completed_at: Some(completed_at),
        })
    }else if provider == "ollama"{
        let body = OllamaRequest {
            model: model.to_string(),
            messages: vec![
                Message { role: "system".to_string(), content: system_prompt.to_string() },
                Message { role: "user".to_string(), content: user_prompt.to_string() },
            ],
            stream: false,
            options: OllamaOptions {
                temperature,
                num_predict: max_tokens,
            },
        };

        let url = format!("{}/api/chat", base_url.trim_end_matches('/'));
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

        let data: OllamaResponse = resp.json().await.map_err(|e| format!("Ollama parse: {e}"))?;
        let content = data.message.content;
        let tokens_in = data.prompt_eval_count.unwrap_or(0);
        let tokens_out = data.eval_count.unwrap_or(0);
        let completed_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Ok(PersonaResult {
            persona_id: String::new(),
            persona_name: String::new(),
            provider: "ollama".to_string(),
            model: model.to_string(),
            status: "ok".to_string(),
            content,
            error: None,
            tokens_in,
            tokens_out,
            latency_ms: completed_at - started_at,
            cost: cost_ollama(model, tokens_in, tokens_out),
            started_at,
            completed_at: Some(completed_at),
        })
    }
}


// Judge Call
pub async fn judgeCall(client: &reqwest::Client, api_key: &str, provider: &str, model: &str, synthesis_prompt: &str, temperature: f64, max_tokens: i64, sys_prompt: Option<String> ) -> Result<JudgeResult, String> {
    
    if sys_prompt.is_none() {
        let sys_prompt = "You are a council judge. Your job is to synthesize multiple AI persona responses into a structured evaluation. Always output valid JSON with the fields: summary, consensus, disagreements, minority_views, recommendations, confidence_score, synthesis. Never omit a field.";
    }

    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    
    // Build a persona result shaped response by calling the appropriate provider
    let result = makeCall(provider, client, api_key, model, sys_prompt.unwrap_or_default().as_str(), synthesis_prompt, temperature, max_tokens as f64).await;

    match result {
        Ok(pr) => {
            let completed_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            // Try to parse JSON from the judge's response
            match serde_json::from_str::<JudgeResult>(&pr.content) {
                Ok(mut jr) => {
                    jr.tokens_in = pr.tokens_in;
                    jr.tokens_out = pr.tokens_out;
                    jr.latency_ms = completed_at - started_at;
                    Ok(jr)
                }
                Err(_) => {
                    // Judge didn't return valid JSON; use raw content as synthesis
                    Ok(JudgeResult {
                        summary: "Judge response (unstructured)".to_string(),
                        consensus: vec![],
                        disagreements: vec![],
                        minority_views: vec![],
                        recommendations: vec![],
                        confidence_score: 50,
                        synthesis: pr.content,
                        tokens_in: pr.tokens_in,
                        tokens_out: pr.tokens_out,
                        latency_ms: completed_at - started_at,
                    })
                }
            }
        }
        Err(e) => Err(e),
    }
}
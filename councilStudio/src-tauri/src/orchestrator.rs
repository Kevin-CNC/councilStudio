use crate::cmds::{Persona, PersonaResult, JudgeResult};
use tauri::Emitter;


fn build_judge_prompt(prompt: &str, results: &[PersonaResult]) -> String {
    let mut p = format!(
        "You are a council judge. Synthesize the following responses from {} AI personas to the question below.\n\nReturn ONLY valid JSON (no markdown, no code fences) with exactly these fields:\n- summary: string — overall synthesis\n- consensus: string[] — points most personas agree on\n- disagreements: string[] — points where personas conflict\n- minority_views: string[] — claims made by only one persona\n- recommendations: string[] — actionable next steps\n- confidence_score: number 0-100 — how confident the synthesis is\n- synthesis: string — detailed narrative synthesis\n\n## QUESTION\n{}\n\n## PERSONA RESPONSES\n\n",
        results.len(),
        prompt
    );
    for (i, r) in results.iter().enumerate() {
        let status_label = if r.status == "failed" { " [FAILED]" } else { "" };
        p.push_str(&format!(
            "### Persona {}: {} ({}/{}){}\n{}\n\n",
            i + 1,
            r.persona_name,
            r.provider,
            r.model,
            status_label,
            r.content
        ));
    }
    p
}


// Main method to run a council
pub async fn run_council(
    app_handle: &tauri::AppHandle,
    prompt: &str,
    personas: &[Persona],
    judge_model: &str,
    judge_provider: &str,
) -> Result<(), String> {
    let run_id = uuid::Uuid::new_v4().to_string();

    // 1. Emit start event
    app_handle
        .emit(
            "council-run-started",
            serde_json::json!({
                "runId": run_id,
                "personaCount": personas.len()
            }),
        )
        .ok();

    // 2. Load API keys
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let keys = crate::secrets::load_keys(&app_data_dir);

    // 3. Spawn all persona calls concurrently
    let client = reqwest::Client::new();
    let mut tasks = Vec::new();

    for persona in personas.iter().filter(|p| p.enabled) {
        let app_handle = app_handle.clone();
        let client = client.clone();
        let prompt = prompt.to_string();
        let persona = persona.clone();
        let api_key = keys.get(&persona.provider).cloned();
        let base_url = keys
            .get(&format!("{}_url", &persona.provider))
            .cloned();

        let task = tokio::spawn(async move {
            let started_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            let result = match persona.provider.as_str() {
                "anthropic" => {
                    let key = match api_key {
                        Some(k) => k,
                        None => {
                            return PersonaResult {
                                persona_id: persona.id.clone(),
                                persona_name: persona.name.clone(),
                                provider: persona.provider.clone(),
                                model: persona.model.clone(),
                                status: "failed".to_string(),
                                content: String::new(),
                                error: Some("No Anthropic API key configured".to_string()),
                                tokens_in: 0,
                                tokens_out: 0,
                                latency_ms: 0,
                                cost: 0.0,
                                started_at,
                                completed_at: None,
                            }
                        }
                    };
                    crate::providers::call_anthropic(
                        &client, &key, &persona.model, &persona.sys_prompt,
                        &prompt, persona.temp, persona.max_tokens,
                    )
                    .await
                }
                "openai" => {
                    let key = match api_key {
                        Some(k) => k,
                        None => {
                            return PersonaResult {
                                persona_id: persona.id.clone(),
                                persona_name: persona.name.clone(),
                                provider: persona.provider.clone(),
                                model: persona.model.clone(),
                                status: "failed".to_string(),
                                content: String::new(),
                                error: Some("No OpenAI API key configured".to_string()),
                                tokens_in: 0,
                                tokens_out: 0,
                                latency_ms: 0,
                                cost: 0.0,
                                started_at,
                                completed_at: None,
                            }
                        }
                    };
                    crate::providers::call_openai(
                        &client, &key, &persona.model, &persona.sys_prompt,
                        &prompt, persona.temp, persona.max_tokens,
                    )
                    .await
                }
                "openrouter" => {
                    let key = match api_key {
                        Some(k) => k,
                        None => {
                            return PersonaResult {
                                persona_id: persona.id.clone(),
                                persona_name: persona.name.clone(),
                                provider: persona.provider.clone(),
                                model: persona.model.clone(),
                                status: "failed".to_string(),
                                content: String::new(),
                                error: Some("No OpenRouter API key configured".to_string()),
                                tokens_in: 0,
                                tokens_out: 0,
                                latency_ms: 0,
                                cost: 0.0,
                                started_at,
                                completed_at: None,
                            }
                        }
                    };
                    crate::providers::call_openrouter(
                        &client, &key, &persona.model, &persona.sys_prompt,
                        &prompt, persona.temp, persona.max_tokens,
                    )
                    .await
                }
                "ollama" => {
                    let url = base_url.unwrap_or_else(|| "http://localhost:11434".to_string());
                    crate::providers::call_ollama(
                        &client, &url, &persona.model, &persona.sys_prompt,
                        &prompt, persona.temp, persona.max_tokens,
                    )
                    .await
                }
                _ => Err(format!("Unknown provider: {}", persona.provider)),
            };

            let mut persona_result = match result {
                Ok(mut r) => {
                    r.persona_id = persona.id.clone();
                    r.persona_name = persona.name.clone();
                    r
                }
                Err(e) => PersonaResult {
                    persona_id: persona.id.clone(),
                    persona_name: persona.name.clone(),
                    provider: persona.provider.clone(),
                    model: persona.model.clone(),
                    status: "failed".to_string(),
                    content: String::new(),
                    error: Some(e),
                    tokens_in: 0,
                    tokens_out: 0,
                    latency_ms: 0,
                    cost: 0.0,
                    started_at,
                    completed_at: None,
                },
            };

            // Emit per-persona result
            app_handle.emit("persona-result", &persona_result).ok();
            persona_result
        });

        tasks.push(task);
    }

    // 4. Wait for all to settle
    let mut results: Vec<PersonaResult> = Vec::new();
    for task in tasks {
        match task.await {
            Ok(result) => results.push(result),
            Err(_) => {} // task panicked, skip
        }
    }

    // 5. Build judge prompt
    let synthesis_prompt = build_judge_prompt(prompt, &results);

    // 6. Call judge
    let judge_api_key = keys.get(judge_provider).cloned();
    let judge_result = match judge_api_key {
        Some(key) => {
            crate::providers::call_judge(
                &client,
                &key,
                judge_provider,
                judge_model,
                &synthesis_prompt,
                0.7,
                4096,
            )
            .await
        }
        None => {
            let started_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;
            Err::<JudgeResult, String>(format!(
                "No API key configured for judge provider: {judge_provider}"
            ))
        }
    };

    let judge_result = match judge_result {
        Ok(r) => r,
        Err(e) => JudgeResult {
            summary: format!("Judge failed: {e}"),
            consensus: vec![],
            disagreements: vec![],
            minority_views: vec![],
            recommendations: vec![],
            confidence_score: 0,
            synthesis: String::new(),
            tokens_in: 0,
            tokens_out: 0,
            latency_ms: 0,
        },
    };

    // 7. Emit judge result
    app_handle.emit("judge-result", &judge_result).ok();

    // 8. Emit completed
    app_handle
        .emit(
            "council-run-completed",
            serde_json::json!({ "runId": run_id }),
        )
        .ok();

    Ok(())
}
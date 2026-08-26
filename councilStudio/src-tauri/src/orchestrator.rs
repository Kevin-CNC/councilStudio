//! Council orchestration: run all enabled personas in parallel, then judge.
//!
//! Provider-independent: the orchestrator never branches on provider. It
//! resolves credentials and hands a single `ChatRequest` to
//! `providers::chat_completion` / `providers::judge_call`.

use crate::cmds::{JudgeResult, Persona, PersonaResult, RunAttachment};
use crate::providers::ChatRequest;
use tauri::{Emitter, Manager};

fn build_judge_prompt(prompt: &str, results: &[PersonaResult]) -> String {
    let mut p = format!(
        "You are a council judge. Synthesize the following responses from {} AI personas to the question below.\n\nReturn ONLY valid JSON (no markdown, no code fences) with exactly these fields:\n- summary: string — overall synthesis\n- consensus: string[] — points most personas agree on\n- disagreements: string[] — points where personas conflict\n- minority_views: string[] — claims made by only one persona\n- recommendations: string[] — actionable next steps\n- confidence_score: number 0-100 — how confident the synthesis is\n- synthesis: string — detailed narrative synthesis\n- diagrams: array of {{\"id\": string, \"code\": string, \"caption\": string}} — `code` is raw mermaid source (no fences). Include only if a diagram genuinely helps; else [].\n- citations: array of {{\"id\": string, \"source\": string, \"url\": string, \"excerpt\": string}} — external sources you reference in summary/synthesis via [{{n}}] markers; else [].\n- missing_personas: string[] — names of personas that failed or gave no usable response.\n\n`summary` and `synthesis` are markdown and may contain ```mermaid fences and [{{n}}] citation markers. Never emit raw HTML.\n\n## QUESTION\n{}\n\n## PERSONA RESPONSES\n\n",
        results.len(),
        prompt
    );
    for (i, r) in results.iter().enumerate() {
        let status_label = if r.status == "failed" {
            " [FAILED]"
        } else {
            ""
        };
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

/// Main method to run a council.
pub async fn run_council(
    app_handle: &tauri::AppHandle,
    prompt: &str,
    personas: &[Persona],
    judge_model: &str,
    judge_provider: &str,
    attachments: &[RunAttachment],
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
        let base_url = keys.get(&format!("{}_url", persona.provider)).cloned();
        let attachments = attachments.to_vec();

        let task = tokio::spawn(async move {
            let started_at = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            // Tell the frontend this member is now working.
            app_handle
                .emit(
                    "persona-status",
                    serde_json::json!({
                        "personaId": persona.id,
                        "personaName": persona.name,
                        "status": "thinking"
                    }),
                )
                .ok();

            // Harness contract: append to the persona's system prompt so every
            // provider gets the same diagram/citation/cross-ref instructions.
            let sys_prompt = format!(
                "{}{}",
                persona.sys_prompt,
                crate::harness::HARNESS_INSTRUCTIONS
            );

            // One call, any provider. A missing key comes back as Err and
            // becomes a failed PersonaResult below.
            let result = crate::providers::chat_completion(
                &client,
                ChatRequest {
                    provider: &persona.provider,
                    api_key: api_key.as_deref(),
                    base_url: base_url.as_deref(),
                    model: &persona.model,
                    system_prompt: &sys_prompt,
                    user_prompt: &prompt,
                    temperature: persona.temp,
                    max_tokens: persona.max_tokens,
                    attachments: &attachments,
                },
            )
            .await;

            let persona_result = match result {
                Ok(mut r) => {
                    r.persona_id = persona.id.clone();
                    r.persona_name = persona.name.clone();
                    // Citations are parsed before persona_id is known — fill it in.
                    for c in r.citations.iter_mut() {
                        c.persona_id = persona.id.clone();
                    }
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
                    input_cost: 0.0,
                    output_cost: 0.0,
                    started_at,
                    completed_at: None,
                    raw_response: None,
                    citations: vec![],
                },
            };

            // Emit per-persona result (success or failure)
            app_handle.emit("persona-result", &persona_result).ok();
            persona_result
        });

        tasks.push(task);
    }

    // 4. Wait for all to settle
    let mut results: Vec<PersonaResult> = Vec::new();
    for task in tasks {
        if let Ok(result) = task.await {
            results.push(result);
        }
    }

    // Spec `missingPersonas`: members that produced no result or a failed one.
    // Authoritative here — the judge's own enumeration is advisory.
    let missing_personas: Vec<String> = personas
        .iter()
        .filter(|p| p.enabled)
        .filter(|p| match results.iter().find(|r| r.persona_id == p.id) {
            None => true,
            Some(r) => r.status != "completed",
        })
        .map(|p| p.name.clone())
        .collect();

    // 5. Build judge prompt
    let synthesis_prompt = build_judge_prompt(prompt, &results);

    // 6. Call judge — same single method as personas, judge system prompt applied
    app_handle
        .emit("judge-status", serde_json::json!({ "status": "thinking" }))
        .ok();

    let judge_result = crate::providers::judge_call(
        &client,
        ChatRequest {
            provider: judge_provider,
            api_key: keys.get(judge_provider).map(String::as_str),
            base_url: keys
                .get(&format!("{judge_provider}_url"))
                .map(String::as_str),
            model: judge_model,
            system_prompt: "", // overridden by judge_call
            user_prompt: &synthesis_prompt,
            temperature: 0.7,
            max_tokens: 4096,
            attachments,
        },
    )
    .await;

    let mut judge_result = match judge_result {
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
            cost: 0.0,
            raw_response: None,
            diagrams: vec![],
            citations: vec![],
            missing_personas: vec![],
        },
    };

    // Authoritative missing-personas list (judge's own list is advisory).
    judge_result.missing_personas = missing_personas;

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

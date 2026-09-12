//! Council orchestration: run all enabled personas in parallel, then judge.
//!
//! Provider-independent: the orchestrator never branches on provider. It
//! resolves credentials and hands a single `ChatRequest` to
//! `providers::chat_completion` / `providers::judge_call`.

use crate::cmds::{JudgeResult, Persona, PersonaResult, RunAttachment};
use crate::providers::{ChatMsg, ChatRequest};
use tauri::{Emitter, Manager};

/// Cap on tool-call rounds per persona — failure is local, never a runaway loop.
const MAX_TOOL_ROUNDS: usize = 8;

fn build_judge_prompt(prompt: &str, results: &[PersonaResult]) -> String {
    let mut p = format!(
        "You are a council judge. Synthesize the following responses from {} AI personas to the question below.\n\nRespond with ONLY a single JSON object. Begin with `{{`, end with `}}`. No markdown, no code fences, no prose. Use exactly these fields:\n- summary: string — overall synthesis\n- consensus: string[] — points most personas agree on\n- disagreements: string[] — points where personas conflict\n- minority_views: string[] — claims made by only one persona\n- recommendations: string[] — actionable next steps\n- confidence_score: number 0-100 — how confident the synthesis is\n- synthesis: string — detailed narrative synthesis\n- diagrams: array of {{\"id\": string, \"code\": string, \"caption\": string}} — `code` is raw mermaid source (no fences). Include only if a diagram genuinely helps; else [].\n- citations: array of {{\"id\": string, \"source\": string, \"url\": string, \"excerpt\": string}} — external sources you reference in summary/synthesis via [{{n}}] markers; each marker's `n` must equal that citation's string `id`; else [].\n- tables: array of {{\"id\": string, \"caption\": string, \"columns\": [string], \"rows\": [[string]]}} — structured comparison data; each row has one cell per column; else [].\n- missing_personas: string[] — names of personas that failed or gave no usable response.\n\n`summary` and `synthesis` are markdown and may contain ```mermaid fences, [{{n}}] citation markers, {{{{@Name}}}} cross-references to persona names, and ```table fenced blocks (one JSON object {{\"caption\",\"columns\",\"rows\"}} — auto-extracted and renumbered, so prefer the JSON `tables` array). Never emit raw HTML.\n\n## QUESTION\n{}\n\n## PERSONA RESPONSES\n\n",
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

            // Resolve this persona's MCP tools. Empty assignments collapse to
            // the plain single-shot path (byte-identical wire body).
            let (tools, connectors, tool_owner, mcp_note) =
                resolve_persona_tools(&app_handle, &persona).await;

            let result = if tools.is_empty() {
                // One call, any provider. A missing key comes back as Err and
                // becomes a failed PersonaResult below.
                crate::providers::chat_completion(
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
                        tools: &[],
                    },
                )
                .await
                .map(|mut r| {
                    r.note = mcp_note.clone();
                    r
                })
            } else {
                run_with_tools(
                    &client,
                    &persona,
                    &sys_prompt,
                    &prompt,
                    &attachments,
                    api_key.as_deref(),
                    base_url.as_deref(),
                    &tools,
                    &connectors,
                    &tool_owner,
                    mcp_note.clone(),
                )
                .await
            };

            let persona_result = match result {
                Ok(mut r) => {
                    r.persona_id = persona.id.clone();
                    r.persona_name = persona.name.clone();
                    // Citations/tables are parsed before persona_id is known — fill it in.
                    for c in r.citations.iter_mut() {
                        c.persona_id = persona.id.clone();
                    }
                    for t in r.tables.iter_mut() {
                        t.persona_id = persona.id.clone();
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
                    note: mcp_note.clone(),
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
                    tables: vec![],
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
            tools: &[],
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
            tables: vec![],
            missing_personas: vec![],
            started_at: 0,
            completed_at: None,
            structured: false,
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

/// Connect to every MCP server assigned to a persona and collect its tools.
/// Returns the merged tool list, the live connectors, a parallel ownership map
/// (tool index → connector index), and an optional note recording partial
/// failures. An empty tool list with a non-empty note means "ran without
/// tools" (plan: MCP unreachable at run start → plain fallback).
async fn resolve_persona_tools(
    app_handle: &tauri::AppHandle,
    persona: &Persona,
) -> (
    Vec<crate::mcp::McpTool>,
    Vec<Box<dyn crate::mcp::McpConnector>>,
    Vec<usize>,
    Option<String>,
) {
    if persona.mcp_server_ids.is_empty() {
        return (Vec::new(), Vec::new(), Vec::new(), None);
    }

    // Server rows come from the DB; secrets from the encrypted store.
    let rows = {
        let state = app_handle.state::<crate::db::DbState>();
        let conn = match state.0.lock() {
            Ok(c) => c,
            Err(_) => {
                return (
                    Vec::new(),
                    Vec::new(),
                    Vec::new(),
                    Some("MCP unavailable (database lock)".to_string()),
                )
            }
        };
        persona
            .mcp_server_ids
            .iter()
            .map(|id| {
                conn.query_row(
                    "SELECT id, name, transport, command, args_json, env_keys_json, url,
                            headers_json, has_bearer, created_at, updated_at
                     FROM mcp_servers WHERE id = ?1",
                    [id],
                    |row| {
                        let args_json: String = row.get("args_json")?;
                        let headers_json: String = row.get("headers_json")?;
                        Ok((
                            row.get::<_, String>("id")?,
                            row.get::<_, String>("name")?,
                            row.get::<_, String>("transport")?,
                            row.get::<_, String>("command")?,
                            serde_json::from_str::<Vec<String>>(&args_json).unwrap_or_default(),
                            row.get::<_, String>("url")?,
                            serde_json::from_str::<std::collections::HashMap<String, String>>(
                                &headers_json,
                            )
                            .unwrap_or_default(),
                        ))
                    },
                )
                .map_err(|e| format!("{id}: {e}"))
            })
            .collect::<Vec<_>>()
    };

    let app_data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string());

    let mut tools: Vec<crate::mcp::McpTool> = Vec::new();
    let mut tool_owner: Vec<usize> = Vec::new();
    let mut connectors: Vec<Box<dyn crate::mcp::McpConnector>> = Vec::new();
    let mut failures: Vec<String> = Vec::new();

    for row in rows {
        let (id, name, transport, command, args, url, headers) = match row {
            Ok(r) => r,
            Err(e) => {
                failures.push(format!("server lookup failed: {e}"));
                continue;
            }
        };
        let secrets = match &app_data_dir {
            Ok(dir) => crate::mcp_secrets::get_secrets(dir, &id)
                .ok()
                .flatten()
                .unwrap_or_default(),
            Err(_) => crate::mcp_secrets::McpSecretBundle::default(),
        };
        let config = crate::mcp::McpServerConfig {
            transport,
            command,
            args,
            env: secrets.env.into_iter().collect(),
            url,
            headers: headers.into_iter().collect(),
        };
        match crate::mcp::connect(&config, secrets.bearer_token.as_deref()).await {
            Ok(connector) => match connector.list_tools().await {
                Ok(server_tools) => {
                    let owner = connectors.len();
                    // Merge first-wins on name collisions across servers.
                    for t in server_tools {
                        if !tools.iter().any(|existing| existing.name == t.name) {
                            tools.push(t);
                            tool_owner.push(owner);
                        }
                    }
                    connectors.push(connector);
                }
                Err(e) => failures.push(format!("{name}: {e}")),
            },
            Err(e) => failures.push(format!("{name}: {e}")),
        }
    }

    let note = if failures.is_empty() {
        None
    } else if tools.is_empty() {
        Some(format!(
            "MCP unreachable ({}); ran without tools",
            failures.join("; ")
        ))
    } else {
        Some(format!("Some MCP servers failed: {}", failures.join("; ")))
    };

    (tools, connectors, tool_owner, note)
}

/// The bounded tool-call loop. Runs only when the persona has ≥1 usable tool:
/// up to `MAX_TOOL_ROUNDS` rounds of (model → tool calls → results), then a
/// final harness-parsed answer. Cost/tokens sum across rounds; a tool error
/// becomes an error-text tool result and the loop continues.
#[allow(clippy::too_many_arguments)]
async fn run_with_tools(
    client: &reqwest::Client,
    persona: &Persona,
    sys_prompt: &str,
    prompt: &str,
    attachments: &[RunAttachment],
    api_key: Option<&str>,
    base_url: Option<&str>,
    tools: &[crate::mcp::McpTool],
    connectors: &[Box<dyn crate::mcp::McpConnector>],
    tool_owner: &[usize],
    note: Option<String>,
) -> Result<PersonaResult, String> {
    let started_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let mut messages = vec![
        ChatMsg::System(sys_prompt.to_string()),
        ChatMsg::User {
            text: prompt.to_string(),
            include_attachments: true,
        },
    ];

    let mut tokens_in = 0u64;
    let mut tokens_out = 0u64;
    let mut cost = 0.0;
    let mut input_cost = 0.0;
    let mut output_cost = 0.0;
    let mut last_raw: Option<String> = None;
    let mut final_text: Option<String> = None;

    for _round in 0..MAX_TOOL_ROUNDS {
        let step = crate::providers::chat_step(
            client,
            &ChatRequest {
                provider: &persona.provider,
                api_key,
                base_url,
                model: &persona.model,
                system_prompt: sys_prompt,
                user_prompt: prompt,
                temperature: persona.temp,
                max_tokens: persona.max_tokens,
                attachments,
                tools,
            },
            &messages,
        )
        .await?;

        tokens_in += step.usage.prompt_tokens;
        tokens_out += step.usage.completion_tokens;
        let round_cost =
            crate::pricing::resolve_cost(client, &persona.provider, &persona.model, &step.usage)
                .await;
        cost += round_cost.total;
        input_cost += round_cost.input_cost;
        output_cost += round_cost.output_cost;
        last_raw = Some(step.raw_response);

        if step.tool_calls.is_empty() {
            final_text = Some(step.text);
            break;
        }

        messages.push(ChatMsg::AssistantToolUse {
            text: step.text,
            calls: step.tool_calls.clone(),
        });

        // Execute each call against the connector that advertised the tool
        // (ownership recorded at merge time; first-wins on name collisions).
        for call in &step.tool_calls {
            let args = match call.args.clone() {
                serde_json::Value::Object(map) => map,
                other => {
                    let mut map = rmcp::model::JsonObject::new();
                    map.insert("value".to_string(), other);
                    map
                }
            };
            let owner = tools
                .iter()
                .position(|t| t.name == call.name)
                .and_then(|idx| tool_owner.get(idx))
                .and_then(|&owner| connectors.get(owner));
            let result = match owner {
                Some(connector) => connector.call_tool(&call.name, args).await,
                None => Err(format!("no MCP server provides tool {}", call.name)),
            };
            match result {
                Ok(text) => messages.push(ChatMsg::ToolResult {
                    call_id: call.id.clone(),
                    name: call.name.clone(),
                    content: text,
                    is_error: false,
                }),
                Err(e) => messages.push(ChatMsg::ToolResult {
                    call_id: call.id.clone(),
                    name: call.name.clone(),
                    content: format!("Tool error: {e}"),
                    is_error: true,
                }),
            }
        }
    }

    let final_text =
        final_text.unwrap_or_else(|| "Tool call limit reached without a final answer.".to_string());
    let completed_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    let (content, citations, tables) = crate::harness::parse_persona_response(&final_text);

    Ok(PersonaResult {
        persona_id: String::new(),   // filled by caller
        persona_name: String::new(), // filled by caller
        provider: persona.provider.clone(),
        model: persona.model.clone(),
        status: "completed".to_string(),
        content,
        error: None,
        note,
        tokens_in,
        tokens_out,
        latency_ms: completed_at - started_at,
        cost,
        input_cost,
        output_cost,
        started_at,
        completed_at: Some(completed_at),
        raw_response: last_raw,
        citations, // persona_id filled by caller
        tables,    // persona_id filled by caller
    })
}

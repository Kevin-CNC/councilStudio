use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

/// A council member (also called persona or agent elsewhere). This is the public API shape.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Persona {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(rename = "systemPrompt")]
    pub sys_prompt: String,
    #[serde(rename = "temperature")]
    pub temp: f64,
    #[serde(rename = "maxTokens")]
    pub max_tokens: i64,
    pub enabled: bool,
    pub streaming: bool,
    pub color: String,
    #[serde(rename = "order")]
    pub sort_order: i32,
    #[serde(rename = "reasoningLevel")]
    pub reasoning_level: String,
}

/// Input for creating a new member. The backend assigns the id and a default sort_order.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaCreate {
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(rename = "systemPrompt")]
    pub sys_prompt: String,
    #[serde(rename = "temperature")]
    pub temp: f64,
    #[serde(rename = "maxTokens")]
    pub max_tokens: i64,
    pub enabled: bool,
    pub streaming: bool,
    pub color: String,
    #[serde(rename = "reasoningLevel")]
    pub reasoning_level: String,
    pub sort_order: Option<i32>,
}

/// Input for partially updating a member. `None` means leave the current value.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaUpdate {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    #[serde(rename = "systemPrompt")]
    pub sys_prompt: Option<String>,
    #[serde(rename = "temperature")]
    pub temp: Option<f64>,
    #[serde(rename = "maxTokens")]
    pub max_tokens: Option<i64>,
    pub enabled: Option<bool>,
    pub streaming: Option<bool>,
    pub color: Option<String>,
    #[serde(rename = "order")]
    pub sort_order: Option<i32>,
    #[serde(rename = "reasoningLevel")]
    pub reasoning_level: Option<String>,
}

/// Command wrapper for a partial update.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMemberRequest {
    pub id: String,
    pub updates: PersonaUpdate,
}

/// Command wrapper for a hard delete.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteMemberRequest {
    pub id: String,
}

/// One entry in a batch reorder request.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReorderItem {
    pub id: String,
    #[serde(rename = "order")]
    pub sort_order: i32,
}

// --- row mapping -----------------------------------------------------------

fn persona_from_row(row: &rusqlite::Row) -> Result<Persona, rusqlite::Error> {
    Ok(Persona {
        id: row.get("id")?,
        name: row.get("agent_name")?,
        provider: row.get("provider")?,
        model: row.get("model")?,
        sys_prompt: row.get("sys_prompt")?,
        temp: row.get("temp")?,
        max_tokens: row.get("max_tkns")?,
        enabled: row.get("enabled")?,
        streaming: row.get("streaming")?,
        color: row.get("agent_color")?,
        sort_order: row.get("registered_order")?,
        reasoning_level: row.get("reasoning")?,
    })
}

fn get_persona(conn: &rusqlite::Connection, id: &str) -> Result<Persona, String> {
    conn.query_row(
        "SELECT id, agent_name, provider, model, sys_prompt, temp, max_tkns,
                enabled, streaming, agent_color, registered_order, reasoning
         FROM agents
         WHERE id = ?1",
        [id],
        |row| persona_from_row(row),
    )
    .map_err(|e| e.to_string())
}

fn list_personas(conn: &rusqlite::Connection) -> Result<Vec<Persona>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, agent_name, provider, model, sys_prompt, temp, max_tkns,
                    enabled, streaming, agent_color, registered_order, reasoning
             FROM agents
             ORDER BY registered_order ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| persona_from_row(row))
        .map_err(|e| e.to_string())?;

    let mut personas = Vec::new();
    for row in rows {
        personas.push(row.map_err(|e| e.to_string())?);
    }
    Ok(personas)
}

// --- validation ------------------------------------------------------------

fn valid_uuid(id: &str) -> Result<(), String> {
    if id.trim().is_empty() {
        return Err("id is required".to_string());
    }
    Uuid::parse_str(id).map_err(|_| "id must be a valid uuid".to_string())?;
    Ok(())
}

fn valid_provider(provider: &str) -> Result<(), String> {
    match provider {
        "anthropic" | "openai" | "openrouter" | "ollama" => Ok(()),
        _ => Err(format!(
            "provider must be one of: anthropic, openai, openrouter, ollama; got {}",
            provider
        )),
    }
}

fn valid_reasoning_level(level: &str) -> Result<(), String> {
    match level {
        "none" | "low" | "medium" | "high" => Ok(()),
        _ => Err(format!(
            "reasoning_level must be one of: none, low, medium, high; got {}",
            level
        )),
    }
}

fn valid_hex_color(color: &str) -> Result<(), String> {
    if !color.starts_with('#') || color.len() != 7 {
        return Err("color must be a 6-digit hex color like #rrggbb".to_string());
    }
    let hex = &color[1..];
    if !hex.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("color must only contain hex digits after #".to_string());
    }
    Ok(())
}

fn validate_create(p: &PersonaCreate) -> Result<(), String> {
    if p.name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if p.name.chars().count() > 100 {
        return Err("name must be at most 100 characters".to_string());
    }
    if p.provider.trim().is_empty() {
        return Err("provider is required".to_string());
    }
    valid_provider(&p.provider)?;
    if p.model.trim().is_empty() {
        return Err("model is required".to_string());
    }
    if p.sys_prompt.chars().count() > 10_000 {
        return Err("system_prompt must be at most 10,000 characters".to_string());
    }
    valid_hex_color(&p.color)?;
    valid_reasoning_level(&p.reasoning_level)?;
    if !(0.0..=2.0).contains(&p.temp) {
        return Err("temp must be between 0.0 and 2.0".to_string());
    }
    if !(1..=200_000).contains(&p.max_tokens) {
        return Err("max_tokens must be between 1 and 200,000".to_string());
    }
    Ok(())
}

fn validate_update(u: &PersonaUpdate) -> Result<(), String> {
    if let Some(v) = &u.name {
        if v.trim().is_empty() {
            return Err("name cannot be empty".to_string());
        }
        if v.chars().count() > 100 {
            return Err("name must be at most 100 characters".to_string());
        }
    }
    if let Some(v) = &u.provider {
        if v.trim().is_empty() {
            return Err("provider cannot be empty".to_string());
        }
        valid_provider(v)?;
    }
    if let Some(v) = &u.model {
        if v.trim().is_empty() {
            return Err("model cannot be empty".to_string());
        }
    }
    if let Some(v) = &u.sys_prompt {
        if v.chars().count() > 10_000 {
            return Err("system_prompt must be at most 10,000 characters".to_string());
        }
    }
    if let Some(v) = &u.color {
        valid_hex_color(v)?;
    }
    if let Some(v) = &u.reasoning_level {
        valid_reasoning_level(v)?;
    }
    if let Some(v) = u.temp {
        if !(0.0..=2.0).contains(&v) {
            return Err("temp must be between 0.0 and 2.0".to_string());
        }
    }
    if let Some(v) = u.max_tokens {
        if !(1..=200_000).contains(&v) {
            return Err("max_tokens must be between 1 and 200,000".to_string());
        }
    }
    Ok(())
}

// --- commands --------------------------------------------------------------

/// Create a new council member. The backend assigns a UUID and a default sort_order if needed.
#[tauri::command]
pub fn create_member(state: State<DbState>, payload: PersonaCreate) -> Result<Persona, String> {
    validate_create(&payload)?;
    let id = Uuid::new_v4().to_string();

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let sort_order = match payload.sort_order {
        Some(order) => order,
        None => conn
            .query_row(
                "SELECT COALESCE(MAX(registered_order), 0) + 1 FROM agents",
                [],
                |row| row.get(0),
            )
            .unwrap_or(1),
    };

    conn.execute(
        "INSERT INTO agents
            (id, agent_name, provider, model, sys_prompt, temp, max_tkns,
             enabled, streaming, agent_color, registered_order, reasoning)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            id,
            payload.name,
            payload.provider,
            payload.model,
            payload.sys_prompt,
            payload.temp,
            payload.max_tokens,
            payload.enabled,
            payload.streaming,
            payload.color,
            sort_order,
            payload.reasoning_level,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_persona(&conn, &id)
}

/// Return all members ordered by sort_order.
#[tauri::command]
pub fn list_members(state: State<DbState>) -> Result<Vec<Persona>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    list_personas(&conn)
}

/// Partially update an existing member.
#[tauri::command]
pub fn update_member(
    state: State<DbState>,
    request: UpdateMemberRequest,
) -> Result<Persona, String> {
    valid_uuid(&request.id)?;
    validate_update(&request.updates)?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let changed = conn.execute(
        "UPDATE agents
         SET agent_name = COALESCE(?1, agent_name),
             provider = COALESCE(?2, provider),
             model = COALESCE(?3, model),
             sys_prompt = COALESCE(?4, sys_prompt),
             temp = COALESCE(?5, temp),
             max_tkns = COALESCE(?6, max_tkns),
             enabled = COALESCE(?7, enabled),
             streaming = COALESCE(?8, streaming),
             agent_color = COALESCE(?9, agent_color),
             registered_order = COALESCE(?10, registered_order),
             reasoning = COALESCE(?11, reasoning)
         WHERE id = ?12",
        params![
            request.updates.name,
            request.updates.provider,
            request.updates.model,
            request.updates.sys_prompt,
            request.updates.temp,
            request.updates.max_tokens,
            request.updates.enabled,
            request.updates.streaming,
            request.updates.color,
            request.updates.sort_order,
            request.updates.reasoning_level,
            request.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("member not found".to_string());
    }

    get_persona(&conn, &request.id)
}

/// Hard delete a member by id.
#[tauri::command]
pub fn delete_member(state: State<DbState>, request: DeleteMemberRequest) -> Result<(), String> {
    valid_uuid(&request.id)?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let changed = conn
        .execute("DELETE FROM agents WHERE id = ?1", [request.id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("member not found".to_string());
    }

    Ok(())
}

/// Batch update sort_order. All updates happen in one transaction.
#[tauri::command]
pub fn reorder_members(state: State<DbState>, items: Vec<ReorderItem>) -> Result<(), String> {
    if items.is_empty() {
        return Err("no reorder items provided".to_string());
    }
    for item in &items {
        valid_uuid(&item.id)?;
    }

    let mut conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut stmt = tx
        .prepare("UPDATE agents SET registered_order = ?1 WHERE id = ?2")
        .map_err(|e| e.to_string())?;

    for item in items {
        let changed = stmt
            .execute(params![item.sort_order, item.id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err(format!("member with id {} not found", item.id));
        }
    }

    drop(stmt);
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

/// Seed the four default personas from the spec if the database is empty.
#[tauri::command]
pub fn seed_default_members(state: State<DbState>) -> Result<Vec<Persona>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM agents", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err("database already seeded".to_string());
    }

    struct SeedPersona {
        name: &'static str,
        provider: &'static str,
        model: &'static str,
        temp: f64,
        max_tokens: i64,
        color: &'static str,
        sort_order: i32,
        reasoning_level: &'static str,
        sys_prompt: &'static str,
    }

    let seeds = [
        SeedPersona {
            name: "Pragmatist",
            provider: "anthropic",
            model: "claude-sonnet-5",
            temp: 0.7,
            max_tokens: 4096,
            color: "#3b82f6",
            sort_order: 1,
            reasoning_level: "medium",
            sys_prompt: "You are a pragmatic advisor. Focus on feasibility, second-order effects, and execution risk.",
        },
        SeedPersona {
            name: "Skeptic",
            provider: "openai",
            model: "gpt-4.1",
            temp: 0.7,
            max_tokens: 4096,
            color: "#ef4444",
            sort_order: 2,
            reasoning_level: "high",
            sys_prompt: "You are a skeptical reviewer. Attack assumptions, hunt for flaws, and expose risks others miss.",
        },
        SeedPersona {
            name: "Visionary",
            provider: "openrouter",
            model: "deepseek/deepseek-chat",
            temp: 0.8,
            max_tokens: 4096,
            color: "#8b5cf6",
            sort_order: 3,
            reasoning_level: "medium",
            sys_prompt: "You are a visionary thinker. Reframe the problem and explore unconventional angles.",
        },
        SeedPersona {
            name: "Specialist",
            provider: "anthropic",
            model: "claude-sonnet-5",
            temp: 0.7,
            max_tokens: 4096,
            color: "#10b981",
            sort_order: 4,
            reasoning_level: "medium",
            sys_prompt: "You are a deep technical specialist. Apply rigorous domain-specific depth to the topic.",
        },
    ];

    for seed in seeds {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO agents
                (id, agent_name, provider, model, sys_prompt, temp, max_tkns,
                 enabled, streaming, agent_color, registered_order, reasoning)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                id,
                seed.name,
                seed.provider,
                seed.model,
                seed.sys_prompt,
                seed.temp,
                seed.max_tokens,
                true,  // enabled
                true,  // streaming
                seed.color,
                seed.sort_order,
                seed.reasoning_level,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    list_personas(&conn)
}

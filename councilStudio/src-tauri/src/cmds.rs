use crate::db::DbState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager, State};
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
    /// MCP servers assigned to this member (server ids). Empty by default.
    #[serde(default)]
    pub mcp_server_ids: Vec<String>,
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
    #[serde(default)]
    pub mcp_server_ids: Option<Vec<String>>,
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
    #[serde(default)]
    pub mcp_server_ids: Option<Vec<String>>,
}

/// A mermaid diagram a member or the judge wants rendered.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Diagram {
    pub id: String,
    /// Raw mermaid source (no fences).
    pub code: String,
    #[serde(default)]
    pub caption: Option<String>,
}

/// A structured data table a member or the judge wants rendered. Extracted
/// from ```table fenced JSON blocks (members) or the judge's `tables` array;
/// members reference it in-place via a `{{table:n}}` marker left in `content`.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Table {
    pub id: String,
    #[serde(default)]
    pub caption: Option<String>,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub persona_id: String,
}

/// An external source cited by a member or the judge, surfaced inline via
/// `[{n}]` markers and listed in the Sources tab.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Citation {
    pub id: String,
    pub source: String,
    #[serde(default)]
    pub url: Option<String>,
    pub excerpt: String,
    pub persona_id: String,
}

// Result struct for a response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaResult {
    pub persona_id: String,
    pub persona_name: String,
    pub provider: String,
    pub model: String,
    pub status: String,
    pub content: String,
    pub error: Option<String>,
    /// Non-fatal annotation (e.g. "MCP unreachable — ran without tools").
    #[serde(default)]
    pub note: Option<String>,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub latency_ms: u64,
    pub cost: f64,
    #[serde(default)]
    pub input_cost: f64,
    #[serde(default)]
    pub output_cost: f64,
    pub started_at: u64,
    pub completed_at: Option<u64>,
    pub raw_response: Option<String>,
    /// External sources cited in `content` via `[{n}]` markers. Parsed out of
    /// the response's trailing ```references block.
    #[serde(default)]
    pub citations: Vec<Citation>,
    /// Structured tables extracted from ```table fenced blocks in `content`;
    /// each block is replaced by a `{{table:n}}` marker (1-based, in order).
    #[serde(default)]
    pub tables: Vec<Table>,
}

/// Structured synthesis from the judge persona.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JudgeResult {
    pub summary: String,
    pub consensus: Vec<String>,
    pub disagreements: Vec<String>,
    pub minority_views: Vec<String>,
    pub recommendations: Vec<String>,
    pub confidence_score: u32,
    pub synthesis: String,
    pub tokens_in: u64,
    pub tokens_out: u64,
    pub latency_ms: u64,
    #[serde(default)]
    pub cost: f64,
    pub raw_response: Option<String>,
    /// Mermaid diagrams the judge wants shown.
    #[serde(default)]
    pub diagrams: Vec<Diagram>,
    /// Sources the judge cited in `summary`/`synthesis` via `[{n}]` markers.
    #[serde(default)]
    pub citations: Vec<Citation>,
    /// Tables the judge wants shown — from its JSON `tables` array plus any
    /// ```table fences in `summary`/`synthesis` (markers `{{table:n}}` left
    /// inline, numbered across both fields in order).
    #[serde(default)]
    pub tables: Vec<Table>,
    /// Personas that failed/timed out (spec `missingPersonas`). The orchestrator
    /// computes this authoritatively; the judge's own list is advisory.
    #[serde(default)]
    pub missing_personas: Vec<String>,
    /// Wall-clock start of the judge call (unix ms) — drives the telemetry lane.
    #[serde(default)]
    pub started_at: u64,
    /// Wall-clock end of the judge call (unix ms); `None` while still running.
    #[serde(default)]
    pub completed_at: Option<u64>,
    /// Whether the judge returned parseable structured JSON. `false` → the UI
    /// shows an "unstructured" banner. Defaults true so legacy stored sessions
    /// parse as structured.
    #[serde(default = "default_true")]
    pub structured: bool,
}

fn default_true() -> bool {
    true
}

/// A single image attachment sent with a run. Session-only; never persisted as bytes.
#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunAttachment {
    pub name: String,
    pub mime_type: String,
    /// Bare base64, or a full "data:<mime>;base64,<data>" URL — normalized at use.
    #[serde(default)]
    pub data_base64: String,
}

/// Input for the run_council command.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunCouncilRequest {
    pub prompt: String,
    pub judge_model: String,
    pub judge_provider: String,
    /// Council whose ordered membership runs. `None` runs all enabled members (legacy).
    #[serde(default)]
    pub council_id: Option<String>,
    #[serde(default)]
    pub attachments: Vec<RunAttachment>,
}

/// Input for saving an API key.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveApiKeyRequest {
    pub provider: String,
    pub key: String,
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

/// A named, reusable council: an ordered subset of member ids. A member runs
/// only when it is both enabled (available) and present in the active council.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Council {
    pub id: String,
    pub name: String,
    pub member_ids: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Input for `create_council`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCouncilRequest {
    pub name: String,
}

/// Input for `update_council` — partial rename and/or membership replacement.
/// `None` means leave the current value.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCouncilRequest {
    pub id: String,
    pub name: Option<String>,
    pub member_ids: Option<Vec<String>>,
}

// --- sessions & prompt templates --------------------------------------------

/// Lightweight session row for list views — excludes `run_json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSummary {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub config_id: String,
    pub config_name: String,
    pub status: String,
    pub persona_count: i64,
    pub tokens_used: i64,
    pub total_cost: f64,
    pub duration_ms: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub tags: Vec<String>,
}

/// Full session row, including the serialized `CouncilRun` JSON blob.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub config_id: String,
    pub config_name: String,
    pub status: String,
    pub persona_count: i64,
    pub tokens_used: i64,
    pub total_cost: f64,
    pub duration_ms: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub pinned: bool,
    pub tags: Vec<String>,
    pub run_json: String,
    pub raw_responses_json: String,
    pub utility_json: String,
}

/// Input for `save_session` — an upsert keyed on `id`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCreate {
    pub id: String,
    pub title: String,
    pub prompt: String,
    pub config_id: String,
    pub config_name: String,
    pub status: String,
    pub persona_count: i64,
    pub tokens_used: i64,
    pub total_cost: f64,
    pub duration_ms: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub run_json: String,
    pub raw_responses_json: String,
    pub utility_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplateRow {
    pub id: String,
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub category: String,
    pub created_at: i64,
}

/// Input for `save_prompt_template`. `id: None` creates a new template;
/// `id: Some(existing)` upserts it.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTemplateCreate {
    pub id: Option<String>,
    pub name: String,
    pub description: String,
    pub prompt: String,
    pub category: String,
    pub created_at: Option<i64>,
}

/// Shared `{ id }` request shape for get/delete/pin-by-id commands.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdRequest {
    pub id: String,
}

fn session_summary_from_row(row: &rusqlite::Row) -> Result<SessionSummary, rusqlite::Error> {
    let tags_json: String = row.get("tags")?;
    Ok(SessionSummary {
        id: row.get("id")?,
        title: row.get("title")?,
        prompt: row.get("prompt")?,
        config_id: row.get("config_id")?,
        config_name: row.get("config_name")?,
        status: row.get("status")?,
        persona_count: row.get("persona_count")?,
        tokens_used: row.get("tokens_used")?,
        total_cost: row.get("total_cost")?,
        duration_ms: row.get("duration_ms")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        pinned: row.get("pinned")?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
    })
}

fn session_row_from_row(row: &rusqlite::Row) -> Result<SessionRow, rusqlite::Error> {
    let tags_json: String = row.get("tags")?;
    Ok(SessionRow {
        id: row.get("id")?,
        title: row.get("title")?,
        prompt: row.get("prompt")?,
        config_id: row.get("config_id")?,
        config_name: row.get("config_name")?,
        status: row.get("status")?,
        persona_count: row.get("persona_count")?,
        tokens_used: row.get("tokens_used")?,
        total_cost: row.get("total_cost")?,
        duration_ms: row.get("duration_ms")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        pinned: row.get("pinned")?,
        tags: serde_json::from_str(&tags_json).unwrap_or_default(),
        run_json: row.get("run_json")?,
        raw_responses_json: row.get("raw_responses_json")?,
        utility_json: row.get("utility_json")?,
    })
}

fn prompt_template_from_row(row: &rusqlite::Row) -> Result<PromptTemplateRow, rusqlite::Error> {
    Ok(PromptTemplateRow {
        id: row.get("id")?,
        name: row.get("name")?,
        description: row.get("description")?,
        prompt: row.get("prompt")?,
        category: row.get("category")?,
        created_at: row.get("created_at")?,
    })
}

/// Upsert a session (called by the frontend after a council run completes).
#[tauri::command]
pub fn save_session(state: State<DbState>, payload: SessionCreate) -> Result<(), String> {
    valid_uuid(&payload.id)?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    conn.execute(
        "INSERT INTO sessions
            (id, title, prompt, config_id, config_name, status, persona_count,
             tokens_used, total_cost, duration_ms, created_at, updated_at, run_json,
             raw_responses_json, utility_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
         ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            prompt = excluded.prompt,
            config_id = excluded.config_id,
            config_name = excluded.config_name,
            status = excluded.status,
            persona_count = excluded.persona_count,
            tokens_used = excluded.tokens_used,
            total_cost = excluded.total_cost,
            duration_ms = excluded.duration_ms,
            updated_at = excluded.updated_at,
            run_json = excluded.run_json,
            raw_responses_json = excluded.raw_responses_json,
            utility_json = excluded.utility_json",
        params![
            payload.id,
            payload.title,
            payload.prompt,
            payload.config_id,
            payload.config_name,
            payload.status,
            payload.persona_count,
            payload.tokens_used,
            payload.total_cost,
            payload.duration_ms,
            payload.created_at,
            payload.updated_at,
            payload.run_json,
            payload.raw_responses_json,
            payload.utility_json,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Return all sessions (without `run_json`), newest first.
#[tauri::command]
pub fn list_sessions(state: State<DbState>) -> Result<Vec<SessionSummary>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, prompt, config_id, config_name, status, persona_count,
                    tokens_used, total_cost, duration_ms, created_at, updated_at, pinned, tags
             FROM sessions
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], session_summary_from_row)
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    for row in rows {
        sessions.push(row.map_err(|e| e.to_string())?);
    }
    Ok(sessions)
}

/// Return one session including its full `run_json`.
#[tauri::command]
pub fn get_session(state: State<DbState>, request: IdRequest) -> Result<SessionRow, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    conn.query_row(
        "SELECT id, title, prompt, config_id, config_name, status, persona_count,
                tokens_used, total_cost, duration_ms, created_at, updated_at, pinned, tags, run_json, raw_responses_json, utility_json
         FROM sessions
         WHERE id = ?1",
        [&request.id],
        session_row_from_row,
    )
    .map_err(|e| e.to_string())
}

/// Delete a session by id.
#[tauri::command]
pub fn delete_session(state: State<DbState>, request: IdRequest) -> Result<(), String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let changed = conn
        .execute("DELETE FROM sessions WHERE id = ?1", [&request.id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("session not found".to_string());
    }
    Ok(())
}

/// Toggle a session's pinned flag and return the updated row.
#[tauri::command]
pub fn pin_session(state: State<DbState>, request: IdRequest) -> Result<SessionRow, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let changed = conn
        .execute(
            "UPDATE sessions SET pinned = NOT pinned WHERE id = ?1",
            [&request.id],
        )
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("session not found".to_string());
    }

    conn.query_row(
        "SELECT id, title, prompt, config_id, config_name, status, persona_count,
                tokens_used, total_cost, duration_ms, created_at, updated_at, pinned, tags, run_json, raw_responses_json, utility_json
         FROM sessions
         WHERE id = ?1",
        [&request.id],
        session_row_from_row,
    )
    .map_err(|e| e.to_string())
}

/// Create or update a prompt template. `id: None` generates a new UUID.
#[tauri::command]
pub fn save_prompt_template(
    state: State<DbState>,
    payload: PromptTemplateCreate,
) -> Result<PromptTemplateRow, String> {
    if payload.name.trim().is_empty() {
        return Err("name is required".to_string());
    }

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let id = payload.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let created_at = payload.created_at.unwrap_or_else(now_ms);

    conn.execute(
        "INSERT INTO prompt_templates (id, name, description, prompt, category, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            prompt = excluded.prompt,
            category = excluded.category",
        params![
            id,
            payload.name,
            payload.description,
            payload.prompt,
            payload.category,
            created_at,
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, name, description, prompt, category, created_at
         FROM prompt_templates WHERE id = ?1",
        [&id],
        prompt_template_from_row,
    )
    .map_err(|e| e.to_string())
}

/// Return all prompt templates, newest first.
#[tauri::command]
pub fn list_prompt_templates(state: State<DbState>) -> Result<Vec<PromptTemplateRow>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, prompt, category, created_at
             FROM prompt_templates
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], prompt_template_from_row)
        .map_err(|e| e.to_string())?;

    let mut templates = Vec::new();
    for row in rows {
        templates.push(row.map_err(|e| e.to_string())?);
    }
    Ok(templates)
}

/// Delete a prompt template by id.
#[tauri::command]
pub fn delete_prompt_template(state: State<DbState>, request: IdRequest) -> Result<(), String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let changed = conn
        .execute("DELETE FROM prompt_templates WHERE id = ?1", [&request.id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("template not found".to_string());
    }
    Ok(())
}

/// Create a new, empty named council.
#[tauri::command]
pub fn create_council(
    state: State<DbState>,
    request: CreateCouncilRequest,
) -> Result<Council, String> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err("name is required".to_string());
    }

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let id = Uuid::new_v4().to_string();
    let now = now_ms();

    conn.execute(
        "INSERT INTO councils (id, name, member_ids, created_at, updated_at)
         VALUES (?1, ?2, '[]', ?3, ?3)",
        params![id, name, now],
    )
    .map_err(|e| e.to_string())?;

    Ok(Council {
        id,
        name: name.to_string(),
        member_ids: Vec::new(),
        created_at: now,
        updated_at: now,
    })
}

/// Return all councils in creation order.
#[tauri::command]
pub fn list_councils(state: State<DbState>) -> Result<Vec<Council>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    list_councils_inner(&conn)
}

/// Partially update a council: rename and/or replace its ordered membership.
#[tauri::command]
pub fn update_council(
    state: State<DbState>,
    request: UpdateCouncilRequest,
) -> Result<Council, String> {
    valid_uuid(&request.id)?;

    let new_name = match request.name {
        None => None,
        Some(name) => {
            let name = name.trim().to_string();
            if name.is_empty() {
                return Err("name is required".to_string());
            }
            Some(name)
        }
    };

    let new_member_ids = match request.member_ids {
        None => None,
        Some(member_ids) => {
            for id in &member_ids {
                valid_uuid(id)?;
            }
            Some(member_ids)
        }
    };

    if new_name.is_none() && new_member_ids.is_none() {
        return Err("nothing to update".to_string());
    }

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let mut council = get_council(&conn, &request.id)?;

    if let Some(name) = new_name {
        council.name = name;
    }
    if let Some(member_ids) = new_member_ids {
        council.member_ids = member_ids;
    }
    council.updated_at = now_ms();

    let member_ids_json = serde_json::to_string(&council.member_ids).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE councils SET name = ?1, member_ids = ?2, updated_at = ?3 WHERE id = ?4",
        params![
            council.name,
            member_ids_json,
            council.updated_at,
            request.id
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(council)
}

/// Delete a council by id. Sessions referencing it keep their stored snapshot.
#[tauri::command]
pub fn delete_council(state: State<DbState>, request: IdRequest) -> Result<(), String> {
    valid_uuid(&request.id)?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    let changed = conn
        .execute("DELETE FROM councils WHERE id = ?1", [&request.id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("council not found".to_string());
    }
    Ok(())
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// --- row mapping -----------------------------------------------------------

fn persona_from_row(row: &rusqlite::Row) -> Result<Persona, rusqlite::Error> {
    let mcp_server_ids_json: String = row.get("mcp_server_ids")?;
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
        mcp_server_ids: serde_json::from_str(&mcp_server_ids_json).unwrap_or_default(),
    })
}

fn get_persona(conn: &rusqlite::Connection, id: &str) -> Result<Persona, String> {
    conn.query_row(
        "SELECT id, agent_name, provider, model, sys_prompt, temp, max_tkns,
                enabled, streaming, agent_color, registered_order, reasoning, mcp_server_ids
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
                    enabled, streaming, agent_color, registered_order, reasoning, mcp_server_ids
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

fn council_from_row(row: &rusqlite::Row) -> Result<Council, rusqlite::Error> {
    let member_ids_json: String = row.get("member_ids")?;
    Ok(Council {
        id: row.get("id")?,
        name: row.get("name")?,
        member_ids: serde_json::from_str(&member_ids_json).unwrap_or_default(),
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn get_council(conn: &rusqlite::Connection, id: &str) -> Result<Council, String> {
    conn.query_row(
        "SELECT id, name, member_ids, created_at, updated_at
         FROM councils
         WHERE id = ?1",
        [id],
        council_from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => "council not found".to_string(),
        e => e.to_string(),
    })
}

fn list_councils_inner(conn: &rusqlite::Connection) -> Result<Vec<Council>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, name, member_ids, created_at, updated_at
             FROM councils
             ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], council_from_row)
        .map_err(|e| e.to_string())?;

    let mut councils = Vec::new();
    for row in rows {
        councils.push(row.map_err(|e| e.to_string())?);
    }
    Ok(councils)
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
    if let Some(ids) = &p.mcp_server_ids {
        for id in ids {
            valid_uuid(id)?;
        }
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
    if let Some(ids) = &u.mcp_server_ids {
        for id in ids {
            valid_uuid(id)?;
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
             enabled, streaming, agent_color, registered_order, reasoning, mcp_server_ids)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
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
            serde_json::to_string(&payload.mcp_server_ids.unwrap_or_default())
                .map_err(|e| e.to_string())?,
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

    let changed = conn
        .execute(
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
             reasoning = COALESCE(?11, reasoning),
             mcp_server_ids = COALESCE(?12, mcp_server_ids)
         WHERE id = ?13",
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
                request
                    .updates
                    .mcp_server_ids
                    .as_ref()
                    .map(serde_json::to_string)
                    .transpose()
                    .map_err(|e| e.to_string())?,
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
        .execute("DELETE FROM agents WHERE id = ?1", [&request.id])
        .map_err(|e| e.to_string())?;

    if changed == 0 {
        return Err("member not found".to_string());
    }

    // Strip the deleted id from every council's membership so councils never dangle.
    let affected: Vec<Council> = list_councils_inner(&conn)?
        .into_iter()
        .filter(|c| c.member_ids.contains(&request.id))
        .collect();
    if !affected.is_empty() {
        let now = now_ms();
        let mut stmt = conn
            .prepare("UPDATE councils SET member_ids = ?1, updated_at = ?2 WHERE id = ?3")
            .map_err(|e| e.to_string())?;
        for mut council in affected {
            council.member_ids.retain(|id| id != &request.id);
            let member_ids_json =
                serde_json::to_string(&council.member_ids).map_err(|e| e.to_string())?;
            stmt.execute(params![member_ids_json, now, council.id])
                .map_err(|e| e.to_string())?;
        }
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
                true, // enabled
                true, // streaming
                seed.color,
                seed.sort_order,
                seed.reasoning_level,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    list_personas(&conn)
}

/// Run a council in parallel, then synthesize with a judge. When `council_id`
/// is present, the run set is that council's members (in council order) filtered
/// by availability; otherwise all enabled members run (legacy behavior).
#[tauri::command]
pub async fn run_council(
    state: tauri::State<'_, DbState>,
    app_handle: tauri::AppHandle,
    request: RunCouncilRequest,
) -> Result<(), String> {
    let enabled: Vec<Persona> = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;

        match request.council_id.as_deref() {
            Some(council_id) => {
                valid_uuid(council_id)?;
                let council = get_council(&conn, council_id)?;
                let by_id: std::collections::HashMap<String, Persona> = list_personas(&conn)?
                    .into_iter()
                    .map(|p| (p.id.clone(), p))
                    .collect();
                // Council order, unknown ids dropped, then availability filter.
                council
                    .member_ids
                    .iter()
                    .filter_map(|id| by_id.get(id).cloned())
                    .filter(|p| p.enabled)
                    .collect()
            }
            // Legacy fallback: all enabled members.
            None => list_personas(&conn)?
                .into_iter()
                .filter(|p| p.enabled)
                .collect(),
        }
    };

    if enabled.is_empty() {
        return Err("No enabled council members".to_string());
    }

    crate::orchestrator::run_council(
        &app_handle,
        &request.prompt,
        &enabled,
        &request.judge_model,
        &request.judge_provider,
        &request.attachments,
    )
    .await
}

/// Cancel a running council. MVP: emits a cancelled event; frontend ignores further results.
#[tauri::command]
pub async fn cancel_run(app_handle: tauri::AppHandle) -> Result<(), String> {
    app_handle
        .emit("council-run-cancelled", ())
        .map_err(|e| e.to_string())
}

/// Save an API key for a provider.
#[tauri::command]
pub fn save_api_key(
    app_handle: tauri::AppHandle,
    request: SaveApiKeyRequest,
) -> Result<(), String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    crate::secrets::save_key(&app_data_dir, &request.provider, &request.key)
}

/// Check whether each member's model supports the required input/output modalities.
#[tauri::command]
pub async fn check_model_compatibility(
    request: crate::compatibility::CompatibilityCheckRequest,
) -> Result<crate::compatibility::CompatibilityCheckResult, String> {
    crate::compatibility::run_compatibility_check(request).await
}

// --- MCP integration servers ------------------------------------------------

/// An MCP server row as the frontend sees it. Secret material (bearer token,
/// env values) never appears here — `has_bearer` and `env_keys` are display
/// metadata only.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerRow {
    pub id: String,
    pub name: String,
    pub transport: String, // "stdio" | "http"
    pub command: String,
    pub args: Vec<String>,
    /// Env variable NAMES for stdio configs. Values live in the encrypted
    /// secret store and are never returned.
    pub env_keys: Vec<String>,
    pub url: String,
    /// Extra http headers (non-secret).
    pub headers: std::collections::HashMap<String, String>,
    /// Whether a bearer token is stored for this server.
    pub has_bearer: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// Input for `create_mcp_server`. `bearer_token` and `env` values are split
/// off into the encrypted secret store before the row is written.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerCreate {
    pub name: String,
    pub transport: String,
    #[serde(default)]
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    /// stdio env entries — values are secrets.
    #[serde(default)]
    pub env: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub url: String,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub bearer_token: Option<String>,
}

/// Input for `update_mcp_server` — `None` leaves the value. For the bearer
/// token, `Some("")` clears the stored secret and `Some(v)` replaces it.
/// Env merges per key: non-empty value sets, empty value deletes, absent
/// key keeps its stored value.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerUpdate {
    pub id: String,
    pub name: Option<String>,
    pub transport: Option<String>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub env: Option<std::collections::HashMap<String, String>>,
    pub url: Option<String>,
    pub headers: Option<std::collections::HashMap<String, String>>,
    #[serde(default)]
    pub bearer_token: Option<String>,
}

/// Result of a `test_mcp_connection` probe: connect + list_tools.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTestResult {
    pub ok: bool,
    pub tools: Vec<crate::mcp::McpTool>,
    pub error: Option<String>,
}

/// Bulk-assign payload: add `mcp_server_id` to every member in `member_ids`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignMcpRequest {
    pub mcp_server_id: String,
    pub member_ids: Vec<String>,
}

fn valid_transport(transport: &str) -> Result<(), String> {
    match transport {
        "stdio" | "http" => Ok(()),
        other => Err(format!(
            "transport must be one of: stdio, http; got {other}"
        )),
    }
}

fn validate_mcp_fields(
    name: &str,
    transport: &str,
    command: &str,
    url: &str,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("name is required".to_string());
    }
    if name.chars().count() > 100 {
        return Err("name must be at most 100 characters".to_string());
    }
    valid_transport(transport)?;
    match transport {
        "stdio" if command.trim().is_empty() => {
            return Err("command is required for stdio transport".to_string());
        }
        "http" => {
            if url.trim().is_empty() {
                return Err("url is required for http transport".to_string());
            }
            if !url.starts_with("http://") && !url.starts_with("https://") {
                return Err("url must start with http:// or https://".to_string());
            }
        }
        _ => {}
    }
    Ok(())
}

fn mcp_server_from_row(row: &rusqlite::Row) -> Result<McpServerRow, rusqlite::Error> {
    let args_json: String = row.get("args_json")?;
    let env_keys_json: String = row.get("env_keys_json")?;
    let headers_json: String = row.get("headers_json")?;
    Ok(McpServerRow {
        id: row.get("id")?,
        name: row.get("name")?,
        transport: row.get("transport")?,
        command: row.get("command")?,
        args: serde_json::from_str(&args_json).unwrap_or_default(),
        env_keys: serde_json::from_str(&env_keys_json).unwrap_or_default(),
        url: row.get("url")?,
        headers: serde_json::from_str(&headers_json).unwrap_or_default(),
        has_bearer: row.get("has_bearer")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
    })
}

fn get_mcp_server(conn: &rusqlite::Connection, id: &str) -> Result<McpServerRow, String> {
    conn.query_row(
        "SELECT id, name, transport, command, args_json, env_keys_json, url,
                headers_json, has_bearer, created_at, updated_at
         FROM mcp_servers
         WHERE id = ?1",
        [id],
        mcp_server_from_row,
    )
    .map_err(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => "mcp server not found".to_string(),
        e => e.to_string(),
    })
}

/// Create an MCP server. Secrets are written to the encrypted store first; if
/// the row insert fails the secrets are rolled back so nothing dangles.
#[tauri::command]
pub fn create_mcp_server(
    state: State<DbState>,
    app_handle: tauri::AppHandle,
    payload: McpServerCreate,
) -> Result<McpServerRow, String> {
    validate_mcp_fields(
        &payload.name,
        &payload.transport,
        &payload.command,
        &payload.url,
    )?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();

    let bundle = crate::mcp_secrets::McpSecretBundle {
        env: payload.env.clone(),
        bearer_token: payload
            .bearer_token
            .as_ref()
            .filter(|t| !t.trim().is_empty())
            .cloned(),
    };
    crate::mcp_secrets::put_secrets(&app_data_dir, &id, bundle.clone())?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let now = now_ms();
    let env_keys: Vec<String> = payload.env.keys().cloned().collect();

    let insert = conn.execute(
        "INSERT INTO mcp_servers
            (id, name, transport, command, args_json, env_keys_json, url,
             headers_json, has_bearer, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
        params![
            id,
            payload.name.trim(),
            payload.transport,
            payload.command,
            serde_json::to_string(&payload.args).map_err(|e| e.to_string())?,
            serde_json::to_string(&env_keys).map_err(|e| e.to_string())?,
            payload.url,
            serde_json::to_string(&payload.headers).map_err(|e| e.to_string())?,
            bundle.bearer_token.is_some(),
            now,
        ],
    );
    if let Err(e) = insert {
        let _ = crate::mcp_secrets::delete_secrets(&app_data_dir, &id);
        return Err(e.to_string());
    }

    get_mcp_server(&conn, &id)
}

/// Return all MCP servers, newest first.
#[tauri::command]
pub fn list_mcp_servers(state: State<DbState>) -> Result<Vec<McpServerRow>, String> {
    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, transport, command, args_json, env_keys_json, url,
                    headers_json, has_bearer, created_at, updated_at
             FROM mcp_servers
             ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], mcp_server_from_row)
        .map_err(|e| e.to_string())?;
    let mut servers = Vec::new();
    for row in rows {
        servers.push(row.map_err(|e| e.to_string())?);
    }
    Ok(servers)
}

/// Partially update an MCP server. Fields follow the member-update convention:
/// `None` keeps. For secrets, bearer `Some("")` clears / `Some(v)` replaces.
/// Env entries merge per key: non-empty sets, empty deletes, absent keeps.
#[tauri::command]
pub fn update_mcp_server(
    state: State<DbState>,
    app_handle: tauri::AppHandle,
    payload: McpServerUpdate,
) -> Result<McpServerRow, String> {
    valid_uuid(&payload.id)?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let current = get_mcp_server(&conn, &payload.id)?;

    let name = payload.name.clone().unwrap_or_else(|| current.name.clone());
    let transport = payload
        .transport
        .clone()
        .unwrap_or_else(|| current.transport.clone());
    let command = payload
        .command
        .clone()
        .unwrap_or_else(|| current.command.clone());
    let url = payload.url.clone().unwrap_or_else(|| current.url.clone());
    validate_mcp_fields(&name, &transport, &command, &url)?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    // Resolve secret updates against the stored bundle. Env merges per key so
    // the edit form can send only touched rows; absent keys keep their stored
    // values.
    let mut bundle =
        crate::mcp_secrets::get_secrets(&app_data_dir, &payload.id)?.unwrap_or_default();
    if let Some(env) = &payload.env {
        for (k, v) in env {
            if v.is_empty() {
                bundle.env.remove(k);
            } else {
                bundle.env.insert(k.clone(), v.clone());
            }
        }
    }
    if let Some(token) = &payload.bearer_token {
        bundle.bearer_token = if token.trim().is_empty() {
            None
        } else {
            Some(token.clone())
        };
    }
    crate::mcp_secrets::put_secrets(&app_data_dir, &payload.id, bundle.clone())?;

    let env_keys: Vec<String> = bundle.env.keys().cloned().collect();
    let args = payload.args.clone().unwrap_or_else(|| current.args.clone());
    let headers = payload
        .headers
        .clone()
        .unwrap_or_else(|| current.headers.clone());
    let now = now_ms();

    conn.execute(
        "UPDATE mcp_servers
         SET name = ?1, transport = ?2, command = ?3, args_json = ?4,
             env_keys_json = ?5, url = ?6, headers_json = ?7, has_bearer = ?8,
             updated_at = ?9
         WHERE id = ?10",
        params![
            name.trim(),
            transport,
            command,
            serde_json::to_string(&args).map_err(|e| e.to_string())?,
            serde_json::to_string(&env_keys).map_err(|e| e.to_string())?,
            url,
            serde_json::to_string(&headers).map_err(|e| e.to_string())?,
            bundle.bearer_token.is_some(),
            now,
            payload.id,
        ],
    )
    .map_err(|e| e.to_string())?;

    get_mcp_server(&conn, &payload.id)
}

/// Delete an MCP server: row, encrypted secrets, and every member assignment.
#[tauri::command]
pub fn delete_mcp_server(
    state: State<DbState>,
    app_handle: tauri::AppHandle,
    request: IdRequest,
) -> Result<(), String> {
    valid_uuid(&request.id)?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;
    let changed = conn
        .execute("DELETE FROM mcp_servers WHERE id = ?1", [&request.id])
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        return Err("mcp server not found".to_string());
    }

    crate::mcp_secrets::delete_secrets(&app_data_dir, &request.id)?;

    // Strip the id from every member's assignment list so nothing dangles.
    let affected: Vec<Persona> = list_personas(&conn)?
        .into_iter()
        .filter(|p| p.mcp_server_ids.contains(&request.id))
        .collect();
    for persona in affected {
        let remaining: Vec<String> = persona
            .mcp_server_ids
            .into_iter()
            .filter(|id| id != &request.id)
            .collect();
        conn.execute(
            "UPDATE agents SET mcp_server_ids = ?1 WHERE id = ?2",
            params![
                serde_json::to_string(&remaining).map_err(|e| e.to_string())?,
                persona.id
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Probe an MCP server config: connect + list tools. Nothing is persisted.
/// `config` carries the same fields as `McpServerCreate`.
#[tauri::command]
pub async fn test_mcp_connection(
    app_handle: tauri::AppHandle,
    config: McpServerCreate,
    #[allow(non_snake_case)] mcpServerId: Option<String>,
) -> Result<McpTestResult, String> {
    validate_mcp_fields(
        &config.name,
        &config.transport,
        &config.command,
        &config.url,
    )?;

    // For an existing server, a `None` bearer token means "use the stored
    // secret". Env entries merge over the stored ones (non-empty sets, empty
    // deletes) — the edit form sends only touched rows and never echoes
    // secrets back to the client.
    let stored = match mcpServerId.as_deref() {
        Some(id) => {
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?;
            crate::mcp_secrets::get_secrets(&app_data_dir, id)?.unwrap_or_default()
        }
        None => crate::mcp_secrets::McpSecretBundle::default(),
    };
    let mut env = stored.env;
    for (k, v) in &config.env {
        if v.is_empty() {
            env.remove(k);
        } else {
            env.insert(k.clone(), v.clone());
        }
    }
    let bearer = config
        .bearer_token
        .clone()
        .filter(|t| !t.trim().is_empty())
        .or(stored.bearer_token);

    let connect_config = crate::mcp::McpServerConfig {
        transport: config.transport.clone(),
        command: config.command.clone(),
        args: config.args.clone(),
        env: env.into_iter().collect(),
        url: config.url.clone(),
        headers: config.headers.clone().into_iter().collect(),
    };

    match crate::mcp::connect(&connect_config, bearer.as_deref()).await {
        Ok(connector) => match connector.list_tools().await {
            Ok(tools) => Ok(McpTestResult {
                ok: true,
                tools,
                error: None,
            }),
            Err(e) => Ok(McpTestResult {
                ok: false,
                tools: vec![],
                error: Some(e),
            }),
        },
        Err(e) => Ok(McpTestResult {
            ok: false,
            tools: vec![],
            error: Some(e),
        }),
    }
}

/// List a saved server's tools (fresh connect each call — cheap and always
/// reflects what the server currently advertises).
#[tauri::command]
pub async fn list_mcp_tools(
    state: State<'_, DbState>,
    app_handle: tauri::AppHandle,
    request: IdRequest,
) -> Result<Vec<crate::mcp::McpTool>, String> {
    valid_uuid(&request.id)?;

    let row = {
        let conn = state
            .0
            .lock()
            .map_err(|_| "database lock poisoned".to_string())?;
        get_mcp_server(&conn, &request.id)?
    };

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let secrets = crate::mcp_secrets::get_secrets(&app_data_dir, &request.id)?.unwrap_or_default();

    let config = crate::mcp::McpServerConfig {
        transport: row.transport.clone(),
        command: row.command.clone(),
        args: row.args.clone(),
        env: secrets.env.clone().into_iter().collect(),
        url: row.url.clone(),
        headers: row.headers.clone().into_iter().collect(),
    };
    let connector = crate::mcp::connect(&config, secrets.bearer_token.as_deref()).await?;
    connector.list_tools().await
}

/// Bulk-assign an MCP server to members: union-add the server id to each
/// member's `mcp_server_ids`. Removal rides the per-member `update_member`.
#[tauri::command]
pub fn assign_mcp_servers(
    state: State<DbState>,
    request: AssignMcpRequest,
) -> Result<Vec<Persona>, String> {
    valid_uuid(&request.mcp_server_id)?;
    for id in &request.member_ids {
        valid_uuid(id)?;
    }

    let conn = state
        .0
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?;

    // The server must exist.
    get_mcp_server(&conn, &request.mcp_server_id)?;

    let mut updated = Vec::new();
    for member_id in &request.member_ids {
        let mut persona = get_persona(&conn, member_id)?;
        if persona.mcp_server_ids.contains(&request.mcp_server_id) {
            updated.push(persona);
            continue;
        }
        persona.mcp_server_ids.push(request.mcp_server_id.clone());
        conn.execute(
            "UPDATE agents SET mcp_server_ids = ?1 WHERE id = ?2",
            params![
                serde_json::to_string(&persona.mcp_server_ids).map_err(|e| e.to_string())?,
                persona.id
            ],
        )
        .map_err(|e| e.to_string())?;
        updated.push(persona);
    }
    Ok(updated)
}

/// Return which providers have API keys configured.
#[tauri::command]
pub fn get_api_keys(app_handle: tauri::AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let keys = crate::secrets::load_keys(&app_data_dir);
    let result: Vec<serde_json::Value> = ["anthropic", "openai", "openrouter", "ollama"]
        .iter()
        .map(|p| {
            // Ollama needs no API key — its base URL is stored as "ollama_url".
            let configured = if *p == "ollama" {
                keys.contains_key("ollama_url")
            } else {
                keys.contains_key(*p)
            };
            serde_json::json!({
                "provider": p,
                "hasKey": configured
            })
        })
        .collect();
    Ok(result)
}

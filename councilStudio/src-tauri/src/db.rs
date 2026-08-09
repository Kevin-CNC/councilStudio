use std::sync::Mutex;

use rusqlite::Connection;
use tauri::Manager;

/// Tauri-managed state that wraps the single SQLite connection behind a mutex.
/// Commands acquire this lock for the duration of one DB operation.
pub struct DbState(pub Mutex<Connection>);

/// Open (or create) the SQLite database in the Tauri app-data directory and
/// ensure the `agents` table exists.
pub fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir failed: {e}"))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| format!("create app dir: {e}"))?;

    let db_path = app_dir.join("council.db");
    let conn = Connection::open(&db_path).map_err(|e| format!("open db: {e}"))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY NOT NULL,
            agent_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            sys_prompt TEXT NOT NULL,
            temp REAL NOT NULL,
            max_tkns INTEGER NOT NULL,
            enabled INTEGER NOT NULL,
            streaming INTEGER NOT NULL,
            agent_color TEXT NOT NULL,
            registered_order INTEGER NOT NULL,
            reasoning TEXT NOT NULL
        )",
        (),
    )
    .map_err(|e| format!("create table: {e}"))?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY NOT NULL,
            title TEXT NOT NULL,
            prompt TEXT NOT NULL,
            config_id TEXT NOT NULL DEFAULT 'default',
            config_name TEXT NOT NULL DEFAULT 'Default',
            status TEXT NOT NULL DEFAULT 'completed',
            persona_count INTEGER NOT NULL DEFAULT 0,
            tokens_used INTEGER NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0.0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            pinned INTEGER NOT NULL DEFAULT 0,
            tags TEXT NOT NULL DEFAULT '[]',
            run_json TEXT NOT NULL,
            raw_responses_json TEXT NOT NULL DEFAULT ''
        )",
        (),
    )
    .map_err(|e| format!("create table: {e}"))?;

    // No migration framework exists — add the column idempotently for existing
    // installs. The duplicate-column error is expected and discarded.
    conn.execute(
        "ALTER TABLE sessions ADD COLUMN raw_responses_json TEXT NOT NULL DEFAULT ''",
        (),
    )
    .ok();

    conn.execute(
        "CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY NOT NULL,
            name TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            prompt TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'general',
            created_at INTEGER NOT NULL
        )",
        (),
    )
    .map_err(|e| format!("create table: {e}"))?;

    Ok(conn)
}

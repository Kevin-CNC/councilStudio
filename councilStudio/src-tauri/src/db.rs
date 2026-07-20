use rusqlite::{Connection, Result};

fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(app_handle.path().app_data_dir().unwrap_or_else(|_| std::env::current_dir().unwrap()))?;

    conn.execute( // Create table for 'agents'
        "CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY NOT NULL,
            agent_name TEXT NOT NULL,
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            sys_prompt TEXT NOT NULL,
            temp INTEGER NOT NULL,
            max_tkns INTEGER NOT NULL,
            enabled INTEGER NOT NULL,
            streaming INTEGER NOT NULL,
            agent_color TEXT NOT NULL,
            registered_order INTEGER NOT NULL,
            reasoning TEXT NOT NULL
        )",
        (),
    )?;

    Ok(conn)
}
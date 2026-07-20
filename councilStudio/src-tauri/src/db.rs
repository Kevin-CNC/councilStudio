use rusqlite::{Connection, Result};

fn init_db(app_handle: &tauri::AppHandle) -> Result<Connection, String> {
    let conn = Connection::open(app_handle.path().app_data_dir().unwrap_or_else(|_| std::env::current_dir().unwrap()))?;

    conn.execute(
        "create table if not exists cat_colors (
             id integer primary key,
             name text not null unique
         )",
        (),
    )?;

    Ok(conn)
}
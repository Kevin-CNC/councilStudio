mod cmds;
mod db;
mod models;
mod secrets;
mod providers;
mod orchestrator;

use cmds::{
    cancel_run, create_member, delete_member, get_api_keys, list_members, reorder_members,
    run_council, save_api_key, seed_default_members, update_member,
};
use std::sync::Mutex;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let conn = db::init_db(app.handle()).expect("failed to initialize database");
            app.manage(db::DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            create_member,
            list_members,
            update_member,
            delete_member,
            reorder_members,
            seed_default_members,
            run_council,
            cancel_run,
            save_api_key,
            get_api_keys,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
mod cmds;
mod compatibility;
mod db;
mod harness;
mod models;
mod orchestrator;
mod pricing;
mod providers;
mod secrets;

use cmds::{
    cancel_run, check_model_compatibility, create_council, create_member, delete_council,
    delete_member, delete_prompt_template, delete_session, get_api_keys, get_session,
    list_councils, list_members, list_prompt_templates, list_sessions, pin_session,
    reorder_members, run_council, save_api_key, save_prompt_template, save_session,
    seed_default_members, update_council, update_member,
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
            check_model_compatibility,
            save_api_key,
            get_api_keys,
            save_session,
            list_sessions,
            get_session,
            delete_session,
            pin_session,
            create_council,
            list_councils,
            update_council,
            delete_council,
            save_prompt_template,
            list_prompt_templates,
            delete_prompt_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

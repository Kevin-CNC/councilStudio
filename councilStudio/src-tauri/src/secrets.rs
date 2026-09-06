use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const KEYS_FILE: &str = "api_keys.json";

pub fn load_keys(app_data_dir: &PathBuf) -> HashMap<String, String> {
    let path = app_data_dir.join(KEYS_FILE);
    fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_key(app_data_dir: &PathBuf, provider: &str, key: &str) -> Result<(), String> {
    let path = app_data_dir.join(KEYS_FILE);
    let mut keys = load_keys(app_data_dir);
    keys.insert(provider.to_string(), key.to_string());
    let json = serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?;
    fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn get_key(app_data_dir: &PathBuf, provider: &str) -> Option<String> {
    load_keys(app_data_dir).get(provider).cloned()
}

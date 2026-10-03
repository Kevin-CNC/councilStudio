//! Encrypted-at-rest store for MCP credentials (bearer tokens, stdio env
//! secrets). Separate from `secrets.rs` — the plaintext `api_keys.json` flow
//! is deliberately untouched so the working API-key path cannot regress.
//!
//! AES-256-GCM with a random per-install master key. The key lives in its own
//! file next to the blob; this is obfuscation-grade protection (backups,
//! casual snooping), not OS-keychain-grade. Swapping the key storage for an
//! OS keystore later only touches `load_or_create_master_key`.
//!
//! Wire format of `mcp_secrets.enc`: base64( nonce(12B) || ciphertext ).

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::Engine;
use rand::RngCore;

const KEY_FILE: &str = "mcp_master.key";
const BLOB_FILE: &str = "mcp_secrets.enc";

/// Per-server secret bundle. `env` holds stdio env values keyed by env name;
/// `bearer_token` holds the http transport's token.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct McpSecretBundle {
    pub env: HashMap<String, String>,
    pub bearer_token: Option<String>,
}

fn master_key_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join(KEY_FILE)
}

fn blob_path(app_data_dir: &PathBuf) -> PathBuf {
    app_data_dir.join(BLOB_FILE)
}

/// Load the master key, generating and persisting a fresh one on first use.
fn load_or_create_master_key(app_data_dir: &PathBuf) -> Result<[u8; 32], String> {
    let path = master_key_path(app_data_dir);
    if let Ok(encoded) = fs::read_to_string(&path) {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded.trim())
            .map_err(|e| e.to_string())?;
        let key: [u8; 32] = bytes
            .try_into()
            .map_err(|_| "master key file is corrupt".to_string())?;
        return Ok(key);
    }

    let mut key = [0u8; 32];
    rand::rngs::OsRng.fill_bytes(&mut key);
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    fs::write(&path, encoded).map_err(|e| e.to_string())?;
    Ok(key)
}

fn decrypt_all(app_data_dir: &PathBuf) -> Result<HashMap<String, McpSecretBundle>, String> {
    let path = blob_path(app_data_dir);
    let encoded = match fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Ok(HashMap::new()), // no blob yet = no secrets
    };
    let raw = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .map_err(|e| e.to_string())?;
    if raw.len() < 12 {
        return Err("mcp secrets blob is corrupt".to_string());
    }
    let (nonce_bytes, ciphertext) = raw.split_at(12);
    let key = load_or_create_master_key(app_data_dir)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plaintext = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| "failed to decrypt mcp secrets (wrong key or corrupt blob)".to_string())?;
    serde_json::from_slice(&plaintext).map_err(|e| e.to_string())
}

fn encrypt_all(
    app_data_dir: &PathBuf,
    secrets: &HashMap<String, McpSecretBundle>,
) -> Result<(), String> {
    let key = load_or_create_master_key(app_data_dir)?;
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let mut nonce_bytes = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let plaintext = serde_json::to_vec(secrets).map_err(|e| e.to_string())?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext.as_ref())
        .map_err(|_| "failed to encrypt mcp secrets".to_string())?;
    let mut raw = nonce_bytes.to_vec();
    raw.extend_from_slice(&ciphertext);
    let encoded = base64::engine::general_purpose::STANDARD.encode(raw);
    fs::write(blob_path(app_data_dir), encoded).map_err(|e| e.to_string())
}

/// Fetch one server's secret bundle. `None` when nothing is stored.
pub fn get_secrets(
    app_data_dir: &PathBuf,
    server_id: &str,
) -> Result<Option<McpSecretBundle>, String> {
    Ok(decrypt_all(app_data_dir)?.get(server_id).cloned())
}

/// Replace one server's secret bundle. An empty bundle deletes the entry.
pub fn put_secrets(
    app_data_dir: &PathBuf,
    server_id: &str,
    bundle: McpSecretBundle,
) -> Result<(), String> {
    let mut all = decrypt_all(app_data_dir)?;
    if bundle.env.is_empty() && bundle.bearer_token.is_none() {
        all.remove(server_id);
    } else {
        all.insert(server_id.to_string(), bundle);
    }
    encrypt_all(app_data_dir, &all)
}

/// Drop all secrets for a server (used on delete).
pub fn delete_secrets(app_data_dir: &PathBuf, server_id: &str) -> Result<(), String> {
    let mut all = decrypt_all(app_data_dir)?;
    all.remove(server_id);
    encrypt_all(app_data_dir, &all)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("council-mcp-secrets-{tag}"));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn round_trips_a_bundle() {
        let dir = temp_dir("roundtrip");
        let mut env = HashMap::new();
        env.insert("API_KEY".to_string(), "s3cr3t".to_string());
        let bundle = McpSecretBundle {
            env: env.clone(),
            bearer_token: Some("tok".to_string()),
        };
        put_secrets(&dir, "srv1", bundle).unwrap();
        let loaded = get_secrets(&dir, "srv1").unwrap().expect("stored");
        assert_eq!(loaded.env, env);
        assert_eq!(loaded.bearer_token.as_deref(), Some("tok"));
        // Blob on disk must not contain plaintext secrets.
        let blob = fs::read_to_string(dir.join(BLOB_FILE)).unwrap();
        assert!(!blob.contains("s3cr3t"));
        assert!(!blob.contains("tok"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn empty_bundle_removes_entry_and_delete_works() {
        let dir = temp_dir("delete");
        let mut env = HashMap::new();
        env.insert("K".to_string(), "V".to_string());
        put_secrets(
            &dir,
            "srv1",
            McpSecretBundle {
                env,
                bearer_token: None,
            },
        )
        .unwrap();
        assert!(get_secrets(&dir, "srv1").unwrap().is_some());
        delete_secrets(&dir, "srv1").unwrap();
        assert!(get_secrets(&dir, "srv1").unwrap().is_none());
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_blob_yields_none() {
        let dir = temp_dir("missing");
        assert!(get_secrets(&dir, "nope").unwrap().is_none());
        let _ = fs::remove_dir_all(&dir);
    }
}

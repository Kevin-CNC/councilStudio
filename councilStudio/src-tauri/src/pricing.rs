//! Per-model pricing lookup and USD cost computation.
//!
//! Pricing is fetched from the same OpenRouter endpoint used by
//! `compatibility.rs` and cached for five minutes. Local providers (Ollama) have
//! no pricing entry; they normalize to `None` and report `$0.00`.

use crate::compatibility::normalize_model_id;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

/// Session-scoped cache TTL for per-model pricing (mirrors `compatibility.rs`).
const CACHE_TTL: Duration = Duration::from_secs(300);

/// Deserialize an optional f64 that may arrive as either a JSON number or a
/// numeric string (OpenRouter prices are strings). Absent / unparseable → `None`.
fn f64_or_string<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    #[derive(Deserialize)]
    #[serde(untagged)]
    enum NumberOrString {
        F(f64),
        S(String),
    }
    Ok(match Option::<NumberOrString>::deserialize(deserializer)? {
        None => None,
        Some(NumberOrString::F(f)) => Some(f),
        Some(NumberOrString::S(s)) => s.parse::<f64>().ok(),
    })
}

/// Per-token USD prices, deserialized from OpenRouter's `data.pricing`.
#[derive(Deserialize, Clone, Default)]
struct Pricing {
    #[serde(default, deserialize_with = "f64_or_string")]
    prompt: Option<f64>,
    #[serde(default, deserialize_with = "f64_or_string")]
    completion: Option<f64>,
    #[serde(default, deserialize_with = "f64_or_string")]
    input_cache_read: Option<f64>,
    #[serde(default, deserialize_with = "f64_or_string")]
    input_cache_write: Option<f64>,
    // Parsed but unused — this app issues no web-search or image/audio generation.
    #[allow(dead_code)]
    #[serde(default, deserialize_with = "f64_or_string")]
    web_search: Option<f64>,
    #[allow(dead_code)]
    #[serde(default, deserialize_with = "f64_or_string")]
    image: Option<f64>,
    #[allow(dead_code)]
    #[serde(default, deserialize_with = "f64_or_string")]
    audio: Option<f64>,
}

/// Token counters relevant to cost, plus the provider-reported cost when present.
#[derive(Debug, Clone, Default)]
pub struct Usage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cache_read_tokens: u64,
    pub cache_write_tokens: u64,
    pub reported_cost: Option<f64>,
}

#[derive(Debug, Clone, Default)]
pub struct CostBreakdown {
    pub total: f64,
    pub input_cost: f64,
    pub output_cost: f64,
}

#[derive(Deserialize)]
struct ModelInfo {
    data: Option<ModelData>,
}

#[derive(Deserialize)]
struct ModelData {
    pricing: Option<Pricing>,
}

struct CacheEntry {
    checked_at: Instant,
    pricing: Option<Pricing>,
}

fn cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static CACHE: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cache_get(key: &str) -> Option<Option<Pricing>> {
    let mut map = cache().lock().ok()?;
    if let Some(entry) = map.get(key) {
        if entry.checked_at.elapsed() < CACHE_TTL {
            return Some(entry.pricing.clone());
        }
        map.remove(key);
    }
    None
}

fn cache_put(key: String, pricing: Option<Pricing>) {
    if let Ok(mut map) = cache().lock() {
        map.insert(
            key,
            CacheEntry {
                checked_at: Instant::now(),
                pricing,
            },
        );
    }
}

/// Fetch pricing for a provider/model pair. Returns `None` for local providers
/// and any model whose pricing endpoint is unreachable or missing. `None` is
/// cached too, so a 404 isn't re-fetched on every call.
async fn fetch_pricing(client: &reqwest::Client, provider: &str, model: &str) -> Option<Pricing> {
    let id = normalize_model_id(provider, model)?;
    if let Some(cached) = cache_get(&id) {
        return cached;
    }

    let url = format!("https://openrouter.ai/api/v1/model/{id}");
    let pricing = tokio::time::timeout(Duration::from_secs(5), async {
        let resp = client.get(&url).send().await.ok()?;
        if !resp.status().is_success() {
            return None;
        }
        resp.json::<ModelInfo>().await.ok()?.data?.pricing
    })
    .await
    .unwrap_or(None);

    cache_put(id, pricing.clone());
    pricing
}

/// Sum token counts against per-token prices. Missing price fields → 0.0.
fn cost_for(pricing: &Pricing, usage: &Usage) -> f64 {
    usage.prompt_tokens as f64 * pricing.prompt.unwrap_or(0.0)
        + usage.completion_tokens as f64 * pricing.completion.unwrap_or(0.0)
        + usage.cache_read_tokens as f64 * pricing.input_cache_read.unwrap_or(0.0)
        + usage.cache_write_tokens as f64 * pricing.input_cache_write.unwrap_or(0.0)
}

/// Resolve the USD cost of a completed call. OpenRouter's own `usage.cost` is
/// authoritative when present; otherwise the cost is computed from pricing.
pub async fn resolve_cost(
    client: &reqwest::Client,
    provider: &str,
    model: &str,
    usage: &Usage,
) -> CostBreakdown {
    let pricing = fetch_pricing(client, provider, model).await;
    let computed = pricing.as_ref().map(|p| cost_for(p, usage)).unwrap_or(0.0);
    // Cache read/write are input-side costs; fold them into input_cost so the
    // breakdown reconciles with `cost_for`'s total.
    let mut input_cost = pricing.as_ref().map_or(0.0, |p| {
        usage.prompt_tokens as f64 * p.prompt.unwrap_or(0.0)
            + usage.cache_read_tokens as f64 * p.input_cache_read.unwrap_or(0.0)
            + usage.cache_write_tokens as f64 * p.input_cache_write.unwrap_or(0.0)
    });
    let mut output_cost =
        usage.completion_tokens as f64 * pricing.as_ref().and_then(|p| p.completion).unwrap_or(0.0);
    let total = usage.reported_cost.unwrap_or(computed);
    // Provider-reported cost is authoritative for `total`; rescale the breakdown
    // proportionally so input + output == total despite rate/rounding drift.
    if usage.reported_cost.is_some() && computed > 0.0 {
        let scale = total / computed;
        input_cost *= scale;
        output_cost *= scale;
    }
    CostBreakdown {
        total,
        input_cost,
        output_cost,
    }
}

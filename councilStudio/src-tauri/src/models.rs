use serde::{Deserialize, Serialize};

/// A member of the council (also called a persona or agent in earlier docs).
/// Kept as plain data so it can be serialized to the frontend and persisted as JSON later.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    pub sys_prompt: String,
    pub temp: f64,
    pub max_tokens: i64,
    pub enabled: bool,
    pub streaming: bool,
    pub color: String,
    pub sort_order: i32,
    pub reasoning_level: String,
}

/// Input for creating a new member. The backend generates the id and can pick a sort_order.
#[derive(Debug, Deserialize)]
pub struct AgentCreate {
    pub name: String,
    pub provider: String,
    pub model: String,
    pub sys_prompt: String,
    pub temp: f64,
    pub max_tokens: i64,
    pub enabled: bool,
    pub streaming: bool,
    pub color: String,
    pub reasoning_level: String,
    pub sort_order: Option<i32>,
}

/// Input for partially updating an existing member.
/// Every field is optional; `None` leaves the current value untouched.
#[derive(Debug, Deserialize)]
pub struct AgentUpdate {
    pub name: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub sys_prompt: Option<String>,
    pub temp: Option<f64>,
    pub max_tokens: Option<i64>,
    pub enabled: Option<bool>,
    pub streaming: Option<bool>,
    pub color: Option<String>,
    pub sort_order: Option<i32>,
    pub reasoning_level: Option<String>,
}

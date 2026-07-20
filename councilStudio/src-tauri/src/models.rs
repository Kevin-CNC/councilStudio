use rusqlite::{Connection, Result, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub agent_name: String,
    pub provider: String,
    pub model: String,
    pub sys_prompt: String,
    pub temp: i64,
    pub max_tkns: i64,
    pub enabled: bool,
    pub streaming: bool,
    pub agent_color: String,
    pub registered_order: i32,
    pub reasoning: String,
}

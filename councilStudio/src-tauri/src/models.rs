use rusqlite::{Connection, Result, Row};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub agent_name: String,
    pub provider: String,
    pub model: String,
    pub sys_prompt: String,
    pub temp: f64,
    pub max_tkns: i64,
    pub enabled: bool,
    pub streaming: bool,
    pub agent_color: String,
    pub registered_order: i32,
    pub reasoning: String,
}


pub struct AgentCreate { // model for when it's requested to create an agent
    pub id: String,
    pub agent_name: String,
    pub provider: String,
    pub model: String,
    pub sys_prompt: String,
    pub temp: i64,
    pub max_tkns: i64,
    pub streaming: bool,
    pub agent_color: String,
    pub reasoning: String,
}



#[derive(Debug, Deserialize)]
pub struct AgentUpdate { // model to apply any agent updates
    pub agent_name: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub sys_prompt: Option<String>,
    pub temp: Option<f64>,
    pub max_tkns: Option<i64>,
    pub enabled: Option<bool>,
    pub streaming: Option<bool>,
    pub agent_color: Option<String>,
    pub registered_order: Option<i32>,
    pub reasoning_level: Option<String>,
}
//! MCP (Model Context Protocol) client layer.
//!
//! One trait for the whole app — the rest of the code only ever sees
//! `McpConnector`, never a transport branch. Two transports exist:
//! - **stdio** — spawn a local child process and speak MCP over its pipes.
//! - **http** — streamable HTTP/SSE against a remote MCP endpoint, optionally
//!   with bearer-token / custom headers.
//!
//! Connect → list tools → call tool. Tool calls return text; structured
//! content is JSON-serialized when not purely textual.

use std::sync::Mutex;

use rmcp::model::{CallToolRequestParams, JsonObject};
use rmcp::service::{serve_client, RoleClient, RunningService};
use rmcp::transport::streamable_http_client::{
    StreamableHttpClientTransport, StreamableHttpClientTransportConfig,
};
use rmcp::transport::TokioChildProcess;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/// A tool's schema as advertised by an MCP server.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpTool {
    pub name: String,
    pub description: String,
    pub input_schema: serde_json::Value,
}

/// Snapshot of a connector's status for the UI.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub connected: bool,
    /// Number of tools discovered. `None` until the first `list_tools`.
    pub tool_count: Option<usize>,
    pub last_used_ms: Option<i64>,
}

/// Transport-neutral view of one MCP server's configuration. Secrets (bearer
/// token, env values) are already resolved by the credential store — this
/// layer only ever sees plaintext and never persists it.
#[derive(Debug, Clone)]
pub struct McpServerConfig {
    pub transport: String, // "stdio" | "http"
    pub command: String,
    pub args: Vec<String>,
    pub env: Vec<(String, String)>,
    pub url: String,
    pub headers: Vec<(String, String)>,
}

const MCP_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(15);
const MCP_CALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);

/// One live MCP connection. The rest of the app sees only this trait, never a
/// transport branch.
#[async_trait::async_trait]
pub trait McpConnector: Send + Sync {
    /// All tools the server advertises (paginated list flattened).
    async fn list_tools(&self) -> Result<Vec<McpTool>, String>;
    /// Call a tool by name. Tool-level errors come back as `Ok` with the
    /// error text (MCP semantics); protocol/timeouts come back as `Err`.
    async fn call_tool(&self, name: &str, args: JsonObject) -> Result<String, String>;
    fn describe(&self) -> McpStatus;
}

/// Connect to an MCP server, performing the initialize handshake within a
/// bounded timeout (`MCP_CONNECT_TIMEOUT`). `resolved_secret` is the
/// decrypted bearer token for http transports (ignored for stdio).
pub async fn connect(
    config: &McpServerConfig,
    resolved_secret: Option<&str>,
) -> Result<Box<dyn McpConnector>, String> {
    match config.transport.as_str() {
        "stdio" => {
            let mut cmd = tokio::process::Command::new(&config.command);
            cmd.args(&config.args);
            cmd.envs(config.env.iter().map(|(k, v)| (k, v)));
            let transport = TokioChildProcess::new(cmd).map_err(|e| e.to_string())?;
            let service = tokio::time::timeout(MCP_CONNECT_TIMEOUT, serve_client((), transport))
                .await
                .map_err(|_| format!("MCP connect timed out: {}", config.command))?
                .map_err(|e| format!("MCP initialize failed: {e}"))?;
            Ok(Box::new(RmcpConnector::new(service)))
        }
        "http" => {
            // rmcp pins its own reqwest (major version ahead of ours), so we
            // cannot hand it our reqwest::Client. Pass everything through the
            // transport config and let rmcp build its internal client.
            let mut custom_headers = std::collections::HashMap::new();
            for (k, v) in &config.headers {
                let name = reqwest::header::HeaderName::from_bytes(k.as_bytes())
                    .map_err(|e| e.to_string())?;
                let value = reqwest::header::HeaderValue::from_str(v).map_err(|e| e.to_string())?;
                custom_headers.insert(name, value);
            }
            let mut transport_config =
                StreamableHttpClientTransportConfig::with_uri(config.url.clone());
            transport_config.auth_header = resolved_secret.map(|t| format!("Bearer {t}"));
            transport_config.custom_headers = custom_headers;
            let transport = StreamableHttpClientTransport::from_config(transport_config);
            let service = tokio::time::timeout(MCP_CONNECT_TIMEOUT, serve_client((), transport))
                .await
                .map_err(|_| format!("MCP connect timed out: {}", config.url))?
                .map_err(|e| format!("MCP initialize failed: {e}"))?;
            Ok(Box::new(RmcpConnector::new(service)))
        }
        other => Err(format!("unknown MCP transport: {other}")),
    }
}

// ---------------------------------------------------------------------------
// rmcp-backed connector
// ---------------------------------------------------------------------------

/// One live MCP connection. `RunningService` spawns the io loop on connect.
struct RmcpConnector {
    service: RunningService<RoleClient, ()>,
    // Cached tool list so `describe().tool_count` stays available between
    // list calls without round-tripping the server.
    cached_tools: Mutex<Option<Vec<McpTool>>>,
    last_used_ms: Mutex<Option<i64>>,
}

impl RmcpConnector {
    fn new(service: RunningService<RoleClient, ()>) -> Self {
        Self {
            service,
            cached_tools: Mutex::new(None),
            last_used_ms: Mutex::new(None),
        }
    }
}

#[async_trait::async_trait]
impl McpConnector for RmcpConnector {
    async fn list_tools(&self) -> Result<Vec<McpTool>, String> {
        let tools = tokio::time::timeout(MCP_CALL_TIMEOUT, self.service.list_all_tools())
            .await
            .map_err(|_| "MCP list_tools timed out".to_string())?
            .map_err(|e| format!("MCP list_tools failed: {e}"))?;
        let tools = tools
            .into_iter()
            .map(|t| McpTool {
                name: t.name.to_string(),
                description: t.description.map(|d| d.to_string()).unwrap_or_default(),
                input_schema: serde_json::Value::Object(t.input_schema.as_ref().clone()),
            })
            .collect::<Vec<_>>();
        *self.cached_tools.lock().unwrap_or_else(|e| e.into_inner()) = Some(tools.clone());
        Ok(tools)
    }

    async fn call_tool(&self, name: &str, args: JsonObject) -> Result<String, String> {
        let started = now_millis();
        let fut = self
            .service
            .call_tool(CallToolRequestParams::new(name.to_string()).with_arguments(args));
        let result = tokio::time::timeout(MCP_CALL_TIMEOUT, fut)
            .await
            .map_err(|_| format!("MCP tool call timed out: {name}"))?
            .map_err(|e| format!("MCP tool call failed: {e}"))?;

        *self.last_used_ms.lock().unwrap_or_else(|e| e.into_inner()) = Some(started);

        // All-text content is joined plainly; anything structured is
        // JSON-serialized so the model still sees a readable payload.
        let text_blocks: Vec<String> = result
            .content
            .iter()
            .filter_map(|c| c.as_text().map(|t| t.text.clone()))
            .collect();
        if !text_blocks.is_empty() && text_blocks.len() == result.content.len() {
            Ok(text_blocks.join("\n"))
        } else if result.content.is_empty() {
            Ok(String::new())
        } else {
            serde_json::to_string(&result.content).map_err(|e| e.to_string())
        }
    }

    fn describe(&self) -> McpStatus {
        let count = self
            .cached_tools
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .map(Vec::len);
        McpStatus {
            connected: !self.service.is_closed(),
            tool_count: count,
            last_used_ms: *self.last_used_ms.lock().unwrap_or_else(|e| e.into_inner()),
        }
    }
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ---------------------------------------------------------------------------
// Tests — mock MCP server over an in-memory duplex stream (NDJSON framing,
// same as stdio). No live servers, no real child processes.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::{json, Value};
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

    /// Spawn a minimal mock MCP server on one end of a duplex stream. The
    /// server echoes the client's requested protocol version, advertises two
    /// tools, and answers `tools/call` with the name and args stringified.
    async fn mock_server_end() -> tokio::io::DuplexStream {
        let (client_end, server_end) = tokio::io::duplex(64 * 1024);
        let (read, mut write) = tokio::io::split(server_end);
        let mut reader = BufReader::new(read).lines();

        tokio::spawn(async move {
            while let Ok(Some(line)) = reader.next_line().await {
                let msg: Value = match serde_json::from_str(&line) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
                // Notifications carry no id — never respond to them.
                let Some(id) = msg.get("id").cloned() else {
                    continue;
                };
                let result = match method {
                    "initialize" => json!({
                        "protocolVersion": msg.pointer("/params/protocolVersion")
                            .cloned()
                            .unwrap_or_else(|| json!("2025-06-18")),
                        "capabilities": { "tools": {} },
                        "serverInfo": { "name": "mock", "version": "0.0.1" }
                    }),
                    "tools/list" => json!({
                        "tools": [
                            { "name": "echo", "description": "echo back",
                              "inputSchema": { "type": "object" } },
                            { "name": "noop", "description": "do nothing",
                              "inputSchema": { "type": "object" } }
                        ]
                    }),
                    "tools/call" => {
                        let name = msg
                            .pointer("/params/name")
                            .and_then(Value::as_str)
                            .unwrap_or("?");
                        let args = msg
                            .pointer("/params/arguments")
                            .cloned()
                            .unwrap_or_else(|| json!({}));
                        json!({
                            "content": [{
                                "type": "text",
                                "text": format!("called {name} with {}", serde_json::to_string(&args).unwrap())
                            }]
                        })
                    }
                    _ => json!({}),
                };
                let response = json!({ "jsonrpc": "2.0", "id": id, "result": result });
                let mut bytes = serde_json::to_vec(&response).unwrap();
                bytes.push(b'\n');
                if write.write_all(&bytes).await.is_err() {
                    break;
                }
            }
        });

        client_end
    }

    async fn connect_mock() -> Box<dyn McpConnector> {
        let stream = mock_server_end().await;
        let service = serve_client((), stream).await.expect("handshake");
        Box::new(RmcpConnector::new(service))
    }

    #[tokio::test]
    async fn lists_tools_over_duplex() {
        let connector = connect_mock().await;
        let tools = connector.list_tools().await.expect("list_tools");
        assert_eq!(tools.len(), 2);
        assert_eq!(tools[0].name, "echo");
        assert_eq!(tools[0].description, "echo back");
        assert_eq!(tools[0].input_schema["type"], "object");

        let status = connector.describe();
        assert!(status.connected);
        assert_eq!(status.tool_count, Some(2));
        assert!(status.last_used_ms.is_none());
    }

    #[tokio::test]
    async fn calls_tool_and_returns_text() {
        let connector = connect_mock().await;
        let mut args = JsonObject::new();
        args.insert("text".to_string(), json!("hello"));
        let out = connector.call_tool("echo", args).await.expect("call_tool");
        assert!(out.contains("called echo with"), "got: {out}");
        assert!(out.contains("hello"));

        let status = connector.describe();
        assert!(status.last_used_ms.is_some());
    }

    /// Minimal NDJSON MCP server as a bash script — written to a temp file by
    /// the stdio e2e test below.
    const MOCK_SH: &str = r#"while IFS= read -r line; do
  id=$(printf '%s' "$line" | sed -n 's/.*"id":\([0-9]*\).*/\1/p')
  case "$line" in
    *'"initialize"'*)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"sh-mock","version":"0"}}}\n' "$id"
      ;;
    *'"tools/list"'*)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"tools":[{"name":"echo","description":"echo","inputSchema":{"type":"object"}}]}}\n' "$id"
      ;;
    *'"tools/call"'*)
      printf '{"jsonrpc":"2.0","id":%s,"result":{"content":[{"type":"text","text":"pong"}]}}\n' "$id"
      ;;
  esac
done
"#;

    /// End-to-end over a real spawned child process: spawn → handshake →
    /// list tools → call a tool. Skipped where bash is unavailable (bare
    /// Windows dev machines); the duplex tests above cover the same paths.
    #[tokio::test]
    async fn stdio_child_process_end_to_end() {
        if tokio::process::Command::new("bash")
            .arg("--version")
            .output()
            .await
            .is_err()
        {
            eprintln!("skipping stdio e2e: bash not available");
            return;
        }
        let script_path = std::env::temp_dir().join(format!("mcp-mock-{}.sh", std::process::id()));
        std::fs::write(&script_path, MOCK_SH).expect("write mock script");

        let config = McpServerConfig {
            transport: "stdio".to_string(),
            command: "bash".to_string(),
            args: vec![script_path.to_string_lossy().to_string()],
            env: vec![],
            url: String::new(),
            headers: vec![],
        };
        let connector = connect(&config, None).await.expect("connect stdio");
        let tools = connector.list_tools().await.expect("list_tools");
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "echo");

        let out = connector
            .call_tool("echo", JsonObject::new())
            .await
            .expect("call_tool");
        assert_eq!(out, "pong");

        let _ = std::fs::remove_file(&script_path);
    }

    #[tokio::test]
    async fn rejects_unknown_transport() {
        let config = McpServerConfig {
            transport: "carrier-pigeon".to_string(),
            command: String::new(),
            args: vec![],
            env: vec![],
            url: String::new(),
            headers: vec![],
        };
        let err = match connect(&config, None).await {
            Ok(_) => panic!("must fail"),
            Err(e) => e,
        };
        assert!(err.contains("carrier-pigeon"));
    }
}

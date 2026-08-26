//! Response compatibility harness: the shared output contract members and the
//! judge follow so they can safely emit diagrams, external citations and
//! cross-member references alongside plain markdown.
//!
//! The contract is prompt-induced (no provider API changes). It extends normal
//! markdown with three inline devices:
//!
//! 1. Diagram: a standard ```mermaid fence, left in `content` and rendered
//!    client-side (order-preserving).
//! 2. External citation: an inline `[{n}]` marker plus ONE trailing
//!    ```references fence holding a JSON array of {id, source, url, excerpt}.
//!    This module strips the fence into a typed `Vec<Citation>` and leaves the
//!    `[{n}]` markers in `content` for the frontend to turn into chips.
//! 3. Cross-member reference: an inline `{{@PersonaName}}`, left in `content`
//!    and turned into a clickable chip client-side.
//!
//! Parsing is intentionally non-destructive and tolerant: malformed or absent
//! `references` blocks leave the content untouched and yield no citations, so
//! legacy free-text runs render byte-identical to before.

use crate::cmds::Citation;
use serde::Deserialize;

/// Contract appended to persona system prompts (and folded into the judge
/// prompt). Short and concrete so every provider can follow it.
pub const HARNESS_INSTRUCTIONS: &str = r#"

## Response formatting contract
- To show a diagram, emit a ```mermaid fenced code block. Never emit raw HTML.
- To cite an external source, add a `[{n}]` marker in the prose (n = 1, 2, 3, ...) and put ONE ```references fenced block at the very END of your response holding a JSON array:
  [{"id":"1","source":"Source name","url":"https://example.com","excerpt":"short quote"}]
  Only cite real sources. Include `url` when you have one; `url` and `excerpt` are optional but `source` is required.
- To reference another council member by name, write `{{@TheirName}}`.
- Write everything else as normal markdown (GFM tables are fine).
"#;

/// Parse a member/judge response: strip the trailing ```references fence into
/// typed citations, leaving `[{n}]` markers, ```mermaid fences and `{{@Name}}`
/// cross-references in the returned content for client-side rendering.
///
/// Returns `(cleaned_content, citations)`. On a missing or unparseable
/// references block, returns the original content unchanged and an empty vec.
pub fn parse_persona_response(text: &str) -> (String, Vec<Citation>) {
    match find_references_block(text) {
        Some((start, end, json)) => {
            let citations = parse_references(json);
            if citations.is_empty() {
                // Block present but not parseable into any citation — keep the
                // original block in the content so nothing is silently dropped.
                return (text.to_string(), Vec::new());
            }
            let cleaned = format!("{}{}", &text[..start], &text[end..]);
            (cleaned.trim_end().to_string(), citations)
        }
        None => (text.to_string(), Vec::new()),
    }
}

/// Locate the first ```references fenced block. Returns
/// `(block_start, block_end_exclusive, inner_json)`. Byte offsets; line-based
/// scan is multi-byte safe because fence markers are ASCII.
fn find_references_block(text: &str) -> Option<(usize, usize, &str)> {
    let bytes = text.as_bytes();
    let mut line_start = 0usize;
    let mut fence_start: Option<usize> = None;
    let mut content_start = 0usize;

    while line_start < bytes.len() {
        let line_end = text[line_start..]
            .find('\n')
            .map(|o| line_start + o)
            .unwrap_or(bytes.len());
        let trimmed = text[line_start..line_end].trim();

        if fence_start.is_none() {
            if trimmed == "```references" || trimmed.starts_with("```references ") {
                fence_start = Some(line_start);
                content_start = if line_end < bytes.len() {
                    line_end + 1
                } else {
                    line_end
                };
            }
        } else if trimmed == "```" {
            let json = &text[content_start..line_start];
            let block_end = if line_end < bytes.len() {
                line_end + 1
            } else {
                line_end
            };
            return Some((fence_start.unwrap(), block_end, json));
        }

        line_start = if line_end < bytes.len() {
            line_end + 1
        } else {
            bytes.len()
        };
    }
    None
}

/// Tolerant wire shape for one references entry. `id` may be a string or a
/// number; everything else defaults so a partial entry still parses.
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct RawCitation {
    #[serde(default)]
    id: serde_json::Value,
    #[serde(default)]
    source: String,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    excerpt: String,
}

fn parse_references(json: &str) -> Vec<Citation> {
    let raw: Vec<RawCitation> = serde_json::from_str(json).unwrap_or_default();
    raw.into_iter()
        .enumerate()
        .filter(|(_, c)| !c.source.trim().is_empty())
        .map(|(i, c)| {
            let id = normalize_id(&c.id);
            Citation {
                id: if id.is_empty() {
                    (i + 1).to_string()
                } else {
                    id
                },
                source: c.source.trim().to_string(),
                url: c
                    .url
                    .map(|u| u.trim().to_string())
                    .filter(|u| !u.is_empty()),
                excerpt: c.excerpt.trim().to_string(),
                persona_id: String::new(), // filled by the orchestrator
            }
        })
        .collect()
}

fn normalize_id(v: &serde_json::Value) -> String {
    match v {
        serde_json::Value::String(s) => s.trim().to_string(),
        serde_json::Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_references_block_and_keeps_markers() {
        let input = "This holds under load[{1}].\n\n```references\n[{\"id\":\"1\",\"source\":\"MDN\",\"url\":\"https://developer.mozilla.org/x\",\"excerpt\":\"the excerpt\"}]\n```\n";
        let (content, citations) = parse_persona_response(input);
        assert_eq!(content, "This holds under load[{1}].");
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].id, "1");
        assert_eq!(citations[0].source, "MDN");
        assert_eq!(
            citations[0].url.as_deref(),
            Some("https://developer.mozilla.org/x")
        );
        assert_eq!(citations[0].excerpt, "the excerpt");
        assert!(citations[0].persona_id.is_empty());
    }

    #[test]
    fn accepts_numeric_id() {
        let input = "t[{1}]\n```references\n[{\"id\":1,\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (_, citations) = parse_persona_response(input);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].id, "1");
    }

    #[test]
    fn assigns_index_id_when_missing() {
        let input = "```references\n[{\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (_, citations) = parse_persona_response(input);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].id, "1");
    }

    #[test]
    fn drops_entries_without_source() {
        let input = "```references\n[{\"source\":\"\",\"excerpt\":\"e\"},{\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (_, citations) = parse_persona_response(input);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].source, "S");
    }

    #[test]
    fn malformed_json_keeps_block_and_no_citations() {
        let input = "body\n```references\nnot json at all\n```\n";
        let (content, citations) = parse_persona_response(input);
        assert!(citations.is_empty());
        assert_eq!(content, input); // block left intact, not silently dropped
    }

    #[test]
    fn no_references_is_passthrough() {
        let input = "Just plain markdown, [{1}] marker with no block.";
        let (content, citations) = parse_persona_response(input);
        assert_eq!(content, input);
        assert!(citations.is_empty());
    }

    #[test]
    fn preserves_mermaid_and_markers() {
        let input = "Intro\n```mermaid\ngraph TD; A-->B\n```\nSee {{@Skeptic}} and [{1}].\n\n```references\n[{\"id\":\"1\",\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (content, citations) = parse_persona_response(input);
        assert!(content.contains("```mermaid"));
        assert!(content.contains("graph TD; A-->B"));
        assert!(content.contains("{{@Skeptic}}"));
        assert!(content.contains("[{1}]"));
        assert!(!content.contains("```references"));
        assert_eq!(citations.len(), 1);
    }

    #[test]
    fn empty_input_is_passthrough() {
        let (content, citations) = parse_persona_response("");
        assert_eq!(content, "");
        assert!(citations.is_empty());
    }
}

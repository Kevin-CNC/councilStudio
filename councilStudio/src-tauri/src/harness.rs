//! Response compatibility harness: the shared output contract members and the
//! judge follow so they can safely emit diagrams, external citations,
//! structured tables and cross-member references alongside plain markdown.
//!
//! The contract is prompt-induced (no provider API changes). It extends normal
//! markdown with four inline devices:
//!
//! 1. Diagram: a standard ```mermaid fence, left in `content` and rendered
//!    client-side (order-preserving).
//! 2. External citation: an inline `[{n}]` marker plus ONE trailing
//!    ```references fence holding a JSON array of {id, source, url, excerpt}.
//!    This module strips the fence into a typed `Vec<Citation>` and leaves the
//!    `[{n}]` markers in `content` for the frontend to turn into chips.
//! 3. Structured table: a ```table fence holding ONE JSON object
//!    {caption?, columns, rows}. This module strips each such fence into a
//!    typed `Table` and replaces it with a `{{table:n}}` marker (1-based, in
//!    document order) so the frontend renders a real table at that position.
//! 4. Cross-member reference: an inline `{{@PersonaName}}`, left in `content`
//!    and turned into a clickable chip client-side.
//!
//! Parsing is intentionally non-destructive and tolerant: malformed or absent
//! `references`/`table` blocks leave the content untouched and yield no
//! citations/tables, so legacy free-text runs render byte-identical to before.

use crate::cmds::{Citation, Table};
use serde::Deserialize;

/// Contract appended to persona system prompts (and folded into the judge
/// prompt). Short and concrete so every provider can follow it.
pub const HARNESS_INSTRUCTIONS: &str = r#"

## Response formatting contract
- To show a diagram, emit a ```mermaid fenced code block. Never emit raw HTML.
- To cite an external source, add a `[{n}]` marker in the prose (n = 1, 2, 3, ...) and put ONE ```references fenced block at the very END of your response holding a JSON array:
  [{"id":"1","source":"Source name","url":"https://example.com","excerpt":"short quote"}]
  Only cite real sources. Include `url` when you have one; `url` and `excerpt` are optional but `source` is required.
- To show a structured table, emit a ```table fenced block holding ONE JSON object:
  {"caption":"optional title","columns":["Col A","Col B"],"rows":[["a1","b1"],["a2","b2"]]}
  Every row must have as many cells as there are columns. Use this for comparable data; plain GFM pipes for simple layout.
- To reference another council member by name, write `{{@TheirName}}`.
- Write everything else as normal markdown (GFM tables are fine).
"#;

/// Parse a member/judge response: strip the trailing ```references fence into
/// typed citations and each ```table fence into typed tables. Leaves `[{n}]`
/// markers, ```mermaid fences and `{{@Name}}` cross-references in the returned
/// content; each extracted table is replaced by a `{{table:n}}` marker
/// (1-based, in document order) for in-place client-side rendering.
///
/// Returns `(cleaned_content, citations, tables)`. On missing or unparseable
/// blocks, the original content passes through unchanged for that block.
pub fn parse_persona_response(text: &str) -> (String, Vec<Citation>, Vec<Table>) {
    let mut out = String::with_capacity(text.len());
    let mut citations: Vec<Citation> = Vec::new();
    let mut tables: Vec<Table> = Vec::new();

    let mut line_start = 0usize;
    while line_start < text.len() {
        let line_end = text[line_start..]
            .find('\n')
            .map(|o| line_start + o)
            .unwrap_or(text.len());
        let line = &text[line_start..line_end];
        let trimmed = line.trim();
        let next = if line_end < text.len() {
            line_end + 1
        } else {
            text.len()
        };

        let is_references = trimmed == "```references" || trimmed.starts_with("```references ");
        let is_table = trimmed == "```table" || trimmed.starts_with("```table ");

        // One references block: stripped only if it parses into citations.
        if is_references && citations.is_empty() {
            if let Some((json, fence_end)) = read_fence_body(text, next) {
                let parsed = parse_references(json);
                if !parsed.is_empty() {
                    citations = parsed;
                    line_start = fence_end;
                    continue;
                }
            }
        }

        // Any number of table blocks: stripped in position, replaced by marker.
        if is_table {
            if let Some((json, fence_end)) = read_fence_body(text, next) {
                if let Some(table) = parse_table(json, tables.len() + 1) {
                    tables.push(table);
                    out.push_str("{{table:");
                    out.push_str(&tables.len().to_string());
                    out.push_str("}}\n");
                    line_start = fence_end;
                    continue;
                }
            }
        }

        out.push_str(&text[line_start..next.min(text.len())]);
        line_start = next;
    }

    // Legacy shape parity with the old single-block stripper: if the trailing
    // references block was the only content removed, match its trim_end.
    let cleaned = if !citations.is_empty() {
        out.trim_end().to_string()
    } else {
        out
    };
    (cleaned, citations, tables)
}

/// Shift every `{{table:n}}` marker in `text` by `offset` (used to merge
/// per-field extractions into one numbered list, e.g. judge summary + synthesis).
pub fn shift_table_markers(text: &str, offset: usize) -> String {
    if offset == 0 {
        return text.to_string();
    }
    let mut out = String::with_capacity(text.len());
    let mut rest = text;
    while let Some(pos) = rest.find("{{table:") {
        out.push_str(&rest[..pos]);
        let after = &rest[pos + "{{table:".len()..];
        let digits = after.chars().take_while(|c| c.is_ascii_digit()).count();
        if digits > 0 && after[digits..].starts_with("}}") {
            let n: usize = after[..digits].parse().unwrap_or(0);
            out.push_str("{{table:");
            out.push_str(&(n + offset).to_string());
            out.push_str("}}");
            rest = &after[digits + 2..];
        } else {
            out.push_str("{{table:");
            rest = after;
        }
    }
    out.push_str(rest);
    out
}

/// Read the body of a fence whose opening marker ends at `body_start`.
/// Returns `(inner_json, offset_after_closing_fence)`; `None` when the fence
/// never closes.
fn read_fence_body(text: &str, body_start: usize) -> Option<(&str, usize)> {
    let mut line_start = body_start.min(text.len());
    while line_start < text.len() {
        let line_end = text[line_start..]
            .find('\n')
            .map(|o| line_start + o)
            .unwrap_or(text.len());
        let trimmed = text[line_start..line_end].trim();
        if trimmed == "```" {
            let after = if line_end < text.len() {
                line_end + 1
            } else {
                text.len()
            };
            return Some((&text[body_start..line_start], after));
        }
        line_start = if line_end < text.len() {
            line_end + 1
        } else {
            text.len()
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

/// Tolerant wire shape for a ```table block. Cells may be strings, numbers or
/// booleans — all coerced to strings. Rows are padded/truncated to the column
/// count so the frontend always gets a rectangular grid.
#[derive(Deserialize)]
struct RawTable {
    #[serde(default)]
    id: serde_json::Value,
    #[serde(default)]
    caption: Option<String>,
    #[serde(default)]
    columns: Vec<serde_json::Value>,
    #[serde(default)]
    rows: Vec<Vec<serde_json::Value>>,
}

fn parse_table(json: &str, fallback_index: usize) -> Option<Table> {
    let raw: RawTable = serde_json::from_str(json).ok()?;
    if raw.columns.is_empty() {
        return None;
    }
    let width = raw.columns.len();
    let cell = |v: &serde_json::Value| -> String {
        match v {
            serde_json::Value::String(s) => s.trim().to_string(),
            serde_json::Value::Number(n) => n.to_string(),
            serde_json::Value::Bool(b) => b.to_string(),
            _ => String::new(),
        }
    };
    let columns: Vec<String> = raw.columns.iter().map(cell).collect();
    if columns.iter().all(|c| c.is_empty()) {
        return None;
    }
    let rows = raw
        .rows
        .into_iter()
        .map(|mut r| {
            r.truncate(width);
            let mut cells: Vec<String> = r.iter().map(cell).collect();
            cells.resize(width, String::new());
            cells
        })
        .collect();
    let id = normalize_id(&raw.id);
    Some(Table {
        id: if id.is_empty() {
            fallback_index.to_string()
        } else {
            id
        },
        caption: raw
            .caption
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty()),
        columns,
        rows,
        persona_id: String::new(), // filled by the orchestrator
    })
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
        let (content, citations, tables) = parse_persona_response(input);
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
        assert!(tables.is_empty());
    }

    #[test]
    fn accepts_numeric_id() {
        let input = "t[{1}]\n```references\n[{\"id\":1,\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (_, citations, _) = parse_persona_response(input);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].id, "1");
    }

    #[test]
    fn assigns_index_id_when_missing() {
        let input = "```references\n[{\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (_, citations, _) = parse_persona_response(input);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].id, "1");
    }

    #[test]
    fn drops_entries_without_source() {
        let input = "```references\n[{\"source\":\"\",\"excerpt\":\"e\"},{\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (_, citations, _) = parse_persona_response(input);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0].source, "S");
    }

    #[test]
    fn malformed_json_keeps_block_and_no_citations() {
        let input = "body\n```references\nnot json at all\n```\n";
        let (content, citations, _) = parse_persona_response(input);
        assert!(citations.is_empty());
        assert_eq!(content, input); // block left intact, not silently dropped
    }

    #[test]
    fn no_references_is_passthrough() {
        let input = "Just plain markdown, [{1}] marker with no block.";
        let (content, citations, _) = parse_persona_response(input);
        assert_eq!(content, input);
        assert!(citations.is_empty());
    }

    #[test]
    fn preserves_mermaid_and_markers() {
        let input = "Intro\n```mermaid\ngraph TD; A-->B\n```\nSee {{@Skeptic}} and [{1}].\n\n```references\n[{\"id\":\"1\",\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (content, citations, _) = parse_persona_response(input);
        assert!(content.contains("```mermaid"));
        assert!(content.contains("graph TD; A-->B"));
        assert!(content.contains("{{@Skeptic}}"));
        assert!(content.contains("[{1}]"));
        assert!(!content.contains("```references"));
        assert_eq!(citations.len(), 1);
    }

    #[test]
    fn empty_input_is_passthrough() {
        let (content, citations, tables) = parse_persona_response("");
        assert_eq!(content, "");
        assert!(citations.is_empty());
        assert!(tables.is_empty());
    }

    #[test]
    fn extracts_table_and_leaves_marker() {
        let input = "Compare:\n\n```table\n{\"caption\":\"Options\",\"columns\":[\"Name\",\"Cost\"],\"rows\":[[\"A\",\"1\"],[\"B\",\"2\"]]}\n```\n\nDone.\n```references\n[{\"id\":\"1\",\"source\":\"S\",\"excerpt\":\"e\"}]\n```";
        let (content, citations, tables) = parse_persona_response(input);
        assert_eq!(tables.len(), 1);
        assert_eq!(tables[0].caption.as_deref(), Some("Options"));
        assert_eq!(tables[0].columns, vec!["Name", "Cost"]);
        assert_eq!(tables[0].rows, vec![vec!["A", "1"], vec!["B", "2"]]);
        assert!(content.contains("{{table:1}}"));
        assert!(!content.contains("```table"));
        assert!(content.contains("Done."));
        assert_eq!(citations.len(), 1); // references still stripped after table
    }

    #[test]
    fn multiple_tables_number_in_order() {
        let input = "```table\n{\"columns\":[\"A\"],\"rows\":[[\"1\"]]}\n```\nmid\n```table\n{\"columns\":[\"B\"],\"rows\":[[\"2\"],[\"3\"]]}\n```";
        let (content, _, tables) = parse_persona_response(input);
        assert_eq!(tables.len(), 2);
        assert!(content.contains("{{table:1}}"));
        assert!(content.contains("{{table:2}}"));
        assert_eq!(tables[0].id, "1");
        assert_eq!(tables[1].id, "2");
    }

    #[test]
    fn table_rows_normalized_to_rectangular() {
        let input = "```table\n{\"columns\":[\"A\",\"B\",\"C\"],\"rows\":[[\"1\"],[\"1\",\"2\",\"3\",\"4\"]]}\n```";
        let (_, _, tables) = parse_persona_response(input);
        assert_eq!(tables.len(), 1);
        assert_eq!(tables[0].rows[0], vec!["1", "", ""]);
        assert_eq!(tables[0].rows[1], vec!["1", "2", "3"]);
    }

    #[test]
    fn table_cells_coerced_to_strings() {
        let input = "```table\n{\"columns\":[\"A\",42,true],\"rows\":[[1.5,false]]}\n```";
        let (_, _, tables) = parse_persona_response(input);
        assert_eq!(tables[0].columns, vec!["A", "42", "true"]);
        assert_eq!(tables[0].rows[0], vec!["1.5", "false", ""]);
    }

    #[test]
    fn table_without_columns_kept_verbatim() {
        let input = "x\n```table\n{\"rows\":[[\"1\"]]}\n```\n";
        let (content, _, tables) = parse_persona_response(input);
        assert!(tables.is_empty());
        assert_eq!(content, input);
    }

    #[test]
    fn malformed_table_kept_verbatim() {
        let input = "x\n```table\nnot json\n```\n";
        let (content, _, tables) = parse_persona_response(input);
        assert!(tables.is_empty());
        assert_eq!(content, input);
    }

    #[test]
    fn unclosed_table_fence_kept_verbatim() {
        let input = "x\n```table\n{\"columns\":[\"A\"],\"rows\":[]}\n";
        let (content, _, tables) = parse_persona_response(input);
        assert!(tables.is_empty());
        assert_eq!(content, input);
    }

    #[test]
    fn shift_table_markers_offsets_ids() {
        assert_eq!(shift_table_markers("a {{table:1}} b", 0), "a {{table:1}} b");
        assert_eq!(shift_table_markers("a {{table:1}} b", 2), "a {{table:3}} b");
        assert_eq!(
            shift_table_markers("{{table:12}} and {{table:1}}", 10),
            "{{table:22}} and {{table:11}}"
        );
        assert_eq!(shift_table_markers("no marker", 5), "no marker");
        // Not a marker — missing closing braces stays untouched.
        assert_eq!(shift_table_markers("{{table:1", 3), "{{table:1");
    }
}

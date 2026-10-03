// Prompt-level @var substitution and markdown/var tokenizing for the
// highlighted prompt editor. Substitution happens entirely on the frontend
// so the backend/provider only ever sees resolved text, never var names.

export const VAR_REFERENCE_PATTERN = /@([A-Za-z_]\w*)/g;

/**
 * Replace @name references with vars[name]. Unknown names are left
 * literal in the text (e.g. "@foo" stays "@foo" if "foo" isn't defined).
 */
export function resolvePromptVars(text: string, vars: Record<string, string>): string {
  return text.replace(VAR_REFERENCE_PATTERN, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : match
  );
}

export type PromptTokenType =
  | "text"
  | "bold"
  | "italic"
  | "code"
  | "codeblock"
  | "var-known"
  | "var-unknown";

export interface PromptToken {
  type: PromptTokenType;
  text: string;
}

// Ordered alternation: fenced code > inline code > bold > italic > @var.
// Earlier alternatives win when they match at the same start position, so
// "**bold**" is consumed whole before the single-asterisk italic case runs.
const TOKEN_PATTERN =
  /(```[\s\S]*?```)|(`[^`\n]+`)|(\*\*[^*]+?\*\*)|(\*[^*\n]+?\*)|(@[A-Za-z_]\w*)/g;

export function tokenizePrompt(text: string, knownVarNames: Set<string>): PromptToken[] {
  const tokens: PromptToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }
    const [, codeblock, code, bold, italic, varRef] = match;
    if (codeblock) {
      tokens.push({ type: "codeblock", text: codeblock });
    } else if (code) {
      tokens.push({ type: "code", text: code });
    } else if (bold) {
      tokens.push({ type: "bold", text: bold });
    } else if (italic) {
      tokens.push({ type: "italic", text: italic });
    } else if (varRef) {
      const name = varRef.slice(1);
      tokens.push({ type: knownVarNames.has(name) ? "var-known" : "var-unknown", text: varRef });
    }
    lastIndex = TOKEN_PATTERN.lastIndex;
  }
  if (lastIndex < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIndex) });
  }
  return tokens;
}

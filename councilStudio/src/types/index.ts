export type Theme = "light" | "dark";

export type Provider = "anthropic" | "openai" | "openrouter" | "ollama";

export type RunStatus =
  | "queued"
  | "running"
  | "streaming"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled"
  | "terminated";

/** Live per-member progress during a council run. */
export type MemberRunStatus =
  "waiting" | "thinking" | "completed" | "failed" | "cancelled";

export interface Persona {
  id: string;
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  streaming: boolean;
  color: string; // Hex/initial color for avatar
  order: number;
  tools?: string[];
  knowledgeSources?: string[];
  reasoningLevel?: "none" | "low" | "medium" | "high";
  /** MCP integration servers assigned to this member (server ids). */
  mcpServerIds?: string[];
}

// --- MCP integration servers ---

export type McpTransport = "stdio" | "http";

export interface McpTool {
  name: string;
  description: string;
  inputSchema: unknown;
}

/** Live status of a probed MCP server connection. */
export interface McpStatus {
  connected: boolean;
  toolCount?: number;
  lastUsedMs?: number;
}

/**
 * An MCP server row as the backend returns it. Secret material (bearer token,
 * env values) never appears here — `hasBearer`/`envKeys` are display metadata.
 */
export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  command: string;
  args: string[];
  envKeys: string[];
  url: string;
  headers: Record<string, string>;
  hasBearer: boolean;
  createdAt: number;
  updatedAt: number;
}

/** Create payload. `env` values and `bearerToken` go to the encrypted store. */
export interface McpServerCreate {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
}

/**
 * Update payload — absent fields keep their value. For secrets: empty string
 * clears the stored secret, a value replaces it, absent keeps it.
 */
export interface McpServerUpdate {
  id: string;
  name?: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
}

export interface McpTestResult {
  ok: boolean;
  tools: McpTool[];
  error?: string;
}

export interface ProviderCredential {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;
  isActive: boolean;
}

export interface MemberCompatibilityCheck {
  personaId: string;
  personaName: string;
  provider: Provider;
  model: string;
  compatible: boolean;
  issues: string[];
}

export interface CompatibilityCheckResult {
  checks: MemberCompatibilityCheck[];
  incompatibleCount: number;
  failedRequestsCount: number;
}

export interface CompatibilityCheckRequest {
  members: { id: string; name: string; provider: Provider; model: string }[];
  requiredInputModalities: string[];
  requiredOutputModalities: string[];
}

export interface CouncilConfig {
  id: string;
  name: string;
  description: string;
  personaIds: string[];
  judgeModel: string;
  judgeProvider: Provider;
  maxConcurrency: number;
  timeoutMs: number;
  retryCount: number;
}

/**
 * A named, reusable council: an ordered subset of member ids. A member runs
 * only when it is both enabled (available) and present in the active council.
 * Sessions reference the council that produced them via configId/configName.
 */
export interface Council {
  id: string;
  name: string;
  memberIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface PersonaResult {
  personaId: string;
  personaName: string;
  provider: Provider;
  model: string;
  status: "running" | "completed" | "failed" | "cancelled";
  content: string;
  error?: string;
  rawResponse?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cost: number;
  inputCost: number;
  outputCost: number;
  citations?: Citation[];
  /** Tables extracted from ```table fences; `{{table:n}}` markers stay inline in `content`. */
  tables?: Table[];
  startedAt: number;
  completedAt?: number;
}

export interface JudgeResult {
  summary: string;
  consensus: string[];
  disagreements: string[];
  minorityViews: string[];
  recommendations: string[];
  confidenceScore: number; // 0-100
  synthesis: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cost: number;
  rawResponse?: string;
  /** Mermaid diagrams the judge wants rendered. */
  diagrams?: Diagram[];
  /** External sources the judge cited via `[{n}]` markers. */
  citations?: Citation[];
  /** Tables the judge wants shown (JSON array plus ```table fences in summary/synthesis). */
  tables?: Table[];
  /** Personas that failed/timed out (spec `missingPersonas`). */
  missingPersonas?: string[];
  /** Wall-clock start of the judge call (unix ms) — drives the telemetry lane. */
  startedAt?: number;
  /** Wall-clock end of the judge call (unix ms); absent while still running. */
  completedAt?: number;
  /** `false` → UI shows an unstructured-output banner; `undefined` treated as structured. */
  structured?: boolean;
}

export interface Citation {
  id: string;
  source: string;
  url?: string;
  excerpt: string;
  personaId: string;
}

/** A mermaid diagram a member or the judge wants rendered. `code` is raw source (no fences). */
export interface Diagram {
  id: string;
  code: string;
  caption?: string;
}

/** A structured data table a member or the judge wants rendered. Rows are rectangular (one cell per column). */
export interface Table {
  id: string;
  caption?: string;
  columns: string[];
  rows: string[][];
  personaId: string;
}

// In-memory image attachment held on the current prompt input. Never persisted.
export interface PromptAttachment {
  id: string;
  name: string;
  fileType: string;
  dataUrl: string;
  size: number;
}

// Payload shape sent to the backend for a single run.
export interface RunAttachment {
  name: string;
  fileType: string;
  dataUrl: string;
}

// Persisted session reference — metadata only, never the image bytes.
export interface AttachmentMeta {
  name: string;
  fileType: string;
}

export interface CouncilRun {
  id: string;
  configId: string;
  prompt: string;
  status: RunStatus;
  personaResults: PersonaResult[];
  judgeResult?: JudgeResult;
  startedAt: number;
  completedAt?: number;
  attachments?: AttachmentMeta[];
}

export interface Session {
  id: string;
  title: string;
  prompt: string;
  configId: string;
  configName: string;
  status: RunStatus;
  personaCount: number;
  tokensUsed: number;
  totalCost: number;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  tags: string[];
  /** Full run detail. Omitted from list views — fetched lazily on selection. */
  run?: CouncilRun;
  utilityData?: SessionUtilityData;
}

// Per-member cost/throughput snapshot (derived, not user-edited)
export interface MemberUtilityCost {
  memberId: string;
  member: string;
  tokenThroughputPerMin: number;
  cost: number;
  inputCost: number;
  outputCost: number;
  inputTokens: number;
  outputTokens: number;
}

export interface SessionCosts {
  ovrlAverageCostPerToken: number;
  ovrlOutputTokens: number;
  ovrlTokenThroughputPerMin: number;
  ovrlTotalCost: number;
  members: MemberUtilityCost[];
}

export interface SessionUtilityData {
  judge_model: string;
  judge_provider: string;
  max_tokens: number;
  concurrency: number;
  customVars: Record<string, string>;
  costs: SessionCosts;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
  category: string;
  createdAt: number;
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  createdAt: number;
}

// Payload for creating a new council member
export interface PersonaCreate {
  name: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  streaming: boolean;
  color: string;
  reasoningLevel: "none" | "low" | "medium" | "high";
  mcpServerIds?: string[];
}

// Payload for partially updating an existing member
export interface PersonaUpdate {
  name?: string;
  provider?: Provider;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  enabled?: boolean;
  streaming?: boolean;
  color?: string;
  reasoningLevel?: "none" | "low" | "medium" | "high";
  mcpServerIds?: string[];
}

// Model metadata for dropdowns
export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  costPer1kIn: number;
  costPer1kOut: number;
}

// --- Export/Import types ---

export interface MemberExportItem {
  Name: string;
  provider: Provider;
  model: string;
  sys_prompt: string;
  member_color: string;
  reasoning: string;
  max_tkns: number;
  temperature: number;
}

export interface MemberExportFile {
  members: MemberExportItem[];
}

export interface TemplateExportItem {
  Name: string;
  desc: string;
  prompt: string;
  category: string;
}

export interface TemplateExportFile {
  templates: TemplateExportItem[];
}

export interface SessionExportItem {
  Name: string;
  prompt: string;
  status: RunStatus;
  persona_count: number;
  tokens_used: number;
  total_cost: number;
  duration_ms: number;
  created_at: number;
  pinned: boolean;
  run?: CouncilRun;
}

export interface SessionExportFile {
  sessions: SessionExportItem[];
}

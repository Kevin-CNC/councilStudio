export type Theme = "light" | "dark";

export type Provider = "anthropic" | "openai" | "openrouter" | "ollama";

export type RunStatus = "queued" | "running" | "streaming" | "completed" | "partial" | "failed" | "cancelled" | "terminated";

/** Live per-member progress during a council run. */
export type MemberRunStatus = "waiting" | "thinking" | "completed" | "failed" | "cancelled";

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
}

export interface Citation {
  id: string;
  source: string;
  url?: string;
  excerpt: string;
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

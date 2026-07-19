export type Theme = "light" | "dark";

export type Provider = "anthropic" | "openai" | "openrouter" | "ollama";

export type RunStatus = "queued" | "running" | "streaming" | "completed" | "partial" | "failed" | "cancelled";

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

export interface PersonaResult {
  personaId: string;
  personaName: string;
  provider: Provider;
  model: string;
  status: "running" | "completed" | "failed" | "cancelled";
  content: string;
  error?: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  cost: number;
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
}

export interface Citation {
  id: string;
  source: string;
  url?: string;
  excerpt: string;
  personaId: string;
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
  run: CouncilRun;
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

// Model metadata for dropdowns
export interface ModelOption {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  costPer1kIn: number;
  costPer1kOut: number;
}

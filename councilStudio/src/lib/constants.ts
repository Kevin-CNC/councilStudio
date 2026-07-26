import type { Provider, RunStatus } from "@/types";

export const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  ollama: "Ollama",
};

export const STATUS_STYLES: Record<RunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  streaming: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
  terminated: "bg-red-100 text-red-700",
};

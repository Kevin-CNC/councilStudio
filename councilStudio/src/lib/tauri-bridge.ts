import { invoke } from "@tauri-apps/api/core";
import type {
  Persona,
  PersonaCreate,
  PersonaUpdate,
  Provider,
  Session,
  Council,
  CouncilRun,
  PromptTemplate,
  CompatibilityCheckRequest,
  CompatibilityCheckResult,
  RunAttachment,
} from "@/types";

/**
 * Create a new council member. The backend assigns a UUID id and sort order.
 */
export async function createMember(data: PersonaCreate): Promise<Persona> {
  return invoke<Persona>("create_member", { payload: data });
}

/**
 * List all council members ordered by sort order.
 */
export async function listMembers(): Promise<Persona[]> {
  return invoke<Persona[]>("list_members");
}

/**
 * Partially update an existing member. Only the fields provided will be changed.
 */
export async function updateMember(
  id: string,
  updates: PersonaUpdate
): Promise<Persona> {
  return invoke<Persona>("update_member", {
    request: { id, updates },
  });
}

/**
 * Permanently delete a member by id.
 */
export async function deleteMember(id: string): Promise<void> {
  return invoke<void>("delete_member", { request: { id } });
}

/**
 * Batch update the sort order of members. Each item specifies the member id
 * and its new position (0-based).
 */
export async function reorderMembers(
  order: { id: string; order: number }[]
): Promise<void> {
  return invoke<void>("reorder_members", { items: order });
}

/**
 * Seed the four default personas (Pragmatist, Skeptic, Visionary, Specialist)
 * if the database is empty. Does nothing if members already exist.
 */
export async function seedDefaultMembers(): Promise<Persona[]> {
  return invoke<Persona[]>("seed_default_members");
}

// --- Councils ---------------------------------------------------------------

/**
 * Create a new, empty named council.
 */
export async function createCouncil(name: string): Promise<Council> {
  return invoke<Council>("create_council", { request: { name } });
}

/**
 * List all councils in creation order.
 */
export async function listCouncils(): Promise<Council[]> {
  return invoke<Council[]>("list_councils");
}

/**
 * Partially update a council: rename and/or replace its ordered membership.
 * Only the fields provided will be changed.
 */
export async function updateCouncil(
  id: string,
  updates: { name?: string; memberIds?: string[] }
): Promise<Council> {
  return invoke<Council>("update_council", {
    request: { id, name: updates.name ?? null, memberIds: updates.memberIds ?? null },
  });
}

/**
 * Permanently delete a council by id. Sessions keep their stored snapshot.
 */
export async function deleteCouncil(id: string): Promise<void> {
  return invoke<void>("delete_council", { request: { id } });
}

/**
 * Run the council: the given council's enabled members execute in parallel in
 * the Rust backend (when `councilId` is omitted, all enabled members run),
 * results stream back as "persona-result" events, and the judge synthesis
 * arrives as a "judge-result" event. Resolves once the run has been
 * dispatched (listen for events for progress/completion).
 */
export async function runCouncil(
  prompt: string,
  judgeModel: string,
  judgeProvider: Provider,
  attachments: RunAttachment[] = [],
  councilId: string | null = null
): Promise<void> {
  return invoke<void>("run_council", {
    request: {
      prompt,
      judgeModel,
      judgeProvider,
      councilId,
      attachments: attachments.map((a) => ({
        name: a.name,
        mimeType: a.fileType,
        dataBase64: a.dataUrl,
      })),
    },
  });
}

/**
 * Cancel the active council run. The backend emits "council-run-cancelled".
 */
export async function cancelRun(): Promise<void> {
  return invoke<void>("cancel_run");
}

/**
 * Pre-flight check: verify each member's model supports the required
 * input/output modalities via OpenRouter's public model-info API.
 */
export async function checkModelCompatibility(
  request: CompatibilityCheckRequest
): Promise<CompatibilityCheckResult> {
  return invoke<CompatibilityCheckResult>("check_model_compatibility", { request });
}

/**
 * Save an API key for a provider. For Ollama pass provider "ollama_url"
 * with the base URL instead of a key.
 */
export async function saveApiKey(provider: string, key: string): Promise<void> {
  return invoke<void>("save_api_key", {
    request: { provider, key },
  });
}

/**
 * Report which providers have credentials configured.
 */
export async function getApiKeys(): Promise<
  { provider: Provider; hasKey: boolean }[]
> {
  return invoke<{ provider: Provider; hasKey: boolean }[]>("get_api_keys");
}

// --- Sessions ---------------------------------------------------------------

interface SessionSummaryDto {
  id: string;
  title: string;
  prompt: string;
  configId: string;
  configName: string;
  status: string;
  personaCount: number;
  tokensUsed: number;
  totalCost: number;
  durationMs: number;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  tags: string[];
}

interface SessionRowDto extends SessionSummaryDto {
  runJson: string;
  rawResponsesJson: string;
}

function sessionFromRow(row: SessionRowDto): Session {
  const run = JSON.parse(row.runJson) as CouncilRun;

  // Merge stored raw responses back onto the loaded run so the rest of the UI
  // reads them uniformly off the CouncilRun. Defensive: corrupt/missing JSON
  // must not break session loading.
  let rawMap: Record<string, string> = {};
  if (row.rawResponsesJson?.trim()) {
    try {
      rawMap = JSON.parse(row.rawResponsesJson) as Record<string, string>;
    } catch {
      rawMap = {};
    }
  }
  if (run.personaResults) {
    for (const r of run.personaResults) {
      const raw = rawMap[r.personaId];
      if (raw) r.rawResponse = raw;
    }
  }
  if (run.judgeResult && rawMap.judge) {
    run.judgeResult.rawResponse = rawMap.judge;
  }

  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    configId: row.configId,
    configName: row.configName,
    status: row.status as Session["status"],
    personaCount: row.personaCount,
    tokensUsed: row.tokensUsed,
    totalCost: row.totalCost,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pinned: row.pinned,
    tags: row.tags,
    run,
  };
}

/**
 * Persist a session (upsert by id). Called after a council run completes.
 */
export async function saveSession(session: Session): Promise<void> {
  const rawMap: Record<string, string | undefined> = {};
  if (session.run) {
    for (const r of session.run.personaResults) {
      if (r.rawResponse) rawMap[r.personaId] = r.rawResponse;
    }
    if (session.run.judgeResult?.rawResponse) {
      rawMap.judge = session.run.judgeResult.rawResponse;
    }
  }

  return invoke<void>("save_session", {
    payload: {
      id: session.id,
      title: session.title,
      prompt: session.prompt,
      configId: session.configId,
      configName: session.configName,
      status: session.status,
      personaCount: session.personaCount,
      tokensUsed: session.tokensUsed,
      totalCost: session.totalCost,
      durationMs: session.durationMs,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      runJson: JSON.stringify(session.run),
      rawResponsesJson: JSON.stringify(rawMap),
    },
  });
}

/**
 * List all sessions (without the full run payload), newest first.
 */
export async function listSessions(): Promise<
  Omit<Session, "run">[]
> {
  const rows = await invoke<SessionSummaryDto[]>("list_sessions");
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    configId: row.configId,
    configName: row.configName,
    status: row.status as Session["status"],
    personaCount: row.personaCount,
    tokensUsed: row.tokensUsed,
    totalCost: row.totalCost,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    pinned: row.pinned,
    tags: row.tags,
  }));
}

/**
 * Fetch one session including its full CouncilRun.
 */
export async function getSession(id: string): Promise<Session> {
  const row = await invoke<SessionRowDto>("get_session", { request: { id } });
  return sessionFromRow(row);
}

/**
 * Permanently delete a session by id.
 */
export async function deleteSession(id: string): Promise<void> {
  return invoke<void>("delete_session", { request: { id } });
}

/**
 * Toggle a session's pinned flag and return the updated session.
 */
export async function pinSession(id: string): Promise<Session> {
  const row = await invoke<SessionRowDto>("pin_session", { request: { id } });
  return sessionFromRow(row);
}

// --- Prompt templates --------------------------------------------------------

/**
 * Create or update a prompt template. Omit `id` to create a new one.
 */
export async function savePromptTemplate(
  template: Omit<PromptTemplate, "id" | "createdAt"> & { id?: string }
): Promise<PromptTemplate> {
  return invoke<PromptTemplate>("save_prompt_template", {
    payload: {
      id: template.id ?? null,
      name: template.name,
      description: template.description,
      prompt: template.prompt,
      category: template.category,
      createdAt: null,
    },
  });
}

/**
 * List all prompt templates, newest first.
 */
export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  return invoke<PromptTemplate[]>("list_prompt_templates");
}

/**
 * Permanently delete a prompt template by id.
 */
export async function deletePromptTemplate(id: string): Promise<void> {
  return invoke<void>("delete_prompt_template", { request: { id } });
}
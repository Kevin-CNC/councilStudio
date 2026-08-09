import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type {
  Persona,
  PersonaResult,
  JudgeResult,
  Session,
  CouncilRun,
  PromptTemplate,
  Theme,
  Provider,
  MemberRunStatus,
  MemberExportItem,
  TemplateExportItem,
  SessionExportItem,
  PromptAttachment,
} from "@/types";
import * as bridge from "@/lib/tauri-bridge";
import { toast } from "@/components/ui/toaster";
import {
  DEFAULT_SHORTCUTS,
  loadShortcuts,
  saveShortcuts,
  type ShortcutAction,
  type ShortcutBinding,
} from "@/lib/shortcuts";

// --- UI settings persistence (localStorage) ---

const LS_KEYS = {
  theme: "theme",
  fontSize: "app-font-size",
  highContrast: "app-high-contrast",
  reducedMotion: "app-reduced-motion",
  judgeModel: "judge-model",
  judgeProvider: "judge-provider",
} as const;

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage unavailable — non-fatal
  }
}

function storedTheme(): Theme {
  return lsGet(LS_KEYS.theme) === "dark" ? "dark" : "light";
}

function storedFontSize(): number {
  const n = Number(lsGet(LS_KEYS.fontSize));
  return Number.isFinite(n) && n >= 12 && n <= 18 ? n : 16;
}

function storedBool(key: string): boolean {
  return lsGet(key) === "true";
}

function storedJudgeProvider(): Provider {
  const p = lsGet(LS_KEYS.judgeProvider);
  return p === "anthropic" || p === "openai" || p === "openrouter" || p === "ollama"
    ? p
    : "anthropic";
}

type TabId = "overview" | "responses" | "consensus" | "differences" | "sources" | "timeline";
type ViewId = "home" | "prompts" | "sessions" | "members";

/** Internal active run — personaResults stored as Record for O(1) streaming updates. */
export type ActiveRun = Omit<CouncilRun, "personaResults"> & {
  personaResults: Record<string, PersonaResult>;
};

/** Convert a CouncilRun (array) to ActiveRun (Record) for the store. */
function toActiveRun(run: CouncilRun): ActiveRun {
  const map: Record<string, PersonaResult> = {};
  for (const r of run.personaResults) map[r.personaId] = r;
  return { ...run, personaResults: map };
}

interface AppState {
  // Data
  members: Persona[];
  sessions: Session[];
  promptTemplates: PromptTemplate[];
  currentPrompt: string;
  /** In-memory image attachments on the current prompt input. Never persisted. */
  attachments: PromptAttachment[];

  // Run state
  isRunning: boolean;
  activeRun: ActiveRun | null;
  cancelledRunId: string | null;
  judgeModel: string;
  judgeProvider: Provider;
  /** Live per-member progress, keyed by member id. */
  personaStatuses: Record<string, MemberRunStatus>;
  /** Judge lifecycle: idle until the backend says it's synthesizing. */
  judgeStatus: "idle" | "thinking";

  // Loading / error
  isLoading: boolean;
  /** False until the first loadSessions() settles — drives the sessions-page spinner. */
  sessionsLoaded: boolean;
  error: string | null;

  // UI — flattened for fine-grained subscriptions
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  theme: Theme;
  fontSize: number;
  highContrast: boolean;
  reducedMotion: boolean;
  settingsOpen: boolean;
  apiKeysOpen: boolean;
  memberFormOpen: boolean;
  editingMemberId: string | null;
  membersPanelOpen: boolean;
  swapTargetId: string | null;
  activeTab: TabId;
  selectedSessionId: string | null;
  responsePanelHeight: number;
  responsePanelCollapsed: boolean;
  currentView: ViewId;
  shortcuts: Record<ShortcutAction, ShortcutBinding>;
  importPreviewOpen: boolean;
  importPreviewData: { type: "members" | "templates"; items: MemberExportItem[] | TemplateExportItem[]; fileName: string } | null;
  setImportPreviewOpen: (open: boolean) => void;
  setImportPreviewData: (data: AppState["importPreviewData"]) => void;

  // Actions - Members
  loadMembers: () => Promise<void>;
  addMember: (data: Omit<Persona, "id" | "order">) => Promise<void>;
  updateMember: (id: string, updates: Partial<Persona>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  reorderMembers: (fromIndex: number, toIndex: number) => Promise<void>;
  duplicateMember: (id: string) => Promise<void>;
  toggleMemberEnabled: (id: string) => Promise<void>;
  deleteMembers: (ids: string[]) => Promise<void>;
  swapMember: (outId: string, inId: string) => Promise<void>;
  exportMembersToJSON: (title: string) => string;
  exportTemplatesToJSON: (title: string) => string;
  exportSessionsToJSON: (title: string) => string;
  importMembers: (items: MemberExportItem[]) => Promise<{ imported: number; errors: string[] }>;
  importTemplates: (items: TemplateExportItem[]) => Promise<{ imported: number; errors: string[] }>;
  importSessions: (items: SessionExportItem[]) => Promise<{ imported: number; errors: string[] }>;

  // Actions - Prompt
  setPrompt: (prompt: string) => void;
  addAttachments: (files: File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;

  // Actions - Run
  runCouncil: () => void;
  cancelRun: () => void;
  setJudge: (model: string, provider: Provider) => void;

  // Actions - Sessions
  loadSessions: () => Promise<void>;
  setSelectedSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  pinSession: (id: string) => void;
  togglePinSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => void;
  removeSession: (id: string) => Promise<void>;
  restoreSession: (id: string) => void;

  // Actions - Prompt templates
  loadPromptTemplates: () => Promise<void>;
  savePromptTemplate: (
    template: Omit<PromptTemplate, "id" | "createdAt"> & { id?: string }
  ) => Promise<PromptTemplate>;
  removePromptTemplate: (id: string) => Promise<void>;

  // Actions - UI
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  setHighContrast: (enabled: boolean) => void;
  setReducedMotion: (enabled: boolean) => void;
  /** Apply persisted UI settings (theme, font size, contrast, motion) to the DOM. Called once on app mount. */
  applyUiSettingsToDOM: () => void;
  setSettingsOpen: (open: boolean) => void;
  setApiKeysOpen: (open: boolean) => void;
  setMemberFormOpen: (open: boolean, editingId?: string | null) => void;
  setMembersPanelOpen: (open: boolean) => void;
  setSwapTargetId: (id: string | null) => void;
  setActiveTab: (tab: TabId) => void;
  setResponsePanelHeight: (height: number) => void;
  toggleResponsePanelCollapsed: () => void;
  setCurrentView: (view: ViewId) => void;
  setShortcut: (action: ShortcutAction, binding: ShortcutBinding) => void;
  resetShortcuts: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial data — empty, loaded async from SQLite via Rust
  members: [],
  sessions: [],
  promptTemplates: [],
  currentPrompt: "",
  attachments: [],

  // Run state
  isRunning: false,
  activeRun: null,
  cancelledRunId: null,
  judgeModel: lsGet(LS_KEYS.judgeModel) ?? "",
  judgeProvider: storedJudgeProvider(),
  personaStatuses: {},
  judgeStatus: "idle",

  // Loading / error
  isLoading: false,
  sessionsLoaded: false,
  error: null,

  // Initial UI state — flat keys for fine-grained subscriptions
  sidebarOpen: true,
  rightPanelOpen: false,
  theme: storedTheme(),
  fontSize: storedFontSize(),
  highContrast: storedBool(LS_KEYS.highContrast),
  reducedMotion: storedBool(LS_KEYS.reducedMotion),
  settingsOpen: false,
  apiKeysOpen: false,
  memberFormOpen: false,
  editingMemberId: null,
  membersPanelOpen: false,
  swapTargetId: null,
  activeTab: "overview",
  selectedSessionId: null,
  responsePanelHeight: 380,
  responsePanelCollapsed: false,
  currentView: "home",
  shortcuts: loadShortcuts(),
  importPreviewOpen: false,
  importPreviewData: null,

  // --- Member actions (async, backed by SQLite via Tauri) ---

  loadMembers: async () => {
    set({ isLoading: true, error: null });
    try {
      const members = await bridge.listMembers();
      set({ members, isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  addMember: async (data) => {
    set({ error: null });
    try {
      const created = await bridge.createMember({
        name: data.name,
        provider: data.provider,
        model: data.model,
        systemPrompt: data.systemPrompt,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        enabled: data.enabled,
        streaming: data.streaming,
        color: data.color,
        reasoningLevel: data.reasoningLevel || "medium",
      });
      set((state) => ({ members: [...state.members, created] }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  updateMember: async (id, updates) => {
    set({ error: null });
    try {
      const updated = await bridge.updateMember(id, {
        name: updates.name,
        provider: updates.provider,
        model: updates.model,
        systemPrompt: updates.systemPrompt,
        temperature: updates.temperature,
        maxTokens: updates.maxTokens,
        enabled: updates.enabled,
        streaming: updates.streaming,
        color: updates.color,
        reasoningLevel: updates.reasoningLevel,
      });
      set((state) => ({
        members: state.members.map((m) => (m.id === id ? updated : m)),
      }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  deleteMember: async (id) => {
    set({ error: null });
    try {
      await bridge.deleteMember(id);
      set((state) => ({
        members: state.members
          .filter((m) => m.id !== id)
          .map((m, i) => ({ ...m, order: i })),
      }));
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  reorderMembers: async (fromIndex, toIndex) => {
    const members = [...get().members];
    const [moved] = members.splice(fromIndex, 1);
    members.splice(toIndex, 0, moved);
    const reordered = members.map((m, i) => ({ ...m, order: i }));

    // Optimistic update
    set({ members: reordered, error: null });

    try {
      await bridge.reorderMembers(
        reordered.map((m) => ({ id: m.id, order: m.order }))
      );
    } catch (e) {
      set({ error: String(e) });
      // Reload from source of truth on failure
      try {
        const fresh = await bridge.listMembers();
        set({ members: fresh });
      } catch {
        // best effort
      }
    }
  },

  duplicateMember: async (id) => {
    const member = get().members.find((m) => m.id === id);
    if (!member) return;
    await get().addMember({
      name: `${member.name} (Copy)`,
      provider: member.provider,
      model: member.model,
      systemPrompt: member.systemPrompt,
      temperature: member.temperature,
      maxTokens: member.maxTokens,
      streaming: member.streaming,
      color: member.color,
      reasoningLevel: member.reasoningLevel,
      enabled: true,
    });
  },

  toggleMemberEnabled: async (id) => {
    const member = get().members.find((m) => m.id === id);
    if (!member) return;
    await get().updateMember(id, { enabled: !member.enabled });
  },

  deleteMembers: async (ids) => {
    await Promise.all(ids.map((id) => get().deleteMember(id)));
  },

  swapMember: async (outId, inId) => {
    await Promise.all([
      get().updateMember(outId, { enabled: false }),
      get().updateMember(inId, { enabled: true }),
    ]);
  },

  exportMembersToJSON: (_title) => {
    const members = get().members;
    const items: MemberExportItem[] = members.map((m) => ({
      Name: m.name,
      provider: m.provider,
      model: m.model,
      sys_prompt: m.systemPrompt,
      member_color: m.color,
      reasoning: m.reasoningLevel || "medium",
      max_tkns: m.maxTokens,
      temperature: m.temperature,
    }));
    const file: { members: MemberExportItem[] } = { members: items };
    return JSON.stringify(file, null, 2);
  },

  exportTemplatesToJSON: (_title) => {
    const templates = get().promptTemplates;
    const items: TemplateExportItem[] = templates.map((t) => ({
      Name: t.name,
      desc: t.description,
      prompt: t.prompt,
      category: t.category,
    }));
    const file: { templates: TemplateExportItem[] } = { templates: items };
    return JSON.stringify(file, null, 2);
  },

  exportSessionsToJSON: (_title) => {
    const sessions = get().sessions;
    const items: SessionExportItem[] = sessions.map((s) => ({
      Name: s.title,
      prompt: s.prompt,
      status: s.status,
      persona_count: s.personaCount,
      tokens_used: s.tokensUsed,
      total_cost: s.totalCost,
      duration_ms: s.durationMs,
      created_at: s.createdAt,
      pinned: s.pinned,
      run: s.run,
    }));
    const file: { sessions: SessionExportItem[] } = { sessions: items };
    return JSON.stringify(file, null, 2);
  },

  importMembers: async (items) => {
    const errors: string[] = [];
    let imported = 0;
    for (const item of items) {
      try {
        await get().addMember({
          name: item.Name || "Unnamed",
          provider: item.provider,
          model: item.model,
          systemPrompt: item.sys_prompt || "",
          temperature: item.temperature ?? 0.7,
          maxTokens: item.max_tkns ?? 4096,
          enabled: true,
          streaming: true,
          color: item.member_color || "#6366f1",
          reasoningLevel: (item.reasoning as "none" | "low" | "medium" | "high") || "medium",
        });
        imported++;
      } catch (e) {
        errors.push(`${item.Name || "Unknown"}: ${String(e)}`);
      }
    }
    return { imported, errors };
  },

  importTemplates: async (items) => {
    const errors: string[] = [];
    let imported = 0;
    for (const item of items) {
      try {
        await get().savePromptTemplate({
          name: item.Name || "Unnamed",
          description: item.desc || "",
          prompt: item.prompt || "",
          category: item.category || "custom",
        });
        imported++;
      } catch (e) {
        errors.push(`${item.Name || "Unknown"}: ${String(e)}`);
      }
    }
    return { imported, errors };
  },

  importSessions: async (items) => {
    const errors: string[] = [];
    let imported = 0;
    for (const item of items) {
      try {
        const createdAt = item.created_at ?? Date.now();
        const session: Session = {
          // Fresh id so re-importing the same file never overwrites an existing session
          id: crypto.randomUUID(),
          title: item.Name || item.prompt.slice(0, 60) || "Imported session",
          prompt: item.prompt || "",
          configId: "default",
          configName: "Default",
          status: item.status || "completed",
          personaCount: item.persona_count ?? 0,
          tokensUsed: item.tokens_used ?? 0,
          totalCost: item.total_cost ?? 0,
          durationMs: item.duration_ms ?? 0,
          createdAt,
          updatedAt: createdAt,
          pinned: item.pinned ?? false,
          tags: [],
          run: item.run,
        };
        await bridge.saveSession(session);
        set((state) => ({
          sessions: [session, ...state.sessions],
        }));
        imported++;
      } catch (e) {
        errors.push(`${item.Name || "Unknown"}: ${String(e)}`);
      }
    }
    return { imported, errors };
  },

  // --- Prompt actions ---

  setPrompt: (prompt) => set({ currentPrompt: prompt }),

  addAttachments: async (files) => {
    const read = (file: File) =>
      new Promise<PromptAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve({
            id: crypto.randomUUID(),
            name: file.name,
            fileType: file.type,
            dataUrl: String(reader.result),
            size: file.size,
          });
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    const added = await Promise.all(files.map(read));
    set((state) => ({ attachments: [...state.attachments, ...added] }));
  },

  removeAttachment: (id) =>
    set((state) => ({ attachments: state.attachments.filter((a) => a.id !== id) })),

  clearAttachments: () => set({ attachments: [] }),

  // --- Run actions ---

  runCouncil: () => {
    const { currentPrompt, members, judgeModel, judgeProvider, attachments } = get();
    if (
      (!currentPrompt.trim() && attachments.length === 0) ||
      members.filter((m) => m.enabled).length === 0
    ) {
      return;
    }

    const activeRun: ActiveRun = {
      id: crypto.randomUUID(),
      configId: "default",
      prompt: currentPrompt,
      status: "running",
      personaResults: {},
      startedAt: Date.now(),
      attachments: attachments.map((a) => ({ name: a.name, fileType: a.fileType })),
    };

    // Seed per-member statuses so the UI shows every enabled member as queued
    const personaStatuses: Record<string, MemberRunStatus> = {};
    for (const m of members) {
      if (m.enabled) personaStatuses[m.id] = "waiting";
    }

    const runAttachments = attachments.map((a) => ({
      name: a.name,
      fileType: a.fileType,
      dataUrl: a.dataUrl,
    }));

    set({
      isRunning: true,
      activeRun,
      error: null,
      personaStatuses,
      judgeStatus: "idle",
      attachments: [],
    });

    // Backend dispatches personas in parallel and streams results back as
    // Tauri events (see listeners at the bottom of this file).
    bridge.runCouncil(currentPrompt, judgeModel, judgeProvider, runAttachments).catch((err) => {
      set((state) => ({
        isRunning: false,
        error: String(err),
        activeRun: state.activeRun
          ? { ...state.activeRun, status: "failed", completedAt: Date.now() }
          : state.activeRun,
      }));
    });
  },

  cancelRun: () => {
    bridge.cancelRun().catch(() => {
      // Best effort — local state is cancelled regardless
    });
    set((state) => {
      const personaStatuses = { ...state.personaStatuses };
      for (const id of Object.keys(personaStatuses)) {
        if (personaStatuses[id] === "waiting" || personaStatuses[id] === "thinking") {
          personaStatuses[id] = "cancelled";
        }
      }
      return {
        isRunning: false,
        cancelledRunId: state.activeRun?.id || null,
        judgeStatus: "idle",
        personaStatuses,
        activeRun: state.activeRun
          ? { ...state.activeRun, status: "cancelled", completedAt: Date.now() }
          : state.activeRun,
      };
    });
  },

  setJudge: (model, provider) => {
    set({ judgeModel: model, judgeProvider: provider });
    lsSet(LS_KEYS.judgeModel, model);
    lsSet(LS_KEYS.judgeProvider, provider);
  },

  // --- Session actions ---

  loadSessions: async () => {
    try {
      const sessions = await bridge.listSessions();
      set({ sessions, sessionsLoaded: true });
    } catch (e) {
      set({ error: String(e), sessionsLoaded: true });
    }
  },

  setSelectedSession: (id) => {
    if (!id) {
      set({ selectedSessionId: null });
      return;
    }
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;

    set((state) => ({
      selectedSessionId: id,
      activeTab: "responses",
      activeRun: session.run ? toActiveRun(session.run) : state.activeRun,
      currentPrompt: session.prompt,
    }));

    if (!session.run) {
      bridge
        .getSession(id)
        .then((full) => {
          set((state) => ({
            sessions: state.sessions.map((s) => (s.id === id ? full : s)),
            activeRun: state.selectedSessionId === id && full.run
              ? toActiveRun(full.run)
              : state.activeRun,
          }));
        })
        .catch((e) => set({ error: String(e) }));
    }
  },

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions.filter((s) => s.id !== session.id)],
    })),

  pinSession: (id) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, pinned: !s.pinned } : s
      ),
    })),

  togglePinSession: async (id) => {
    try {
      const updated = await bridge.pinSession(id);
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? { ...s, pinned: updated.pinned } : s)),
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      selectedSessionId: state.selectedSessionId === id ? null : state.selectedSessionId,
    })),

  removeSession: async (id) => {
    try {
      await bridge.deleteSession(id);
      get().deleteSession(id);
    } catch (e) {
      set({ error: String(e) });
    }
  },

  restoreSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    set((state) => ({
      currentPrompt: session.prompt,
      selectedSessionId: id,
      activeTab: "responses",
      activeRun: session.run ? toActiveRun(session.run) : state.activeRun,
    }));

    if (!session.run) {
      bridge
        .getSession(id)
        .then((full) => {
          set((state) => ({
            sessions: state.sessions.map((s) => (s.id === id ? full : s)),
            activeRun: state.selectedSessionId === id && full.run
              ? toActiveRun(full.run)
              : state.activeRun,
          }));
        })
        .catch((e) => set({ error: String(e) }));
    }
  },

  // --- Prompt template actions ---

  loadPromptTemplates: async () => {
    try {
      const promptTemplates = await bridge.listPromptTemplates();
      set({ promptTemplates });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  savePromptTemplate: async (template) => {
    try {
      const saved = await bridge.savePromptTemplate(template);
      set((state) => ({
        promptTemplates: template.id
          ? state.promptTemplates.map((t) => (t.id === saved.id ? saved : t))
          : [saved, ...state.promptTemplates],
      }));
      return saved;
    } catch (e) {
      set({ error: String(e) });
      throw e;
    }
  },

  removePromptTemplate: async (id) => {
    try {
      await bridge.deletePromptTemplate(id);
      set((state) => ({
        promptTemplates: state.promptTemplates.filter((t) => t.id !== id),
      }));
    } catch (e) {
      set({ error: String(e) });
    }
  },

  // --- UI actions ---

  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  toggleRightPanel: () => set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

  setTheme: (theme) => {
    set({ theme });
    lsSet(LS_KEYS.theme, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  },

  setFontSize: (size) => {
    set({ fontSize: size });
    lsSet(LS_KEYS.fontSize, String(size));
    document.documentElement.style.setProperty("--app-font-size", `${size}px`);
  },

  setHighContrast: (enabled) => {
    set({ highContrast: enabled });
    lsSet(LS_KEYS.highContrast, String(enabled));
    document.documentElement.classList.toggle("high-contrast", enabled);
  },

  setReducedMotion: (enabled) => {
    set({ reducedMotion: enabled });
    lsSet(LS_KEYS.reducedMotion, String(enabled));
    document.documentElement.classList.toggle("reduced-motion", enabled);
  },

  applyUiSettingsToDOM: () => {
    const { theme, fontSize, highContrast, reducedMotion } = get();
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("high-contrast", highContrast);
    root.classList.toggle("reduced-motion", reducedMotion);
    root.style.setProperty("--app-font-size", `${fontSize}px`);
  },

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setApiKeysOpen: (open) => set({ apiKeysOpen: open }),

  setMemberFormOpen: (open, editingId = null) =>
    set({ memberFormOpen: open, editingMemberId: editingId }),

  setMembersPanelOpen: (open) => set({ membersPanelOpen: open }),

  setSwapTargetId: (id) => set({ swapTargetId: id }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setResponsePanelHeight: (height) => set({ responsePanelHeight: height }),

  toggleResponsePanelCollapsed: () =>
    set((state) => ({ responsePanelCollapsed: !state.responsePanelCollapsed })),

  setCurrentView: (view) => set({ currentView: view }),

  setShortcut: (action, binding) => {
    const shortcuts = { ...get().shortcuts, [action]: binding };
    set({ shortcuts });
    saveShortcuts(shortcuts);
  },

  resetShortcuts: () => {
    const shortcuts = { ...DEFAULT_SHORTCUTS };
    set({ shortcuts });
    saveShortcuts(shortcuts);
  },

  setImportPreviewOpen: (open) => set({ importPreviewOpen: open }),

  setImportPreviewData: (data) => set({ importPreviewData: data }),
}));

// ---------------------------------------------------------------------------
// Named selectors — exported for fine-grained component subscriptions.
// ---------------------------------------------------------------------------

export const selectMembers = (s: AppState) => s.members;
export const selectSessions = (s: AppState) => s.sessions;
export const selectPromptTemplates = (s: AppState) => s.promptTemplates;
export const selectCurrentPrompt = (s: AppState) => s.currentPrompt;
export const selectAttachments = (s: AppState) => s.attachments;
export const selectIsRunning = (s: AppState) => s.isRunning;
export const selectActiveRun = (s: AppState) => s.activeRun;
export const selectPersonaStatuses = (s: AppState) => s.personaStatuses;
export const selectJudgeStatus = (s: AppState) => s.judgeStatus;
export const selectIsLoading = (s: AppState) => s.isLoading;
export const selectError = (s: AppState) => s.error;
export const selectSidebarOpen = (s: AppState) => s.sidebarOpen;
export const selectMembersPanelOpen = (s: AppState) => s.membersPanelOpen;
export const selectSwapTargetId = (s: AppState) => s.swapTargetId;
export const selectCurrentView = (s: AppState) => s.currentView;
export const selectActiveTab = (s: AppState) => s.activeTab;
export const selectTheme = (s: AppState) => s.theme;
export const selectFontSize = (s: AppState) => s.fontSize;
export const selectHighContrast = (s: AppState) => s.highContrast;
export const selectReducedMotion = (s: AppState) => s.reducedMotion;
export const selectJudgeModel = (s: AppState) => s.judgeModel;
export const selectJudgeProvider = (s: AppState) => s.judgeProvider;
export const selectImportPreviewOpen = (s: AppState) => s.importPreviewOpen;
export const selectImportPreviewData = (s: AppState) => s.importPreviewData;
export const selectPersonaResultsArray = (s: AppState) =>
  s.activeRun ? Object.values(s.activeRun.personaResults) : [];

// ---------------------------------------------------------------------------
// Tauri event listeners — wrapped in initStoreListeners() for lifecycle
// management. Called once from App.tsx; cleaned up on unmount.
// ---------------------------------------------------------------------------

let listenersInitialized = false;

type UnlistenFn = () => void;

export async function initStoreListeners(): Promise<UnlistenFn[]> {
  if (listenersInitialized) return [];
  listenersInitialized = true;

  const unlisten1 = await listen<{ personaId: string; status: MemberRunStatus }>(
    "persona-status",
    (event) => {
      const { personaId, status } = event.payload;
      useAppStore.setState((state) => ({
        personaStatuses: { ...state.personaStatuses, [personaId]: status },
      }));
    }
  );

  const unlisten2 = await listen<PersonaResult>("persona-result", (event) => {
    const result = event.payload;
    if (result.status === "failed") {
      toast("error", `${result.personaName} failed`, result.error ?? undefined);
    } else if (result.status === "completed") {
      toast("success", `${result.personaName} finished`);
    }
    // "cancelled" results stay silent — the run-level cancel toast covers them.
    useAppStore.setState((state) => {
      if (!state.activeRun) return state;
      return {
        activeRun: {
          ...state.activeRun,
          personaResults: {
            ...state.activeRun.personaResults,
            [result.personaId]: result,
          },
          status: "streaming",
        },
        personaStatuses: {
          ...state.personaStatuses,
          [result.personaId]: result.status === "failed" ? "failed" : "completed",
        },
      };
    });
  });

  const unlisten3 = await listen<{ status: string }>("judge-status", (event) => {
    if (event.payload.status === "thinking") {
      toast("info", "Judge started synthesizing");
    }
    useAppStore.setState({
      judgeStatus: event.payload.status === "thinking" ? "thinking" : "idle",
    });
  });

  const unlisten4 = await listen<JudgeResult>("judge-result", (event) => {
    toast("success", "Judge finished the summary");
    useAppStore.setState((state) => {
      if (!state.activeRun) return state;
      return {
        judgeStatus: "idle",
        activeRun: {
          ...state.activeRun,
          judgeResult: event.payload,
        },
      };
    });
  });

  const unlisten5 = await listen<{ runId: string }>("council-run-completed", () => {
    toast("success", "Council run complete");
    useAppStore.setState((state) => {
      if (!state.activeRun) return { isRunning: false };
      const resultsArray = Object.values(state.activeRun.personaResults);
      const completedRun: CouncilRun = {
        ...state.activeRun,
        personaResults: resultsArray,
        status: "completed",
        completedAt: Date.now(),
      };
      const session: Session = {
        id: completedRun.id,
        title: completedRun.prompt.slice(0, 60),
        prompt: completedRun.prompt,
        configId: completedRun.configId,
        configName: "Default",
        status: "completed",
        personaCount: resultsArray.length,
        tokensUsed: resultsArray.reduce(
          (s, r) => s + r.tokensIn + r.tokensOut,
          0
        ),
        totalCost: resultsArray.reduce((s, r) => s + r.cost, 0),
        durationMs: completedRun.completedAt! - completedRun.startedAt,
        createdAt: completedRun.startedAt,
        updatedAt: completedRun.completedAt!,
        pinned: false,
        tags: [],
        run: completedRun,
      };
      bridge.saveSession(session).catch((e) => {
        useAppStore.setState({ error: String(e) });
      });
      return {
        isRunning: false,
        activeRun: { ...state.activeRun, status: "completed", completedAt: Date.now() },
        sessions: [session, ...state.sessions.filter((s) => s.id !== session.id)],
      };
    });
  });

  const unlisten6 = await listen("council-run-cancelled", () => {
    toast("info", "Council run cancelled");
    useAppStore.setState((state) => {
      if (!state.activeRun) return { isRunning: false };
      const resultsArray = Object.values(state.activeRun.personaResults);
      const terminatedRun: CouncilRun = {
        ...state.activeRun,
        personaResults: resultsArray,
        status: "terminated",
        completedAt: Date.now(),
      };
      const session: Session = {
        id: terminatedRun.id,
        title: terminatedRun.prompt.slice(0, 60),
        prompt: terminatedRun.prompt,
        configId: terminatedRun.configId,
        configName: "Default",
        status: "terminated",
        personaCount: resultsArray.length,
        tokensUsed: resultsArray.reduce(
          (s, r) => s + r.tokensIn + r.tokensOut,
          0
        ),
        totalCost: resultsArray.reduce((s, r) => s + r.cost, 0),
        durationMs: terminatedRun.completedAt! - terminatedRun.startedAt,
        createdAt: terminatedRun.startedAt,
        updatedAt: terminatedRun.completedAt!,
        pinned: false,
        tags: [],
        run: terminatedRun,
      };
      bridge.saveSession(session).catch((e) => {
        useAppStore.setState({ error: String(e) });
      });
      return {
        isRunning: false,
        activeRun: { ...state.activeRun, status: "terminated", completedAt: Date.now() },
        sessions: [session, ...state.sessions.filter((s) => s.id !== session.id)],
      };
    });
  });

  return [unlisten1, unlisten2, unlisten3, unlisten4, unlisten5, unlisten6];
}

/** Reset the guard so listeners can be re-initialized (e.g., after HMR). */
export function resetListenerGuard(): void {
  listenersInitialized = false;
}

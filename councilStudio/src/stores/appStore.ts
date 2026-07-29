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
} from "@/types";
import * as bridge from "@/lib/tauri-bridge";
import { toast } from "@/components/ui/toaster";

type TabId = "overview" | "responses" | "consensus" | "differences" | "sources" | "timeline";
type ViewId = "home" | "prompts" | "sessions";

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
  error: string | null;

  // UI — flattened for fine-grained subscriptions
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  theme: Theme;
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

  // Actions - Prompt
  setPrompt: (prompt: string) => void;

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
  setSettingsOpen: (open: boolean) => void;
  setApiKeysOpen: (open: boolean) => void;
  setMemberFormOpen: (open: boolean, editingId?: string | null) => void;
  setMembersPanelOpen: (open: boolean) => void;
  setSwapTargetId: (id: string | null) => void;
  setActiveTab: (tab: TabId) => void;
  setResponsePanelHeight: (height: number) => void;
  toggleResponsePanelCollapsed: () => void;
  setCurrentView: (view: ViewId) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial data — empty, loaded async from SQLite via Rust
  members: [],
  sessions: [],
  promptTemplates: [],
  currentPrompt: "",

  // Run state
  isRunning: false,
  activeRun: null,
  cancelledRunId: null,
  judgeModel: "claude-sonnet-5",
  judgeProvider: "anthropic",
  personaStatuses: {},
  judgeStatus: "idle",

  // Loading / error
  isLoading: false,
  error: null,

  // Initial UI state — flat keys for fine-grained subscriptions
  sidebarOpen: true,
  rightPanelOpen: false,
  theme: "light",
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

  // --- Prompt actions ---

  setPrompt: (prompt) => set({ currentPrompt: prompt }),

  // --- Run actions ---

  runCouncil: () => {
    const { currentPrompt, members, judgeModel, judgeProvider } = get();
    if (
      !currentPrompt.trim() ||
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
    };

    // Seed per-member statuses so the UI shows every enabled member as queued
    const personaStatuses: Record<string, MemberRunStatus> = {};
    for (const m of members) {
      if (m.enabled) personaStatuses[m.id] = "waiting";
    }

    set({
      isRunning: true,
      activeRun,
      error: null,
      personaStatuses,
      judgeStatus: "idle",
    });

    // Backend dispatches personas in parallel and streams results back as
    // Tauri events (see listeners at the bottom of this file).
    bridge.runCouncil(currentPrompt, judgeModel, judgeProvider).catch((err) => {
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

  setJudge: (model, provider) => set({ judgeModel: model, judgeProvider: provider }),

  // --- Session actions ---

  loadSessions: async () => {
    try {
      const sessions = await bridge.listSessions();
      set({ sessions });
    } catch (e) {
      set({ error: String(e) });
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
    document.documentElement.classList.toggle("dark", theme === "dark");
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
}));

// ---------------------------------------------------------------------------
// Named selectors — exported for fine-grained component subscriptions.
// ---------------------------------------------------------------------------

export const selectMembers = (s: AppState) => s.members;
export const selectSessions = (s: AppState) => s.sessions;
export const selectPromptTemplates = (s: AppState) => s.promptTemplates;
export const selectCurrentPrompt = (s: AppState) => s.currentPrompt;
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
export const selectJudgeModel = (s: AppState) => s.judgeModel;
export const selectJudgeProvider = (s: AppState) => s.judgeProvider;
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

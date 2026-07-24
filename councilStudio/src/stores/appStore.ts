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

type TabId = "overview" | "responses" | "consensus" | "differences" | "sources" | "timeline";

interface UIState {
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  theme: Theme;
  settingsOpen: boolean;
  apiKeysOpen: boolean;
  memberFormOpen: boolean;
  editingMemberId: string | null;
  activeTab: TabId;
  selectedSessionId: string | null;
  responsePanelHeight: number;
  responsePanelCollapsed: boolean;
}

interface AppState {
  // Data
  members: Persona[];
  sessions: Session[];
  promptTemplates: PromptTemplate[];
  currentPrompt: string;

  // Run state
  isRunning: boolean;
  activeRun: CouncilRun | null;
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

  // UI
  ui: UIState;

  // Actions - Members
  loadMembers: () => Promise<void>;
  addMember: (data: Omit<Persona, "id" | "order">) => Promise<void>;
  updateMember: (id: string, updates: Partial<Persona>) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  reorderMembers: (fromIndex: number, toIndex: number) => Promise<void>;
  duplicateMember: (id: string) => Promise<void>;
  toggleMemberEnabled: (id: string) => Promise<void>;

  // Actions - Prompt
  setPrompt: (prompt: string) => void;

  // Actions - Run
  runCouncil: () => void;
  cancelRun: () => void;
  setJudge: (model: string, provider: Provider) => void;

  // Actions - Sessions
  setSelectedSession: (id: string | null) => void;
  addSession: (session: Session) => void;
  pinSession: (id: string) => void;
  deleteSession: (id: string) => void;
  restoreSession: (id: string) => void;

  // Actions - UI
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setTheme: (theme: Theme) => void;
  setSettingsOpen: (open: boolean) => void;
  setApiKeysOpen: (open: boolean) => void;
  setMemberFormOpen: (open: boolean, editingId?: string | null) => void;
  setActiveTab: (tab: TabId) => void;
  setResponsePanelHeight: (height: number) => void;
  toggleResponsePanelCollapsed: () => void;
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

  // Initial UI state
  ui: {
    sidebarOpen: true,
    rightPanelOpen: false,
    theme: "light",
    settingsOpen: false,
    apiKeysOpen: false,
    memberFormOpen: false,
    editingMemberId: null,
    activeTab: "overview",
    selectedSessionId: null,
    responsePanelHeight: 380,
    responsePanelCollapsed: false,
  },

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

    const activeRun: CouncilRun = {
      id: crypto.randomUUID(),
      configId: "default",
      prompt: currentPrompt,
      status: "running",
      personaResults: [],
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

  setSelectedSession: (id) =>
    set((state) => {
      if (!id) return { ui: { ...state.ui, selectedSessionId: null } };
      const session = state.sessions.find((s) => s.id === id);
      if (!session) return state;
      return {
        ui: { ...state.ui, selectedSessionId: id, activeTab: "responses" },
        activeRun: session.run,
        currentPrompt: session.prompt,
      };
    }),

  addSession: (session) =>
    set((state) => ({
      sessions: [session, ...state.sessions],
    })),

  pinSession: (id) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === id ? { ...s, pinned: !s.pinned } : s
      ),
    })),

  deleteSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      ui: state.ui.selectedSessionId === id
        ? { ...state.ui, selectedSessionId: null }
        : state.ui,
    })),

  restoreSession: (id) => {
    const session = get().sessions.find((s) => s.id === id);
    if (!session) return;
    set({
      currentPrompt: session.prompt,
      ui: { ...get().ui, selectedSessionId: id, activeTab: "responses" },
      activeRun: session.run,
    });
  },

  // --- UI actions ---

  toggleSidebar: () =>
    set((state) => ({ ui: { ...state.ui, sidebarOpen: !state.ui.sidebarOpen } })),

  toggleRightPanel: () =>
    set((state) => ({ ui: { ...state.ui, rightPanelOpen: !state.ui.rightPanelOpen } })),

  setTheme: (theme) => {
    set((state) => ({ ui: { ...state.ui, theme } }));
    document.documentElement.classList.toggle("dark", theme === "dark");
  },

  setSettingsOpen: (open) =>
    set((state) => ({ ui: { ...state.ui, settingsOpen: open } })),

  setApiKeysOpen: (open) =>
    set((state) => ({ ui: { ...state.ui, apiKeysOpen: open } })),

  setMemberFormOpen: (open, editingId = null) =>
    set((state) => ({
      ui: { ...state.ui, memberFormOpen: open, editingMemberId: editingId },
    })),

  setActiveTab: (tab) =>
    set((state) => ({ ui: { ...state.ui, activeTab: tab } })),

  setResponsePanelHeight: (height) =>
    set((state) => ({ ui: { ...state.ui, responsePanelHeight: height } })),

  toggleResponsePanelCollapsed: () =>
    set((state) => ({
      ui: { ...state.ui, responsePanelCollapsed: !state.ui.responsePanelCollapsed },
    })),
}));

// ---------------------------------------------------------------------------
// Tauri event listeners — registered once at module load. The Rust backend
// emits these during a council run (see orchestrator.rs).
// ---------------------------------------------------------------------------

listen<{ personaId: string; status: MemberRunStatus }>(
  "persona-status",
  (event) => {
    const { personaId, status } = event.payload;
    useAppStore.setState((state) => ({
      personaStatuses: { ...state.personaStatuses, [personaId]: status },
    }));
  }
);

listen<PersonaResult>("persona-result", (event) => {
  const result = event.payload;
  useAppStore.setState((state) => {
    if (!state.activeRun) return state;
    const others = state.activeRun.personaResults.filter(
      (r) => r.personaId !== result.personaId
    );
    return {
      activeRun: {
        ...state.activeRun,
        personaResults: [...others, result],
        status: "streaming",
      },
      personaStatuses: {
        ...state.personaStatuses,
        [result.personaId]: result.status === "failed" ? "failed" : "completed",
      },
    };
  });
});

listen<{ status: string }>("judge-status", (event) => {
  useAppStore.setState({
    judgeStatus: event.payload.status === "thinking" ? "thinking" : "idle",
  });
});

listen<JudgeResult>("judge-result", (event) => {
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

listen<{ runId: string }>("council-run-completed", () => {
  useAppStore.setState((state) => {
    if (!state.activeRun) return { isRunning: false };
    const completedRun: CouncilRun = {
      ...state.activeRun,
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
      personaCount: completedRun.personaResults.length,
      tokensUsed: completedRun.personaResults.reduce(
        (s, r) => s + r.tokensIn + r.tokensOut,
        0
      ),
      totalCost: completedRun.personaResults.reduce((s, r) => s + r.cost, 0),
      durationMs: completedRun.completedAt! - completedRun.startedAt,
      createdAt: completedRun.startedAt,
      updatedAt: completedRun.completedAt!,
      pinned: false,
      tags: [],
      run: completedRun,
    };
    return {
      isRunning: false,
      activeRun: completedRun,
      sessions: [session, ...state.sessions],
    };
  });
});

listen("council-run-cancelled", () => {
  useAppStore.setState((state) => ({
    isRunning: false,
    activeRun: state.activeRun
      ? { ...state.activeRun, status: "cancelled", completedAt: Date.now() }
      : state.activeRun,
  }));
});
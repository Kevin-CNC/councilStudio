import { create } from "zustand";
import type { Persona, Session, CouncilRun, PromptTemplate, Theme } from "@/types";
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
  runCouncil: () => CouncilRun;
  cancelRun: () => void;

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
    throw new Error("Not implemented — orchestration coming in Phase 4");
  },

  cancelRun: () => {
    set({ isRunning: false, cancelledRunId: get().activeRun?.id || null });
  },

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
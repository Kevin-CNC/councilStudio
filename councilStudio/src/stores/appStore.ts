import { create } from "zustand";
import type { Persona, Session, CouncilRun, PromptTemplate, Theme } from "@/types";
import { SEED_PERSONAS, SAMPLE_PROMPTS, createSampleSessions, createSampleRun } from "@/lib/mock-data";

type TabId = "overview" | "responses" | "consensus" | "differences" | "sources" | "timeline";

interface UIState {
  sidebarOpen: boolean;
  rightPanelOpen: boolean;
  theme: Theme;
  settingsOpen: boolean;
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

  // UI
  ui: UIState;

  // Actions - Members
  addMember: (member: Persona) => void;
  updateMember: (id: string, updates: Partial<Persona>) => void;
  deleteMember: (id: string) => void;
  reorderMembers: (fromIndex: number, toIndex: number) => void;
  duplicateMember: (id: string) => void;
  toggleMemberEnabled: (id: string) => void;

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
  setMemberFormOpen: (open: boolean, editingId?: string | null) => void;
  setActiveTab: (tab: TabId) => void;
  setResponsePanelHeight: (height: number) => void;
  toggleResponsePanelCollapsed: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  // Initial data
  members: SEED_PERSONAS,
  sessions: createSampleSessions(),
  promptTemplates: SAMPLE_PROMPTS,
  currentPrompt: "",

  // Run state
  isRunning: false,
  activeRun: null,
  cancelledRunId: null,

  // Initial UI state
  ui: {
    sidebarOpen: true,
    rightPanelOpen: false,
    theme: "light",
    settingsOpen: false,
    memberFormOpen: false,
    editingMemberId: null,
    activeTab: "overview",
    selectedSessionId: null,
    responsePanelHeight: 380,
    responsePanelCollapsed: false,
  },

  // Member actions
  addMember: (member) =>
    set((state) => ({
      members: [...state.members, { ...member, order: state.members.length }],
    })),

  updateMember: (id, updates) =>
    set((state) => ({
      members: state.members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    })),

  deleteMember: (id) =>
    set((state) => ({
      members: state.members.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i })),
    })),

  reorderMembers: (fromIndex, toIndex) =>
    set((state) => {
      const members = [...state.members];
      const [moved] = members.splice(fromIndex, 1);
      members.splice(toIndex, 0, moved);
      return { members: members.map((m, i) => ({ ...m, order: i })) };
    }),

  duplicateMember: (id) =>
    set((state) => {
      const member = state.members.find((m) => m.id === id);
      if (!member) return state;
      const newMember: Persona = {
        ...member,
        id: `person-${Date.now()}`,
        name: `${member.name} (Copy)`,
        order: state.members.length,
      };
      return { members: [...state.members, newMember] };
    }),

  toggleMemberEnabled: (id) =>
    set((state) => ({
      members: state.members.map((m) =>
        m.id === id ? { ...m, enabled: !m.enabled } : m
      ),
    })),

  // Prompt actions
  setPrompt: (prompt) => set({ currentPrompt: prompt }),

  // Run actions
  runCouncil: () => {
    const { currentPrompt, members, sessions } = get();
    const enabledMembers = members.filter((m) => m.enabled);

    if (!currentPrompt.trim() || enabledMembers.length === 0) {
      throw new Error("No prompt or no enabled members");
    }

    const run = createSampleRun(currentPrompt);

    // Create new session
    const session: Session = {
      id: `session-${Date.now()}`,
      title: currentPrompt.slice(0, 60) + (currentPrompt.length > 60 ? "..." : ""),
      prompt: currentPrompt,
      configId: "default",
      configName: "Balanced Council",
      status: "completed",
      personaCount: enabledMembers.length,
      tokensUsed: run.personaResults.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0),
      totalCost: run.personaResults.reduce((s, r) => s + r.cost, 0),
      durationMs: 6000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      pinned: false,
      tags: [],
      run,
    };

    set({
      isRunning: false,
      activeRun: run,
      sessions: [session, ...sessions].slice(0, 50), // Keep last 50 sessions
      ui: { ...get().ui, activeTab: "responses", selectedSessionId: session.id },
    });

    return run;
  },

  cancelRun: () => {
    set((state) => ({
      isRunning: false,
      cancelledRunId: state.activeRun?.id || null,
    }));
  },

  // Session actions
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

  // UI actions
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

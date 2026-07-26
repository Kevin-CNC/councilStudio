import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore, initStoreListeners, resetListenerGuard } from "@/stores/appStore";
import { seedDefaultMembers } from "@/lib/tauri-bridge";

function App() {
  const loadMembers = useAppStore((s) => s.loadMembers);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const loadPromptTemplates = useAppStore((s) => s.loadPromptTemplates);

  useEffect(() => {
    async function init() {
      await loadMembers();
      const { members } = useAppStore.getState();
      if (members.length === 0) {
        try {
          const seeded = await seedDefaultMembers();
          useAppStore.setState({ members: seeded });
        } catch {
          // DB already seeded or error — handled by store
        }
      }
      await Promise.all([loadSessions(), loadPromptTemplates()]);
    }
    init();
  }, [loadMembers, loadSessions, loadPromptTemplates]);

  // Tauri event listener lifecycle — register once, clean up on unmount.
  useEffect(() => {
    let unlisteners: (() => void)[] = [];
    initStoreListeners().then((fns) => {
      unlisteners = fns;
    });
    return () => {
      unlisteners.forEach((fn) => fn());
      resetListenerGuard();
    };
  }, []);

  return (
    <TooltipProvider>
      <AppShell>
        <Dashboard />
      </AppShell>
    </TooltipProvider>
  );
}

export default App;

import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAppStore } from "@/stores/appStore";
import { seedDefaultMembers } from "@/lib/tauri-bridge";

function App() {
  const loadMembers = useAppStore((s) => s.loadMembers);

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
    }
    init();
  }, [loadMembers]);

  return (
    <TooltipProvider>
      <AppShell>
        <Dashboard />
      </AppShell>
    </TooltipProvider>
  );
}

export default App;

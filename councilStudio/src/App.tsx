import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";

function App() {
  return (
    <TooltipProvider>
      <AppShell>
        <Dashboard />
      </AppShell>
    </TooltipProvider>
  );
}

export default App;

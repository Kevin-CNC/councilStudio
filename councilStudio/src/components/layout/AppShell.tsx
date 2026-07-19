import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { RightPanel } from "@/components/layout/RightPanel";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div id="app-shell-root" className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content area */}
      <div id="app-shell-main" className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <main id="app-shell-content" className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-auto">
            {children}
          </div>

          {/* Right Panel */}
          <div className="flex items-start p-2">
            <RightPanel />
          </div>
        </main>
      </div>
    </div>
  );
}

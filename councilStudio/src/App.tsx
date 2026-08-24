import { useEffect } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Dashboard } from "@/pages/Dashboard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { KeyboardProvider } from "@/components/layout/KeyboardProvider";
import { LoaderScreen } from "@/components/layout/LoaderScreen";
import { Toaster } from "@/components/ui/toaster";
import { useAppStore, initStoreListeners, resetListenerGuard } from "@/stores/appStore";
import { seedDefaultMembers } from "@/lib/tauri-bridge";

function App() {
  const loadMembers = useAppStore((s) => s.loadMembers);
  const loadCouncils = useAppStore((s) => s.loadCouncils);
  const loadSessions = useAppStore((s) => s.loadSessions);
  const loadPromptTemplates = useAppStore((s) => s.loadPromptTemplates);
  const isBootstrapped = useAppStore((s) => s.isBootstrapped);

  useEffect(() => {
    // Hydrate persisted UI settings (theme, font size, contrast, motion) onto the DOM
    useAppStore.getState().applyUiSettingsToDOM();
    async function init() {
      try {
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
        await Promise.all([loadCouncils(), loadSessions(), loadPromptTemplates()]);
      } finally {
        // Always clear the boot loader, even if a startup load throws.
        useAppStore.setState({ isBootstrapped: true });
      }
    }
    init();
  }, [loadMembers, loadCouncils, loadSessions, loadPromptTemplates]);

  // Tauri event listener lifecycle — register once, clean up on unmount.
  // StrictMode mounts → cleans up → remounts before the async listen() calls
  // resolve, so track cancellation: listeners that resolve after cleanup are
  // unlistened immediately instead of leaking a duplicate set.
  useEffect(() => {
    let cancelled = false;
    let unlisteners: (() => void)[] = [];
    initStoreListeners().then((fns) => {
      if (cancelled) {
        fns.forEach((fn) => fn());
      } else {
        unlisteners = fns;
      }
    });
    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
      resetListenerGuard();
    };
  }, []);

  return (
    <TooltipProvider>
      <KeyboardProvider>
        {isBootstrapped ? (
          <AppShell>
            <Dashboard />
          </AppShell>
        ) : (
          <LoaderScreen />
        )}
        <Toaster />
      </KeyboardProvider>
    </TooltipProvider>
  );
}

export default App;

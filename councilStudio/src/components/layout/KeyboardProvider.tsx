import { useEffect, type ReactNode } from "react";
import { useAppStore } from "@/stores/appStore";
import { matchShortcut, type ShortcutAction } from "@/lib/shortcuts";

const TAB_IDS = ["overview", "responses", "consensus", "sources", "timeline"] as const;

/** True when focus is inside a text-editing element. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

/** Focus the current page's search input, falling back to the prompt textarea. */
function focusSearch(): void {
  const search = document.querySelector<HTMLInputElement>('input[placeholder^="Search"]');
  const promptBox = document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Ask your council"]');
  (search ?? promptBox)?.focus();
}

function dispatchAction(action: ShortcutAction): void {
  const s = useAppStore.getState();

  switch (action) {
    case "toggle-sidebar":
      s.toggleSidebar();
      break;
    case "toggle-right-panel":
      s.toggleRightPanel();
      break;
    case "open-settings":
      s.setSettingsOpen(true);
      break;
    case "open-search":
      focusSearch();
      break;
    case "new-council":
      s.setCurrentView("home");
      s.setPrompt("");
      // Wait for the home view to render before focusing
      setTimeout(() => {
        document.querySelector<HTMLTextAreaElement>('textarea[placeholder^="Ask your council"]')?.focus();
      }, 0);
      break;
    case "open-prompt-history":
      document.getElementById("prompt-history-button")?.click();
      break;
    case "run-council":
      // Clicks the real Run button so the compatibility pre-flight still runs
      document.getElementById("run-council-button")?.click();
      break;
    case "escape-close":
      if (s.settingsOpen) s.setSettingsOpen(false);
      else if (s.apiKeysOpen) s.setApiKeysOpen(false);
      else if (s.memberFormOpen) s.setMemberFormOpen(false);
      else if (s.importPreviewOpen) s.setImportPreviewOpen(false);
      else if (s.isRunning) s.cancelRun();
      else if (s.rightPanelOpen) s.toggleRightPanel();
      break;
    default: {
      if (action.startsWith("switch-tab-")) {
        const idx = Number(action.slice("switch-tab-".length)) - 1;
        const tab = TAB_IDS[idx];
        if (tab) s.setActiveTab(tab);
      }
    }
  }
}

/**
 * Registers the global keydown listener and dispatches to store actions
 * based on the user's shortcut map. Reads state via getState() so the
 * listener never needs to re-register.
 */
export function KeyboardProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const { shortcuts } = useAppStore.getState();
      const action = matchShortcut(e, shortcuts);
      if (!action) return;

      // Ignore shortcuts while typing — except Escape (dismiss) and the
      // run-council combo (Shift+Enter submits from the prompt textarea).
      if (isEditableTarget(e.target) && action !== "escape-close" && action !== "run-council") {
        return;
      }

      e.preventDefault();
      dispatchAction(action);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return <>{children}</>;
}

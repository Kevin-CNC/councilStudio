import { lazy, Suspense } from "react";
import { useAppStore, selectIsLoading, selectError, selectCurrentView } from "@/stores/appStore";
import { MemberList } from "@/components/council/MemberList";
import { MemberForm } from "@/components/council/MemberForm";
import { MembersPanel } from "@/components/council/MembersPanel";
import { SwapMemberDialog } from "@/components/council/SwapMemberDialog";
import { PromptEditor } from "@/components/prompt/PromptEditor";
import { SessionList } from "@/components/sessions/SessionList";
import { ResponsePanelDock } from "@/components/responses/ResponsePanelDock";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ApiKeysPanel } from "@/components/settings/ApiKeysPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const SessionsPage = lazy(() => import("@/pages/SessionsPage").then((m) => ({ default: m.SessionsPage })));
const PromptsPage = lazy(() => import("@/pages/PromptsPage").then((m) => ({ default: m.PromptsPage })));
const MembersPage = lazy(() => import("@/pages/MembersPage").then((m) => ({ default: m.MembersPage })));
const ImportPreviewSheet = lazy(() => import("@/components/council/ImportPreviewSheet").then((m) => ({ default: m.ImportPreviewSheet })));

function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const isLoading = useAppStore(selectIsLoading);
  const error = useAppStore(selectError);
  const currentView = useAppStore(selectCurrentView);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Loading council members…</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      {currentView === "sessions" ? (
        <Suspense fallback={<PageSkeleton />}>
          <SessionsPage />
        </Suspense>
      ) : currentView === "prompts" ? (
        <Suspense fallback={<PageSkeleton />}>
          <PromptsPage />
        </Suspense>
      ) : currentView === "members" ? (
        <Suspense fallback={<PageSkeleton />}>
          <MembersPage />
        </Suspense>
      ) : (
        <div id="dashboard-root" className="flex h-full flex-col">
          {/* Top section: 3-column layout */}
          <ScrollArea id="dashboard-scroll-area" className="flex-1">
            <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[280px_1fr_280px]">
              {/* Column 1: Council members */}
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="order-2 xl:order-1 min-h-0 overflow-hidden"
              >
                <MemberList />
              </motion.div>

              {/* Column 2: Prompt workspace */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15 }}
                className="order-1 xl:order-2"
              >
                <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                  <PromptEditor />
                </div>
              </motion.div>

              {/* Column 3: Sessions */}
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15 }}
                className="order-3"
              >
                <SessionList />
              </motion.div>
            </div>
          </ScrollArea>

          {/* Response panel (bottom section) — resizable + collapsible */}
          <ResponsePanelDock />
        </div>
      )}

      {/* Slide-over panels */}
      <MemberForm />
      <MembersPanel />
      <SwapMemberDialog />
      <SettingsPanel />
      <ApiKeysPanel />
      <Suspense fallback={null}>
        <ImportPreviewSheet />
      </Suspense>
    </>
  );
}

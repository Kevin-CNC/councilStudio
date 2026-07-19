import { useAppStore } from "@/stores/appStore";
import { MemberList } from "@/components/council/MemberList";
import { MemberForm } from "@/components/council/MemberForm";
import { PromptEditor } from "@/components/prompt/PromptEditor";
import { SessionList } from "@/components/sessions/SessionList";
import { ResponsePanelDock } from "@/components/responses/ResponsePanelDock";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import { ApiKeysPanel } from "@/components/settings/ApiKeysPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion } from "framer-motion";

export function Dashboard() {
  const isRunning = useAppStore((s) => s.isRunning);

  return (
    <>
      <div id="dashboard-root" className="flex h-full flex-col">
        {/* Top section: 3-column layout */}
        <ScrollArea id="dashboard-scroll-area" className="flex-1">
          <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[280px_1fr_280px]">
            {/* Column 1: Council members */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="order-2 xl:order-1"
            >
              <MemberList
                streamStates={
                  isRunning
                    ? Object.fromEntries(
                        useAppStore.getState().members.map((m) => [m.id, { isStreaming: m.enabled }])
                      )
                    : undefined
                }
              />
            </motion.div>

            {/* Column 2: Prompt workspace */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
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
              transition={{ duration: 0.3, delay: 0.1 }}
              className="order-3"
            >
              <SessionList />
            </motion.div>
          </div>
        </ScrollArea>

        {/* Response panel (bottom section) — resizable + collapsible */}
        <ResponsePanelDock />
      </div>

      {/* Slide-over panels */}
      <MemberForm />
      <SettingsPanel />
      <ApiKeysPanel />
    </>
  );
}

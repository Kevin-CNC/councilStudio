import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { PanelRightClose, PanelRight, Activity } from "lucide-react";
import { VarsIcon } from "@/components/icons/AppIcons";
import { VarsTab } from "./VarsTab";
import { MetricsTab } from "./MetricsTab";

export function RightPanel() {
  const { rightPanelOpen, toggleRightPanel } = useAppStore(
    useShallow((s) => ({
      rightPanelOpen: s.rightPanelOpen,
      toggleRightPanel: s.toggleRightPanel,
    }))
  );

  return (
    <>
      {!rightPanelOpen && (
        <button
          onClick={toggleRightPanel}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          title="Open utility panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
      )}

      <AnimatePresence initial={false}>
        {rightPanelOpen && (
          <motion.aside
            initial={{ x: "100%", width: 0 }}
            animate={{ x: 0, width: "18rem" }}
            exit={{ x: "100%", width: 0 }}
            transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            className="flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-card"
          >
            <div className="flex h-full w-full flex-col">
            {/* Header */}
            <div className="flex h-12 items-center justify-between border-b border-border px-3">
              <span className="text-sm font-semibold text-foreground">Utilities</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleRightPanel}
                className="h-7 w-7 text-muted-foreground"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="vars" className="flex-1 min-h-0 flex flex-col">
              <div className="border-b border-border px-2 py-2">
                <TabsList className="h-auto w-full flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger value="vars" className="gap-1.5 text-xs px-2 py-1">
                    <VarsIcon className="h-3 w-3" /> Vars
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="gap-1.5 text-xs px-2 py-1">
                    <Activity className="h-3 w-3" /> Metrics
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                  {([["vars", <VarsTab />], ["metrics", <MetricsTab />]] as const).map(
                    ([value, tab]) => (
                      <TabsContent key={value} value={value} className="m-0 px-3 py-2">
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.16, ease: "easeOut" }}
                        >
                          {tab}
                        </motion.div>
                      </TabsContent>
                    )
                  )}
              </ScrollArea>
            </Tabs>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

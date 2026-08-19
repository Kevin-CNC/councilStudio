import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { PanelRightClose, PanelRight, Variable, DollarSign, Activity } from "lucide-react";
import { VarsTab } from "./VarsTab";
import { CostsTab } from "./CostsTab";
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
            initial={{ x: 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 24, opacity: 0 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="flex h-full w-64 shrink-0 flex-col border-l border-border bg-card sm:w-72"
          >
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
            <Tabs defaultValue="vars" className="flex-1 flex flex-col">
              <div className="border-b border-border px-2 py-2">
                <TabsList className="h-auto w-full flex-wrap gap-1 bg-transparent p-0">
                  <TabsTrigger value="vars" className="gap-1.5 text-xs px-2 py-1">
                    <Variable className="h-3 w-3" /> Vars
                  </TabsTrigger>
                  <TabsTrigger value="costs" className="gap-1.5 text-xs px-2 py-1">
                    <DollarSign className="h-3 w-3" /> Costs
                  </TabsTrigger>
                  <TabsTrigger value="metrics" className="gap-1.5 text-xs px-2 py-1">
                    <Activity className="h-3 w-3" /> Metrics
                  </TabsTrigger>
                </TabsList>
              </div>

              <ScrollArea className="flex-1">
                  {([["vars", <VarsTab />], ["costs", <CostsTab />], ["metrics", <MetricsTab />]] as const).map(
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
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}

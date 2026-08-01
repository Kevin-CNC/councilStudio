import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import {
  PanelRightClose,
  PanelRight,
  ScrollText,
  Variable,
  DollarSign,
  Clock,
  Activity,
  Radio,
} from "lucide-react";

export function RightPanel() {
  const { rightPanelOpen, toggleRightPanel } = useAppStore(
    useShallow((s) => ({
      rightPanelOpen: s.rightPanelOpen,
      toggleRightPanel: s.toggleRightPanel,
    }))
  );

  if (!rightPanelOpen) {
    return (
      <button
        onClick={toggleRightPanel}
        className="hidden xl:flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        title="Open utility panel"
      >
        <PanelRight className="h-4 w-4" />
      </button>
    );
  }

  return (
    <aside className="hidden xl:flex h-full w-72 flex-col border-l border-border bg-card">
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
      <Tabs defaultValue="logs" className="flex-1 flex flex-col">
        <div className="border-b border-border px-2 py-2">
          <TabsList className="h-auto w-full flex-wrap gap-1 bg-transparent p-0">
            <TabsTrigger value="logs" className="gap-1.5 text-xs px-2 py-1">
              <ScrollText className="h-3 w-3" /> Logs
            </TabsTrigger>
            <TabsTrigger value="vars" className="gap-1.5 text-xs px-2 py-1">
              <Variable className="h-3 w-3" /> Vars
            </TabsTrigger>
            <TabsTrigger value="costs" className="gap-1.5 text-xs px-2 py-1">
              <DollarSign className="h-3 w-3" /> Costs
            </TabsTrigger>
            <TabsTrigger value="latency" className="gap-1.5 text-xs px-2 py-1">
              <Clock className="h-3 w-3" /> Latency
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-1.5 text-xs px-2 py-1">
              <Activity className="h-3 w-3" /> Metrics
            </TabsTrigger>
            <TabsTrigger value="events" className="gap-1.5 text-xs px-2 py-1">
              <Radio className="h-3 w-3" /> Events
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="logs" className="m-0 px-3 py-2">
            <ExecutionLogsTab />
          </TabsContent>
          <TabsContent value="vars" className="m-0 px-3 py-2">
            <VariablesTab />
          </TabsContent>
          <TabsContent value="costs" className="m-0 px-3 py-2">
            <CostsTab />
          </TabsContent>
          <TabsContent value="latency" className="m-0 px-3 py-2">
            <LatencyTab />
          </TabsContent>
          <TabsContent value="metrics" className="m-0 px-3 py-2">
            <MetricsTab />
          </TabsContent>
          <TabsContent value="events" className="m-0 px-3 py-2">
            <EventsTab />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </aside>
  );
}

/** Shared empty state — replaces the old hardcoded mock data. */
function EmptyTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-xs text-muted-foreground">
        Data will appear here during council runs
      </p>
    </div>
  );
}

function ExecutionLogsTab() {
  return <EmptyTab />;
}

function VariablesTab() {
  const { members, judgeModel, judgeProvider, isRunning } = useAppStore(
    useShallow((s) => ({
      members: s.members,
      judgeModel: s.judgeModel,
      judgeProvider: s.judgeProvider,
      isRunning: s.isRunning,
    }))
  );

  const enabled = members.filter((m) => m.enabled);
  const temps = enabled.map((m) => m.temperature);
  const tokens = enabled.map((m) => m.maxTokens);
  const range = (vals: number[]) =>
    vals.length === 0
      ? "—"
      : Math.min(...vals) === Math.max(...vals)
        ? String(vals[0])
        : `${Math.min(...vals)}–${Math.max(...vals)}`;

  const vars = [
    { key: "judge_model", value: judgeModel || "not configured" },
    { key: "judge_provider", value: judgeProvider },
    { key: "concurrency", value: String(enabled.length) },
    { key: "temperature", value: range(temps) },
    { key: "max_tokens", value: range(tokens) },
    { key: "run_status", value: isRunning ? "running" : "idle" },
  ];

  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground mb-2">Session Variables</div>
      {vars.map((v) => (
        <div key={v.key} className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5">
          <span className="font-mono text-muted-foreground">{v.key}</span>
          <span className="font-mono font-medium text-foreground">{v.value}</span>
        </div>
      ))}
    </div>
  );
}

function CostsTab() {
  return <EmptyTab />;
}

function LatencyTab() {
  return <EmptyTab />;
}

function MetricsTab() {
  return <EmptyTab />;
}

function EventsTab() {
  return <EmptyTab />;
}

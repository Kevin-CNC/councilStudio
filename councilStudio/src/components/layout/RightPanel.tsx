import { cn } from "@/lib/utils";
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
      rightPanelOpen: s.ui.rightPanelOpen,
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

function ExecutionLogsTab() {
  const logs = [
    { time: "14:32:01", level: "info", msg: "Dispatching prompt to 6 personas" },
    { time: "14:32:01", level: "info", msg: "Pragmatist (gpt-5.5) started streaming" },
    { time: "14:32:02", level: "info", msg: "Engineer (claude-opus-4) started streaming" },
    { time: "14:32:03", level: "info", msg: "Critic (mistral-large) completed" },
    { time: "14:32:04", level: "info", msg: "Researcher (gemini-2-pro) completed" },
    { time: "14:32:05", level: "info", msg: "Judge synthesis started" },
    { time: "14:32:07", level: "info", msg: "Run completed. Total tokens: 12,450" },
  ];

  return (
    <div className="space-y-1.5 font-mono text-[11px]">
      {logs.map((log, i) => (
        <div key={i} className="flex gap-2">
          <span className="text-muted-foreground">{log.time}</span>
          <span className={cn(
            "uppercase",
            log.level === "info" && "text-secondary",
            log.level === "error" && "text-destructive",
            log.level === "warn" && "text-yellow-600"
          )}>
            [{log.level}]
          </span>
          <span className="text-foreground">{log.msg}</span>
        </div>
      ))}
    </div>
  );
}

function VariablesTab() {
  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground mb-2">Session Variables</div>
      {[
        { key: "model_temperature", value: "0.7" },
        { key: "max_tokens", value: "4096" },
        { key: "concurrency", value: "6" },
        { key: "timeout_ms", value: "30000" },
        { key: "judge_model", value: "claude-sonnet-5" },
        { key: "retry_count", value: "2" },
      ].map((v) => (
        <div key={v.key} className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5">
          <span className="font-mono text-muted-foreground">{v.key}</span>
          <span className="font-mono font-medium text-foreground">{v.value}</span>
        </div>
      ))}
    </div>
  );
}

function CostsTab() {
  const costs = [
    { model: "GPT-5.5", tokens: "4.2k", cost: "$0.042" },
    { model: "Claude Opus", tokens: "6.8k", cost: "$0.185" },
    { model: "Gemini 2 Pro", tokens: "5.1k", cost: "$0.034" },
    { model: "Mistral Large", tokens: "3.9k", cost: "$0.028" },
    { model: "Llama 3.3", tokens: "4.5k", cost: "$0.004" },
    { model: "GPT-5.5 (Advocate)", tokens: "3.8k", cost: "$0.038" },
  ];

  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center justify-between px-1 pb-2 border-b border-border">
        <span className="text-muted-foreground">Total Cost</span>
        <span className="font-semibold text-foreground">$0.331</span>
      </div>
      {costs.map((c) => (
        <div key={c.model} className="flex items-center justify-between rounded-lg px-2 py-1.5">
          <span className="text-foreground">{c.model}</span>
          <div className="text-right">
            <div className="font-medium">{c.cost}</div>
            <div className="text-[10px] text-muted-foreground">{c.tokens} tokens</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LatencyTab() {
  const entries = [
    { name: "Pragmatist", time: "2.1s", status: "complete" },
    { name: "Engineer", time: "4.2s", status: "complete" },
    { name: "Researcher", time: "3.1s", status: "complete" },
    { name: "Critic", time: "1.8s", status: "complete" },
    { name: "Creative", time: "2.9s", status: "complete" },
    { name: "Devil's Advocate", time: "2.4s", status: "complete" },
    { name: "Judge", time: "4.2s", status: "complete" },
  ];

  return (
    <div className="space-y-2 text-xs">
      <div className="flex items-center justify-between px-1 pb-2 border-b border-border">
        <span className="text-muted-foreground">Avg Latency</span>
        <span className="font-semibold text-foreground">2.96s</span>
      </div>
      {entries.map((e) => (
        <div key={e.name} className="rounded-lg px-2 py-1.5">
          <div className="flex items-center justify-between">
            <span className="text-foreground">{e.name}</span>
            <span className="font-mono font-medium">{e.time}</span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-secondary transition-all"
              style={{ width: `${(parseFloat(e.time) / 5) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricsTab() {
  const metrics = [
    { label: "Total Tokens In", value: "12,450" },
    { label: "Total Tokens Out", value: "8,320" },
    { label: "Personas Dispatched", value: "6" },
    { label: "Personas Completed", value: "6" },
    { label: "Personas Failed", value: "0" },
    { label: "Avg Tokens/Persona", value: "3,462" },
    { label: "Total Cost", value: "$0.331" },
    { label: "Run Duration", value: "6.2s" },
    { label: "Confidence Score", value: "62%" },
  ];

  return (
    <div className="space-y-1.5 text-xs">
      {metrics.map((m) => (
        <div key={m.label} className="flex items-center justify-between rounded-lg px-2.5 py-1.5">
          <span className="text-muted-foreground">{m.label}</span>
          <span className="font-mono font-medium text-foreground">{m.value}</span>
        </div>
      ))}
    </div>
  );
}

function EventsTab() {
  const events = [
    { time: "0ms", event: "Run initiated", type: "start" },
    { time: "12ms", event: "Pragmatist dispatched", type: "dispatch" },
    { time: "24ms", event: "Engineer dispatched", type: "dispatch" },
    { time: "36ms", event: "Researcher dispatched", type: "dispatch" },
    { time: "48ms", event: "Critic dispatched", type: "dispatch" },
    { time: "61ms", event: "Creative dispatched", type: "dispatch" },
    { time: "73ms", event: "Devil's Advocate dispatched", type: "dispatch" },
    { time: "1,824ms", event: "Critic completed", type: "complete" },
    { time: "2,142ms", event: "Pragmatist completed", type: "complete" },
    { time: "3,128ms", event: "Researcher completed", type: "complete" },
    { time: "4,156ms", event: "Engineer completed", type: "complete" },
    { time: "4,200ms", event: "Judge synthesis started", type: "judge" },
    { time: "6,200ms", event: "Run completed", type: "end" },
  ];

  return (
    <div className="space-y-3 text-xs">
      {events.map((e, i) => (
        <div key={i} className="flex gap-3">
          <span className="w-16 shrink-0 font-mono text-muted-foreground">{e.time}</span>
          <div className="relative flex-1 pl-3">
            <div className={cn(
              "absolute left-0 top-1.5 h-2 w-2 rounded-full",
              e.type === "start" && "bg-primary",
              e.type === "dispatch" && "bg-secondary",
              e.type === "complete" && "bg-green-500",
              e.type === "judge" && "bg-yellow-500",
              e.type === "end" && "bg-primary"
            )} />
            <span className="text-foreground">{e.event}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

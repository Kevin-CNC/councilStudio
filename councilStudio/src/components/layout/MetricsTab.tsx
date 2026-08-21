import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/stores/appStore";
import { computeMetrics, computeSessionCosts } from "@/lib/metrics";
import { formatTokens, formatDuration, formatCost } from "@/lib/utils";
import type { CouncilRun } from "@/types";

export function MetricsTab() {
  const activeRun = useAppStore(useShallow((s) => s.activeRun));

  const run: CouncilRun | undefined = activeRun
    ? { ...activeRun, personaResults: Object.values(activeRun.personaResults) }
    : undefined;

  if (!run || run.personaResults.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-xs text-muted-foreground">Run a council to see aggregate metrics and costs.</p>
      </div>
    );
  }

  const metrics = computeMetrics(run);
  const costs = computeSessionCosts(run);

  const tiles = [
    { label: "Total Cost", value: metrics.totalCost > 0 ? formatCost(metrics.totalCost) : "—" },
    { label: "Cost / Token", value: metrics.costPerToken > 0 ? formatCost(metrics.costPerToken) : "—" },
    { label: "Total Tokens", value: formatTokens(metrics.totalTokens) },
    { label: "Avg Latency", value: formatDuration(Math.round(metrics.avgLatencyMs)) },
    { label: "Throughput", value: `${formatTokens(Math.round(metrics.tokensPerMin))}/min` },
  ];

  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground mb-2">Aggregate Metrics & Costs</div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-muted/50 px-2.5 py-2">
            <div className="text-muted-foreground">{t.label}</div>
            <div className="font-mono text-sm font-semibold text-foreground">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="text-muted-foreground mb-2">Per-Member Costs</div>
      {costs.members.map((m) => (
        <div key={m.memberId} className="rounded-lg bg-muted/50 px-2.5 py-2 space-y-1 mb-2">
          <div className="font-medium text-foreground">{m.member}</div>
          <div className="grid grid-cols-2 gap-1 text-muted-foreground">
            <span>in tokens</span>
            <span className="text-right font-mono text-foreground">{formatTokens(m.inputTokens)}</span>
            <span>out tokens</span>
            <span className="text-right font-mono text-foreground">{formatTokens(m.outputTokens)}</span>
            <span>input cost</span>
            <span className="text-right font-mono text-foreground">{m.inputCost > 0 ? formatCost(m.inputCost) : "—"}</span>
            <span>output cost</span>
            <span className="text-right font-mono text-foreground">{m.outputCost > 0 ? formatCost(m.outputCost) : "—"}</span>
            <span>inference cost</span>
            <span className="text-right font-mono">{m.cost > 0 ? formatCost(m.cost) : "—"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/stores/appStore";
import { computeMetrics } from "@/lib/metrics";
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
        <p className="text-xs text-muted-foreground">Run a council to see aggregate metrics.</p>
      </div>
    );
  }

  const metrics = computeMetrics(run);

  const tiles = [
    { label: "Cost / Token", value: metrics.costPerToken > 0 ? formatCost(metrics.costPerToken) : "—" },
    { label: "Avg Latency", value: formatDuration(Math.round(metrics.avgLatencyMs)) },
    { label: "Throughput", value: `${formatTokens(Math.round(metrics.tokensPerMin))}/min` },
    { label: "Total Tokens", value: formatTokens(metrics.totalTokens) },
  ];

  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground mb-2">Aggregate Metrics</div>
      <div className="grid grid-cols-2 gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-muted/50 px-2.5 py-2">
            <div className="text-muted-foreground">{t.label}</div>
            <div className="font-mono text-sm font-semibold text-foreground">{t.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

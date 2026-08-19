import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/stores/appStore";
import { computeSessionCosts } from "@/lib/metrics";
import { formatTokens, formatCost } from "@/lib/utils";
import type { CouncilRun } from "@/types";

export function CostsTab() {
  const activeRun = useAppStore(useShallow((s) => s.activeRun));

  const run: CouncilRun | undefined = activeRun
    ? { ...activeRun, personaResults: Object.values(activeRun.personaResults) }
    : undefined;

  const costs = computeSessionCosts(run);

  if (costs.members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-xs text-muted-foreground">Run a council to see per-member costs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="text-muted-foreground mb-2">Per-Member Costs</div>
      {costs.members.map((m) => (
        <div key={m.memberId} className="rounded-lg bg-muted/50 px-2.5 py-2 space-y-1">
          <div className="font-medium text-foreground">{m.member}</div>
          <div className="grid grid-cols-2 gap-1 text-muted-foreground">
            <span>in tokens</span>
            <span className="text-right font-mono text-foreground">{formatTokens(m.inputTokens)}</span>
            <span>out tokens</span>
            <span className="text-right font-mono text-foreground">{formatTokens(m.outputTokens)}</span>
            <span>in $/token</span>
            <span className="text-right font-mono">{m.inputCostPerToken > 0 ? formatCost(m.inputCostPerToken) : "—"}</span>
            <span>out $/token</span>
            <span className="text-right font-mono">{m.outputCostPerToken > 0 ? formatCost(m.outputCostPerToken) : "—"}</span>
            <span>inference cost</span>
            <span className="text-right font-mono">—</span>
          </div>
        </div>
      ))}
    </div>
  );
}

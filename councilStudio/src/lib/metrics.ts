import type { CouncilRun, SessionCosts, MemberUtilityCost } from "@/types";

function throughputPerMin(tokens: number, latencyMs: number): number {
  if (latencyMs <= 0) return 0;
  return tokens / (latencyMs / 60000);
}

export function computeSessionCosts(run: CouncilRun | undefined): SessionCosts {
  const empty: SessionCosts = {
    ovrlAverageInputCost: 0,
    ovrlAverageOutputCost: 0,
    ovrlOutputTokens: 0,
    ovrlTokenThroughputPerMin: 0,
    members: [],
  };
  if (!run) return empty;

  const members: MemberUtilityCost[] = run.personaResults.map((p) => ({
    memberId: p.personaId.slice(0, 16),
    member: p.personaName,
    tokenThroughputPerMin: throughputPerMin(p.tokensIn + p.tokensOut, p.latencyMs),
    inputCostPerToken: 0,
    outputCostPerToken: 0,
    inputTokens: p.tokensIn,
    outputTokens: p.tokensOut,
  }));

  const ovrlOutputTokens = members.reduce((sum, m) => sum + m.outputTokens, 0);
  const totalTokens = members.reduce((sum, m) => sum + m.inputTokens + m.outputTokens, 0);
  const durationMs = run.completedAt ? run.completedAt - run.startedAt : 0;

  return {
    ovrlAverageInputCost: 0,
    ovrlAverageOutputCost: 0,
    ovrlOutputTokens,
    ovrlTokenThroughputPerMin: throughputPerMin(totalTokens, durationMs),
    members,
  };
}

export interface RunMetrics {
  costPerToken: number;
  avgLatencyMs: number;
  tokensPerMin: number;
  totalTokens: number;
  totalCost: number;
}

export function computeMetrics(run: CouncilRun | undefined): RunMetrics {
  const empty: RunMetrics = { costPerToken: 0, avgLatencyMs: 0, tokensPerMin: 0, totalTokens: 0, totalCost: 0 };
  if (!run || run.personaResults.length === 0) return empty;

  const results = run.personaResults;
  const totalTokens = results.reduce((sum, p) => sum + p.tokensIn + p.tokensOut, 0);
  const totalCost = results.reduce((sum, p) => sum + p.cost, 0) + (run.judgeResult ? 0 : 0);
  const avgLatencyMs = results.reduce((sum, p) => sum + p.latencyMs, 0) / results.length;
  const durationMs = run.completedAt ? run.completedAt - run.startedAt : 0;

  return {
    costPerToken: totalTokens > 0 ? totalCost / totalTokens : 0,
    avgLatencyMs,
    tokensPerMin: throughputPerMin(totalTokens, durationMs),
    totalTokens,
    totalCost,
  };
}

import { Badge } from "@/components/ui/badge";
import type { JudgeResult, Persona, PersonaResult } from "@/types";

const TICK_STEPS_S = [1, 2, 5, 10, 30, 60, 300, 600, 3600];
const LABEL_W = "7rem";
const DUR_W = "3.5rem";

interface Lane {
  id: string;
  name: string;
  color: string;
  startedAt: number;
  completedAt?: number;
  failed: boolean;
}

/**
 * Telemetry graph: per-member lanes rendered relative to the run's start, a
 * Judge lane appended when judge timestamps exist, and a relative-second
 * x-axis. Failed members with no completion show a short red marker plus a
 * "failed" badge; a judge lane without `completedAt` during a live run
 * extends to the run's end. Plain divs/SVG-text — no chart library.
 */
export function TimelineGantt({
  results,
  judgeResult,
  runStartedAt,
  runCompletedAt,
  members,
}: {
  results: PersonaResult[];
  judgeResult?: JudgeResult;
  runStartedAt: number;
  runCompletedAt?: number;
  members: Persona[];
}) {
  const origin = runStartedAt;

  // One lane per member, sorted by start time.
  const memberLanes: Lane[] = results.map((r) => ({
    id: r.personaId,
    name: r.personaName,
    color: members.find((m) => m.id === r.personaId)?.color || "#9ca3af",
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    failed: r.status === "failed",
  }));
  memberLanes.sort((a, b) => a.startedAt - b.startedAt);
  const lanes: Lane[] = [...memberLanes];
  if (judgeResult?.startedAt) {
    lanes.push({
      id: "judge",
      name: "Judge",
      color: "#8b5cf6",
      startedAt: judgeResult.startedAt,
      completedAt: judgeResult.completedAt,
      failed: false,
    });
  }

  // Wall-clock end: the latest completion seen, else origin (clamped below).
  const end = Math.max(
    origin,
    runCompletedAt ?? 0,
    ...lanes.map((l) => l.completedAt ?? 0)
  );
  const spanMs = Math.max(1, end - origin); // clamp so instant runs never divide by zero
  const spanSec = spanMs / 1000;
  const stepSec = TICK_STEPS_S.find((s) => spanSec / s <= 8) ?? 3600;
  const tickCount = Math.max(1, Math.floor(spanSec / stepSec));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * stepSec);

  const pct = (ms: number) => `${(ms / spanMs) * 100}%`;

  return (
    <div className="space-y-3">
      {lanes.map((lane) => {
        const relStart = lane.startedAt - origin;
        // Failed with no completion → marker; still-running (usually the
        // judge live) extends to the run end.
        const relEnd = lane.completedAt
          ? lane.completedAt - origin
          : lane.failed
            ? undefined
            : end - origin;
        return (
          <div key={lane.id} className="flex items-center gap-2">
            <span
              className="truncate text-xs font-medium text-foreground"
              style={{ width: LABEL_W }}
            >
              {lane.name}
            </span>
            <div className="relative h-5 flex-1 overflow-hidden">
              {relEnd === undefined ? (
                <div
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-red-500"
                  style={{ left: pct(relStart) }}
                />
              ) : (
                <div
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full"
                  style={{
                    left: pct(relStart),
                    width: pct(Math.max(relEnd - relStart, spanMs * 0.003)),
                    backgroundColor: lane.color,
                  }}
                />
              )}
              {lane.failed && (
                <Badge
                  variant="outline"
                  className="absolute top-0 right-0 h-5 border-red-200 bg-red-50 text-[9px] text-red-700"
                >
                  failed
                </Badge>
              )}
            </div>
            <span
              className="text-right text-[10px] font-mono text-muted-foreground"
              style={{ width: DUR_W }}
            >
              {relEnd !== undefined
                ? `${((relEnd - relStart) / 1000).toFixed(1)}s`
                : "—"}
            </span>
          </div>
        );
      })}
      {/* X-axis — relative seconds from run start */}
      <div className="flex items-center gap-2">
        <span style={{ width: LABEL_W }} />
        <div className="relative h-4 flex-1">
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute -translate-x-1/2 text-[10px] font-mono text-muted-foreground"
              style={{ left: pct(t * 1000) }}
            >
              {t}s
            </span>
          ))}
        </div>
        <span style={{ width: DUR_W }} />
      </div>
    </div>
  );
}

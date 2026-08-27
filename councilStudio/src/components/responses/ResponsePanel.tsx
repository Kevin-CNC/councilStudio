import { lazy, Suspense, useMemo, useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponseCard } from "./ResponseCard";
import { RawResponseDialog } from "./RawResponseDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { motion, AnimatePresence } from "framer-motion";

const DiagramBlock = lazy(() => import("./DiagramBlock"));
const DataTableBlock = lazy(() => import("./DataTableBlock"));
import {
  LayoutGrid,
  GitMerge,
  GitCompare,
  Link2,
  Clock,
  BarChart3,
  MessageSquare,
  Gavel,
  Loader2,
  Braces,
} from "lucide-react";

export function ResponsePanel() {
  const { activeRun, activeTab, setActiveTab, isRunning, judgeStatus, personaStatuses, members } =
    useAppStore(
      useShallow((s) => ({
        activeRun: s.activeRun,
        activeTab: s.activeTab,
        setActiveTab: s.setActiveTab,
        isRunning: s.isRunning,
        judgeStatus: s.judgeStatus,
        personaStatuses: s.personaStatuses,
        members: s.members,
      }))
    );

  // Hooks must run unconditionally — derive empty values when no run is active.
  const judgeResult = activeRun?.judgeResult;
  const results = useMemo(
    () => (activeRun ? Object.values(activeRun.personaResults) : []),
    [activeRun]
  );

  if (!activeRun) {
    return (
      <div id="response-panel-empty-state" className="flex h-full flex-col items-center justify-center text-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted mx-auto">
            <MessageSquare className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="mb-1 text-lg font-semibold text-foreground">No responses yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Write a prompt and run your council to see responses here.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div id="response-panel-content" className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="border-b border-border px-4 py-2">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="h-auto bg-transparent p-0 gap-1">
            <TabsTrigger value="overview" className="gap-1.5 text-xs px-3 py-1.5">
              <LayoutGrid className="h-3.5 w-3.5" /> Overview
            </TabsTrigger>
            <TabsTrigger value="responses" className="gap-1.5 text-xs px-3 py-1.5">
              <MessageSquare className="h-3.5 w-3.5" /> All Responses
            </TabsTrigger>
            <TabsTrigger value="consensus" className="gap-1.5 text-xs px-3 py-1.5">
              <GitMerge className="h-3.5 w-3.5" /> Consensus
            </TabsTrigger>
            <TabsTrigger value="differences" className="gap-1.5 text-xs px-3 py-1.5">
              <GitCompare className="h-3.5 w-3.5" /> Differences
            </TabsTrigger>
            <TabsTrigger value="sources" className="gap-1.5 text-xs px-3 py-1.5">
              <Link2 className="h-3.5 w-3.5" /> Sources
            </TabsTrigger>
            <TabsTrigger value="timeline" className="gap-1.5 text-xs px-3 py-1.5">
              <Clock className="h-3.5 w-3.5" /> Timeline
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Tab content */}
      <ScrollArea className="flex-1">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.2 }}
            className="p-4"
          >
            {activeTab === "overview" && (
              <OverviewTab
                results={results}
                judgeResult={judgeResult}
                isRunning={isRunning}
                judgeStatus={judgeStatus}
              />
            )}
            {activeTab === "responses" && (
              <ResponsesTab
                results={results}
                members={members}
                personaStatuses={personaStatuses}
              />
            )}
            {activeTab === "consensus" && (
              <ConsensusTab judgeResult={judgeResult} judgeStatus={judgeStatus} />
            )}
            {activeTab === "differences" && (
              <DifferencesTab judgeResult={judgeResult} judgeStatus={judgeStatus} />
            )}
            {activeTab === "sources" && (
              <SourcesTab results={results} judgeResult={judgeResult} members={members} />
            )}
            {activeTab === "timeline" && <TimelineTab results={results} />}
          </motion.div>
        </AnimatePresence>
      </ScrollArea>
    </div>
  );
}

// Shown while the run is in progress and no judge verdict exists yet.
function JudgePendingCard({ isRunning, judgeStatus }: any) {
  const judging = judgeStatus === "thinking";
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-3">
          {judging ? (
            <Gavel className="h-5 w-5 text-primary" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          )}
          <div>
            <p className="text-sm font-medium text-foreground">
              {judging
                ? "Judge is synthesizing…"
                : isRunning
                  ? "Council members are working…"
                  : "No judge result"}
            </p>
            <p className="text-xs text-muted-foreground">
              {judging
                ? "Consensus, disagreements and recommendations will appear here."
                : "The judge runs after all members finish."}
            </p>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      </CardContent>
    </Card>
  );
}

// Overview Tab
function OverviewTab({ results, judgeResult, isRunning, judgeStatus }: any) {
  const [rawOpen, setRawOpen] = useState(false);

  if (!judgeResult) {
    return <JudgePendingCard isRunning={isRunning} judgeStatus={judgeStatus} />;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-secondary" />
            Council Summary
            {judgeResult.rawResponse && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground ml-auto"
                title="View raw judge response"
                onClick={() => setRawOpen(true)}
              >
                <Braces className="h-3.5 w-3.5" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MarkdownRenderer
            content={judgeResult.summary}
            citations={judgeResult.citations ?? []}
            tables={judgeResult.tables ?? []}
          />
        </CardContent>
      </Card>

      {/* Missing personas */}
      {judgeResult.missingPersonas && judgeResult.missingPersonas.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/60 dark:bg-yellow-950/20">
          <CardContent className="p-4 text-sm text-foreground">
            <span className="font-medium">Missing personas: </span>
            {judgeResult.missingPersonas.join(", ")}
          </CardContent>
        </Card>
      )}

      {/* Judge synthesis (markdown, may include diagrams/citations) */}
      {judgeResult.synthesis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gavel className="h-4 w-4 text-primary" />
              Judge Synthesis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MarkdownRenderer
              content={judgeResult.synthesis}
              citations={judgeResult.citations ?? []}
              tables={judgeResult.tables ?? []}
            />
          </CardContent>
        </Card>
      )}

      {/* Judge tables (from the JSON `tables` array — no inline placement) */}
      {judgeResult.tables && judgeResult.tables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tables</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {judgeResult.tables.map((t: any, i: number) => (
              <Suspense
                key={t.id ?? i}
                fallback={
                  <div className="text-xs text-muted-foreground">Rendering table…</div>
                }
              >
                <DataTableBlock table={t} />
              </Suspense>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Judge diagrams */}
      {judgeResult.diagrams && judgeResult.diagrams.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Diagrams</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {judgeResult.diagrams.map((d: any, i: number) => (
              <Suspense
                key={d.id ?? i}
                fallback={
                  <div className="text-xs text-muted-foreground">Rendering diagram…</div>
                }
              >
                <DiagramBlock code={d.code} caption={d.caption} />
              </Suspense>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Confidence score */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Confidence" value={`${judgeResult.confidenceScore}%`} />
        <StatCard label="Personas" value={results.length.toString()} />
        <StatCard label="Consensus Points" value={judgeResult.consensus.length.toString()} />
        <StatCard label="Disagreements" value={judgeResult.disagreements.length.toString()} />
      </div>

      {/* Key recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Key Recommendations</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2">
            {judgeResult.recommendations.map((rec: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="text-foreground">{rec}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      {/* Voting breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Response Times</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {results.map((r: any) => (
              <div key={r.personaId} className="flex items-center gap-3">
                <span className="w-24 text-xs text-foreground truncate">{r.personaName}</span>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-secondary"
                    style={{ width: `${Math.min(100, (r.latencyMs / 5000) * 100)}%` }}
                  />
                </div>
                <span className="w-12 text-right text-xs font-mono text-muted-foreground">
                  {(r.latencyMs / 1000).toFixed(1)}s
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <RawResponseDialog
        open={rawOpen}
        onOpenChange={setRawOpen}
        title="Raw response — Judge"
        rawResponse={judgeResult.rawResponse || ""}
      />
    </div>
  );
}

// All Responses Tab — completed results plus skeleton cards for members
// still queued or thinking.
function ResponsesTab({ results, members, personaStatuses }: any) {
  const resultIds = new Set(results.map((r: any) => r.personaId));
  const pending = members.filter(
    (m: any) =>
      !resultIds.has(m.id) &&
      (personaStatuses[m.id] === "waiting" || personaStatuses[m.id] === "thinking")
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {results.map((r: any) => (
        <ResponseCard key={r.personaId} result={r} color={r.provider === "anthropic" ? "#17B890" : "#228CDB"} />
      ))}
      {pending.map((m: any) => (
        <Card key={m.id} className="overflow-hidden">
          <CardHeader className="border-b border-border px-4 py-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{m.name}</span>
                  <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {personaStatuses[m.id] === "waiting" ? "Queued" : "Thinking…"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">{m.model}</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Consensus Tab
function ConsensusTab({ judgeResult, judgeStatus }: any) {
  if (!judgeResult) {
    return <JudgePendingCard isRunning judgeStatus={judgeStatus} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-primary" />
            Areas of Agreement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {judgeResult.consensus.map((point: string, i: number) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
                  {i + 1}
                </span>
                <span className="text-foreground">{point}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confidence Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="relative h-20 w-20">
              <svg className="h-full w-full -rotate-90">
                <circle cx="40" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted" />
                <circle
                  cx="40"
                  cy="40"
                  r="32"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeDasharray={`${(judgeResult.confidenceScore / 100) * 201} 201`}
                  className="text-primary"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-bold text-foreground">{judgeResult.confidenceScore}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex-1">
              Consensus confidence based on agreement across all council members.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Differences Tab
function DifferencesTab({ judgeResult, judgeStatus }: any) {
  if (!judgeResult) {
    return <JudgePendingCard isRunning judgeStatus={judgeStatus} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-secondary" />
            Points of Disagreement
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {judgeResult.disagreements.map((point: string, i: number) => (
              <div key={i} className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-sm text-foreground">{point}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Minority Views</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {judgeResult.minorityViews.map((view: string, i: number) => (
              <div key={i} className="flex gap-2 text-sm">
                <Badge variant="outline" className="h-5 text-[10px] shrink-0 bg-yellow-50 text-yellow-700 border-yellow-200">
                  Minority
                </Badge>
                <span className="text-foreground">{view}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Sources Tab — member + judge citations, with clickable URLs and persona names.
function SourcesTab({ results, judgeResult, members }: any) {
  const nameFor = (personaId: string) =>
    personaId === "judge"
      ? "Judge"
      : (members.find((m: any) => m.id === personaId)?.name ?? personaId);

  const allCitations = [
    ...results.flatMap((r: any) => r.citations || []),
    ...(judgeResult?.citations || []),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-secondary" />
            Cited Sources ({allCitations.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allCitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">No citations in this run.</p>
          ) : (
            <div className="space-y-2">
              {allCitations.map((c: any, i: number) => (
                <div
                  key={`${c.personaId}-${c.id}-${i}`}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    {c.url ? (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {c.source}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-foreground">{c.source}</span>
                    )}
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {nameFor(c.personaId)}
                    </Badge>
                  </div>
                  {c.excerpt && (
                    <p className="text-xs text-muted-foreground italic">{c.excerpt}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Timeline Tab
function TimelineTab({ results }: any) {
  const sorted = [...results].sort((a, b) => a.startedAt - b.startedAt);

  return (
    <div className="space-y-1">
      {sorted.map((r) => (
        <motion.div
          key={r.personaId}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.15 }}
          className="flex gap-3 pb-4"
        >
          <div className="flex flex-col items-center">
            <div className="h-3 w-3 rounded-full bg-primary" />
            <div className="flex-1 w-px bg-border mt-1" />
          </div>
          <div className="flex-1 -mt-0.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-foreground">{r.personaName}</span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {(r.latencyMs / 1000).toFixed(1)}s
              </span>
            </div>
            <Badge
              variant="outline"
              className={cn(
                "text-[10px]",
                r.status === "completed" ? "bg-green-50 text-green-700 border-green-200" :
                r.status === "failed" ? "bg-red-50 text-red-700 border-red-200" :
                "bg-blue-50 text-blue-700 border-blue-200"
              )}
            >
              {r.status}
            </Badge>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

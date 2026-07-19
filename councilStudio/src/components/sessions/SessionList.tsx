import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  Pin,
  Clock,
  Users,
  DollarSign,
  History,
  SlidersHorizontal,
} from "lucide-react";
import { formatTokens, formatCost } from "@/lib/utils";
import type { Session, RunStatus } from "@/types";

const STATUS_STYLES: Record<RunStatus, string> = {
  queued: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700",
  streaming: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-muted text-muted-foreground",
};

export function SessionList() {
  const { sessions, setSelectedSession, pinSession } = useAppStore(
    useShallow((s) => ({
      sessions: s.sessions,
      setSelectedSession: s.setSelectedSession,
      pinSession: s.pinSession,
    }))
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let result = [...sessions];

    // Search filter
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (filter !== "all") {
      if (filter === "pinned") {
        result = result.filter((s) => s.pinned);
      } else {
        result = result.filter((s) => s.status === filter);
      }
    }

    // Sort: pinned first, then by date
    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    return result;
  }, [sessions, search, filter]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Sessions</h2>
          <span className="text-[11px] text-muted-foreground">{sessions.length}</span>
        </div>
      </div>

      {/* Search + filter */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            className="pl-8 h-8 text-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-8 w-28 text-xs">
            <SlidersHorizontal className="h-3 w-3 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pinned">Pinned</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Session list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1.5 pr-2">
          {filtered.length === 0 ? (
            <EmptyState />
          ) : (
            <AnimatePresence>
              {filtered.map((session, i) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  index={i}
                  onSelect={() => setSelectedSession(session.id)}
                  onPin={() => pinSession(session.id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SessionCard({
  session,
  index,
  onSelect,
  onPin,
}: {
  session: Session;
  index: number;
  onSelect: () => void;
  onPin: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, delay: index * 0.03 }}
      layout
    >
      <Card
        className="cursor-pointer transition-all hover:shadow-md hover:border-secondary/30 group"
        onClick={onSelect}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-foreground line-clamp-1">
                  {session.title}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPin();
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pin
                    className={cn(
                      "h-3 w-3",
                      session.pinned ? "fill-yellow-400 text-yellow-400 opacity-100" : "text-muted-foreground"
                    )}
                  />
                </button>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {new Date(session.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>

              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{session.personaCount}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="text-foreground font-medium">
                    {formatTokens(session.tokensUsed)}
                  </span>
                </span>
                <span className="flex items-center gap-0.5">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">
                    {formatCost(session.totalCost)}
                  </span>
                </span>
              </div>
            </div>

            <Badge variant="outline" className={cn("shrink-0 text-[10px]", STATUS_STYLES[session.status])}>
              {session.status}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <History className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">No sessions yet</p>
      <p className="text-xs text-muted-foreground">
        Run your first council to get started
      </p>
    </motion.div>
  );
}

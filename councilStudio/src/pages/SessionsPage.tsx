import { useState, useMemo } from "react";
import { cn, formatTokens, formatCost, formatDuration } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Timer,
  History,
  Trash2,
} from "lucide-react";
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

export function SessionsPage() {
  const { sessions, restoreSession, togglePinSession, removeSession, setCurrentView } = useAppStore(
    useShallow((s) => ({
      sessions: s.sessions,
      restoreSession: s.restoreSession,
      togglePinSession: s.togglePinSession,
      removeSession: s.removeSession,
      setCurrentView: s.setCurrentView,
    }))
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = [...sessions];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q)
      );
    }

    if (filter !== "all") {
      result = filter === "pinned" ? result.filter((s) => s.pinned) : result.filter((s) => s.status === filter);
    }

    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    return result;
  }, [sessions, search, filter]);

  const openSession = (id: string) => {
    restoreSession(id);
    setCurrentView("home");
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Sessions</h1>
          <p className="text-sm text-muted-foreground">
            {sessions.length} council run{sessions.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-36">
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

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <EmptyState hasSessions={sessions.length > 0} />
        ) : (
          <div className="grid grid-cols-1 gap-3 pr-2 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {filtered.map((session, i) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  index={i}
                  onOpen={() => openSession(session.id)}
                  onPin={() => togglePinSession(session.id)}
                  onDelete={() => setPendingDeleteId(session.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete session?</DialogTitle>
            <DialogDescription>
              This permanently removes the session and its run history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) removeSession(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionCard({
  session,
  index,
  onOpen,
  onPin,
  onDelete,
}: {
  session: Session;
  index: number;
  onOpen: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      layout
    >
      <Card
        className="cursor-pointer transition-all hover:shadow-md hover:border-secondary/30 group"
        onClick={onOpen}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <span className="text-sm font-medium text-foreground line-clamp-2">
              {session.title}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onPin();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pin
                  className={cn(
                    "h-3.5 w-3.5",
                    session.pinned ? "fill-yellow-400 text-yellow-400 opacity-100" : "text-muted-foreground"
                  )}
                />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
              </button>
            </div>
          </div>

          <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {new Date(session.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-0.5">
                <Users className="h-3 w-3 text-muted-foreground" />
                <span className="text-foreground font-medium">{session.personaCount}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <span className="text-muted-foreground">Tok:</span>
                <span className="text-foreground font-medium">{formatTokens(session.tokensUsed)}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span className="text-foreground font-medium">{formatCost(session.totalCost)}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <Timer className="h-3 w-3 text-muted-foreground" />
                <span className="text-foreground font-medium">{formatDuration(session.durationMs)}</span>
              </span>
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

function EmptyState({ hasSessions }: { hasSessions: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <History className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">
        {hasSessions ? "No matching sessions" : "No sessions yet"}
      </p>
      <p className="text-xs text-muted-foreground">
        {hasSessions ? "Try a different search or filter" : "Run your first council to get started"}
      </p>
    </motion.div>
  );
}

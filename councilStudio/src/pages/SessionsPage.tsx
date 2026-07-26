import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Search, History } from "lucide-react";
import { SessionCard } from "@/components/sessions/SessionCard";

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

  const openSession = useCallback(
    (id: string) => {
      restoreSession(id);
      setCurrentView("home");
    },
    [restoreSession, setCurrentView]
  );

  const handleDelete = useCallback(() => {
    if (pendingDeleteId) removeSession(pendingDeleteId);
    setPendingDeleteId(null);
  }, [pendingDeleteId, removeSession]);

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
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <EmptyState hasSessions={sessions.length > 0} />
        ) : (
          <div className="grid grid-cols-1 gap-3 pr-2 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {filtered.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  variant="full"
                  onSelect={() => openSession(session.id)}
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
              onClick={handleDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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

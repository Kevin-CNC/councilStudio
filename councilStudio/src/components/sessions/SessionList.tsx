import { useState, useMemo, useCallback } from "react";
import { Input } from "@/components/ui/input";
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
  History,
  SlidersHorizontal,
} from "lucide-react";
import { SessionCard } from "./SessionCard";

export function SessionList() {
  const { sessions, setSelectedSession, togglePinSession } = useAppStore(
    useShallow((s) => ({
      sessions: s.sessions,
      setSelectedSession: s.setSelectedSession,
      togglePinSession: s.togglePinSession,
    }))
  );
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const filtered = useMemo(() => {
    let result = [...sessions];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) => s.title.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q)
      );
    }

    if (filter !== "all") {
      if (filter === "pinned") {
        result = result.filter((s) => s.pinned);
      } else {
        result = result.filter((s) => s.status === filter);
      }
    }

    result.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.createdAt - a.createdAt;
    });

    return result;
  }, [sessions, search, filter]);

  const handleSelect = useCallback(
    (id: string) => setSelectedSession(id),
    [setSelectedSession]
  );
  const handlePin = useCallback(
    (id: string) => togglePinSession(id),
    [togglePinSession]
  );

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
            <SelectItem value="terminated">Terminated</SelectItem>
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
              {filtered.map((session) => (
                <SessionCard
                  key={session.id}
                  session={session}
                  onSelect={() => handleSelect(session.id)}
                  onPin={() => handlePin(session.id)}
                />
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
    </div>
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

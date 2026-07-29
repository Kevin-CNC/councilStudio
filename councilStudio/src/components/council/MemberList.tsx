import { useState, useMemo, useCallback } from "react";
import { useAppStore, selectMembers, selectPersonaStatuses } from "@/stores/appStore";
import { MemberCard } from "./MemberCard";
import { AddMemberPopover } from "./AddMemberPopover";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users } from "lucide-react";

export function MemberList() {
  const members = useAppStore(selectMembers);
  const personaStatuses = useAppStore(selectPersonaStatuses);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const enabledCount = members.filter((m) => m.enabled).length;

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.order - b.order),
    [members]
  );

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback(
    (index: number) => {
      if (dragIndex !== null && dragIndex !== index) {
        useAppStore.getState().reorderMembers(dragIndex, index);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-foreground" />
          <h2 className="text-sm font-semibold text-foreground">Council</h2>
          <span className="text-[11px] text-muted-foreground">
            {enabledCount}/{members.length} active
          </span>
        </div>
      </div>

      {/* Member list */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {members.length === 0 ? (
          <EmptyState />
        ) : (
          <AnimatePresence>
            {sortedMembers.map((persona, index) => (
                <motion.div
                  key={persona.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e as any, index)}
                  onDrop={() => handleDrop(index)}
                  onDragEnd={handleDragEnd}
                  animate={{
                    scale: dragOverIndex === index ? 1.02 : 1,
                    opacity: dragIndex === index ? 0.5 : 1,
                  }}
                  transition={{ duration: 0.15 }}
                >
                  <MemberCard
                    persona={persona}
                    runStatus={personaStatuses[persona.id]}
                    dragHandleProps={{}}
                  />
                </motion.div>
              ))}
          </AnimatePresence>
        )}
      </div>

      {/* Add button */}
      <AddMemberPopover>
        <Button
          variant="outline"
          className="mt-3 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-4 w-4" />
          Add Council Member
        </Button>
      </AddMemberPopover>
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
        <Users className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">No council members yet</p>
      <p className="text-xs text-muted-foreground mb-3">
        Add AI personas to form your council
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => useAppStore.getState().setMemberFormOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 mr-1" /> Add First Member
      </Button>
    </motion.div>
  );
}

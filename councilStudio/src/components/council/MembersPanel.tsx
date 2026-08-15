import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toaster";
import {
  useAppStore,
  selectMembers,
  selectMembersPanelOpen,
} from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import type { Persona, Provider } from "@/types";
import { Edit, Copy, Trash2, Plus, Users } from "lucide-react";

const PROVIDER_COLORS: Record<Provider, string> = {
  anthropic: "bg-orange-100 text-orange-700 border-orange-200",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-200",
  openrouter: "bg-purple-100 text-purple-700 border-purple-200",
  ollama: "bg-slate-100 text-slate-700 border-slate-200",
};

export function MembersPanel() {
  const members = useAppStore(selectMembers);
  const membersPanelOpen = useAppStore(selectMembersPanelOpen);
  const setMembersPanelOpen = useAppStore((s) => s.setMembersPanelOpen);
  const setMemberFormOpen = useAppStore((s) => s.setMemberFormOpen);
  const deleteMembers = useAppStore((s) => s.deleteMembers);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const sortedMembers = [...members].sort((a, b) => a.order - b.order);
  const allSelected = members.length > 0 && selectedIds.size === members.length;

  // Reset local state when the sheet closes
  useEffect(() => {
    if (!membersPanelOpen) {
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
    }
  }, [membersPanelOpen]);

  // Prune selection of ids that no longer exist (e.g. deleted via row action)
  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => members.some((m) => m.id === id)));
      return next.size === prev.size ? prev : next;
    });
  }, [members]);

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map((m) => m.id)));
    }
  };

  const handleMassDelete = async () => {
    const ids = [...selectedIds];
    const count = ids.length;
    try {
      await deleteMembers(ids);
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      toast("success", `Deleted ${count} member${count === 1 ? "" : "s"}`);
    } catch {
      // Store already set the error state
    }
  };

  return (
    <>
      <Sheet open={membersPanelOpen} onOpenChange={setMembersPanelOpen}>
        <SheetContent className="sm:max-w-md overflow-hidden">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle>Members</SheetTitle>
              <span className="text-xs text-muted-foreground">
                {members.length} member{members.length === 1 ? "" : "s"}
              </span>
            </div>
            <SheetDescription>
              Inspect, duplicate, or delete council members
            </SheetDescription>
          </SheetHeader>

          {members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Users className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mb-3 text-sm font-medium text-foreground">
                No members yet
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMemberFormOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> Create First Member
              </Button>
            </div>
          ) : (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between py-3">
                <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                  {allSelected ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={selectedIds.size === 0}
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  Delete Selected ({selectedIds.size})
                </Button>
              </div>

              {/* Member rows */}
              <ScrollArea className="h-[calc(100vh-220px)]">
                <div className="space-y-2 pr-3">
                  {sortedMembers.map((persona) => (
                    <MemberRow
                      key={persona.id}
                      persona={persona}
                      selected={selectedIds.has(persona.id)}
                      onToggleSelected={() => toggleSelected(persona.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Mass delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} member{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMassDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MemberRow({
  persona,
  selected,
  onToggleSelected,
}: {
  persona: Persona;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const setMemberFormOpen = useAppStore((s) => s.setMemberFormOpen);
  const duplicateMember = useAppStore((s) => s.duplicateMember);
  const deleteMember = useAppStore((s) => s.deleteMember);
  const toggleMemberEnabled = useAppStore((s) => s.toggleMemberEnabled);

  const [confirming, setConfirming] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  const handleDeleteClick = () => {
    if (!confirming) {
      setConfirming(true);
      resetTimerRef.current = setTimeout(() => setConfirming(false), 5000);
      return;
    }
    if (resetTimerRef.current) {
      clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setConfirming(false);
    deleteMember(persona.id);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5">
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggleSelected}
        className="h-4 w-4 shrink-0 accent-primary"
      />
      <Avatar
        className="h-8 w-8 shrink-0 border-2"
        style={{ borderColor: persona.color }}
      >
        <AvatarFallback
          className="text-xs font-bold"
          style={{ backgroundColor: `${persona.color}20`, color: persona.color }}
        >
          {persona.name[0]}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground truncate">
            {persona.name}
          </span>
          <button
            type="button"
            onClick={() => toggleMemberEnabled(persona.id)}
            title={
              persona.enabled
                ? "Disable — unavailable for councils"
                : "Enable — available for councils"
            }
            className="shrink-0 rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0 cursor-pointer hover:bg-accent",
                !persona.enabled && "text-muted-foreground"
              )}
            >
              {persona.enabled ? "Enabled" : "Disabled"}
            </Badge>
          </button>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0",
              PROVIDER_COLORS[persona.provider]
            )}
          >
            {PROVIDER_LABELS[persona.provider]}
          </Badge>
          <span className="text-[11px] text-muted-foreground truncate">
            {persona.model}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="Edit"
          onClick={() => setMemberFormOpen(true, persona.id)}
        >
          <Edit className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground"
          title="Duplicate"
          onClick={() => duplicateMember(persona.id)}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant={confirming ? "destructive" : "ghost"}
          size={confirming ? "sm" : "icon"}
          className={cn(!confirming && "h-7 w-7 text-destructive")}
          title="Delete"
          onClick={handleDeleteClick}
        >
          {confirming ? "Confirm?" : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}

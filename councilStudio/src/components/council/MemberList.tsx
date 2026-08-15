import { useState, useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useAppStore,
  selectCouncils,
  selectCurrentCouncil,
  selectCurrentCouncilMembers,
  selectPersonaStatuses,
} from "@/stores/appStore";
import { MemberCard } from "./MemberCard";
import { AddMemberPopover } from "./AddMemberPopover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users, ChevronDown, Check, Pencil, Trash2 } from "lucide-react";

export function MemberList() {
  const councils = useAppStore(selectCouncils);
  const currentCouncil = useAppStore(selectCurrentCouncil);
  const councilMembers = useAppStore(useShallow(selectCurrentCouncilMembers));
  const personaStatuses = useAppStore(selectPersonaStatuses);
  const selectCouncil = useAppStore((s) => s.selectCouncil);
  const deleteCouncil = useAppStore((s) => s.deleteCouncil);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [nameDialog, setNameDialog] = useState<
    { mode: "create" } | { mode: "rename"; id: string; initial: string } | null
  >(null);

  const enabledCount = councilMembers.filter((m) => m.enabled).length;

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback(
    (index: number) => {
      if (dragIndex !== null && dragIndex !== index && currentCouncil) {
        const ids = councilMembers.map((m) => m.id);
        const [moved] = ids.splice(dragIndex, 1);
        ids.splice(index, 0, moved);
        useAppStore.getState().reorderCouncilMembers(currentCouncil.id, ids);
      }
      setDragIndex(null);
      setDragOverIndex(null);
    },
    [dragIndex, currentCouncil, councilMembers]
  );

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  return (
    <div className="flex h-full flex-col min-h-0">
      {/* Header — council selector + new council */}
      <div className="flex items-center justify-between px-1 mb-3 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-foreground shrink-0" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-1.5 text-sm font-semibold text-foreground"
              >
                <span className="truncate max-w-32">
                  {currentCouncil?.name ?? "Council"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {councils.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => selectCouncil(c.id)}>
                  <span className="mr-2 flex h-3.5 w-3.5 items-center justify-center">
                    {c.id === currentCouncil?.id && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.memberIds.length}
                  </span>
                </DropdownMenuItem>
              ))}
              <div className="my-1 h-px bg-border" />
              <DropdownMenuItem onClick={() => setNameDialog({ mode: "create" })}>
                <Plus className="h-3.5 w-3.5 mr-2" /> New Council
              </DropdownMenuItem>
              {currentCouncil && (
                <>
                  <DropdownMenuItem
                    onClick={() =>
                      setNameDialog({
                        mode: "rename",
                        id: currentCouncil.id,
                        initial: currentCouncil.name,
                      })
                    }
                  >
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Rename Council
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete council "${currentCouncil.name}"? Sessions keep their saved snapshot.`
                        )
                      ) {
                        deleteCouncil(currentCouncil.id).catch(() => {});
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Council
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-[11px] text-muted-foreground shrink-0">
            {enabledCount}/{councilMembers.length} enabled
          </span>
        </div>
      </div>

      {/* Member list — current council, in council order */}
      <div className="flex-1 space-y-2 overflow-y-auto">
        {councilMembers.length === 0 ? (
          <EmptyState />
        ) : (
          <AnimatePresence>
            {councilMembers.map((persona, index) => (
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

        {/* Add button — sits right after the last member and scrolls with the list */}
        <AddMemberPopover>
          <Button
            variant="outline"
            className="mt-1 w-full justify-start gap-2 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add Council Member
          </Button>
        </AddMemberPopover>
      </div>

      <CouncilNameDialog dialog={nameDialog} onClose={() => setNameDialog(null)} />
    </div>
  );
}

function CouncilNameDialog({
  dialog,
  onClose,
}: {
  dialog: { mode: "create" } | { mode: "rename"; id: string; initial: string } | null;
  onClose: () => void;
}) {
  const createCouncil = useAppStore((s) => s.createCouncil);
  const renameCouncil = useAppStore((s) => s.renameCouncil);
  const [name, setName] = useState("");

  const isRename = dialog?.mode === "rename";
  const title = isRename ? "Rename Council" : "New Council";

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || !dialog) return;
    try {
      if (dialog.mode === "create") {
        await createCouncil(trimmed);
      } else {
        await renameCouncil(dialog.id, trimmed);
      }
      onClose();
    } catch {
      // Store already set the error state — keep the dialog open
    }
  };

  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
        else setName(isRename && dialog.mode === "rename" ? dialog.initial : "");
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isRename
              ? "Rename this council. Sessions keep their saved snapshot."
              : "Create an empty council, then add members to it."}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Council name"
            maxLength={100}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {isRename ? "Rename" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
      <p className="mb-1 text-sm font-medium text-foreground">No members in this council</p>
      <p className="text-xs text-muted-foreground mb-3">
        Add enabled members from your library
      </p>
    </motion.div>
  );
}

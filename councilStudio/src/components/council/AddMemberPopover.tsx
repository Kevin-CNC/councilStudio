import { useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore, selectMembers, selectCurrentCouncil } from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { Plus, UserPlus, Search, Users } from "lucide-react";

interface AddMemberPopoverProps {
  children: React.ReactNode;
}

/**
 * "Add Council Member" dropdown — choose between creating a new persona or
 * adding an existing library member that is not already in the current council.
 */
export function AddMemberPopover({ children }: AddMemberPopoverProps) {
  const [existingDialogOpen, setExistingDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <DropdownMenuItem
            onClick={() => useAppStore.getState().setMemberFormOpen(true)}
          >
            <Plus className="h-3.5 w-3.5 mr-2" /> Create New Member
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setExistingDialogOpen(true)}>
            <UserPlus className="h-3.5 w-3.5 mr-2" /> Add from Existing
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AddExistingMemberDialog
        open={existingDialogOpen}
        onOpenChange={setExistingDialogOpen}
      />
    </>
  );
}

function AddExistingMemberDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const members = useAppStore(selectMembers);
  const currentCouncil = useAppStore(selectCurrentCouncil);
  const [query, setQuery] = useState("");

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.order - b.order),
    [members]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedMembers;
    return sortedMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.model.toLowerCase().includes(q) ||
        PROVIDER_LABELS[m.provider].toLowerCase().includes(q)
    );
  }, [sortedMembers, query]);

  const handleAdd = (id: string) => {
    if (!currentCouncil) return;
    useAppStore.getState().addMembersToCouncil(currentCouncil.id, [id]);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setQuery("");
      }}
    >
      <DialogContent className="max-w-2xl duration-200 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
        <DialogHeader>
          <DialogTitle>Add from Existing</DialogTitle>
          <DialogDescription>
            Pick a library member to add to this council.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Search by name, provider, or model…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>

        {members.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No members exist yet. Create one first.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No members match "{query}".
          </p>
        ) : (
          <ScrollArea className="h-80">
            <div className="grid grid-cols-3 gap-5 pr-3">
              {filtered.map((m) => {
                const alreadyInCouncil = Boolean(
                  currentCouncil?.memberIds.includes(m.id)
                );
                return (
                  <div
                    key={m.id}
                    className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-card p-2.5 text-center"
                  >
                    <Avatar
                      className="h-8 w-8 shrink-0 border-2"
                      style={{ borderColor: m.color }}
                    >
                      <AvatarFallback
                        className="text-xs font-bold"
                        style={{ backgroundColor: `${m.color}20`, color: m.color }}
                      >
                        {m.name[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col items-center gap-0.5">
                      <span className="text-sm font-semibold text-foreground truncate max-w-full">
                        {m.name}
                      </span>
                      {!m.enabled && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
                          Disabled
                        </Badge>
                      )}
                      <span className="text-[11px] text-muted-foreground truncate max-w-full">
                        {m.model}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={alreadyInCouncil || !currentCouncil}
                      onClick={() => handleAdd(m.id)}
                    >
                      {alreadyInCouncil ? "Added" : "Add"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

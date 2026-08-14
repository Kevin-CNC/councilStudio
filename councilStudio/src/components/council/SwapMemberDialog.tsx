import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toaster";
import {
  useAppStore,
  selectMembers,
  selectCurrentCouncil,
  selectSwapTargetId,
  selectIsRunning,
} from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { ArrowLeftRight, Plus } from "lucide-react";

export function SwapMemberDialog() {
  const members = useAppStore(selectMembers);
  const currentCouncil = useAppStore(selectCurrentCouncil);
  const swapTargetId = useAppStore(selectSwapTargetId);
  const isRunning = useAppStore(selectIsRunning);
  const setSwapTargetId = useAppStore((s) => s.setSwapTargetId);
  const setMemberFormOpen = useAppStore((s) => s.setMemberFormOpen);

  const target = members.find((m) => m.id === swapTargetId);

  // Close the dialog if the swap target was deleted externally
  useEffect(() => {
    if (swapTargetId && !target) setSwapTargetId(null);
  }, [swapTargetId, target, setSwapTargetId]);

  // Enabled library members not already in the current council.
  const candidates = currentCouncil
    ? members.filter(
        (m) => m.enabled && !currentCouncil.memberIds.includes(m.id)
      )
    : [];

  const handleSwap = async (inId: string, inName: string) => {
    if (!swapTargetId || !currentCouncil || isRunning) return;
    const outName = target?.name ?? "member";
    const { removeMemberFromCouncil, addMembersToCouncil } = useAppStore.getState();
    try {
      await removeMemberFromCouncil(currentCouncil.id, swapTargetId);
      await addMembersToCouncil(currentCouncil.id, [inId]);
      toast("success", `Swapped ${outName} with ${inName}`);
      setSwapTargetId(null);
    } catch {
      // Store already set the error state — keep the dialog open
    }
  };

  return (
    <Dialog
      open={swapTargetId !== null}
      onOpenChange={(open) => {
        if (!open) setSwapTargetId(null);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap {target?.name ?? "Member"}</DialogTitle>
          <DialogDescription>
            Pick a member to swap into the council.
          </DialogDescription>
        </DialogHeader>

        {isRunning && (
          <p className="text-xs text-muted-foreground">
            Swapping is disabled while a run is active.
          </p>
        )}

        {candidates.length === 0 ? (
          <div className="flex flex-col items-center py-6 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              No other members available to swap with.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSwapTargetId(null);
                setMemberFormOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Create New
            </Button>
          </div>
        ) : (
          <ScrollArea className="max-h-72">
            <div className="space-y-2 pr-3">
              {candidates.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: m.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-foreground truncate">
                      {m.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {PROVIDER_LABELS[m.provider]} · {m.model}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isRunning}
                    onClick={() => handleSwap(m.id, m.name)}
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5 mr-1" /> Swap In
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}

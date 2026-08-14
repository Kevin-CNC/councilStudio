import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useAppStore, selectMembers, selectCurrentCouncil } from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { Plus, UserPlus } from "lucide-react";

interface AddMemberPopoverProps {
  children: React.ReactNode;
}

/**
 * "Add Council Member" dropdown — choose between creating a new persona or
 * adding an enabled library member that is not already in the current council.
 * Implemented with DropdownMenu primitives (no popover dependency installed).
 */
export function AddMemberPopover({ children }: AddMemberPopoverProps) {
  const members = useAppStore(selectMembers);
  const currentCouncil = useAppStore(selectCurrentCouncil);
  const candidates = currentCouncil
    ? members.filter((m) => m.enabled && !currentCouncil.memberIds.includes(m.id))
    : [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onClick={() => useAppStore.getState().setMemberFormOpen(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-2" /> Create New Member
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <UserPlus className="h-3.5 w-3.5 mr-2" /> Add from Existing
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-64">
            {candidates.length === 0 ? (
              <DropdownMenuItem disabled>
                No enabled members available. Enable one in the library first.
              </DropdownMenuItem>
            ) : (
              candidates.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() =>
                    currentCouncil &&
                    useAppStore
                      .getState()
                      .addMembersToCouncil(currentCouncil.id, [m.id])
                  }
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0 mr-2"
                    style={{ backgroundColor: m.color }}
                  />
                  <span className="font-medium truncate">{m.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground truncate">
                    {PROVIDER_LABELS[m.provider]} · {m.model}
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

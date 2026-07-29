import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { useAppStore, selectMembers } from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { Plus, UserPlus } from "lucide-react";

interface AddMemberPopoverProps {
  children: React.ReactNode;
}

/**
 * "Add Council Member" dropdown — choose between creating a new persona or
 * enabling an existing disabled one. Implemented with DropdownMenu primitives
 * (no popover dependency installed).
 */
export function AddMemberPopover({ children }: AddMemberPopoverProps) {
  const members = useAppStore(selectMembers);
  const disabledMembers = members.filter((m) => !m.enabled);

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
            {disabledMembers.length === 0 ? (
              <DropdownMenuItem disabled>
                No other members available. Create one first.
              </DropdownMenuItem>
            ) : (
              disabledMembers.map((m) => (
                <DropdownMenuItem
                  key={m.id}
                  onClick={() =>
                    useAppStore.getState().updateMember(m.id, { enabled: true })
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

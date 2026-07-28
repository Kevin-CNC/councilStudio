import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { MemberCompatibilityCheck } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checks: MemberCompatibilityCheck[];
  onRunAnyway: () => void;
}

export function CompatibilityWarningDialog({ open, onOpenChange, checks, onRunAnyway }: Props) {
  if (checks.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Model Compatibility Warning
          </DialogTitle>
          <DialogDescription>
            {checks.length === 1
              ? "1 council member may not be compatible with this prompt."
              : `${checks.length} council members may not be compatible with this prompt.`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-64 space-y-3 overflow-y-auto">
          {checks.map((check) => (
            <div
              key={check.personaId}
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950"
            >
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                {check.personaName} ({check.provider} / {check.model})
              </p>
              <ul className="mt-1 space-y-0.5">
                {check.issues.map((issue, i) => (
                  <li key={i} className="text-xs text-amber-700 dark:text-amber-300">
                    {issue}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" className="bg-amber-600 hover:bg-amber-700" onClick={onRunAnyway}>
            Run Anyway
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

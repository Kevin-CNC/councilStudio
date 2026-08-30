import { useState, useEffect } from "react";
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
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { toast } from "@/components/ui/toaster";
import type { Provider } from "@/types";

const PROVIDERS: Provider[] = ["anthropic", "openai", "openrouter", "ollama"];

interface JudgeConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Simplified member-form-style dialog for configuring the judge model. */
export function JudgeConfigDialog({ open, onOpenChange }: JudgeConfigDialogProps) {
  const judgeModel = useAppStore((s) => s.judgeModel);
  const judgeProvider = useAppStore((s) => s.judgeProvider);
  const setJudge = useAppStore((s) => s.setJudge);

  const [provider, setProvider] = useState<Provider>(judgeProvider);
  const [model, setModel] = useState(judgeModel);

  // Sync form with stored judge whenever the dialog opens
  useEffect(() => {
    if (open) {
      setProvider(judgeProvider);
      setModel(judgeModel);
    }
  }, [open, judgeProvider, judgeModel]);

  const handleSave = () => {
    const trimmed = model.trim();
    if (!trimmed) return;
    setJudge(trimmed, provider);
    toast("success", "Judge configured", `${trimmed} (${PROVIDER_LABELS[provider]})`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure Judge</DialogTitle>
          <DialogDescription>
            The judge synthesizes all council responses into a final summary.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="judge-provider">Provider</Label>
            <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
              <SelectTrigger id="judge-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="judge-model">Model</Label>
            <Input
              id="judge-model"
              placeholder="e.g. claude-sonnet-5"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!model.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

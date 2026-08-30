import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "@/stores/appStore";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

export function VarsTab() {
  const {
    judgeModel,
    judgeProvider,
    concurrency,
    sessionMaxTokens,
    customVars,
    setConcurrency,
    setSessionMaxTokens,
    setCustomVar,
    removeCustomVar,
  } = useAppStore(
    useShallow((s) => ({
      judgeModel: s.judgeModel,
      judgeProvider: s.judgeProvider,
      concurrency: s.concurrency,
      sessionMaxTokens: s.sessionMaxTokens,
      customVars: s.customVars,
      setConcurrency: s.setConcurrency,
      setSessionMaxTokens: s.setSessionMaxTokens,
      setCustomVar: s.setCustomVar,
      removeCustomVar: s.removeCustomVar,
    }))
  );

  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const addCustomVar = () => {
    const key = newKey.trim();
    if (!key) return;
    setCustomVar(key, newValue.trim());
    setNewKey("");
    setNewValue("");
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="text-muted-foreground mb-2">Session Variables</div>
        <div className="space-y-2">
          <Row label="judge_model" value={judgeModel || "not configured"} />
          <Row label="judge_provider" value={judgeProvider} />
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5">
            <span className="font-mono text-muted-foreground">concurrency</span>
            <Input
              type="number"
              min={1}
              value={concurrency}
              onChange={(e) => setConcurrency(Math.max(1, Number(e.target.value) || 1))}
              className="h-6 w-16 text-right font-mono text-xs"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5">
            <span className="font-mono text-muted-foreground">max_tokens</span>
            <Input
              type="number"
              min={1}
              value={sessionMaxTokens}
              onChange={(e) => setSessionMaxTokens(Math.max(1, Number(e.target.value) || 1))}
              className="h-6 w-20 text-right font-mono text-xs"
            />
          </div>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Edits register at the next run — the active run is unaffected.
        </p>
      </div>

      <div>
        <div className="text-muted-foreground mb-2">Custom Variables</div>
        <div className="space-y-2">
          {Object.entries(customVars).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-2.5 py-1.5">
              <span className="flex-1 truncate font-mono text-muted-foreground">{key}</span>
              <Input
                value={value}
                onChange={(e) => setCustomVar(key, e.target.value)}
                className="h-6 flex-1 font-mono text-xs"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-muted-foreground hover:text-destructive"
                onClick={() => removeCustomVar(key)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          {Object.keys(customVars).length === 0 && (
            <p className="text-[10px] text-muted-foreground">No custom variables yet.</p>
          )}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            placeholder="key"
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            className="h-6 w-20 font-mono text-xs"
          />
          <Input
            placeholder="value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomVar()}
            className="h-6 flex-1 font-mono text-xs"
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={addCustomVar}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-2.5 py-1.5">
      <span className="font-mono text-muted-foreground">{label}</span>
      <span className="font-mono font-medium text-foreground">{value}</span>
    </div>
  );
}

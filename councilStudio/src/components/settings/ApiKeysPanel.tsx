import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import * as bridge from "@/lib/tauri-bridge";
import type { Provider } from "@/types";
import { Eye, EyeOff, Check, Loader2 } from "lucide-react";

const KEY_PROVIDERS: { id: Provider; name: string; placeholder: string }[] = [
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-..." },
];

const OLLAMA_PROVIDER: { id: Provider; name: string; placeholder: string } = {
  id: "ollama",
  name: "Ollama (Self-hosted)",
  placeholder: "http://localhost:11434",
};

export function ApiKeysPanel() {
  const { apiKeysOpen, setApiKeysOpen } = useAppStore(
    useShallow((s) => ({
      apiKeysOpen: s.ui.apiKeysOpen,
      setApiKeysOpen: s.setApiKeysOpen,
    }))
  );

  const [keys, setKeys] = useState<Record<string, string>>({
    anthropic: "",
    openai: "",
    openrouter: "",
  });
  const [baseUrl, setBaseUrl] = useState(OLLAMA_PROVIDER.placeholder);
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load which providers already have credentials when the panel opens.
  useEffect(() => {
    if (!apiKeysOpen) return;
    bridge
      .getApiKeys()
      .then((rows) => {
        const map: Record<string, boolean> = {};
        for (const row of rows) map[row.provider] = row.hasKey;
        setSavedKeys(map);
      })
      .catch(() => {
        // Panel still works — indicators just stay off
      });
  }, [apiKeysOpen]);

  const handleSaveAll = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      for (const p of KEY_PROVIDERS) {
        const key = keys[p.id]?.trim();
        if (key) {
          await bridge.saveApiKey(p.id, key);
          setSavedKeys((prev) => ({ ...prev, [p.id]: true }));
        }
      }
      const url = baseUrl.trim();
      if (url) {
        await bridge.saveApiKey("ollama_url", url);
        setSavedKeys((prev) => ({ ...prev, ollama: true }));
      }
      // Clear entered secrets from component state after persisting
      setKeys({ anthropic: "", openai: "", openrouter: "" });
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={apiKeysOpen} onOpenChange={(open) => setApiKeysOpen(open)}>
      <SheetContent id="api-keys-panel" className="sm:max-w-lg overflow-hidden">
        <SheetHeader>
          <SheetTitle>API Keys</SheetTitle>
          <SheetDescription>
            Keys are stored locally and never sent to our servers.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] py-4">
          <div className="space-y-4 pr-3">
            {KEY_PROVIDERS.map((p) => (
              <div key={p.id} id={`api-keys-provider-${p.id}`} className="space-y-2">
                <Label>{p.name}</Label>
                <div className="relative">
                  <Input
                    type={showKeys[p.id] ? "text" : "password"}
                    placeholder={p.placeholder}
                    value={keys[p.id]}
                    onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
                    className="pr-20"
                  />
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {savedKeys[p.id] && (
                      <span title="Key saved">
                        <Check className="h-3.5 w-3.5 text-primary" />
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowKeys({ ...showKeys, [p.id]: !showKeys[p.id] })}
                    >
                      {showKeys[p.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            <div id={`api-keys-provider-${OLLAMA_PROVIDER.id}`} className="space-y-2 pt-2 border-t border-border">
              <Label>{OLLAMA_PROVIDER.name}</Label>
              <p className="text-xs text-muted-foreground">
                Base URL of your local Ollama server. No API key required.
              </p>
              <div className="relative">
                <Input
                  type="text"
                  placeholder={OLLAMA_PROVIDER.placeholder}
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="pr-16"
                />
                <div className="absolute right-1 top-1/2 -translate-y-1/2">
                  {savedKeys.ollama && (
                    <span title="Base URL saved" className="pr-2">
                      <Check className="h-3.5 w-3.5 text-primary" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border pt-4 space-y-2">
          {saveError && (
            <p className="text-xs text-destructive">{saveError}</p>
          )}
          <Button
            id="api-keys-save-all"
            className="w-full"
            onClick={handleSaveAll}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save All Keys
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

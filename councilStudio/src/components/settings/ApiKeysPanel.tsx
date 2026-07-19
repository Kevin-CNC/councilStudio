import { useState } from "react";
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
import type { Provider } from "@/types";
import { Eye, EyeOff, Check } from "lucide-react";

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
  const [tested, setTested] = useState<Record<string, boolean>>({});

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
                  <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowKeys({ ...showKeys, [p.id]: !showKeys[p.id] })}
                    >
                      {showKeys[p.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setTested({ ...tested, [p.id]: true })}
                    >
                      {tested[p.id] ? <Check className="h-3 w-3 text-primary" /> : "Test"}
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
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setTested({ ...tested, ollama: true })}
                  >
                    {tested.ollama ? <Check className="h-3 w-3 text-primary" /> : "Test"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border pt-4">
          <Button id="api-keys-save-all" className="w-full">
            Save All Keys
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

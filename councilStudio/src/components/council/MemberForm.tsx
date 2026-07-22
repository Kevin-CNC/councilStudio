import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Toggle } from "@/components/ui/toggle";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import type { Provider } from "@/types";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "ollama", label: "Ollama (Self-hosted)" },
];

const ANTHROPIC_MODELS = [
  "claude-fable-5",
  "claude-mythos-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-opus-4-5",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-sonnet-4-5",
  "claude-haiku-4-5",
];

const OPENAI_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.4-nano",
  "gpt-5.3-codex",
  "gpt-5.2",
  "gpt-5.2-pro",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o",
  "gpt-4o-mini",
];

const VALID_MODELS: Record<string, string[]> = {
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
};

const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-5",
  openai: "gpt-5.5",
  openrouter: "",
  ollama: "",
};

function isValidModel(provider: Provider, model: string): boolean {
  if (provider === "openrouter" || provider === "ollama") return true;
  const list = VALID_MODELS[provider];
  return list ? list.includes(model) : true;
}

function getModelHint(provider: Provider): string {
  if (provider === "openrouter") return "Paste your OpenRouter model endpoint…";
  if (provider === "ollama") return "e.g., llama3.1:latest, qwen2.5:72b";
  return "Type or select a model…";
}

const AVATAR_COLORS = [
  "#17B890", "#228CDB", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#10B981", "#F97316", "#6366F1",
];

export function MemberForm() {
  const { memberFormOpen, editingMemberId, setMemberFormOpen, members, addMember, updateMember } =
    useAppStore(
      useShallow((s) => ({
        memberFormOpen: s.ui.memberFormOpen,
        editingMemberId: s.ui.editingMemberId,
        setMemberFormOpen: s.setMemberFormOpen,
        members: s.members,
        addMember: s.addMember,
        updateMember: s.updateMember,
      }))
    );

  const editingMember = editingMemberId ? members.find((m) => m.id === editingMemberId) : null;
  const isEditing = !!editingMember;

  const [name, setName] = useState("");
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [model, setModel] = useState(DEFAULT_MODELS.anthropic);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [reasoningLevel, setReasoningLevel] = useState<"none" | "low" | "medium" | "high">("medium");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [color, setColor] = useState(AVATAR_COLORS[0]);

  const [confirming, setConfirming] = useState(false);
  const [confirmBlocked, setConfirmBlocked] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const modelError = useMemo(() => {
    if (!model.trim()) return null;
    if (!isValidModel(provider, model)) {
      const list = VALID_MODELS[provider];
      return list ? `Unknown model. Valid: ${list.join(", ")}` : null;
    }
    return null;
  }, [provider, model]);

  useEffect(() => {
    if (editingMember) {
      setName(editingMember.name);
      setProvider(editingMember.provider);
      setModel(editingMember.model);
      setTemperature(editingMember.temperature);
      setMaxTokens(editingMember.maxTokens);
      setReasoningLevel(editingMember.reasoningLevel || "medium");
      setSystemPrompt(editingMember.systemPrompt);
      setStreaming(editingMember.streaming);
      setColor(editingMember.color);
    } else {
      setName("");
      setProvider("anthropic");
      setModel(DEFAULT_MODELS.anthropic);
      setTemperature(0.7);
      setMaxTokens(4096);
      setReasoningLevel("medium");
      setSystemPrompt("");
      setStreaming(true);
      setColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
    }
    setConfirming(false);
    setConfirmBlocked(false);
  }, [editingMember, memberFormOpen]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      if (blockTimerRef.current) clearTimeout(blockTimerRef.current);
    };
  }, []);

  const clearConfirmation = useCallback(() => {
    setConfirming(false);
    setConfirmBlocked(false);
    if (resetTimerRef.current) { clearTimeout(resetTimerRef.current); resetTimerRef.current = null; }
    if (blockTimerRef.current) { clearTimeout(blockTimerRef.current); blockTimerRef.current = null; }
  }, []);

  const handleSaveClick = useCallback(() => {
    if (!name.trim() || !model.trim() || modelError) return;

    if (!confirming) {
      // First click — enter confirmation mode
      setConfirming(true);
      setConfirmBlocked(true);

      // 3s debounce before second click is allowed
      blockTimerRef.current = setTimeout(() => {
        setConfirmBlocked(false);
        blockTimerRef.current = null;
      }, 3000);

      // 9s timeout — reset to normal if not confirmed
      resetTimerRef.current = setTimeout(() => {
        clearConfirmation();
      }, 9000);
      return;
    }

    if (confirmBlocked) return; // Still in 3s debounce window

    // Second click — confirmed, execute save
    clearConfirmation();
    executeSave();
  }, [name, model, modelError, confirming, confirmBlocked, clearConfirmation]);

  const executeSave = async () => {
    try {
      if (isEditing && editingMember) {
        await updateMember(editingMember.id, {
          name,
          provider,
          model,
          temperature,
          maxTokens,
          reasoningLevel,
          systemPrompt,
          streaming,
          color,
        });
      } else {
        await addMember({
          name,
          provider,
          model,
          systemPrompt,
          temperature,
          maxTokens,
          streaming,
          color,
          reasoningLevel,
          enabled: true,
        });
      }
      setMemberFormOpen(false);
    } catch {
      // Error is handled by the store (sets error state)
    }
  };

  return (
    <Sheet open={memberFormOpen} onOpenChange={(open) => { if (!open) { clearConfirmation(); setMemberFormOpen(false); } }}>
      <SheetContent className="sm:max-w-md overflow-hidden">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Council Member" : "Add Council Member"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update this persona's configuration"
              : "Configure a new AI persona for your council"}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] py-4">
          <div className="space-y-5 pr-3">
            {/* Name */}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Pragmatist, Engineer, Critic"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Provider & Model */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select
                  value={provider}
                  onValueChange={(v) => {
                    setProvider(v as Provider);
                    setModel(DEFAULT_MODELS[v as Provider]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Model</Label>
                {(provider === "anthropic" || provider === "openai") ? (
                  <Select
                    value={model}
                    onValueChange={(v) => setModel(v)}
                  >
                    <SelectTrigger className={modelError ? "border-red-500" : ""}>
                      <SelectValue placeholder={getModelHint(provider)} />
                    </SelectTrigger>
                    <SelectContent>
                      {(VALID_MODELS[provider] || []).map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder={getModelHint(provider)}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                )}
                {modelError && (
                  <p className="text-xs text-red-500">{modelError}</p>
                )}
                <a
                  href={provider === "ollama" ? "https://ollama.com/library" : provider === "openrouter" ? "https://openrouter.ai/models" : provider === "openai" ? "https://platform.openai.com/docs/models" : "https://docs.anthropic.com/en/docs/about-claude/models"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                >
                  {provider === "openrouter" ? "Browse OpenRouter models →" : provider === "ollama" ? "Browse Ollama models →" : "View available models →"}
                </a>
              </div>
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Temperature</Label>
                <span className="text-xs font-mono text-muted-foreground">
                  {temperature.toFixed(2)}
                </span>
              </div>
              <Slider
                value={[temperature]}
                onValueChange={([v]) => setTemperature(v)}
                min={0}
                max={2}
                step={0.05}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>Precise</span>
                <span>Creative</span>
              </div>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Tokens</Label>
                <span className="text-xs font-mono text-muted-foreground">{maxTokens}</span>
              </div>
              <Slider
                value={[maxTokens]}
                onValueChange={([v]) => setMaxTokens(v)}
                min={256}
                max={32768}
                step={256}
              />
            </div>

            {/* Reasoning Level */}
            <div className="space-y-2">
              <Label>Reasoning Level</Label>
              <div className="flex gap-1.5">
                {(["none", "low", "medium", "high"] as const).map((level) => (
                  <Toggle
                    key={level}
                    pressed={reasoningLevel === level}
                    onPressedChange={() => setReasoningLevel(level)}
                    className="flex-1 justify-center text-xs capitalize"
                  >
                    {level}
                  </Toggle>
                ))}
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                placeholder="Define the persona's role, behavior, and constraints..."
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>

            {/* Avatar Color */}
            <div className="space-y-2">
              <Label>Avatar Color</Label>
              <div className="flex gap-2 flex-wrap">
                {AVATAR_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-all",
                      color === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>

            {/* Toggles */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Streaming</Label>
                <Toggle
                  pressed={streaming}
                  onPressedChange={setStreaming}
                  className="text-xs"
                >
                  {streaming ? "On" : "Off"}
                </Toggle>
              </div>
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => { clearConfirmation(); setMemberFormOpen(false); }}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveClick}
            disabled={!name.trim() || !model.trim() || !!modelError || (confirming && confirmBlocked)}
            className={confirming ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
          >
            {confirming ? "Are you sure?" : isEditing ? "Save Changes" : "Add Member"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

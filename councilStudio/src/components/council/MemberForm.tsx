import { useState, useEffect } from "react";
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
import { MODEL_OPTIONS } from "@/lib/mock-data";
import type { Persona, Provider } from "@/types";

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "google", label: "Google" },
  { id: "mistral", label: "Mistral" },
  { id: "meta", label: "Meta" },
  { id: "openrouter", label: "OpenRouter" },
];

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
  const [model, setModel] = useState("claude-opus-4");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [reasoningLevel, setReasoningLevel] = useState<"none" | "low" | "medium" | "high">("medium");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [streaming, setStreaming] = useState(true);
  const [color, setColor] = useState(AVATAR_COLORS[0]);

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
      setModel("claude-opus-4");
      setTemperature(0.7);
      setMaxTokens(4096);
      setReasoningLevel("medium");
      setSystemPrompt("");
      setStreaming(true);
      setColor(AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]);
    }
  }, [editingMember, memberFormOpen]);

  const filteredModels = MODEL_OPTIONS.filter((m) => m.provider === provider);

  const handleSave = () => {
    if (!name.trim()) return;

    if (isEditing && editingMember) {
      updateMember(editingMember.id, {
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
      const newMember: Persona = {
        id: `person-${Date.now()}`,
        name,
        provider,
        model,
        systemPrompt,
        temperature,
        maxTokens,
        enabled: true,
        streaming,
        color,
        order: members.length,
        reasoningLevel,
      };
      addMember(newMember);
    }

    setMemberFormOpen(false);
  };

  return (
    <Sheet open={memberFormOpen} onOpenChange={(open) => !open && setMemberFormOpen(false)}>
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
                    const models = MODEL_OPTIONS.filter((m) => m.provider === v);
                    if (models.length) setModel(models[0].id);
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
                <Select value={model} onValueChange={setModel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          <Button variant="outline" onClick={() => setMemberFormOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {isEditing ? "Save Changes" : "Add Member"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

import { useRef, useMemo, useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore, selectCurrentPrompt, selectMembers, selectIsRunning, selectJudgeModel, selectJudgeProvider, selectAttachments, selectCustomVars } from "@/stores/appStore";
import { PromptHistory } from "./PromptHistory";
import { CompatibilityWarningDialog } from "./CompatibilityWarningDialog";
import { JudgeConfigDialog } from "./JudgeConfigDialog";
import { checkModelCompatibility } from "@/lib/tauri-bridge";
import { tokenizePrompt, type PromptToken } from "@/lib/prompt-vars";
import { toast } from "@/components/ui/toaster";
import { motion, AnimatePresence } from "framer-motion";
import type { MemberCompatibilityCheck, Provider } from "@/types";
import {
  Play,
  Square,
  Paperclip,
  Gavel,
  X,
  GripHorizontal,
} from "lucide-react";
import { KnowledgeBaseIcon, VoiceIcon } from "@/components/icons/AppIcons";

const MAX_CHARS = 4000;
const MIN_EDITOR_HEIGHT = 120;
const DEFAULT_EDITOR_HEIGHT = 200;

const TOKEN_CLASSNAMES: Record<PromptToken["type"], string> = {
  text: "",
  bold: "font-bold",
  italic: "italic",
  code: "rounded bg-muted text-foreground/90",
  codeblock: "rounded bg-muted text-foreground/90",
  "var-known": "rounded bg-primary/15 text-primary font-medium",
  "var-unknown": "rounded text-muted-foreground underline decoration-dashed decoration-muted-foreground/60",
};

function PromptOverlay({ tokens }: { tokens: PromptToken[] }) {
  return (
    <>
      {tokens.map((token, i) => (
        <span key={i} className={TOKEN_CLASSNAMES[token.type]}>
          {token.text}
        </span>
      ))}
      {/* Trailing newline padding so the caret has room to sit on a final blank line */}
      {"\n"}
    </>
  );
}

export function PromptEditor() {
  const currentPrompt = useAppStore(selectCurrentPrompt);
  const members = useAppStore(selectMembers);
  const isRunning = useAppStore(selectIsRunning);
  const setPrompt = useAppStore((s) => s.setPrompt);
  const runCouncil = useAppStore((s) => s.runCouncil);
  const judgeModel = useAppStore(selectJudgeModel);
  const judgeProvider = useAppStore(selectJudgeProvider);
  const setJudge = useAppStore((s) => s.setJudge);
  const attachments = useAppStore(selectAttachments);
  const addAttachments = useAppStore((s) => s.addAttachments);
  const removeAttachment = useAppStore((s) => s.removeAttachment);
  const customVars = useAppStore(selectCustomVars);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editorHeight, setEditorHeight] = useState(DEFAULT_EDITOR_HEIGHT);
  const dragState = useRef<{ startY: number; startH: number } | null>(null);

  // Resize: mutate textarea style during drag (no re-render), commit to state on release.
  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    const ta = textareaRef.current;
    if (!ta) return;
    e.preventDefault();
    dragState.current = { startY: e.clientY, startH: ta.getBoundingClientRect().height };
    document.body.style.cursor = "ns-resize";

    const clamp = (h: number) =>
      Math.min(window.innerHeight * 0.7, Math.max(MIN_EDITOR_HEIGHT, h));

    const onMove = (ev: PointerEvent) => {
      const d = dragState.current;
      if (!d) return;
      ta.style.height = `${clamp(d.startH + ev.clientY - d.startY)}px`;
    };
    const onUp = (ev: PointerEvent) => {
      const d = dragState.current;
      dragState.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.body.style.cursor = "";
      if (d) setEditorHeight(clamp(d.startH + ev.clientY - d.startY));
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);
  const charCount = currentPrompt.length;
  const knownVarNames = useMemo(() => new Set(Object.keys(customVars)), [customVars]);
  const promptTokens = useMemo(
    () => tokenizePrompt(currentPrompt, knownVarNames),
    [currentPrompt, knownVarNames]
  );
  const handleEditorScroll = useCallback(() => {
    const ta = textareaRef.current;
    const overlay = overlayRef.current;
    if (!ta || !overlay) return;
    overlay.scrollTop = ta.scrollTop;
    overlay.scrollLeft = ta.scrollLeft;
  }, []);
  const [isChecking, setIsChecking] = useState(false);
  const [compatDialogOpen, setCompatDialogOpen] = useState(false);
  const [judgeConfigOpen, setJudgeConfigOpen] = useState(false);
  const [incompatibleChecks, setIncompatibleChecks] = useState<MemberCompatibilityCheck[]>([]);
  const canSubmit =
    (currentPrompt.trim().length > 0 || attachments.length > 0) && !isRunning && !isChecking;
  const enabledCount = members.filter((m) => m.enabled).length;
  const judgeConfigured = judgeModel.trim().length > 0;

  // Judge options: unique provider/model pairs from the council roster,
  // always including the current selection so it stays selectable.
  const judgeValue = `${judgeProvider}:${judgeModel}`;
  const judgeOptions = useMemo(
    () =>
      Array.from(
        new Map(
          [
            ...(judgeConfigured ? [{ provider: judgeProvider, model: judgeModel }] : []),
            ...members.map((m) => ({ provider: m.provider, model: m.model })),
          ].map((o) => [`${o.provider}:${o.model}`, o])
        ).values()
      ),
    [judgeProvider, judgeModel, judgeConfigured, members]
  );

  const handleRun = useCallback(async () => {
    if (!canSubmit) return;

    if (!judgeConfigured) {
      toast("info", "No judge configured", "Set a judge model before running the council.");
      setJudgeConfigOpen(true);
      return;
    }

    setIsChecking(true);
    try {
      const enabledMembers = members.filter((m) => m.enabled);
      const result = await checkModelCompatibility({
        members: enabledMembers.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          model: m.model,
        })),
        requiredInputModalities: attachments.length ? ["image", "text"] : ["text"],
        requiredOutputModalities: ["text"],
      });

      const incompatible = result.checks.filter((c) => !c.compatible);
      if (incompatible.length > 0) {
        setIncompatibleChecks(incompatible);
        setCompatDialogOpen(true);
      } else {
        runCouncil();
      }
    } catch (err) {
      console.error("Compatibility check failed:", err);
      toast("info", "Compatibility check failed", "Running without a pre-flight check.");
      runCouncil();
    } finally {
      setIsChecking(false);
    }
  }, [canSubmit, judgeConfigured, members, runCouncil, attachments]);

  const handleFilesSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length > 0) addAttachments(files);
      e.target.value = "";
    },
    [addAttachments]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-foreground">Prompt</h2>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{enabledCount} members active</span>
        </div>
      </div>

      {/* Attachment thumbnails */}
      {attachments.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div
              key={a.id}
              className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-border bg-muted"
              title={a.name}
            >
              <img src={a.dataUrl} alt={a.name} className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => removeAttachment(a.id)}
                className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground hover:bg-background"
                aria-label={`Remove ${a.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Textarea, with a highlighted overlay behind it for markdown + @var styling */}
      <div className="relative">
        <div
          ref={overlayRef}
          aria-hidden="true"
          className="styled-scrollbar pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words rounded-xl border border-transparent px-3 py-2 text-sm leading-relaxed text-foreground"
          style={{ height: editorHeight }}
        >
          <PromptOverlay tokens={promptTokens} />
        </div>
        <Textarea
          ref={textareaRef}
          placeholder="Ask your council anything..."
          value={currentPrompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
          onScroll={handleEditorScroll}
          disabled={isRunning}
          style={{ height: editorHeight }}
          className={cn(
            "styled-scrollbar relative resize-none bg-transparent text-sm leading-relaxed text-transparent caret-foreground",
            "focus-visible:ring-2 focus-visible:ring-primary/30",
            isRunning && "opacity-60"
          )}
        />
        {/* Textured drag handle on bottom edge — height commits on release */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize prompt box"
          onPointerDown={handleResizeStart}
          className={cn(
            "absolute inset-x-0 -bottom-[7px] flex h-[14px] cursor-ns-resize items-center justify-center",
            "text-muted-foreground/50 transition-colors hover:text-muted-foreground",
            isRunning && "pointer-events-none opacity-40"
          )}
        >
          <div className="flex h-[6px] w-14 items-center justify-center rounded-full border border-border bg-muted shadow-sm">
            <GripHorizontal className="h-3 w-3" />
          </div>
        </div>
      </div>

      {/* Character counter */}
      <div className="mt-1 flex items-center justify-end">
        <span
          className={cn(
            "text-[11px] font-mono",
            charCount > MAX_CHARS * 0.9 ? "text-destructive" : "text-muted-foreground"
          )}
        >
          {charCount.toLocaleString()}/{MAX_CHARS.toLocaleString()}
        </span>
      </div>

      {/* Toolbar */}
      <div className="mt-2 flex items-center gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFilesSelected}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          disabled={isRunning}
          onClick={() => fileInputRef.current?.click()}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <VoiceIcon className="h-4 w-4" />
        </Button>

        <PromptHistory onSelect={(prompt) => setPrompt(prompt)}>
          <Button id="prompt-history-button" variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground">
            <KnowledgeBaseIcon className="h-3.5 w-3.5" />
            Templates
          </Button>
        </PromptHistory>

        <div className="flex-1" />

        {/* Judge model selector — prompts for configuration when unset */}
        {judgeConfigured ? (
          <Select
            value={judgeValue}
            onValueChange={(v) => {
              if (v === "__configure__") {
                setJudgeConfigOpen(true);
                return;
              }
              const [provider, ...rest] = v.split(":");
              setJudge(rest.join(":"), provider as Provider);
            }}
            disabled={isRunning}
          >
            <SelectTrigger className="h-8 w-auto gap-1.5 text-xs text-muted-foreground">
              <Gavel className="h-3.5 w-3.5" />
              <SelectValue placeholder="Judge model" />
            </SelectTrigger>
            <SelectContent>
              {judgeOptions.map((o) => (
                <SelectItem
                  key={`${o.provider}:${o.model}`}
                  value={`${o.provider}:${o.model}`}
                  className="text-xs"
                >
                  {o.model} <span className="text-muted-foreground">({o.provider})</span>
                </SelectItem>
              ))}
              <SelectItem value="__configure__" className="text-xs text-muted-foreground">
                Configure judge…
              </SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs text-amber-600 border-amber-500/50 hover:text-amber-600"
            onClick={() => setJudgeConfigOpen(true)}
            disabled={isRunning}
          >
            <Gavel className="h-3.5 w-3.5" />
            Configure judge…
          </Button>
        )}

        {/* Action buttons */}
        <AnimatePresence mode="wait">
          {isRunning ? (
            <motion.div
              key="cancel"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Button
                variant="destructive"
                onClick={() => useAppStore.getState().cancelRun()}
                className="gap-2"
              >
                <Square className="h-4 w-4" />
                Cancel
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="run"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <Button
                id="run-council-button"
                onClick={handleRun}
                disabled={!canSubmit}
                className="gap-2 bg-primary hover:bg-primary/90"
              >
                <Play className="h-4 w-4" />
                Run Council
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <CompatibilityWarningDialog
        open={compatDialogOpen}
        onOpenChange={setCompatDialogOpen}
        checks={incompatibleChecks}
        onRunAnyway={() => {
          setCompatDialogOpen(false);
          runCouncil();
        }}
      />
      <JudgeConfigDialog open={judgeConfigOpen} onOpenChange={setJudgeConfigOpen} />
    </motion.div>
  );
}

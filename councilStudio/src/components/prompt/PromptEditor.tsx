import { useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppStore } from "@/stores/appStore";
import { PromptHistory } from "./PromptHistory";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Square,
  Paperclip,
  Mic,
  BookOpen,
} from "lucide-react";

const MAX_CHARS = 4000;

export function PromptEditor() {
  const {
    currentPrompt,
    setPrompt,
    members,
    isRunning,
    runCouncil,
  } = useAppStore();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const charCount = currentPrompt.length;
  const canSubmit = currentPrompt.trim().length > 0 && !isRunning;
  const enabledCount = members.filter((m) => m.enabled).length;

  const handleRun = () => {
    if (!canSubmit) return;
    runCouncil();
  };

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

      {/* Textarea */}
      <div className="relative flex-1">
        <Textarea
          ref={textareaRef}
          placeholder="Ask your council anything..."
          value={currentPrompt}
          onChange={(e) => setPrompt(e.target.value.slice(0, MAX_CHARS))}
          disabled={isRunning}
          className={cn(
            "min-h-[200px] resize-none text-sm leading-relaxed",
            "focus-visible:ring-2 focus-visible:ring-primary/30",
            isRunning && "opacity-60"
          )}
        />
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
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Mic className="h-4 w-4" />
        </Button>

        <PromptHistory onSelect={(prompt) => setPrompt(prompt)}>
          <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" />
            Templates
          </Button>
        </PromptHistory>

        <div className="flex-1" />

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
    </motion.div>
  );
}

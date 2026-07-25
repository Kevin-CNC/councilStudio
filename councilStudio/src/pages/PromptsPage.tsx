import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { PromptTemplateForm } from "@/components/prompt/PromptTemplateForm";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Pencil, Trash2, MessageSquare } from "lucide-react";
import type { PromptTemplate } from "@/types";

const CATEGORIES = ["all", "general", "brainstorming", "analysis", "review", "custom"];

export function PromptsPage() {
  const { promptTemplates, setPrompt, setCurrentView, removePromptTemplate } = useAppStore(
    useShallow((s) => ({
      promptTemplates: s.promptTemplates,
      setPrompt: s.setPrompt,
      setCurrentView: s.setCurrentView,
      removePromptTemplate: s.removePromptTemplate,
    }))
  );

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = [...promptTemplates];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
      );
    }
    if (category !== "all") {
      result = result.filter((t) => t.category === category);
    }
    result.sort((a, b) => b.createdAt - a.createdAt);
    return result;
  }, [promptTemplates, search, category]);

  const openCreate = () => {
    setEditingTemplate(null);
    setFormOpen(true);
  };

  const openEdit = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setFormOpen(true);
  };

  const useTemplate = (template: PromptTemplate) => {
    setPrompt(template.prompt);
    setCurrentView("home");
  };

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Prompts</h1>
          <p className="text-sm text-muted-foreground">
            {promptTemplates.length} template{promptTemplates.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c} className="capitalize">
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        {filtered.length === 0 ? (
          <EmptyState hasTemplates={promptTemplates.length > 0} onCreate={openCreate} />
        ) : (
          <div className="grid grid-cols-1 gap-3 pr-2 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {filtered.map((template, i) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  index={i}
                  onUse={() => useTemplate(template)}
                  onEdit={() => openEdit(template)}
                  onDelete={() => setPendingDeleteId(template.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      <PromptTemplateForm open={formOpen} onOpenChange={setFormOpen} template={editingTemplate} />

      <Dialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete template?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeleteId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDeleteId) removePromptTemplate(pendingDeleteId);
                setPendingDeleteId(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateCard({
  template,
  index,
  onUse,
  onEdit,
  onDelete,
}: {
  template: PromptTemplate;
  index: number;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.02 }}
      layout
    >
      <Card
        className="cursor-pointer transition-all hover:shadow-md hover:border-secondary/30 group"
        onClick={onUse}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-sm font-medium text-foreground line-clamp-1">{template.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
              </button>
            </div>
          </div>

          <p className="mb-3 text-xs text-muted-foreground line-clamp-2">
            {template.description || template.prompt}
          </p>

          <Badge variant="outline" className="text-[10px] capitalize">
            {template.category}
          </Badge>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function EmptyState({ hasTemplates, onCreate }: { hasTemplates: boolean; onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">
        {hasTemplates ? "No matching templates" : "No prompt templates yet"}
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        {hasTemplates ? "Try a different search or filter" : "Save a prompt to reuse it across council runs"}
      </p>
      {!hasTemplates && (
        <Button size="sm" onClick={onCreate} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      )}
    </motion.div>
  );
}

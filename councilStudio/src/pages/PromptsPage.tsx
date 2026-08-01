import { useState, useMemo, useCallback, memo, useRef } from "react";
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
import { Label } from "@/components/ui/label";
import { PromptTemplateForm } from "@/components/prompt/PromptTemplateForm";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/toaster";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Plus, Pencil, Trash2, MessageSquare, Download, Upload } from "lucide-react";
import type { PromptTemplate, MemberExportItem, TemplateExportItem } from "@/types";

/** Download a JSON string as a file in the browser. */
function downloadJSON(filename: string, json: string) {
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const CATEGORIES = ["all", "general", "brainstorming", "analysis", "review", "custom"];

export function PromptsPage() {
  const {
    promptTemplates,
    setPrompt,
    setCurrentView,
    removePromptTemplate,
    exportTemplatesToJSON,
    setImportPreviewOpen,
    setImportPreviewData,
  } = useAppStore(
    useShallow((s) => ({
      promptTemplates: s.promptTemplates,
      setPrompt: s.setPrompt,
      setCurrentView: s.setCurrentView,
      removePromptTemplate: s.removePromptTemplate,
      exportTemplatesToJSON: s.exportTemplatesToJSON,
      setImportPreviewOpen: s.setImportPreviewOpen,
      setImportPreviewData: s.setImportPreviewData,
    }))
  );

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const openCreate = useCallback(() => {
    setEditingTemplate(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((template: PromptTemplate) => {
    setEditingTemplate(template);
    setFormOpen(true);
  }, []);

  const useTemplate = useCallback(
    (template: PromptTemplate) => {
      setPrompt(template.prompt);
      setCurrentView("home");
    },
    [setPrompt, setCurrentView]
  );

  const requestDelete = useCallback((id: string) => {
    setPendingDeleteId(id);
  }, []);

  const handleExport = useCallback(() => {
    if (!exportTitle.trim()) return;
    const json = exportTemplatesToJSON(exportTitle.trim());
    const filename = `${exportTitle.trim()}-${todayStr()}.json`;
    downloadJSON(filename, json);
    setExportDialogOpen(false);
    setExportTitle("");
    toast("success", `Exported ${promptTemplates.length} template${promptTemplates.length === 1 ? "" : "s"}`);
  }, [exportTitle, exportTemplatesToJSON, promptTemplates.length]);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed.templates && Array.isArray(parsed.templates)) {
            setImportPreviewData({
              type: "templates",
              items: parsed.templates as TemplateExportItem[],
              fileName: file.name,
            });
            setImportPreviewOpen(true);
          } else if (parsed.members && Array.isArray(parsed.members)) {
            setImportPreviewData({
              type: "members",
              items: parsed.members as MemberExportItem[],
              fileName: file.name,
            });
            setImportPreviewOpen(true);
          } else {
            toast("error", "Invalid file format", "Expected 'templates' or 'members' array.");
          }
        } catch {
          toast("error", "Invalid JSON file", "Could not parse the selected file.");
        }
      };
      reader.onerror = () => {
        toast("error", "Failed to read file");
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [setImportPreviewData, setImportPreviewOpen]
  );

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Prompts</h1>
          <p className="text-sm text-muted-foreground">
            {promptTemplates.length} template{promptTemplates.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setExportDialogOpen(true)}
            disabled={promptTemplates.length === 0}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        </div>
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
              {filtered.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onUse={useTemplate}
                  onEdit={openEdit}
                  onDelete={requestDelete}
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

      {/* Export title dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Templates</DialogTitle>
            <DialogDescription>
              Enter a name for the export file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="export-title">Title</Label>
            <Input
              id="export-title"
              placeholder="My Prompt Templates"
              value={exportTitle}
              onChange={(e) => setExportTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleExport();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} disabled={!exportTitle.trim()}>
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TemplateCard = memo(function TemplateCard({
  template,
  onUse,
  onEdit,
  onDelete,
}: {
  template: PromptTemplate;
  onUse: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
      layout
    >
      <Card
        className="cursor-pointer transition-shadow hover:shadow-md hover:border-secondary/30 group contain-paint"
        onClick={() => onUse(template)}
      >
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <span className="text-sm font-medium text-foreground line-clamp-1">{template.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(template);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(template.id);
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
});

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

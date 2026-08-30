import { useState, useMemo, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberCard } from "@/components/council/MemberCard";
import { AddMemberPopover } from "@/components/council/AddMemberPopover";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/toaster";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Download,
  Upload,
  Trash2,
  Users,
  CheckSquare,
  Square,
} from "lucide-react";
import type { MemberExportItem, TemplateExportItem } from "@/types";

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

/** Format today's date as YYYY-MM-DD. */
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function MembersPage() {
  const {
    members,
    deleteMembers,
    exportMembersToJSON,
    setImportPreviewOpen,
    setImportPreviewData,
    setMemberFormOpen,
  } = useAppStore(
    useShallow((s) => ({
      members: s.members,
      deleteMembers: s.deleteMembers,
      exportMembersToJSON: s.exportMembersToJSON,
      setImportPreviewOpen: s.setImportPreviewOpen,
      setImportPreviewData: s.setImportPreviewData,
      setMemberFormOpen: s.setMemberFormOpen,
    }))
  );

  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportTitle, setExportTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedMembers = useMemo(
    () => [...members].sort((a, b) => a.order - b.order),
    [members]
  );

  const allSelected = members.length > 0 && selectedIds.size === members.length;

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(members.map((m) => m.id)));
    }
  }, [allSelected, members]);

  const handleExport = useCallback(() => {
    if (!exportTitle.trim()) return;
    const json = exportMembersToJSON(exportTitle.trim());
    const filename = `${exportTitle.trim()}-${todayStr()}.json`;
    downloadJSON(filename, json);
    setExportDialogOpen(false);
    setExportTitle("");
    toast("success", `Exported ${members.length} member${members.length === 1 ? "" : "s"}`);
  }, [exportTitle, exportMembersToJSON, members.length]);

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // Process first file (multi-file support could be added later)
      const file = files[0];
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          if (parsed.members && Array.isArray(parsed.members)) {
            setImportPreviewData({
              type: "members",
              items: parsed.members as MemberExportItem[],
              fileName: file.name,
            });
            setImportPreviewOpen(true);
          } else if (parsed.templates && Array.isArray(parsed.templates)) {
            setImportPreviewData({
              type: "templates",
              items: parsed.templates as TemplateExportItem[],
              fileName: file.name,
            });
            setImportPreviewOpen(true);
          } else {
            toast("error", "Invalid file format", "Expected 'members' or 'templates' array.");
          }
        } catch {
          toast("error", "Invalid JSON file", "Could not parse the selected file.");
        }
      };
      reader.onerror = () => {
        toast("error", "Failed to read file");
      };
      reader.readAsText(file);

      // Reset input so the same file can be re-imported
      e.target.value = "";
    },
    [setImportPreviewData, setImportPreviewOpen]
  );

  const handleMassDelete = useCallback(async () => {
    const ids = [...selectedIds];
    const count = ids.length;
    try {
      await deleteMembers(ids);
      setSelectedIds(new Set());
      setDeleteConfirmOpen(false);
      toast("success", `Deleted ${count} member${count === 1 ? "" : "s"}`);
    } catch {
      // Store already set the error state
    }
  }, [selectedIds, deleteMembers]);

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Members</h1>
          <p className="text-sm text-muted-foreground">
            {members.length} member{members.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setExportDialogOpen(true)}
            disabled={members.length === 0}
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
          <AddMemberPopover>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              Add Member
            </Button>
          </AddMemberPopover>
        </div>
      </div>

      {/* Bulk toolbar */}
      {members.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="gap-1.5">
            {allSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {allSelected ? "Deselect All" : "Select All"}
          </Button>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Member grid */}
      <ScrollArea className="flex-1">
        {members.length === 0 ? (
          <EmptyState onCreate={() => setMemberFormOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-3 pr-2 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence>
              {sortedMembers.map((persona) => (
                <motion.div
                  key={persona.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  layout
                  className="relative"
                >
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(persona.id)}
                      onChange={() => toggleSelected(persona.id)}
                      className="h-4 w-4 accent-primary"
                    />
                  </div>
                  <div className="pl-7">
                    <MemberCard persona={persona} variant="library" />
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      {/* Export title dialog */}
      <Dialog open={exportDialogOpen} onOpenChange={setExportDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Members</DialogTitle>
            <DialogDescription>
              Enter a name for the export file.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="export-title">Title</Label>
            <Input
              id="export-title"
              placeholder="My Council Members"
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

      {/* Mass delete confirmation */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} member{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleMassDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">
        No council members yet
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        Create your first AI persona to start building your council
      </p>
      <Button size="sm" onClick={onCreate} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add Member
      </Button>
    </motion.div>
  );
}
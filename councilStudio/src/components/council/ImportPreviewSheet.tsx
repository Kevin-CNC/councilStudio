import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toaster";
import {
  useAppStore,
  selectImportPreviewOpen,
  selectImportPreviewData,
} from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import type { MemberExportItem, TemplateExportItem } from "@/types";
import { Download } from "lucide-react";

function isMemberItem(item: MemberExportItem | TemplateExportItem): item is MemberExportItem {
  return "provider" in item;
}

export function ImportPreviewSheet() {
  const open = useAppStore(selectImportPreviewOpen);
  const data = useAppStore(selectImportPreviewData);
  const setImportPreviewOpen = useAppStore((s) => s.setImportPreviewOpen);
  const setImportPreviewData = useAppStore((s) => s.setImportPreviewData);
  const importMembers = useAppStore((s) => s.importMembers);
  const importTemplates = useAppStore((s) => s.importTemplates);

  const [importing, setImporting] = useState(false);

  const items = data?.items ?? [];
  const type = data?.type ?? "members";
  const fileName = data?.fileName ?? "unknown.json";

  const handleClose = () => {
    if (importing) return;
    setImportPreviewOpen(false);
    setImportPreviewData(null);
  };

  const handleImport = async () => {
    if (!data || importing) return;
    setImporting(true);
    try {
      let result: { imported: number; errors: string[] };
      if (type === "members") {
        result = await importMembers(items as MemberExportItem[]);
      } else {
        result = await importTemplates(items as TemplateExportItem[]);
      }

      if (result.imported > 0) {
        toast("success", `Imported ${result.imported} ${type === "members" ? "member" : "template"}${result.imported === 1 ? "" : "s"}`);
      }
      if (result.errors.length > 0) {
        toast("error", `${result.errors.length} failed`, result.errors.join("; "));
      }
      if (result.imported === 0 && result.errors.length === 0) {
        toast("info", "Nothing to import");
      }

      handleClose();
    } catch (e) {
      toast("error", "Import failed", String(e));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <SheetContent className="sm:max-w-lg overflow-hidden flex flex-col">
        <SheetHeader>
          <SheetTitle>Import Preview</SheetTitle>
          <SheetDescription>
            Review the data before importing.
          </SheetDescription>
        </SheetHeader>

        {/* File info */}
        <div className="flex items-center gap-2 py-2">
          <span className="text-sm font-medium text-foreground">{fileName}</span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {items.length} item{items.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {type === "members" ? (
                    <>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Provider</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Model</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Temp</th>
                    </>
                  ) : (
                    <>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Category</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Preview</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr
                    key={i}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    {type === "members" && isMemberItem(item) ? (
                      <>
                        <td className="px-3 py-2 font-medium text-foreground max-w-[120px] truncate">
                          {item.Name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {PROVIDER_LABELS[item.provider] || item.provider}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[100px] truncate">
                          {item.model}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {(item.temperature ?? 0.7).toFixed(1)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 font-medium text-foreground max-w-[120px] truncate">
                          {(item as TemplateExportItem).Name}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {(item as TemplateExportItem).category}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[200px] truncate">
                          {(item as TemplateExportItem).desc || (item as TemplateExportItem).prompt}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={handleClose} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={importing || items.length === 0} className="gap-1.5">
            <Download className="h-4 w-4" />
            {importing ? "Importing…" : `Import ${items.length} item${items.length === 1 ? "" : "s"}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/components/ui/toaster";
import {
  useAppStore,
  selectImportPreviewOpen,
  selectImportPreviewData,
} from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { MemberExportItem, TemplateExportItem, Provider } from "@/types";
import { ChevronDown, ChevronRight, Download } from "lucide-react";

function isMemberItem(item: MemberExportItem | TemplateExportItem): item is MemberExportItem {
  return "provider" in item;
}

const PROVIDER_COLORS: Record<Provider, string> = {
  anthropic: "bg-orange-100 text-orange-700 border-orange-200",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-200",
  openrouter: "bg-purple-100 text-purple-700 border-purple-200",
  ollama: "bg-slate-100 text-slate-700 border-slate-200",
};

export function ImportPreviewSheet() {
  const open = useAppStore(selectImportPreviewOpen);
  const data = useAppStore(selectImportPreviewData);
  const setImportPreviewOpen = useAppStore((s) => s.setImportPreviewOpen);
  const setImportPreviewData = useAppStore((s) => s.setImportPreviewData);
  const importMembers = useAppStore((s) => s.importMembers);
  const importTemplates = useAppStore((s) => s.importTemplates);

  const [importing, setImporting] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const items = data?.items ?? [];
  const type = data?.type ?? "members";
  const fileName = data?.fileName ?? "unknown.json";

  const handleClose = () => {
    if (importing) return;
    setImportPreviewOpen(false);
    setImportPreviewData(null);
    setExpandedIdx(null);
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
            Click an item to inspect it before importing.
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

        {/* Expandable item list */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-1.5 pb-2">
            {items.map((item, i) =>
              type === "members" && isMemberItem(item) ? (
                <MemberPreviewRow
                  key={i}
                  item={item}
                  expanded={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                />
              ) : (
                <TemplatePreviewRow
                  key={i}
                  item={item as TemplateExportItem}
                  expanded={expandedIdx === i}
                  onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
                />
              )
            )}
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

function MemberPreviewRow({
  item,
  expanded,
  onToggle,
}: {
  item: MemberExportItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const color = item.member_color || "#6366f1";
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Collapsed header — always visible */}
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <Avatar className="h-7 w-7 shrink-0 border-2" style={{ borderColor: color }}>
          <AvatarFallback
            className="text-[10px] font-bold"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {(item.Name || "?")[0]}
          </AvatarFallback>
        </Avatar>
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {item.Name || "Unnamed"}
        </span>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 shrink-0",
            PROVIDER_COLORS[item.provider] ?? ""
          )}
        >
          {PROVIDER_LABELS[item.provider] || item.provider}
        </Badge>
        <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">
          {item.model}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20">
          <DetailField label="Provider">
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] px-1.5 py-0",
                PROVIDER_COLORS[item.provider] ?? ""
              )}
            >
              {PROVIDER_LABELS[item.provider] || item.provider}
            </Badge>
          </DetailField>

          <DetailField label="Model">
            <span className="text-xs font-mono text-foreground break-all">
              {item.model}
            </span>
          </DetailField>

          <DetailField label="System Prompt">
            {item.sys_prompt ? (
              <ScrollArea className="max-h-32 rounded-md border border-border bg-background">
                <p className="px-2.5 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                  {item.sys_prompt}
                </p>
              </ScrollArea>
            ) : (
              <span className="text-xs italic text-muted-foreground">(empty)</span>
            )}
          </DetailField>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <DetailField label="Temperature">
              <span className="text-xs font-mono text-foreground">
                {(item.temperature ?? 0.7).toFixed(1)}
              </span>
            </DetailField>
            <DetailField label="Max Tokens">
              <span className="text-xs font-mono text-foreground">
                {(item.max_tkns ?? 4096).toLocaleString()}
              </span>
            </DetailField>
            <DetailField label="Reasoning">
              <span className="text-xs text-foreground capitalize">
                {item.reasoning || "medium"}
              </span>
            </DetailField>
          </div>

          <DetailField label="Color">
            <span className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full border border-border"
                style={{ backgroundColor: color }}
              />
              <span className="text-xs font-mono text-muted-foreground">{color}</span>
            </span>
          </DetailField>
        </div>
      )}
    </div>
  );
}

function TemplatePreviewRow({
  item,
  expanded,
  onToggle,
}: {
  item: TemplateExportItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {item.Name || "Unnamed"}
        </span>
        <Badge variant="outline" className="text-[10px] capitalize shrink-0">
          {item.category || "custom"}
        </Badge>
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/20">
          <DetailField label="Description">
            <span className="text-xs text-muted-foreground">
              {item.desc || <span className="italic">(none)</span>}
            </span>
          </DetailField>
          <DetailField label="Prompt">
            <ScrollArea className="max-h-32 rounded-md border border-border bg-background">
              <p className="px-2.5 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                {item.prompt}
              </p>
            </ScrollArea>
          </DetailField>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div>{children}</div>
    </div>
  );
}

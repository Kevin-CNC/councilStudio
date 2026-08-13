import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { JsonTreeView } from "./JsonTreeView";

interface RawResponseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rawResponse: string;
}

export function RawResponseDialog({
  open,
  onOpenChange,
  title,
  rawResponse,
}: RawResponseDialogProps) {
  const [copied, setCopied] = useState(false);

  const parsed = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(rawResponse) };
    } catch {
      return { ok: false as const, value: null };
    }
  }, [rawResponse]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pr-6">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="text-xs">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </DialogHeader>
        <div className="styled-scrollbar flex-1 min-h-0 max-h-[65vh] overflow-auto rounded-md border bg-muted/50">
          <div className="p-4 min-w-max">
            {parsed.ok ? (
              <JsonTreeView data={parsed.value} />
            ) : (
              <pre className="text-xs font-mono whitespace-pre">{rawResponse}</pre>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

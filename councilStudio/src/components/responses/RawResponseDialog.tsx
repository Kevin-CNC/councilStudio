import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, Check } from "lucide-react";

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

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawResponse);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
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
        <ScrollArea className="flex-1 min-h-0 rounded-md border bg-muted/50 p-4">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all">
            {rawResponse}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

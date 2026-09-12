import { useAppStore } from "@/stores/appStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink } from "lucide-react";

/**
 * Warn-before-redirect dialog for external links. Reads `pendingExternalUrl`
 * from the store; `confirmOpenExternal` stages the URL, this confirms and
 * opens it via the Tauri opener plugin. Mounted once in App.tsx.
 */
export function ExternalLinkDialog() {
  const url = useAppStore((s) => s.pendingExternalUrl);
  const setPendingExternalUrl = useAppStore((s) => s.setPendingExternalUrl);

  const close = () => setPendingExternalUrl(null);

  const confirm = async () => {
    if (!url) return;
    try {
      await openUrl(url);
      close();
    } catch (e) {
      toast("error", "Failed to open link", String(e));
    }
  };

  return (
    <Dialog open={url !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Open external link?
          </DialogTitle>
          <DialogDescription>
            You are about to open an external website.
          </DialogDescription>
        </DialogHeader>
        <div className="break-all rounded-md border border-border bg-muted/40 p-3 font-mono text-xs text-foreground">
          {url}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={confirm}>Open in Browser</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

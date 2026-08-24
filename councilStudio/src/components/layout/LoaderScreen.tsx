import { Loader2 } from "lucide-react";

/**
 * Full-screen branded loader shown while the app bootstraps (initial member /
 * council / session / template loads). Replaced by the real shell once
 * `isBootstrapped` flips true in the store.
 */
export function LoaderScreen() {
  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <img
        src="/councilStudio_logo.svg"
        alt="Council Studio logo"
        className="app-logo app-logo-light h-16 w-16"
        draggable={false}
      />
      <img
        src="/councilStudio_logo_dark.svg"
        alt=""
        aria-hidden="true"
        className="app-logo app-logo-dark h-16 w-16"
        draggable={false}
      />
      <div className="text-lg font-semibold tracking-tight">Council Studio</div>
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

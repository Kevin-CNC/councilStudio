import { create } from "zustand";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastState {
  toasts: ToastItem[];
  dismiss: (id: number) => void;
}

const AUTO_DISMISS_MS = 4000;
const MAX_TOASTS = 5;

let nextId = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  dismiss: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere (store listeners, components, bridge errors). */
export function toast(kind: ToastKind, title: string, description?: string) {
  const id = nextId++;
  useToastStore.setState((state) => ({
    toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), { id, kind, title, description }],
  }));
  setTimeout(() => useToastStore.getState().dismiss(id), AUTO_DISMISS_MS);
}

const KIND_STYLES: Record<ToastKind, { icon: typeof Info; className: string }> = {
  success: { icon: CheckCircle2, className: "text-primary" },
  error: { icon: XCircle, className: "text-destructive" },
  info: { icon: Info, className: "text-secondary" },
};

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { icon: Icon, className } = KIND_STYLES[item.kind];

  return (
    <div
      role="status"
      className="toast-in pointer-events-auto flex w-80 items-start gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{item.title}</p>
        {item.description && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>
      <button
        onClick={() => dismiss(item.id)}
        className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Fixed toast stack — render once near the app root. */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastCard key={t.id} item={t} />
      ))}
    </div>
  );
}

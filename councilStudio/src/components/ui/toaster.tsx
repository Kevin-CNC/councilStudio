import { create } from "zustand";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  description?: string;
  createdAt: number;
}

interface ToastState {
  /** Live toasts on screen — self-remove after AUTO_DISMISS_MS. */
  toasts: ToastItem[];
  /** Session-only notification history (unread). Read = removed. Newest first. */
  history: ToastItem[];
  dismiss: (id: number) => void;
  markRead: (id: number) => void;
  clearHistory: () => void;
}

// Keep in sync with the `toast-progress` animation duration in index.css.
const AUTO_DISMISS_MS = 5000;
const MAX_TOASTS = 5;
const MAX_HISTORY = 50;

let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  history: [],
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  markRead: (id) =>
    set((state) => ({ history: state.history.filter((t) => t.id !== id) })),
  clearHistory: () => set({ history: [] }),
}));

/** Fire a toast from anywhere (store listeners, components, bridge errors). */
export function toast(kind: ToastKind, title: string, description?: string) {
  const id = nextId++;
  const item: ToastItem = { id, kind, title, description, createdAt: Date.now() };
  useToastStore.setState((state) => ({
    toasts: [...state.toasts.slice(-(MAX_TOASTS - 1)), item],
    history: [item, ...state.history].slice(0, MAX_HISTORY),
  }));
  timers.set(
    id,
    setTimeout(() => useToastStore.getState().dismiss(id), AUTO_DISMISS_MS),
  );
}

export const KIND_STYLES: Record<
  ToastKind,
  { icon: typeof Info; className: string; barClassName: string }
> = {
  success: { icon: CheckCircle2, className: "text-primary", barClassName: "bg-primary" },
  error: { icon: XCircle, className: "text-destructive", barClassName: "bg-destructive" },
  info: { icon: Info, className: "text-secondary", barClassName: "bg-secondary" },
};

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const { icon: Icon, className, barClassName } = KIND_STYLES[item.kind];

  return (
    <div
      role="status"
      className="toast-in pointer-events-auto relative w-80 overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
    >
      <div className="flex items-start gap-3 p-3 pb-4">
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
      {/* Countdown bar — mirrors the auto-dismiss timer */}
      <div className={`toast-progress absolute bottom-0 left-0 h-0.5 ${barClassName}`} />
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

// Keyboard shortcut registry: types, Shift-based defaults, persistence, matching.
//
// Bindings match on `KeyboardEvent.code` (physical key) rather than `key` so
// shifted punctuation (e.g. Shift+, producing "<") matches reliably.

export type ShortcutAction =
  | "toggle-sidebar"
  | "open-settings"
  | "run-council"
  | "open-search"
  | "new-council"
  | "open-prompt-history"
  | "toggle-right-panel"
  | "switch-tab-1"
  | "switch-tab-2"
  | "switch-tab-3"
  | "switch-tab-4"
  | "switch-tab-5"
  | "switch-tab-6"
  | "escape-close";

export interface ShortcutBinding {
  code: string; // KeyboardEvent.code, e.g. "KeyK", "Digit1", "Comma", "Enter"
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  meta: boolean;
}

function bind(code: string, shift = false): ShortcutBinding {
  return { code, shift, ctrl: false, alt: false, meta: false };
}

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutBinding> = {
  "open-search": bind("KeyK", true),
  "new-council": bind("KeyN", true),
  "open-prompt-history": bind("KeyP", true),
  "toggle-sidebar": bind("KeyB", true),
  "open-settings": bind("Comma", true),
  "toggle-right-panel": bind("Period", true),
  "run-council": bind("Enter", true),
  "switch-tab-1": bind("Digit1", true),
  "switch-tab-2": bind("Digit2", true),
  "switch-tab-3": bind("Digit3", true),
  "switch-tab-4": bind("Digit4", true),
  "switch-tab-5": bind("Digit5", true),
  "switch-tab-6": bind("Digit6", true),
  "escape-close": bind("Escape"),
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  "open-search": "Open search",
  "new-council": "New council run",
  "open-prompt-history": "Open prompt history",
  "toggle-sidebar": "Toggle sidebar",
  "open-settings": "Open settings",
  "toggle-right-panel": "Toggle utility panel",
  "run-council": "Submit prompt",
  "switch-tab-1": "Switch to tab 1",
  "switch-tab-2": "Switch to tab 2",
  "switch-tab-3": "Switch to tab 3",
  "switch-tab-4": "Switch to tab 4",
  "switch-tab-5": "Switch to tab 5",
  "switch-tab-6": "Switch to tab 6",
  "escape-close": "Close panels / Cancel run",
};

/** Display order for the settings UI. */
export const SHORTCUT_ORDER: ShortcutAction[] = [
  "open-search",
  "new-council",
  "open-prompt-history",
  "toggle-sidebar",
  "toggle-right-panel",
  "open-settings",
  "run-council",
  "switch-tab-1",
  "switch-tab-2",
  "switch-tab-3",
  "switch-tab-4",
  "switch-tab-5",
  "switch-tab-6",
  "escape-close",
];

const STORAGE_KEY = "app-shortcuts";

/** Load persisted custom bindings merged over defaults. */
export function loadShortcuts(): Record<ShortcutAction, ShortcutBinding> {
  const merged = { ...DEFAULT_SHORTCUTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return merged;
    const stored = JSON.parse(raw) as Partial<Record<ShortcutAction, ShortcutBinding>>;
    for (const action of Object.keys(merged) as ShortcutAction[]) {
      const b = stored[action];
      if (b && typeof b.code === "string") {
        merged[action] = {
          code: b.code,
          shift: !!b.shift,
          ctrl: !!b.ctrl,
          alt: !!b.alt,
          meta: !!b.meta,
        };
      }
    }
  } catch {
    // corrupted storage — fall back to defaults
  }
  return merged;
}

/** Persist only bindings that differ from defaults. */
export function saveShortcuts(shortcuts: Record<ShortcutAction, ShortcutBinding>): void {
  const custom: Partial<Record<ShortcutAction, ShortcutBinding>> = {};
  for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
    if (!bindingsEqual(shortcuts[action], DEFAULT_SHORTCUTS[action])) {
      custom[action] = shortcuts[action];
    }
  }
  try {
    if (Object.keys(custom).length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    }
  } catch {
    // storage unavailable — non-fatal
  }
}

export function bindingsEqual(a: ShortcutBinding, b: ShortcutBinding): boolean {
  return (
    a.code === b.code &&
    a.shift === b.shift &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.meta === b.meta
  );
}

export function eventMatchesBinding(e: KeyboardEvent, b: ShortcutBinding): boolean {
  return (
    e.code === b.code &&
    e.shiftKey === b.shift &&
    e.ctrlKey === b.ctrl &&
    e.altKey === b.alt &&
    e.metaKey === b.meta
  );
}

/** Find the action a keyboard event is bound to, or null. */
export function matchShortcut(
  e: KeyboardEvent,
  shortcuts: Record<ShortcutAction, ShortcutBinding>
): ShortcutAction | null {
  for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
    if (eventMatchesBinding(e, shortcuts[action])) return action;
  }
  return null;
}

/** Find another action already using this binding (for conflict detection). */
export function findConflict(
  binding: ShortcutBinding,
  shortcuts: Record<ShortcutAction, ShortcutBinding>,
  excludeAction: ShortcutAction
): ShortcutAction | null {
  for (const action of Object.keys(shortcuts) as ShortcutAction[]) {
    if (action !== excludeAction && bindingsEqual(shortcuts[action], binding)) {
      return action;
    }
  }
  return null;
}

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** True when the event is only a modifier keypress (nothing to bind yet). */
export function isModifierOnly(e: KeyboardEvent): boolean {
  return MODIFIER_CODES.has(e.code);
}

const KEY_LABELS: Record<string, string> = {
  Comma: ",",
  Period: ".",
  Enter: "↵",
  Escape: "Esc",
  Space: "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Minus: "-",
  Equal: "=",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backquote: "`",
  Tab: "Tab",
  Backspace: "⌫",
  Delete: "Del",
};

/** Convert a binding into display parts, e.g. ["⇧", "K"]. */
export function formatBinding(b: ShortcutBinding): string[] {
  const parts: string[] = [];
  if (b.ctrl) parts.push("Ctrl");
  if (b.meta) parts.push("⌘");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("⇧");
  parts.push(codeLabel(b.code));
  return parts;
}

function codeLabel(code: string): string {
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

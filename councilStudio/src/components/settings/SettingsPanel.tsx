import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_LABELS,
  SHORTCUT_ORDER,
  findConflict,
  formatBinding,
  isModifierOnly,
  type ShortcutAction,
  type ShortcutBinding,
} from "@/lib/shortcuts";
import { Palette, Keyboard, Bell } from "lucide-react";

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen } = useAppStore(
    useShallow((s) => ({
      settingsOpen: s.settingsOpen,
      setSettingsOpen: s.setSettingsOpen,
    }))
  );

  return (
    <Sheet open={settingsOpen} onOpenChange={(open) => setSettingsOpen(open)}>
      <SheetContent id="settings-panel" className="sm:max-w-lg overflow-hidden">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure your council studio preferences
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] py-4">
          <Tabs defaultValue="appearance" className="w-full">
            <TabsList className="w-full justify-start bg-transparent border-b border-border p-0 h-auto gap-1">
              <TabsTrigger value="appearance" className="gap-1.5 text-xs px-3 py-2">
                <Palette className="h-3.5 w-3.5" /> Appearance
              </TabsTrigger>
              <TabsTrigger value="shortcuts" className="gap-1.5 text-xs px-3 py-2">
                <Keyboard className="h-3.5 w-3.5" /> Shortcuts
              </TabsTrigger>
              <TabsTrigger value="notifications" className="gap-1.5 text-xs px-3 py-2">
                <Bell className="h-3.5 w-3.5" /> Notifications
              </TabsTrigger>
            </TabsList>

            <TabsContent value="appearance" className="mt-4 space-y-4">
              <AppearanceSection />
            </TabsContent>
            <TabsContent value="shortcuts" className="mt-4">
              <ShortcutsSection />
            </TabsContent>
            <TabsContent value="notifications" className="mt-4">
              <NotificationsSection />
            </TabsContent>
          </Tabs>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function AppearanceSection() {
  const {
    theme,
    setTheme,
    fontSize,
    setFontSize,
    highContrast,
    setHighContrast,
    reducedMotion,
    setReducedMotion,
  } = useAppStore(
    useShallow((s) => ({
      theme: s.theme,
      setTheme: s.setTheme,
      fontSize: s.fontSize,
      setFontSize: s.setFontSize,
      highContrast: s.highContrast,
      setHighContrast: s.setHighContrast,
      reducedMotion: s.reducedMotion,
      setReducedMotion: s.setReducedMotion,
    }))
  );

  // Local preview during drag; persisted to the store only on commit so the
  // whole app doesn't re-render on every pixel of slider movement.
  const [previewSize, setPreviewSize] = useState([fontSize]);

  return (
    <div className="space-y-6">
      {/* Theme */}
      <div id="settings-theme-picker" className="space-y-2">
        <Label>Theme</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              id={`settings-theme-option-${t}`}
              onClick={() => setTheme(t)}
              className={`rounded-lg border-2 p-3 text-center transition-[border-color,background-color] ${
                theme === t ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`mx-auto mb-2 h-8 w-8 rounded-full ${
                t === "light" ? "bg-white border border-border" : "bg-gray-800"
              }`} />
              <span className="text-xs font-medium capitalize">{t}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Font size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Font Size</Label>
          <span className="text-xs font-mono text-muted-foreground">{previewSize[0]}px</span>
        </div>
        <Slider
          value={previewSize}
          onValueChange={setPreviewSize}
          onValueCommit={(v) => setFontSize(v[0])}
          min={12}
          max={18}
          step={1}
        />
      </div>

      <Separator />

      {/* Toggles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <Label>High Contrast</Label>
            <p className="text-xs text-muted-foreground">Increase text contrast for readability</p>
          </div>
          <Toggle pressed={highContrast} onPressedChange={setHighContrast}>
            {highContrast ? "On" : "Off"}
          </Toggle>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <Label>Reduced Motion</Label>
            <p className="text-xs text-muted-foreground">Minimize animations</p>
          </div>
          <Toggle pressed={reducedMotion} onPressedChange={setReducedMotion}>
            {reducedMotion ? "On" : "Off"}
          </Toggle>
        </div>
      </div>
    </div>
  );
}

function ShortcutsSection() {
  const { shortcuts, setShortcut, resetShortcuts } = useAppStore(
    useShallow((s) => ({
      shortcuts: s.shortcuts,
      setShortcut: s.setShortcut,
      resetShortcuts: s.resetShortcuts,
    }))
  );

  const [capturing, setCapturing] = useState<ShortcutAction | null>(null);
  const [conflict, setConflict] = useState<{
    action: ShortcutAction;
    binding: ShortcutBinding;
    conflictsWith: ShortcutAction;
  } | null>(null);

  // While capturing, record the next real key combo as the new binding.
  // Bare Escape cancels instead of binding.
  useEffect(() => {
    if (!capturing || conflict) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();
      if (isModifierOnly(e)) return;
      if (e.code === "Escape" && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setCapturing(null);
        return;
      }
      const binding: ShortcutBinding = {
        code: e.code,
        shift: e.shiftKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        meta: e.metaKey,
      };
      const conflictsWith = findConflict(binding, shortcuts, capturing!);
      if (conflictsWith) {
        setConflict({ action: capturing!, binding, conflictsWith });
      } else {
        setShortcut(capturing!, binding);
        setCapturing(null);
      }
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [capturing, conflict, shortcuts, setShortcut]);

  const closeCapture = useCallback(() => {
    setCapturing(null);
    setConflict(null);
  }, []);

  const applyConflictOverride = useCallback(() => {
    if (!conflict) return;
    // Bind the new action and revert the displaced one to its default
    setShortcut(conflict.action, conflict.binding);
    setShortcut(conflict.conflictsWith, DEFAULT_SHORTCUTS[conflict.conflictsWith]);
    closeCapture();
  }, [conflict, setShortcut, closeCapture]);

  return (
    <div className="space-y-1">
      {SHORTCUT_ORDER.map((action) => (
        <div
          key={action}
          className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50"
        >
          <span className="text-sm text-foreground">{SHORTCUT_LABELS[action]}</span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {formatBinding(shortcuts[action]).map((k, i, arr) => (
                <span key={i} className="flex items-center">
                  <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-mono text-foreground">
                    {k}
                  </kbd>
                  {i < arr.length - 1 && <span className="mx-0.5 text-muted-foreground">+</span>}
                </span>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              onClick={() => setCapturing(action)}
            >
              Edit
            </Button>
          </div>
        </div>
      ))}

      <div className="flex justify-end pt-3">
        <Button variant="outline" size="sm" onClick={resetShortcuts}>
          Reset to defaults
        </Button>
      </div>

      {/* Key capture dialog */}
      <Dialog open={capturing !== null} onOpenChange={(open) => !open && closeCapture()}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {capturing ? SHORTCUT_LABELS[capturing] : "Edit shortcut"}
            </DialogTitle>
            <DialogDescription>
              {conflict
                ? `This shortcut is already used by "${SHORTCUT_LABELS[conflict.conflictsWith]}". Override? The other action resets to its default.`
                : "Press the new key combination. Bare Escape cancels."}
            </DialogDescription>
          </DialogHeader>
          {conflict && (
            <DialogFooter>
              <Button variant="outline" onClick={closeCapture}>
                Cancel
              </Button>
              <Button onClick={applyConflictOverride}>Override</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotificationsSection() {
  const [desktop, setDesktop] = useState(true);
  const [sound, setSound] = useState(false);
  const [email, setEmail] = useState(false);

  return (
    <div className="space-y-4">
      {[
        { label: "Desktop Notifications", desc: "Show system notifications when runs complete", value: desktop, setter: setDesktop },
        { label: "Sound", desc: "Play a sound when run completes", value: sound, setter: setSound },
        { label: "Email Digest", desc: "Daily summary of council activity", value: email, setter: setEmail },
      ].map((n) => (
        <div key={n.label} className="flex items-center justify-between rounded-lg border border-border p-3">
          <div>
            <Label>{n.label}</Label>
            <p className="text-xs text-muted-foreground">{n.desc}</p>
          </div>
          <Toggle pressed={n.value} onPressedChange={n.setter}>
            {n.value ? "On" : "Off"}
          </Toggle>
        </div>
      ))}
    </div>
  );
}

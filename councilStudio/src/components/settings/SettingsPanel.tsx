import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { Separator } from "@/components/ui/separator";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import type { Theme } from "@/types";
import {
  Key,
  Palette,
  Keyboard,
  Bell,
  Download,
  Upload,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";

export function SettingsPanel() {
  const { settingsOpen, setSettingsOpen, theme, setTheme } = useAppStore(
    useShallow((s) => ({
      settingsOpen: s.ui.settingsOpen,
      setSettingsOpen: s.setSettingsOpen,
      theme: s.ui.theme,
      setTheme: s.setTheme,
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
          <Tabs defaultValue="api-keys" className="w-full">
            <TabsList className="w-full justify-start bg-transparent border-b border-border p-0 h-auto gap-1">
              <TabsTrigger value="api-keys" className="gap-1.5 text-xs px-3 py-2">
                <Key className="h-3.5 w-3.5" /> API Keys
              </TabsTrigger>
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

            <TabsContent value="api-keys" className="mt-4 space-y-4">
              <ApiKeysSection />
            </TabsContent>
            <TabsContent value="appearance" className="mt-4 space-y-4">
              <AppearanceSection theme={theme} setTheme={setTheme} />
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

function ApiKeysSection() {
  const [keys, setKeys] = useState({
    anthropic: "",
    openai: "",
    google: "",
    mistral: "",
  });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [tested, setTested] = useState<Record<string, boolean>>({});

  const providers = [
    { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-..." },
    { id: "openai", name: "OpenAI", placeholder: "sk-..." },
    { id: "google", name: "Google AI", placeholder: "AI..." },
    { id: "mistral", name: "Mistral", placeholder: "..." },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h4 className="text-sm font-semibold mb-1">API Keys</h4>
        <p className="text-xs text-muted-foreground">
          Keys are stored locally and never sent to our servers.
        </p>
      </div>

      {providers.map((p) => (
        <div key={p.id} className="space-y-2">
          <Label>{p.name}</Label>
          <div className="relative">
            <Input
              type={showKeys[p.id] ? "text" : "password"}
              placeholder={p.placeholder}
              value={keys[p.id as keyof typeof keys]}
              onChange={(e) => setKeys({ ...keys, [p.id]: e.target.value })}
              className="pr-20"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setShowKeys({ ...showKeys, [p.id]: !showKeys[p.id] })}
              >
                {showKeys[p.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setTested({ ...tested, [p.id]: true })}
              >
                {tested[p.id] ? (
                  <Check className="h-3 w-3 text-primary" />
                ) : (
                  "Test"
                )}
              </Button>
            </div>
          </div>
        </div>
      ))}

      <div className="pt-4 border-t border-border">
        <h4 className="text-sm font-semibold mb-3">Council Presets</h4>
        <div className="space-y-2">
          {["Fast (2 models)", "Balanced (4 models)", "Deep Analysis (6 models)"].map((preset) => (
            <div key={preset} className="flex items-center justify-between rounded-lg border border-border p-2">
              <span className="text-sm">{preset}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs">
                Load
              </Button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-3">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Import
          </Button>
        </div>
      </div>

      <Button className="w-full mt-4">Save All Keys</Button>
    </div>
  );
}

function AppearanceSection({ theme, setTheme }: { theme: Theme; setTheme: (t: Theme) => void }) {
  const [fontSize, setFontSize] = useState([14]);
  const [highContrast, setHighContrast] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

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
              className={`rounded-lg border-2 p-3 text-center transition-all ${
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
          <span className="text-xs font-mono text-muted-foreground">{fontSize[0]}px</span>
        </div>
        <Slider
          value={fontSize}
          onValueChange={setFontSize}
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
  const shortcuts = [
    { keys: ["⌘", "K"], action: "Open search" },
    { keys: ["⌘", "N"], action: "New council run" },
    { keys: ["⌘", "⇧", "P"], action: "Open prompt history" },
    { keys: ["⌘", "B"], action: "Toggle sidebar" },
    { keys: ["⌘", "."], action: "Open settings" },
    { keys: ["Esc"], action: "Close panels / Cancel run" },
    { keys: ["⌘", "↵"], action: "Submit prompt" },
    { keys: ["⌘", "1-6"], action: "Switch to tab" },
  ];

  return (
    <div className="space-y-1">
      {shortcuts.map((s) => (
        <div key={s.action} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-muted/50">
          <span className="text-sm text-foreground">{s.action}</span>
          <div className="flex items-center gap-1">
            {s.keys.map((k, i) => (
              <span key={i} className="flex items-center">
                <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded border border-border bg-muted px-1.5 text-[11px] font-mono text-foreground">
                  {k}
                </kbd>
                {i < s.keys.length - 1 && <span className="mx-0.5 text-muted-foreground">+</span>}
              </span>
            ))}
          </div>
        </div>
      ))}
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

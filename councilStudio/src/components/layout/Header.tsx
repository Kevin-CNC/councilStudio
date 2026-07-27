import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/appStore";
import { KIND_STYLES, useToastStore } from "@/components/ui/toaster";
import { useShallow } from "zustand/react/shallow";
import {
  Search,
  Bell,
  Settings,
  Sun,
  Moon,
  ChevronDown,
  Menu,
} from "lucide-react";

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export function Header() {
  const { theme, setTheme, setSettingsOpen, toggleSidebar } = useAppStore(
    useShallow((s) => ({
      theme: s.theme,
      setTheme: s.setTheme,
      setSettingsOpen: s.setSettingsOpen,
      toggleSidebar: s.toggleSidebar,
    }))
  );

  const themeIcon = theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;

  const { history, markRead, clearHistory } = useToastStore(
    useShallow((s) => ({
      history: s.history,
      markRead: s.markRead,
      clearHistory: s.clearHistory,
    }))
  );
  const unreadCount = history.length;

  return (
    <header id="app-header" className="flex h-14 items-center gap-4 border-b border-border bg-card px-4">
      {/* Mobile menu */}
      <Button
        id="header-mobile-menu-button"
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Search */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="header-search-input"
          placeholder="Search... (⌘K)"
          className="pl-9 bg-muted/50 border-transparent focus-visible:border-border"
        />
      </div>

      <div className="flex items-center gap-2">
        {/* Workspace selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id="header-workspace-button" variant="ghost" size="sm" className="gap-2 text-muted-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-primary/10 text-primary text-xs font-bold">
                W
              </span>
              <span>Workspace</span>
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem>Default Workspace</DropdownMenuItem>
            <DropdownMenuItem>Research Team</DropdownMenuItem>
            <DropdownMenuItem>+ New Workspace</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Theme toggle */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id="header-theme-toggle-button" variant="ghost" size="icon" className="text-muted-foreground">
              {themeIcon}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem id="header-theme-option-light" onClick={() => setTheme("light")}>
              <Sun className="h-4 w-4 mr-2" /> Light
            </DropdownMenuItem>
            <DropdownMenuItem id="header-theme-option-dark" onClick={() => setTheme("dark")}>
              <Moon className="h-4 w-4 mr-2" /> Dark
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button id="header-notifications-button" variant="ghost" size="icon" className="relative text-muted-foreground">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-medium">Notifications</span>
              <button
                onClick={clearHistory}
                disabled={history.length === 0}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
              >
                Clear all
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {history.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No notifications
                </p>
              ) : (
                history.map((n) => {
                  const { icon: Icon, className } = KIND_STYLES[n.kind];
                  return (
                    <div
                      key={n.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => markRead(n.id)}
                      onKeyDown={(e) => e.key === "Enter" && markRead(n.id)}
                      title="Click to mark as read"
                      className="flex cursor-pointer items-start gap-3 border-b border-border px-3 py-2 transition-colors last:border-b-0 hover:bg-muted"
                    >
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${className}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-tight">{n.title}</p>
                        {n.description && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {n.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <Button
          id="header-settings-button"
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          className="text-muted-foreground"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppStore } from "@/stores/appStore";
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

export function Header() {
  const { theme, setTheme, setSettingsOpen, toggleSidebar } = useAppStore(
    useShallow((s) => ({
      theme: s.ui.theme,
      setTheme: s.setTheme,
      setSettingsOpen: s.setSettingsOpen,
      toggleSidebar: s.toggleSidebar,
    }))
  );

  const themeIcon = theme === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />;

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
        <Button id="header-notifications-button" variant="ghost" size="icon" className="relative text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>

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

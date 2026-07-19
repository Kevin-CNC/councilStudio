import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import {
  Home,
  Users,
  MessageSquare,
  History,
  FileText,
  BookOpen,
  FolderOpen,
  BarChart3,
  Plug,
  Key,
  Settings,
  PanelLeftClose,
  PanelLeft,
  Compass,
} from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "council", label: "Council", icon: Users, badge: "6" },
  { id: "prompts", label: "Prompts", icon: MessageSquare },
  { id: "sessions", label: "Sessions", icon: History },
  { id: "templates", label: "Templates", icon: FileText },
  { id: "knowledge", label: "Knowledge Base", icon: BookOpen },
  { id: "files", label: "Files", icon: FolderOpen },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "integrations", label: "Integrations", icon: Plug },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const { sidebarOpen, toggleSidebar, setSettingsOpen, setApiKeysOpen } = useAppStore(
    useShallow((s) => ({
      sidebarOpen: s.ui.sidebarOpen,
      toggleSidebar: s.toggleSidebar,
      setSettingsOpen: s.setSettingsOpen,
      setApiKeysOpen: s.setApiKeysOpen,
    }))
  );

  const handleNavClick = (id: string) => {
    if (id === "settings") {
      setSettingsOpen(true);
    } else if (id === "api-keys") {
      setApiKeysOpen(true);
    }
  };

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-all duration-200",
        sidebarOpen ? "w-60" : "w-16"
      )}
    >
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b border-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Compass className="h-4 w-4" />
        </div>
        {sidebarOpen && (
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold text-foreground truncate">Council Studio</span>
            <span className="text-[11px] text-muted-foreground truncate">AI Council v0.1</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-2">
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.id}
              item={item}
              collapsed={!sidebarOpen}
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </nav>

        {sidebarOpen && (
          <div className="px-4 pt-6 pb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              System
            </span>
          </div>
        )}

        <nav className="flex flex-col gap-0.5 px-2 mt-2">
          {BOTTOM_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.id}
              item={item}
              collapsed={!sidebarOpen}
              onClick={() => handleNavClick(item.id)}
            />
          ))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border p-2">
        <Button
          id="sidebar-collapse-toggle"
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className={cn(
            "w-full justify-start gap-2 text-muted-foreground hover:text-foreground",
            !sidebarOpen && "justify-center px-0"
          )}
        >
          {sidebarOpen ? (
            <>
              <PanelLeftClose className="h-4 w-4" />
              <span className="text-xs">Collapse</span>
            </>
          ) : (
            <PanelLeft className="h-4 w-4" />
          )}
        </Button>
      </div>
    </aside>
  );
}

function SidebarNavItem({
  item,
  collapsed,
  onClick,
}: {
  item: NavItem;
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      id={`sidebar-nav-${item.id}`}
      onClick={onClick}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-muted hover:text-foreground",
        item.id === "council" && "bg-primary/10 text-primary hover:bg-primary/15",
        collapsed && "justify-center px-0"
      )}
      title={collapsed ? item.label : undefined}
    >
      <item.icon className={cn("h-4 w-4 shrink-0", item.id === "council" && "text-primary")} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{item.label}</span>
          {item.badge && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
              {item.badge}
            </span>
          )}
        </>
      )}
    </button>
  );
}

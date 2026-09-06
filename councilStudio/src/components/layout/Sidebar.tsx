import { memo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { History, PanelLeftClose, PanelLeft } from "lucide-react";
import {
  AnalyticsIcon,
  ApiKeyIcon,
  CouncilIcon,
  FilesIcon,
  IntegrationsIcon,
  KnowledgeBaseIcon,
  MemberIcon,
  PromptsIcon,
  SettingsIcon,
} from "@/components/icons/AppIcons";

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  /** Feature not implemented yet — shown dimmed with a "Soon" badge. */
  comingSoon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { id: "council", label: "Council", icon: CouncilIcon, badge: "6" },
  { id: "members", label: "Members", icon: MemberIcon },
  { id: "prompts", label: "Prompts", icon: PromptsIcon },
  { id: "sessions", label: "Sessions", icon: History },
  { id: "knowledge", label: "Knowledge Base", icon: KnowledgeBaseIcon, comingSoon: true },
  { id: "files", label: "Files", icon: FilesIcon, comingSoon: true },
];

const BOTTOM_ITEMS: NavItem[] = [
  { id: "analytics", label: "Analytics", icon: AnalyticsIcon, comingSoon: true },
  { id: "integrations", label: "Integrations", icon: IntegrationsIcon, comingSoon: true },
  { id: "api-keys", label: "API Keys", icon: ApiKeyIcon },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

export function Sidebar() {
  const { sidebarOpen, currentView, toggleSidebar, setSettingsOpen, setApiKeysOpen, setCurrentView } = useAppStore(
    useShallow((s) => ({
      sidebarOpen: s.sidebarOpen,
      currentView: s.currentView,
      toggleSidebar: s.toggleSidebar,
      setSettingsOpen: s.setSettingsOpen,
      setApiKeysOpen: s.setApiKeysOpen,
      setCurrentView: s.setCurrentView,
    }))
  );

  const handleNavClick = useCallback(
    (id: string) => {
      if (id === "settings") {
        setSettingsOpen(true);
      } else if (id === "api-keys") {
        setApiKeysOpen(true);
      } else if (id === "members") {
        setCurrentView("members");
      } else if (id === "home" || id === "council") {
        setCurrentView("home");
      } else if (id === "prompts" || id === "sessions") {
        setCurrentView(id);
      }
    },
    [setSettingsOpen, setApiKeysOpen, setCurrentView]
  );

  const isActive = (id: string) =>
    id === currentView || (currentView === "home" && id === "council") || (id === "members" && currentView === "members");

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-[width] duration-200 contain-paint",
        sidebarOpen ? "w-60" : "w-16"
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-14 items-center gap-2 border-b border-border px-4", !sidebarOpen && "justify-center px-0")}>
        <img
          src="/councilStudio_logo.svg"
          alt="Council Studio logo"
          className="app-logo app-logo-light h-7 w-7 shrink-0"
          draggable={false}
        />
        <img
          src="/councilStudio_logo_dark.svg"
          alt=""
          aria-hidden="true"
          className="app-logo app-logo-dark h-7 w-7 shrink-0"
          draggable={false}
        />
        {sidebarOpen && (
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold text-foreground truncate">Council Studio</span>
            <span className="text-[11px] text-muted-foreground truncate">AI Council v1.0</span>
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
              active={isActive(item.id)}
              onNavigate={handleNavClick}
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
              active={isActive(item.id)}
              onNavigate={handleNavClick}
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

const SidebarNavItem = memo(function SidebarNavItem({
  item,
  collapsed,
  active,
  onNavigate,
}: {
  item: NavItem;
  collapsed: boolean;
  active?: boolean;
  onNavigate: (id: string) => void;
}) {
  return (
    <button
      id={`sidebar-nav-${item.id}`}
      onClick={() => onNavigate(item.id)}
      className={cn(
        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "hover:bg-muted hover:text-foreground",
        active && "bg-primary/10 text-primary hover:bg-primary/15",
        collapsed && "justify-center px-0",
        item.comingSoon && "opacity-60 cursor-default"
      )}
      title={item.comingSoon ? `${item.label} — Coming soon` : collapsed ? item.label : undefined}
    >
      <item.icon className={cn("h-4 w-4 shrink-0", active && "text-primary")} />
      {!collapsed && (
        <>
          <span className="flex-1 truncate text-left">{item.label}</span>
          {item.comingSoon ? (
            <span className="flex h-5 items-center justify-center rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">
              Soon
            </span>
          ) : (
            item.badge && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold text-primary">
                {item.badge}
              </span>
            )
          )}
        </>
      )}
    </button>
  );
});

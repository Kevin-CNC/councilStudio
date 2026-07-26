import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore, selectPromptTemplates, selectSessions } from "@/stores/appStore";
import { Search, FileText, Clock } from "lucide-react";

interface PromptHistoryProps {
  onSelect: (prompt: string) => void;
  children: React.ReactNode;
}

export function PromptHistory({ onSelect, children }: PromptHistoryProps) {
  const promptTemplates = useAppStore(selectPromptTemplates);
  const sessions = useAppStore(selectSessions);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filteredTemplates = promptTemplates.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.prompt.toLowerCase().includes(search.toLowerCase())
  );

  const recentPrompts = sessions.slice(0, 5).map((s) => ({
    id: s.id,
    prompt: s.prompt,
    createdAt: s.createdAt,
  }));

  const filteredRecent = recentPrompts.filter((p) =>
    p.prompt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="p-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search prompts..."
              className="pl-8 h-8 text-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <ScrollArea className="max-h-80">
          {/* Templates */}
          {filteredTemplates.length > 0 && (
            <div className="p-2">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Templates
              </div>
              {filteredTemplates.slice(0, 5).map((template) => (
                <button
                  key={template.id}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted transition-colors"
                  onClick={() => {
                    onSelect(template.prompt);
                    setOpen(false);
                  }}
                >
                  <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-secondary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">
                      {template.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">
                      {template.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Recent */}
          {filteredRecent.length > 0 && (
            <div className="p-2 border-t border-border">
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </div>
              {filteredRecent.map((p) => (
                <button
                  key={p.id}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left hover:bg-muted transition-colors"
                  onClick={() => {
                    onSelect(p.prompt);
                    setOpen(false);
                  }}
                >
                  <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-foreground line-clamp-2">
                      {p.prompt}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {filteredTemplates.length === 0 && filteredRecent.length === 0 && (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No matching prompts found
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppStore } from "@/stores/appStore";
import { motion } from "framer-motion";
import {
  GripVertical,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Persona, Provider } from "@/types";

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  ollama: "Ollama",
};

const PROVIDER_COLORS: Record<Provider, string> = {
  anthropic: "bg-orange-100 text-orange-700 border-orange-200",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-200",
  openrouter: "bg-purple-100 text-purple-700 border-purple-200",
  ollama: "bg-slate-100 text-slate-700 border-slate-200",
};

interface MemberCardProps {
  persona: Persona;
  index: number;
  isStreaming?: boolean;
  dragHandleProps?: any;
}

export function MemberCard({ persona, index, isStreaming, dragHandleProps }: MemberCardProps) {
  const { setMemberFormOpen, deleteMember, duplicateMember, toggleMemberEnabled } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05 }}
    >
      <Card
        className={cn(
          "group relative transition-all hover:shadow-md",
          !persona.enabled && "opacity-60"
        )}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            {/* Drag handle */}
            <div
              {...dragHandleProps}
              className="flex h-8 w-4 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <GripVertical className="h-4 w-4" />
            </div>

            {/* Avatar */}
            <Avatar className="h-9 w-9 shrink-0 border-2" style={{ borderColor: persona.color }}>
              <AvatarFallback
                className="text-xs font-bold"
                style={{ backgroundColor: `${persona.color}20`, color: persona.color }}
              >
                {persona.name[0]}
              </AvatarFallback>
            </Avatar>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground truncate">
                  {persona.name}
                </span>
                {isStreaming && (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 mb-1.5">
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0", PROVIDER_COLORS[persona.provider])}
                >
                  {PROVIDER_LABELS[persona.provider]}
                </Badge>
                <span className="text-[11px] text-muted-foreground truncate">
                  {persona.model}
                </span>
              </div>

              {/* Temperature indicator */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">Temp:</span>
                <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-secondary transition-all"
                    style={{ width: `${(persona.temperature / 2) * 100}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground w-6 text-right">
                  {persona.temperature.toFixed(1)}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                onClick={() => toggleMemberEnabled(persona.id)}
                title={persona.enabled ? "Disable" : "Enable"}
              >
                {persona.enabled ? (
                  <Eye className="h-3 w-3" />
                ) : (
                  <EyeOff className="h-3 w-3" />
                )}
              </Button>

              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                  >
                    <MoreVertical className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setMemberFormOpen(true, persona.id)}>
                    <Edit className="h-3.5 w-3.5 mr-2" /> Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateMember(persona.id)}>
                    <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => deleteMember(persona.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

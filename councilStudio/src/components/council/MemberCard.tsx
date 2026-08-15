import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAppStore } from "@/stores/appStore";
import { PROVIDER_LABELS } from "@/lib/constants";
import { motion } from "framer-motion";
import {
  GripVertical,
  MoreVertical,
  Edit,
  Copy,
  Trash2,
  UserMinus,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ArrowLeftRight,
} from "lucide-react";
import { memo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Persona, Provider, MemberRunStatus } from "@/types";

const PROVIDER_COLORS: Record<Provider, string> = {
  anthropic: "bg-orange-100 text-orange-700 border-orange-200",
  openai: "bg-emerald-100 text-emerald-700 border-emerald-200",
  openrouter: "bg-purple-100 text-purple-700 border-purple-200",
  ollama: "bg-slate-100 text-slate-700 border-slate-200",
};

const RUN_STATUS_UI: Record<
  MemberRunStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  waiting: {
    label: "Queued",
    className: "text-muted-foreground",
    icon: <Clock className="h-3 w-3" />,
  },
  thinking: {
    label: "Thinking…",
    className: "text-blue-600 dark:text-blue-400",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  completed: {
    label: "Done",
    className: "text-green-600 dark:text-green-400",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    className: "text-destructive",
    icon: <XCircle className="h-3 w-3" />,
  },
  cancelled: {
    label: "Cancelled",
    className: "text-muted-foreground",
    icon: <Ban className="h-3 w-3" />,
  },
};

interface MemberCardProps {
  persona: Persona;
  runStatus?: MemberRunStatus;
  dragHandleProps?: any;
  /** "council" (default) shows a remove-from-council action; "library" shows enable/disable. */
  variant?: "council" | "library";
}

export const MemberCard = memo(function MemberCard({ persona, runStatus, dragHandleProps, variant = "council" }: MemberCardProps) {
  const setMemberFormOpen = useAppStore((s) => s.setMemberFormOpen);
  const deleteMember = useAppStore((s) => s.deleteMember);
  const duplicateMember = useAppStore((s) => s.duplicateMember);
  const currentCouncilId = useAppStore((s) => s.currentCouncilId);
  const removeMemberFromCouncil = useAppStore((s) => s.removeMemberFromCouncil);
  const toggleMemberEnabled = useAppStore((s) => s.toggleMemberEnabled);
  const setSwapTargetId = useAppStore((s) => s.setSwapTargetId);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card
        className={cn(
          "group relative transition-shadow hover:shadow-md contain-paint",
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
                {runStatus && (
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[10px] font-medium",
                      RUN_STATUS_UI[runStatus].className
                    )}
                  >
                    {RUN_STATUS_UI[runStatus].icon}
                    {RUN_STATUS_UI[runStatus].label}
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
                    className="h-full rounded-full bg-secondary transition-[width]"
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
              {variant === "library" ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                  onClick={() => toggleMemberEnabled(persona.id)}
                  title={
                    persona.enabled
                      ? "Disable — unavailable for councils"
                      : "Enable — available for councils"
                  }
                >
                  {persona.enabled ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                  onClick={() =>
                    currentCouncilId &&
                    removeMemberFromCouncil(currentCouncilId, persona.id)
                  }
                  title="Remove from council"
                >
                  <UserMinus className="h-3 w-3" />
                </Button>
              )}

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
                  <DropdownMenuItem onClick={() => setSwapTargetId(persona.id)}>
                    <ArrowLeftRight className="h-3.5 w-3.5 mr-2" /> Swap
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
});

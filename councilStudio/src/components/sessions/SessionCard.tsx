import { memo } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatTokens, formatCost, formatDuration } from "@/lib/utils";
import { STATUS_STYLES } from "@/lib/constants";
import { Pin, Clock, Users, DollarSign, Timer, Trash2 } from "lucide-react";
import type { Session } from "@/types";

interface SessionCardProps {
  session: Session;
  onSelect: () => void;
  onPin: () => void;
  onDelete?: () => void;
  variant?: "compact" | "full";
}

export const SessionCard = memo(function SessionCard({
  session,
  onSelect,
  onPin,
  onDelete,
  variant = "compact",
}: SessionCardProps) {
  if (variant === "full") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        layout
      >
        <Card
          className="cursor-pointer transition-shadow hover:shadow-md hover:border-secondary/30 group contain-paint"
          onClick={onSelect}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-foreground line-clamp-2">
                {session.title}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onPin(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pin className={cn("h-3.5 w-3.5", session.pinned ? "fill-yellow-400 text-yellow-400 opacity-100" : "text-muted-foreground")} />
                </button>
                {onDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                  </button>
                )}
              </div>
            </div>

            <div className="mb-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {new Date(session.createdAt).toLocaleDateString(undefined, {
                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
              })}
              <span className="truncate">· {session.configName}</span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{session.personaCount}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="text-muted-foreground">Tok:</span>
                  <span className="text-foreground font-medium">{formatTokens(session.tokensUsed)}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{formatCost(session.totalCost)}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <Timer className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{formatDuration(session.durationMs)}</span>
                </span>
              </div>
              <Badge variant="outline" className={cn("shrink-0 text-[10px]", STATUS_STYLES[session.status])}>
                {session.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Compact variant (used in sidebar SessionList)
  return (
    <motion.div
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
      layout
    >
      <Card
        className="cursor-pointer transition-shadow hover:shadow-md hover:border-secondary/30 group contain-paint"
        onClick={onSelect}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs font-medium text-foreground line-clamp-1">
                  {session.title}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onPin(); }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Pin className={cn("h-3 w-3", session.pinned ? "fill-yellow-400 text-yellow-400 opacity-100" : "text-muted-foreground")} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-2">
                <span className="flex items-center gap-0.5">
                  <Clock className="h-3 w-3" />
                  {new Date(session.createdAt).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })}
                </span>
                <span className="truncate">· {session.configName}</span>
              </div>

              <div className="flex items-center gap-3 text-[10px]">
                <span className="flex items-center gap-0.5">
                  <Users className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{session.personaCount}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <span className="text-muted-foreground">Tokens:</span>
                  <span className="text-foreground font-medium">{formatTokens(session.tokensUsed)}</span>
                </span>
                <span className="flex items-center gap-0.5">
                  <DollarSign className="h-3 w-3 text-muted-foreground" />
                  <span className="text-foreground font-medium">{formatCost(session.totalCost)}</span>
                </span>
              </div>
            </div>

            <Badge variant="outline" className={cn("shrink-0 text-[10px]", STATUS_STYLES[session.status])}>
              {session.status}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
});

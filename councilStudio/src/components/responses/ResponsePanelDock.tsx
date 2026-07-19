import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useAppStore } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { ResponsePanel } from "./ResponsePanel";
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN_HEIGHT = 200;
const BOTTOM_MARGIN = 200;

export function ResponsePanelDock() {
  const { height, collapsed, setHeight, toggleCollapsed } = useAppStore(
    useShallow((s) => ({
      height: s.ui.responsePanelHeight,
      collapsed: s.ui.responsePanelCollapsed,
      setHeight: s.setResponsePanelHeight,
      toggleCollapsed: s.toggleResponsePanelCollapsed,
    }))
  );

  const [isDragging, setIsDragging] = useState(false);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHeightRef = useRef(height);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const delta = startYRef.current - e.clientY;
      const maxHeight = window.innerHeight - BOTTOM_MARGIN;
      const next = Math.min(maxHeight, Math.max(MIN_HEIGHT, startHeightRef.current + delta));
      setHeight(next);
    },
    [setHeight]
  );

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
    setIsDragging(false);
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
  }, [handlePointerMove]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    setIsDragging(true);
    startYRef.current = e.clientY;
    startHeightRef.current = height;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  if (collapsed) {
    return (
      <button
        id="response-panel-expand-button"
        onClick={toggleCollapsed}
        className="flex h-10 w-full flex-shrink-0 items-center justify-center gap-2 border-t border-border bg-card text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        Show Responses
      </button>
    );
  }

  return (
    <div id="response-panel-dock" className="flex flex-shrink-0 flex-col" style={{ height }}>
      <div
        id="response-panel-resize-handle"
        onPointerDown={handlePointerDown}
        className={cn(
          "group flex h-2.5 w-full flex-shrink-0 cursor-row-resize items-center justify-center border-t border-border bg-card",
          isDragging && "bg-muted"
        )}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/50 group-hover:text-muted-foreground" />
      </div>

      <div id="response-panel-dock-header" className="flex items-center justify-between border-b border-border bg-card px-3 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Responses
        </span>
        <button
          id="response-panel-collapse-button"
          onClick={toggleCollapsed}
          title="Hide responses"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        <ResponsePanel />
      </div>
    </div>
  );
}

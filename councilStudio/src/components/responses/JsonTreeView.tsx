import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function valueClass(value: JsonValue): string {
  if (value === null) return "text-muted-foreground";
  switch (typeof value) {
    case "string":
      return "text-emerald-600 dark:text-emerald-400";
    case "number":
      return "text-blue-600 dark:text-blue-400";
    case "boolean":
      return "text-amber-600 dark:text-amber-400";
    default:
      return "";
  }
}

function renderPrimitive(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

interface JsonNodeProps {
  name: string | null;
  value: JsonValue;
  depth: number;
  defaultCollapsed: boolean;
}

function JsonNode({ name, value, depth, defaultCollapsed }: JsonNodeProps) {
  const isArray = Array.isArray(value);
  const isObject = !isArray && typeof value === "object" && value !== null;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  if (!isArray && !isObject) {
    return (
      <div className="whitespace-nowrap pl-4" style={{ paddingLeft: depth * 16 + 16 }}>
        {name !== null && (
          <span className="text-sky-700 dark:text-sky-300">"{name}"</span>
        )}
        {name !== null && <span className="text-muted-foreground">: </span>}
        <span className={valueClass(value)}>{renderPrimitive(value)}</span>
      </div>
    );
  }

  const entries = isArray
    ? (value as JsonValue[]).map((v, i) => [String(i), v] as const)
    : Object.entries(value as Record<string, JsonValue>);
  const openBrace = isArray ? "[" : "{";
  const closeBrace = isArray ? "]" : "}";

  return (
    <div className="whitespace-nowrap">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="inline-flex items-center gap-0.5 hover:bg-muted/60 rounded-sm"
        style={{ paddingLeft: depth * 16 }}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        {name !== null && (
          <span className="text-sky-700 dark:text-sky-300">"{name}"</span>
        )}
        {name !== null && <span className="text-muted-foreground">: </span>}
        <span className="text-muted-foreground">{openBrace}</span>
        {collapsed && (
          <span className="text-muted-foreground/70 italic">
            {" "}
            {entries.length} {entries.length === 1 ? "item" : "items"} {closeBrace}
          </span>
        )}
      </button>
      {!collapsed && (
        <>
          {entries.map(([k, v]) => (
            <JsonNode
              key={k}
              name={isArray ? null : k}
              value={v}
              depth={depth + 1}
              defaultCollapsed={defaultCollapsed}
            />
          ))}
          <div className="text-muted-foreground" style={{ paddingLeft: depth * 16 }}>
            {closeBrace}
          </div>
        </>
      )}
    </div>
  );
}

interface JsonTreeViewProps {
  data: JsonValue;
  defaultCollapsed?: boolean;
  className?: string;
}

export function JsonTreeView({ data, defaultCollapsed = false, className }: JsonTreeViewProps) {
  return (
    <div className={cn("text-xs font-mono", className)}>
      <JsonNode name={null} value={data} depth={0} defaultCollapsed={defaultCollapsed} />
    </div>
  );
}

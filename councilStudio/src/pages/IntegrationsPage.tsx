import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore, countMcpUsage } from "@/stores/appStore";
import { useShallow } from "zustand/react/shallow";
import { toast } from "@/components/ui/toaster";
import { motion } from "framer-motion";
import {
  Plus,
  Plug,
  Trash2,
  Pencil,
  Loader2,
  RefreshCw,
  Users,
  UserMinus,
  Terminal,
  Globe,
} from "lucide-react";
import type { McpServer, McpServerCreate, McpTransport } from "@/types";

/** Result of the last connection probe, keyed by server id (or "draft"). */
interface ProbeState {
  checking: boolean;
  ok?: boolean;
  toolCount?: number;
  error?: string;
}

/** Parse a `KEY=VALUE`-per-line textarea into a record. Blank lines skipped. */
function parseKeyValueLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

function toKeyValueLines(rec: Record<string, string>): string {
  return Object.entries(rec)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

// --- Row-table machinery (args + env) ---------------------------------------

type ArgType = "flag" | "option" | "positional";
type EnvType = "plain" | "secret";
type AnyRow<RowType extends string> = { id: string; name: string; value: string; type: RowType };
type ArgRow = AnyRow<ArgType>;
type EnvRow = AnyRow<EnvType>;

const ARG_TYPES: { id: ArgType; label: string }[] = [
  { id: "flag", label: "flag" },
  { id: "option", label: "option" },
  { id: "positional", label: "positional" },
];
const ENV_TYPES: { id: EnvType; label: string }[] = [
  { id: "plain", label: "plain" },
  { id: "secret", label: "secret" },
];

function newRow<RowType extends string>(type: RowType): AnyRow<RowType> {
  return { id: crypto.randomUUID(), name: "", value: "", type };
}

/**
 * Flatten CLI args back into rows (edit form). Leading-dash entries bind with
 * the next bare value as an `option` pair; bare values are `positional`.
 */
function argsToRows(args: string[]): ArgRow[] {
  const rows: ArgRow[] = [];
  let i = 0;
  while (i < args.length) {
    const a = args[i];
    if (a.startsWith("-")) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        rows.push({ ...newRow<ArgType>("option"), name: a, value: next });
        i += 2;
      } else {
        rows.push({ ...newRow<ArgType>("flag"), name: a });
        i += 1;
      }
    } else {
      rows.push({ ...newRow<ArgType>("positional"), value: a });
      i += 1;
    }
  }
  return rows;
}

/** Serialize arg rows back to the CLI arg array the backend stores. */
function rowsToArgs(rows: ArgRow[]): string[] {
  return rows.flatMap((r) => {
    const name = r.name.trim();
    const value = r.value.trim();
    if (r.type === "flag") return name ? [name] : [];
    if (r.type === "option") {
      if (!name) return [];
      return value ? [name, value] : [name];
    }
    return value ? [value] : [];
  });
}

export function IntegrationsPage() {
  const {
    mcpServers,
    members,
    removeMcpServer,
    assignMcpToMembers,
    removeMcpFromAll,
    probeMcpConnection,
  } = useAppStore(
    useShallow((s) => ({
      mcpServers: s.mcpServers,
      members: s.members,
      removeMcpServer: s.removeMcpServer,
      assignMcpToMembers: s.assignMcpToMembers,
      removeMcpFromAll: s.removeMcpFromAll,
      probeMcpConnection: s.probeMcpConnection,
    }))
  );

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McpServer | null>(null);
  const [probes, setProbes] = useState<Record<string, ProbeState>>({});
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const setProbe = useCallback((id: string, patch: Partial<ProbeState>) => {
    setProbes((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  /** Card-level test: blank env/bearer → backend falls back to stored secrets. */
  const handleCardTest = useCallback(
    async (server: McpServer) => {
      setProbe(server.id, { checking: true, error: undefined });
      const result = await probeMcpConnection(
        {
          name: server.name,
          transport: server.transport,
          command: server.command,
          args: server.args,
          url: server.url,
          headers: server.headers,
        },
        server.id
      );
      setProbe(server.id, {
        checking: false,
        ok: result.ok,
        toolCount: result.ok ? result.tools.length : undefined,
        error: result.error ?? undefined,
      });
      if (result.ok) {
        toast("success", `${server.name} connected`, `${result.tools.length} tool(s) advertised`);
      } else {
        toast("error", `${server.name} unreachable`, result.error ?? undefined);
      }
    },
    [probeMcpConnection, setProbe]
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await removeMcpServer(deleteTarget.id);
      toast("success", `Deleted ${deleteTarget.name}`);
    } catch {
      // store sets error state
    }
    setDeleteTarget(null);
  }, [deleteTarget, removeMcpServer]);

  const handleAssignAll = useCallback(
    async (server: McpServer) => {
      setBulkBusy(server.id);
      try {
        await assignMcpToMembers(server.id, members.map((m) => m.id));
        toast("success", `${server.name} assigned to all members`);
      } catch {
        // store sets error state
      }
      setBulkBusy(null);
    },
    [members, assignMcpToMembers]
  );

  const handleRemoveAll = useCallback(
    async (server: McpServer) => {
      setBulkBusy(server.id);
      try {
        await removeMcpFromAll(server.id);
        toast("success", `${server.name} removed from all members`);
      } catch {
        // store sets error state
      }
      setBulkBusy(null);
    },
    [removeMcpFromAll]
  );

  return (
    <div className="flex h-full flex-col p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            {mcpServers.length} MCP server{mcpServers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditingServer(null);
            setSheetOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Server
        </Button>
      </div>

      {/* Server list */}
      <ScrollArea className="flex-1">
        {mcpServers.length === 0 ? (
          <EmptyState
            onCreate={() => {
              setEditingServer(null);
              setSheetOpen(true);
            }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 pr-2 md:grid-cols-2 xl:grid-cols-3">
            {mcpServers.map((server) => {
              const usage = countMcpUsage(members, server.id);
              const probe = probes[server.id];
              return (
                <motion.div
                  key={server.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Status dot: gray unknown, green connected, red failed */}
                      <span
                        className={cn(
                          "h-2.5 w-2.5 shrink-0 rounded-full",
                          probe?.checking
                            ? "bg-yellow-500 animate-pulse"
                            : probe?.ok === true
                              ? "bg-green-500"
                              : probe?.ok === false
                                ? "bg-red-500"
                                : "bg-muted-foreground/40"
                        )}
                        title={
                          probe?.checking
                            ? "Checking…"
                            : probe?.ok === true
                              ? "Connected"
                              : probe?.ok === false
                                ? (probe.error ?? "Connection failed")
                                : "Not tested"
                        }
                      />
                      {server.transport === "stdio" ? (
                        <Terminal className="h-4 w-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate text-sm font-medium text-foreground">
                        {server.name}
                      </span>
                    </div>
                    <Badge variant="secondary">{server.transport}</Badge>
                  </div>

                  <p className="mt-2 truncate font-mono text-xs text-muted-foreground" title={server.transport === "stdio" ? `${server.command} ${server.args.join(" ")}` : server.url}>
                    {server.transport === "stdio"
                      ? `${server.command} ${server.args.join(" ")}`
                      : server.url}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {probe?.ok && probe.toolCount !== undefined && (
                      <Badge variant="outline">
                        {probe.toolCount} tool{probe.toolCount === 1 ? "" : "s"}
                      </Badge>
                    )}
                    {usage === 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        unused
                      </Badge>
                    ) : (
                      <Badge variant="outline">
                        {usage} member{usage === 1 ? "" : "s"}
                      </Badge>
                    )}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      disabled={probe?.checking}
                      onClick={() => handleCardTest(server)}
                    >
                      {probe?.checking ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1"
                      onClick={() => {
                        setEditingServer(server);
                        setSheetOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(server)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 text-xs"
                      disabled={bulkBusy === server.id || members.length === 0}
                      onClick={() => handleAssignAll(server)}
                    >
                      <Users className="h-3.5 w-3.5" />
                      Assign to all
                    </Button>
                    {usage > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        disabled={bulkBusy === server.id}
                        onClick={() => handleRemoveAll(server)}
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                        Remove from all
                      </Button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Add/edit sheet */}
      <McpServerSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        editing={editingServer}
        probe={probes["draft"]}
        onProbe={setProbe}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This removes the server, its stored credentials, and every member
              assignment. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-24 text-center"
    >
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Plug className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="mb-1 text-sm font-medium text-foreground">
        No MCP servers yet
      </p>
      <p className="mb-4 text-xs text-muted-foreground">
        Connect a Model Context Protocol server to give members tools
      </p>
      <Button size="sm" onClick={onCreate} className="gap-1.5">
        <Plus className="h-4 w-4" />
        Add Server
      </Button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Add/edit sheet
// ---------------------------------------------------------------------------

function McpServerSheet({
  open,
  onOpenChange,
  editing,
  probe,
  onProbe,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: McpServer | null;
  probe?: ProbeState;
  onProbe: (id: string, patch: Partial<ProbeState>) => void;
}) {
  const { addMcpServer, editMcpServer, probeMcpConnection } = useAppStore(
    useShallow((s) => ({
      addMcpServer: s.addMcpServer,
      editMcpServer: s.editMcpServer,
      probeMcpConnection: s.probeMcpConnection,
    }))
  );

  const isEditing = !!editing;

  const [name, setName] = useState("");
  const [transport, setTransport] = useState<McpTransport>("stdio");
  const [command, setCommand] = useState("");
  const [argRows, setArgRows] = useState<ArgRow[]>([]);
  const [envRows, setEnvRows] = useState<EnvRow[]>([]);
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Env key names as loaded when editing started — drives delete detection. */
  const [initialEnvKeys, setInitialEnvKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setTransport(editing.transport);
      setCommand(editing.command);
      setArgRows(argsToRows(editing.args));
      // Env values are secrets and never echoed — rows show blank values,
      // meaning "keep stored".
      setEnvRows(
        editing.envKeys.map((k) => ({ ...newRow<EnvType>("plain"), name: k }))
      );
      setInitialEnvKeys(editing.envKeys);
      setUrl(editing.url);
      setHeadersText(toKeyValueLines(editing.headers));
      setBearerToken("");
    } else {
      setName("");
      setTransport("stdio");
      setCommand("");
      setArgRows([]);
      setEnvRows([]);
      setInitialEnvKeys([]);
      setUrl("");
      setHeadersText("");
      setBearerToken("");
    }
    setFormError(null);
  }, [editing, open]);

  const buildConfig = useCallback((): McpServerCreate => {
    // Env payload — backend merges per key: non-empty sets, empty deletes,
    // absent keeps. Existing keys with a blank value are omitted (= keep);
    // keys dropped from the table are sent empty (= delete).
    const env: Record<string, string> = {};
    if (isEditing) {
      const currentKeys = new Set(envRows.map((r) => r.name.trim()).filter(Boolean));
      for (const r of envRows) {
        const k = r.name.trim();
        const v = r.value.trim();
        if (!k || v === "") continue;
        env[k] = r.value;
      }
      for (const k of initialEnvKeys) {
        if (!currentKeys.has(k)) env[k] = "";
      }
    } else {
      for (const r of envRows) {
        const k = r.name.trim();
        if (!k) continue;
        env[k] = r.value;
      }
    }
    return {
      name: name.trim(),
      transport,
      command: command.trim(),
      args: rowsToArgs(argRows),
      env,
      url: url.trim(),
      headers: parseKeyValueLines(headersText),
      bearerToken: bearerToken.trim() || undefined,
    };
  }, [name, transport, command, argRows, envRows, initialEnvKeys, url, headersText, bearerToken, isEditing]);

  const formValid =
    name.trim().length > 0 &&
    (transport === "stdio" ? command.trim().length > 0 : /^https?:\/\//.test(url.trim()));

  const handleTest = useCallback(async () => {
    onProbe("draft", { checking: true, error: undefined });
    const result = await probeMcpConnection(buildConfig(), editing?.id);
    onProbe("draft", {
      checking: false,
      ok: result.ok,
      toolCount: result.ok ? result.tools.length : undefined,
      error: result.error ?? undefined,
    });
  }, [buildConfig, editing, probeMcpConnection, onProbe]);

  const handleSave = useCallback(async () => {
    if (!formValid) return;
    setSaving(true);
    setFormError(null);
    const config = buildConfig();
    try {
      if (isEditing && editing) {
        await editMcpServer({ id: editing.id, ...config });
        toast("success", `Updated ${config.name}`);
      } else {
        await addMcpServer(config);
        toast("success", `Added ${config.name}`);
      }
      onOpenChange(false);
    } catch (e) {
      setFormError(String(e));
    } finally {
      setSaving(false);
    }
  }, [formValid, buildConfig, isEditing, editing, editMcpServer, addMcpServer, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md overflow-hidden">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit MCP Server" : "Add MCP Server"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Update this server's configuration. Secrets left blank are kept."
              : "Configure a Model Context Protocol server. New servers start assigned to no members."}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-200px)] py-4">
          <div className="space-y-5 pr-3">
            {/* Name */}
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Local tools, Web search"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Transport */}
            <div className="space-y-2">
              <Label>Transport</Label>
              <Select value={transport} onValueChange={(v) => setTransport(v as McpTransport)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">stdio (local command)</SelectItem>
                  <SelectItem value="http">HTTP (streamable / SSE)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transport === "stdio" ? (
              <>
                {/* Command */}
                <div className="space-y-2">
                  <Label>Command</Label>
                  <Input
                    placeholder="e.g., npx, python, /usr/local/bin/mcp-server"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                  />
                </div>

                {/* Args */}
                <div className="space-y-2">
                  <Label>Arguments</Label>
                  <TrioTable<ArgType>
                    rows={argRows}
                    onChange={setArgRows}
                    typeOptions={ARG_TYPES}
                    namePlaceholder="-y, --port"
                    valuePlaceholder="value"
                    nameDisabled={(row) => row.type === "positional"}
                    valueDisabled={(row) => row.type === "flag"}
                  />
                </div>

                {/* Env */}
                <div className="space-y-2">
                  <Label>Environment Variables</Label>
                  <TrioTable<EnvType>
                    rows={envRows}
                    onChange={setEnvRows}
                    typeOptions={ENV_TYPES}
                    namePlaceholder="KEY"
                    valuePlaceholder="stored encrypted"
                    maskValue={(row) => row.type === "secret"}
                  />
                  {isEditing && (
                    <p className="text-xs text-muted-foreground">
                      Existing keys show a blank value — leave blank to keep the
                      stored secret, type a value to replace it, or delete the
                      row to remove the key.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* URL */}
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    placeholder="https://example.com/mcp"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                  />
                </div>

                {/* Bearer token */}
                <div className="space-y-2">
                  <Label>Bearer Token</Label>
                  <Input
                    type="password"
                    placeholder={
                      isEditing && editing?.hasBearer
                        ? "Token stored — leave blank to keep, type to replace"
                        : "Optional. Stored encrypted."
                    }
                    value={bearerToken}
                    onChange={(e) => setBearerToken(e.target.value)}
                  />
                </div>

                {/* Headers */}
                <div className="space-y-2">
                  <Label>Extra Headers</Label>
                  <Textarea
                    placeholder={"KEY=VALUE per line (non-secret)."}
                    value={headersText}
                    onChange={(e) => setHeadersText(e.target.value)}
                    className="min-h-[80px] resize-none font-mono text-xs"
                  />
                </div>
              </>
            )}

            {/* Test connection */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <Label>Connection</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={!formValid || probe?.checking}
                  onClick={handleTest}
                >
                  {probe?.checking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Test Connection
                </Button>
              </div>
              {probe && !probe.checking && probe.ok !== undefined && (
                <p
                  className={cn(
                    "text-xs",
                    probe.ok ? "text-green-600 dark:text-green-400" : "text-destructive"
                  )}
                >
                  {probe.ok
                    ? `Connected — ${probe.toolCount} tool${probe.toolCount === 1 ? "" : "s"} advertised.`
                    : (probe.error ?? "Connection failed.")}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>

        <SheetFooter className="gap-2 pt-4 border-t border-border">
          {formError && <p className="w-full text-xs text-destructive">{formError}</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!formValid || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Add Server"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Row table — name / value / type rows for args and environment variables.
// ---------------------------------------------------------------------------

function TrioTable<RowType extends string>({
  rows,
  onChange,
  typeOptions,
  namePlaceholder,
  valuePlaceholder,
  nameDisabled,
  valueDisabled,
  maskValue,
}: {
  rows: AnyRow<RowType>[];
  onChange: (rows: AnyRow<RowType>[]) => void;
  typeOptions: { id: RowType; label: string }[];
  namePlaceholder: string;
  valuePlaceholder: string;
  /** Row-dependent input lock (e.g. positional args have no name). */
  nameDisabled?: (row: AnyRow<RowType>) => boolean;
  valueDisabled?: (row: AnyRow<RowType>) => boolean;
  /** Row-dependent value masking (env type "secret"). */
  maskValue?: (row: AnyRow<RowType>) => boolean;
}) {
  const patchRow = (id: string, patch: Partial<AnyRow<RowType>>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-1.5">
      {rows.length > 0 && (
        <div className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1.5 text-[10px] uppercase text-muted-foreground">
          <span>name</span>
          <span>value</span>
          <span>type</span>
          <span />
        </div>
      )}
      {rows.map((row) => (
        <div
          key={row.id}
          className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-1.5"
        >
          <Input
            placeholder={nameDisabled?.(row) ? "—" : namePlaceholder}
            value={row.name}
            disabled={nameDisabled?.(row)}
            onChange={(e) => patchRow(row.id, { name: e.target.value })}
            className="h-8 font-mono text-xs"
          />
          <Input
            type={maskValue?.(row) ? "password" : "text"}
            placeholder={valueDisabled?.(row) ? "—" : valuePlaceholder}
            value={row.value}
            disabled={valueDisabled?.(row)}
            onChange={(e) => patchRow(row.id, { value: e.target.value })}
            className="h-8 font-mono text-xs"
          />
          <Select
            value={row.type}
            onValueChange={(v) => patchRow(row.id, { type: v as RowType })}
          >
            <SelectTrigger className="h-8 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {typeOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="gap-1 text-xs"
        onClick={() =>
          onChange([...rows, newRow<RowType>(rows[0]?.type ?? typeOptions[0].id)])
        }
      >
        <Plus className="h-3.5 w-3.5" />
        Add row
      </Button>
    </div>
  );
}

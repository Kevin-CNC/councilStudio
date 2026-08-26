import { useState } from "react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import {
  Copy,
  RotateCw,
  ChevronDown,
  ChevronUp,
  Check,
  AlertCircle,
  Download,
  Braces,
} from "lucide-react";
import { formatTokens, formatCost, formatDuration } from "@/lib/utils";
import type { PersonaResult } from "@/types";
import { PROVIDER_LABELS } from "@/lib/constants";
import { RawResponseDialog } from "./RawResponseDialog";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface ResponseCardProps {
  result: PersonaResult;
  streamingContent?: string;
  isStreaming?: boolean;
  color?: string;
}

export function ResponseCard({ result, streamingContent, isStreaming, color = "#666" }: ResponseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  const content = isStreaming ? streamingContent || "" : result.content;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isError = result.status === "failed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card
        id={`persona-result-${result.personaId}`}
        className={cn(
          "overflow-hidden transition-shadow contain-paint",
          isError && "border-destructive/50 bg-destructive/5"
        )}
      >
        {/* Header */}
        <CardHeader className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Avatar className="h-8 w-8 border-2" style={{ borderColor: color }}>
                <AvatarFallback
                  className="text-xs font-bold"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {result.personaName[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{result.personaName}</span>
                  {isStreaming && (
                    <span className="inline-flex h-2 w-2 rounded-full bg-green-500" title="Streaming" />
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                    {PROVIDER_LABELS[result.provider]}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">{result.model}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {result.rawResponse && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  title="View raw provider response"
                  onClick={() => setRawOpen(true)}
                >
                  <Braces className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={handleCopy}
              >
                {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* Body */}
        <CardContent className={cn("p-4", expanded ? "" : "max-h-[300px] overflow-hidden")}>
          {isError ? (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium">Response failed</p>
                <p className="text-xs text-destructive/80 mt-0.5">{result.error || "Unknown error"}</p>
              </div>
            </div>
          ) : isStreaming && !streamingContent ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : (
            <div>
              <MarkdownRenderer content={content} citations={result.citations ?? []} />
              {isStreaming && (
                <span className="inline-block w-2 h-4 bg-foreground animate-blink-3 ml-0.5" />
              )}
            </div>
          )}
        </CardContent>

        {/* Footer */}
        <CardFooter className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <span className="font-mono">{formatDuration(result.latencyMs)}</span>
            </span>
            <span>
              {formatTokens(result.tokensIn)} in / {formatTokens(result.tokensOut)} out
            </span>
            <span className="font-medium text-foreground">
              {formatCost(result.cost)}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Download className="h-3 w-3" />
          </Button>
        </CardFooter>
      </Card>
      <RawResponseDialog
        open={rawOpen}
        onOpenChange={setRawOpen}
        title={`Raw response — ${result.personaName}`}
        rawResponse={result.rawResponse || ""}
      />
    </motion.div>
  );
}

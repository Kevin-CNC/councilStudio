import { lazy, Suspense } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/appStore";
import type { Citation } from "@/types";

const CodeBlock = lazy(() => import("./CodeBlock"));
const DiagramBlock = lazy(() => import("./DiagramBlock"));

interface MarkdownRendererProps {
  content: string;
  /** Citations referenced by `[{n}]` markers in `content`. */
  citations?: Citation[];
  className?: string;
}

/**
 * Convert harness markers into ordinary markdown links so the `a` override can
 * render them as chips — this keeps rendering free of raw HTML (`rehype-raw`
 * is never enabled):
 *   `[{n}]`      → `[n](#cit-n)`     (only when that citation exists)
 *   `{{@Name}}`  → `[Name](#xref-Name)`
 */
function preprocessRich(content: string, citations: Citation[]): string {
  let out = content;
  out = out.replace(/\[\{(\d+)\}\]/g, (m, id: string) =>
    citations.some((c) => c.id === id) ? `[${id}](#cit-${id})` : m
  );
  out = out.replace(/\{\{@([^}]+)\}\}/g, (_m, name: string) => {
    const n = name.trim();
    return `[${n}](#xref-${encodeURIComponent(n)})`;
  });
  return out;
}

function scrollToMember(name: string) {
  const members = useAppStore.getState().members;
  const member = members.find((m) => m.name.toLowerCase() === name.toLowerCase());
  const id = member ? `persona-result-${member.id}` : "";
  document
    .getElementById(id)
    ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function goToSources() {
  useAppStore.getState().setActiveTab("sources");
}

export function MarkdownRenderer({ content, citations = [], className }: MarkdownRendererProps) {
  const display = preprocessRich(content, citations);

  return (
    <div className={cn("prose prose-sm prose-slate max-w-none dark:prose-invert", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            if (!match) {
              return (
                <code
                  className={cn("rounded bg-muted px-1.5 py-0.5 text-xs", className)}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            const text = String(children).replace(/\n$/, "");
            const lang = match[1];
            const fallback = (
              <pre className="rounded-lg bg-muted p-4 overflow-x-auto">
                <code className="text-xs">{text}</code>
              </pre>
            );
            if (lang === "mermaid") {
              return (
                <Suspense fallback={fallback}>
                  <DiagramBlock code={text} />
                </Suspense>
              );
            }
            return (
              <Suspense fallback={fallback}>
                <CodeBlock language={lang}>{text}</CodeBlock>
              </Suspense>
            );
          },
          a({ href, children }) {
            // Citation chip — superscript, tooltip = excerpt, click → Sources tab.
            if (href?.startsWith("#cit-")) {
              const id = href.slice(5);
              const cit = citations.find((c) => c.id === id);
              return (
                <sup>
                  <button
                    type="button"
                    onClick={goToSources}
                    title={cit ? `${cit.source}${cit.excerpt ? ` — ${cit.excerpt}` : ""}` : undefined}
                    className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold text-primary align-super hover:bg-primary/20"
                  >
                    {children}
                  </button>
                </sup>
              );
            }
            // Cross-member reference chip — scrolls to that member's card.
            if (href?.startsWith("#xref-")) {
              const name = decodeURIComponent(href.slice(6));
              return (
                <button
                  type="button"
                  onClick={() => scrollToMember(name)}
                  className="mx-0.5 inline-flex items-center gap-0.5 rounded-full bg-secondary/15 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground align-middle hover:bg-secondary/25"
                  title={`Go to ${name}`}
                >
                  @{name}
                </button>
              );
            }
            // Normal link — http(s) only, never a raw/targetless anchor.
            const safe = href && /^https?:\/\//i.test(href) ? href : undefined;
            return (
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline underline-offset-2"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {display}
      </ReactMarkdown>
    </div>
  );
}

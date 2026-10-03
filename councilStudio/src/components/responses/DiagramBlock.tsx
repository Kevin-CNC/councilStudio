import { useEffect, useState } from "react";

interface DiagramBlockProps {
  /** Raw mermaid source (no fences). */
  code: string;
  caption?: string;
}

// Load mermaid lazily and initialize once, so it stays out of the main bundle
// until a response actually contains a diagram.
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
let renderCounter = 0;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        securityLevel: "strict",
        startOnLoad: false,
        theme: "default",
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

export default function DiagramBlock({ code, caption }: DiagramBlockProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++renderCounter}`;
    getMermaid()
      .then((mermaid) => mermaid.render(id, code))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch((e) => {
        // mermaid leaves its error SVG in a temp body node on parse failure — remove it.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    // Fall back to the raw source rather than a broken/empty frame.
    return (
      <pre className="rounded-lg bg-muted p-4 overflow-x-auto">
        <code className="text-xs">{code}</code>
      </pre>
    );
  }

  if (!svg) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-xs text-muted-foreground">
        Rendering diagram…
      </div>
    );
  }

  // mermaid renders trusted SVG under securityLevel:"strict" (no script/link
  // injection in labels). Never pass raw model HTML anywhere else.
  return (
    <figure className="my-2">
      <div
        className="overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      {caption ? (
        <figcaption className="mt-1 text-xs text-muted-foreground">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

import type { Table } from "@/types";

interface DataTableBlockProps {
  table: Table;
}

/** Render one harness-extracted table. Cells are plain text (never markdown or
 * raw HTML — same trust boundary as DiagramBlock). */
export default function DataTableBlock({ table }: DataTableBlockProps) {
  return (
    <figure className="my-2 not-prose">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full border-collapse text-xs">
          {table.caption ? (
            <caption className="bg-muted/50 px-3 py-1.5 text-left text-[11px] font-medium text-muted-foreground">
              {table.caption}
            </caption>
          ) : null}
          <thead>
            <tr className={table.caption ? "" : "bg-muted/50"}>
              {table.columns.map((col, i) => (
                <th
                  key={i}
                  className="border-b border-border px-3 py-1.5 text-left font-semibold text-foreground whitespace-nowrap"
                >
                  {col || `Column ${i + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td
                  colSpan={Math.max(table.columns.length, 1)}
                  className="px-3 py-2 text-muted-foreground italic"
                >
                  No rows
                </td>
              </tr>
            ) : (
              table.rows.map((row, r) => (
                <tr key={r} className="odd:bg-muted/20">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="border-t border-border/50 px-3 py-1.5 text-foreground align-top"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

import React from "react";

interface Column {
  key: string;
  label: string;
  numeric?: boolean;
}

interface CommandCenterTableProps {
  columns: Column[];
  rows: Record<string, React.ReactNode>[];
  emptyLabel?: string;
}

/** Reusable table foundation — sticky header, right-aligned numerics, hover rows. No data is populated yet. */
export function CommandCenterTable({ columns, rows, emptyLabel = "No data" }: CommandCenterTableProps) {
  return (
    <div className="cc-table-wrap">
      <table className="cc-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} className={c.numeric ? "cc-num" : undefined}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ textAlign: "center", color: "var(--cc-text-muted)" }}>{emptyLabel}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} className={c.numeric ? "cc-num" : undefined}>{row[c.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

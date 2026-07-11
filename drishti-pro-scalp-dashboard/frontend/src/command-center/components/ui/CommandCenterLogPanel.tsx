import React from "react";

export type LogSeverity = "info" | "success" | "warning" | "error" | "critical";

interface LogLine {
  timestamp: string;
  severity: LogSeverity;
  message: string;
}

interface CommandCenterLogPanelProps {
  lines: LogLine[];
  emptyLabel?: string;
}

/** Reusable log-view foundation — monospace, severity-colored label, no data populated yet. */
export function CommandCenterLogPanel({ lines, emptyLabel = "No logs" }: CommandCenterLogPanelProps) {
  if (lines.length === 0) {
    return <div className="cc-log-panel" style={{ padding: "var(--cc-space-4)", color: "var(--cc-text-muted)" }}>{emptyLabel}</div>;
  }
  return (
    <div className="cc-log-panel">
      {lines.map((line, i) => (
        <div key={i} className={`cc-log-line cc-log-line--${line.severity}`}>
          <span className="cc-log-line__ts">{line.timestamp}</span>
          <span className="cc-log-line__sev">{line.severity}</span>
          <span className="cc-log-line__msg">{line.message}</span>
        </div>
      ))}
    </div>
  );
}

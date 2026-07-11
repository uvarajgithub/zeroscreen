import React from "react";

interface StatusDotProps {
  color: string;
  pulse?: boolean;
  label?: string;
}

export function StatusDot({ color, pulse = false, label }: StatusDotProps) {
  return (
    <span
      className={["cc-status-dot", pulse ? "cc-status-dot--pulse" : ""].filter(Boolean).join(" ")}
      style={{ background: color }}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}

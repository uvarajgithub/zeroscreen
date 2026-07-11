import React from "react";

interface CommandCenterTooltipProps {
  label: string;
  children: React.ReactNode;
}

export function CommandCenterTooltip({ label, children }: CommandCenterTooltipProps) {
  return (
    <span className="cc-tooltip-wrap" tabIndex={-1}>
      {children}
      <span className="cc-tooltip" role="tooltip">{label}</span>
    </span>
  );
}

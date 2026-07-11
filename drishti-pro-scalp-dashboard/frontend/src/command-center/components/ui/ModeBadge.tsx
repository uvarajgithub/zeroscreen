import React from "react";
import { SessionMode } from "../../types/session";
import { MODE_COLOR_VAR, MODE_LABEL } from "../../theme/command-center.theme";

interface ModeBadgeProps {
  mode: SessionMode;
}

export function ModeBadge({ mode }: ModeBadgeProps) {
  return (
    <span className="cc-mode-badge">
      <span className="cc-status-dot" style={{ background: MODE_COLOR_VAR[mode] }} />
      {MODE_LABEL[mode]}
    </span>
  );
}

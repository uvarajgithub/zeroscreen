import React from "react";
import { StatusText } from "../ui";

interface CommandCenterHeaderProps {
  status?: string;
  lastUpdated?: string;
}

export function CommandCenterHeader({ status, lastUpdated }: CommandCenterHeaderProps) {
  return (
    <header className="cc-header">
      <div className="cc-header__title-group">
        <h1 className="cc-header__title">Command Center</h1>
        <p className="cc-header__subtitle">Run and monitor trading sessions</p>
      </div>
      <div className="cc-header__meta">
        <StatusText color="var(--cc-text-muted)" text={status ?? "Idle"} />
        <span>Last updated: {lastUpdated ?? "—"}</span>
      </div>
    </header>
  );
}

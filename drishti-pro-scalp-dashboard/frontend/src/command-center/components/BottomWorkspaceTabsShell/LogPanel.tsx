import React from "react";
import { Session } from "../../types/session";
import { CommandCenterButton, CommandCenterLogPanel } from "../ui";

export function LogPanel(_props: { session: Session }) {
  return (
    <div className="cc-log-toolbar-wrap">
      <div className="cc-log-toolbar">
        <input className="cc-select" style={{ minWidth: 180 }} placeholder="Search logs" disabled aria-label="Search logs" />
        <CommandCenterButton variant="neutral" disabled>Filter</CommandCenterButton>
        <CommandCenterButton variant="neutral" disabled>Download</CommandCenterButton>
      </div>
      <CommandCenterLogPanel lines={[]} emptyLabel="No logs — system logs will appear here." />
    </div>
  );
}

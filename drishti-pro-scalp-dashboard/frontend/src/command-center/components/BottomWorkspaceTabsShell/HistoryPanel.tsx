import React from "react";
import { Session } from "../../types/session";
import { CommandCenterCard, CommandCenterCardRow, CommandCenterButton, CommandCenterEmptyState } from "../ui";

export function HistoryPanel(_props: { session: Session }) {
  return (
    <div className="cc-history-panel">
      <div className="cc-history-panel__actions">
        <CommandCenterButton variant="secondary" disabled>Export</CommandCenterButton>
      </div>
      <div className="cc-operational-grid">
        <CommandCenterCard title="Daily Summary">
          <CommandCenterCardRow label="Trades" value="—" />
          <CommandCenterCardRow label="Net P&L" value="—" />
        </CommandCenterCard>
        <CommandCenterCard title="Session Summary">
          <CommandCenterCardRow label="Duration" value="—" />
          <CommandCenterCardRow label="Net P&L" value="—" />
        </CommandCenterCard>
      </div>
      <CommandCenterEmptyState title="No history yet" body="P&L history will appear here once the session has activity." />
    </div>
  );
}

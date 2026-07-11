import React from "react";
import { Session } from "../../types/session";
import { CommandCenterCard, CommandCenterCardRow, CommandCenterEmptyState, ValueDelta } from "../ui";
import { DashboardState } from "../../business/realtime/SessionRuntimeStore";

interface PositionCardProps {
  session: Session;
  dashboard?: DashboardState;
}

/** Position: status, direction, qty, entry, current, MTM, duration. Empty state when there is no open position. */
export function PositionCard({ dashboard }: PositionCardProps) {
  const position = dashboard?.position;
  if (!position) {
    return (
      <CommandCenterCard title="Position">
        <CommandCenterEmptyState title="Waiting for position" body="No open position for this session." />
      </CommandCenterCard>
    );
  }
  return (
    <CommandCenterCard title="Position">
      <CommandCenterCardRow label="Status" value={position.status} />
      <CommandCenterCardRow label="Direction" value={position.direction} />
      <CommandCenterCardRow label="Quantity" value={position.quantity} />
      <CommandCenterCardRow label="Entry" value={position.entryPrice.toFixed(2)} />
      <CommandCenterCardRow label="Current" value={position.currentPrice.toFixed(2)} />
      <CommandCenterCardRow label="MTM" value={<ValueDelta value={position.unrealizedPnl} format={(n) => n.toFixed(2)} />} />
      <CommandCenterCardRow label="Duration" value={position.duration ?? "—"} />
    </CommandCenterCard>
  );
}

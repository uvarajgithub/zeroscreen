import React from "react";
import { Session } from "../../types/session";
import { CommandCenterCard, CommandCenterCardRow, StatusText } from "../ui";
import { DashboardState, HealthState } from "../../business/realtime/SessionRuntimeStore";

interface EngineCardProps {
  session: Session;
  dashboard?: DashboardState;
  health?: HealthState;
}

const HEALTH_COLOR: Record<HealthState, string> = {
  HEALTHY: "var(--cc-success)",
  DEGRADED: "var(--cc-warning)",
  STALE: "var(--cc-warning)",
  DISCONNECTED: "var(--cc-text-muted)",
  ERROR: "var(--cc-danger)",
};

/** Engine: current state, heartbeat, last action, uptime. */
export function EngineCard({ dashboard, health }: EngineCardProps) {
  const status = health ?? "DISCONNECTED";
  return (
    <CommandCenterCard title="Engine" status={<StatusText color={HEALTH_COLOR[status]} text={status} />}>
      <CommandCenterCardRow label="State" value={dashboard?.engineState ?? "—"} />
      <CommandCenterCardRow label="Heartbeat" value={dashboard?.connection.lastHeartbeatAt ?? "—"} />
      <CommandCenterCardRow label="Last action" value={dashboard?.lastAction ?? "—"} />
      <CommandCenterCardRow label="Uptime" value={dashboard?.lastUpdatedAt ? "Active" : "—"} />
    </CommandCenterCard>
  );
}

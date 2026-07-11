import React from "react";
import { Session } from "../../types/session";
import { CommandCenterCard, CommandCenterCardRow } from "../ui";
import { DashboardState } from "../../business/realtime/SessionRuntimeStore";

interface RiskCardProps {
  session: Session;
  dashboard?: DashboardState;
}

const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(2));

/** Risk: daily risk used, remaining risk, current drawdown, emergency status — always session-scoped and simulated for non-LIVE modes. */
export function RiskCard({ dashboard }: RiskCardProps) {
  const risk = dashboard?.risk;
  return (
    <CommandCenterCard title="Risk">
      <CommandCenterCardRow label="Daily risk used" value={fmt(risk?.dailyRiskUsed ?? null)} />
      <CommandCenterCardRow label="Remaining risk" value={fmt(risk?.dailyRiskRemaining ?? null)} />
      <CommandCenterCardRow label="Current drawdown" value={fmt(risk?.currentDrawdown ?? null)} />
      <CommandCenterCardRow label="Emergency status" value={risk?.killSwitchActive ? "Active" : "—"} />
    </CommandCenterCard>
  );
}

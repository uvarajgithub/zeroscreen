import React from "react";
import { Session } from "../../types/session";
import { PositionCard } from "./PositionCard";
import { EngineCard } from "./EngineCard";
import { AccountCard } from "./AccountCard";
import { RiskCard } from "./RiskCard";
import { DashboardState, HealthState } from "../../business/realtime/SessionRuntimeStore";

interface OperationalCardsProps {
  session: Session;
  dashboard?: DashboardState;
  health?: HealthState;
}

/** Exactly four operational cards — Position, Engine, Account, Risk. Nothing more. */
export function OperationalCards({ session, dashboard, health }: OperationalCardsProps) {
  return (
    <div className="cc-operational-grid" aria-label="Operational summary">
      <PositionCard session={session} dashboard={dashboard} />
      <EngineCard session={session} dashboard={dashboard} health={health} />
      <AccountCard session={session} dashboard={dashboard} />
      <RiskCard session={session} dashboard={dashboard} />
    </div>
  );
}

import React from "react";
import { Session } from "../../types/session";
import { HeroSection } from "./HeroSection";
import { OperationalCards } from "./OperationalCards";
import { DashboardState, HealthState } from "../../business/realtime/SessionRuntimeStore";

interface TradingDashboardProps {
  session: Session;
  dashboard?: DashboardState;
  health?: HealthState;
}

/**
 * The one reusable dashboard for every session — LIVE, PAPER, SHADOW, BACKTEST.
 * Only `session`/`dashboard` data changes; there is exactly one component
 * tree, never a per-mode variant (no LiveDashboard/PaperDashboard/etc).
 */
export function TradingDashboard({ session, dashboard, health }: TradingDashboardProps) {
  return (
    <section className="cc-dashboard-workspace" aria-label={`Dashboard for ${session.name}`}>
      <HeroSection session={session} dashboard={dashboard} health={health} />
      <OperationalCards session={session} dashboard={dashboard} health={health} />
    </section>
  );
}

import React from "react";
import { Session } from "../../types/session";
import { CommandCenterHeroSurface, ModeBadge, ValueDelta, Sparkline } from "../ui";
import { DashboardState, HealthState } from "../../business/realtime/SessionRuntimeStore";

interface HeroSectionProps {
  session: Session;
  dashboard?: DashboardState;
  health?: HealthState;
}

/** The single visual focus of the dashboard: today's P&L, equity curve, and session identity. No other KPIs belong here. */
export function HeroSection({ session, dashboard, health }: HeroSectionProps) {
  const isStale = health === "STALE" || health === "DEGRADED";
  return (
    <CommandCenterHeroSurface aria-label="Session hero">
      <div className="cc-hero__top">
        <div className="cc-hero__identity">
          <span className="cc-hero__session-name">{session.name}</span>
          <span className="cc-hero__instrument">{session.instrument}</span>
        </div>
        <div className="cc-hero__indicator">
          <ModeBadge mode={session.mode} />
        </div>
      </div>

      <div className="cc-hero__pnl">
        <span className="cc-hero__pnl-label">{dashboard?.pnl.label ?? "Today's P&L"}</span>
        <span className="cc-hero__pnl-value">
          <ValueDelta value={dashboard ? dashboard.pnl.netPnl : null} format={(n) => n.toFixed(2)} />
        </span>
        {isStale && <span className="cc-stale-badge">Stale — last updated {dashboard?.lastUpdatedAt ?? "unknown"}</span>}
      </div>

      <div className="cc-hero__equity" aria-label="Live equity curve">
        {dashboard && dashboard.equityCurve.length >= 2
          ? <Sparkline points={dashboard.equityCurve} />
          : "Equity curve will render here"}
      </div>
    </CommandCenterHeroSurface>
  );
}

import React from "react";
import { Session } from "../../types/session";
import { CommandCenterCard, CommandCenterCardRow } from "../ui";
import { DashboardState } from "../../business/realtime/SessionRuntimeStore";

interface AccountCardProps {
  session: Session;
  dashboard?: DashboardState;
}

const fmt = (n: number | null) => (n == null ? "—" : n.toFixed(2));

/** Account: balance, available, margin used, broker — labelled per mode (Broker Balance vs Simulated Balance vs Backtest Equity). */
export function AccountCard({ session, dashboard }: AccountCardProps) {
  const account = dashboard?.account;
  return (
    <CommandCenterCard title="Account">
      <CommandCenterCardRow label={account?.label ?? "Balance"} value={fmt(account?.balance ?? null)} />
      <CommandCenterCardRow label="Available" value={fmt(account?.available ?? null)} />
      <CommandCenterCardRow label="Margin used" value={fmt(account?.usedMargin ?? null)} />
      <CommandCenterCardRow label="Broker" value={session.mode === "LIVE" ? (session.broker ?? "—") : "—"} />
    </CommandCenterCard>
  );
}

import React from "react";
import { Session } from "../../types/session";
import { CommandCenterCard, CommandCenterCardRow } from "../ui";

/** Compact analytics only: equity, win rate, drawdown, profit factor, monthly. Nothing more. */
export function AnalyticsPanel(_props: { session: Session }) {
  return (
    <div className="cc-operational-grid">
      <CommandCenterCard title="Equity">
        <CommandCenterCardRow label="Net equity" value="—" />
      </CommandCenterCard>
      <CommandCenterCard title="Win Rate">
        <CommandCenterCardRow label="Win rate" value="—" />
      </CommandCenterCard>
      <CommandCenterCard title="Drawdown">
        <CommandCenterCardRow label="Max drawdown" value="—" />
      </CommandCenterCard>
      <CommandCenterCard title="Profit Factor">
        <CommandCenterCardRow label="Profit factor" value="—" />
      </CommandCenterCard>
      <CommandCenterCard title="Monthly">
        <CommandCenterCardRow label="This month" value="—" />
      </CommandCenterCard>
    </div>
  );
}

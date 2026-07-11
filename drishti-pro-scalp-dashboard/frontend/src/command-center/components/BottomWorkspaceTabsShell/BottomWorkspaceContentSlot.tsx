import React from "react";
import { Session, BottomWorkspaceTab } from "../../types/session";
import { TradesTable } from "./TradesTable";
import { OrdersTable } from "./OrdersTable";
import { HistoryPanel } from "./HistoryPanel";
import { LogPanel } from "./LogPanel";
import { AnalyticsPanel } from "./AnalyticsPanel";

interface BottomWorkspaceContentSlotProps {
  session: Session;
  activeTab: BottomWorkspaceTab;
}

/** Only one tab's panel is ever rendered at a time. */
export function BottomWorkspaceContentSlot({ session, activeTab }: BottomWorkspaceContentSlotProps) {
  return (
    <div className="cc-tab-panel" role="tabpanel" id={`bottom-tabpanel-${activeTab}`} aria-labelledby={`bottom-tab-${activeTab}`}>
      {activeTab === "Trades" && <TradesTable session={session} />}
      {activeTab === "Orders" && <OrdersTable session={session} />}
      {activeTab === "History" && <HistoryPanel session={session} />}
      {activeTab === "Logs" && <LogPanel session={session} />}
      {activeTab === "Analytics" && <AnalyticsPanel session={session} />}
    </div>
  );
}

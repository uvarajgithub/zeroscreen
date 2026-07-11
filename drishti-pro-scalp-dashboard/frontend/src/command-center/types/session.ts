export type SessionMode = "LIVE" | "PAPER" | "SHADOW" | "BACKTEST";

/**
 * CC-006 session lifecycle. Note: this has two more states (CONFIGURED,
 * ARCHIVED) than CC-002's `cc_trading_sessions.status` CHECK constraint
 * (DRAFT/READY/STARTING/RUNNING/PAUSED/STOPPING/STOPPED/COMPLETED/FAILED).
 * Reconciling the two is a future DB migration, not done in this
 * business-logic-only phase — see business/README notes in SessionManager.
 */
export type SessionLifecycleState =
  | "DRAFT" | "CONFIGURED" | "READY" | "STARTING" | "RUNNING"
  | "PAUSED" | "STOPPING" | "STOPPED" | "COMPLETED" | "ARCHIVED";

export interface Session {
  id: string;
  name: string;
  mode: SessionMode;
  instrument: string;
  product: "FUTURES" | "OPTIONS";
  strategy: string;
  broker: string | null;
  quantity: number;
  isPinned: boolean;
  isProtected: boolean;
  closable: boolean;
  status: SessionLifecycleState;
  /** BACKTEST-only fields. */
  dateFrom?: string | null;
  dateTo?: string | null;
  initialCapital?: number | null;
  /** Set when a persisted session's runtime could not be restored (CC-007 §14). */
  recoveryRequired?: boolean;
}

export type BottomWorkspaceTab = "Trades" | "Orders" | "History" | "Logs" | "Analytics";

export const BOTTOM_WORKSPACE_TABS: BottomWorkspaceTab[] = [
  "Trades", "Orders", "History", "Logs", "Analytics",
];

/**
 * SessionRuntimeStore — the per-session dashboard state slice and its pure
 * event-application function. One `DashboardState` per sessionId; never a
 * shared/global `currentPnl`/`currentPosition` field.
 */
import { RuntimeEvent } from "./RuntimeEvent";
import { SessionMode } from "../../types/session";

export type ConnectionState = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";
export type HealthState = "HEALTHY" | "DEGRADED" | "STALE" | "DISCONNECTED" | "ERROR";

export interface ConnectionInfo {
  state: ConnectionState;
  lastHeartbeatAt: string | null;
  lastEventAt: string | null;
  health: HealthState;
}

export interface PositionState {
  status: string;
  instrument: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  stopLoss: number | null;
  target: number | null;
  openedAt: string;
  duration: string | null;
}

const PNL_LABEL: Record<SessionMode, string> = {
  LIVE: "Live P&L", PAPER: "Paper P&L", SHADOW: "Shadow P&L", BACKTEST: "Backtest P&L",
};
const ACCOUNT_LABEL: Record<SessionMode, string> = {
  LIVE: "Broker Balance", PAPER: "Simulated Balance", SHADOW: "Simulated Balance", BACKTEST: "Backtest Equity",
};

export interface PnlState {
  unrealizedPnl: number;
  realizedPnl: number;
  grossPnl: number;
  netPnl: number;
  label: string;
}

export interface AccountState {
  balance: number | null;
  available: number | null;
  usedMargin: number | null;
  initialCapital: number | null;
  label: string;
}

export interface RiskState {
  dailyRiskUsed: number | null;
  dailyRiskRemaining: number | null;
  currentDrawdown: number | null;
  maxDrawdown: number | null;
  capitalUsed: number | null;
  exposure: number | null;
  tradeCount: number | null;
  remainingTradeCount: number | null;
  killSwitchActive: boolean;
}

export interface OrderRow { brokerOrderId: string | null; status: string; [key: string]: unknown }
export interface ExecutionRow { orderId: string | null; [key: string]: unknown }
export interface SessionEventRow { eventId: string; occurredAt: string; eventType: string; payload: unknown }
export interface EquityPoint { t: string; value: number }

export interface BacktestProgressState {
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  progressPercent: number;
  currentDate: string | null;
  elapsedSeconds: number;
  estimatedRemainingSeconds: number | null;
  tradeCount: number;
  resultSummary: string | null;
  failureReason: string | null;
}

const MAX_EVENTS_IN_MEMORY = 200;
const MAX_EQUITY_POINTS = 300;

export interface DashboardState {
  sessionId: string;
  mode: SessionMode;
  connection: ConnectionInfo;
  engineState: string;
  lastAction: string | null;
  position: PositionState | null;
  orders: OrderRow[];
  executions: ExecutionRow[];
  pnl: PnlState;
  account: AccountState;
  risk: RiskState;
  events: SessionEventRow[];
  backtest: BacktestProgressState | null;
  equityCurve: EquityPoint[];
  lastUpdatedAt: string | null;
  lastSequenceNumber: number;
}

export function createInitialDashboardState(sessionId: string, mode: SessionMode): DashboardState {
  return {
    sessionId,
    mode,
    connection: { state: "DISCONNECTED", lastHeartbeatAt: null, lastEventAt: null, health: "DISCONNECTED" },
    engineState: "IDLE",
    lastAction: null,
    position: null,
    orders: [],
    executions: [],
    pnl: { unrealizedPnl: 0, realizedPnl: 0, grossPnl: 0, netPnl: 0, label: PNL_LABEL[mode] },
    account: { balance: null, available: null, usedMargin: null, initialCapital: null, label: ACCOUNT_LABEL[mode] },
    risk: {
      dailyRiskUsed: null, dailyRiskRemaining: null, currentDrawdown: null, maxDrawdown: null,
      capitalUsed: null, exposure: null, tradeCount: null, remainingTradeCount: null, killSwitchActive: false,
    },
    events: [],
    backtest: mode === "BACKTEST" ? {
      status: "QUEUED", progressPercent: 0, currentDate: null, elapsedSeconds: 0,
      estimatedRemainingSeconds: null, tradeCount: 0, resultSummary: null, failureReason: null,
    } : null,
    equityCurve: [],
    lastUpdatedAt: null,
    lastSequenceNumber: 0,
  };
}

/**
 * Pure reducer. Ignores (does not mutate) a stale/duplicate event whose
 * sequenceNumber is not strictly newer than the last one applied — this is
 * the ordering protection required by CC-008's event contract.
 */
export function applyRuntimeEvent(state: DashboardState, event: RuntimeEvent): DashboardState {
  if (event.sequenceNumber <= state.lastSequenceNumber) return state; // stale/duplicate -> ignored

  const base: DashboardState = {
    ...state,
    lastUpdatedAt: event.occurredAt,
    lastSequenceNumber: event.sequenceNumber,
    connection: { ...state.connection, lastEventAt: event.occurredAt },
  };

  switch (event.eventType) {
    case "SESSION_HEARTBEAT":
      return { ...base, connection: { ...base.connection, lastHeartbeatAt: event.occurredAt, state: "CONNECTED" } };

    case "SESSION_STATE_UPDATED": {
      const p = event.payload as { engineState?: string; lastAction?: string };
      return { ...base, engineState: p.engineState ?? base.engineState, lastAction: p.lastAction ?? base.lastAction };
    }

    case "BROKER_STATE_UPDATED":
    case "TOKEN_STATE_UPDATED":
    case "MARKET_STATE_UPDATED":
      return base; // status-only signals; surfaced via connection/engine fields already updated above

    case "POSITION_OPENED":
    case "POSITION_UPDATED":
      return { ...base, position: event.payload as PositionState };

    case "POSITION_CLOSED":
      // Move to history (caller appends to session history separately) and clear active-position state.
      return { ...base, position: null };

    case "ORDER_CREATED":
    case "ORDER_UPDATED":
    case "ORDER_EXECUTED":
    case "ORDER_REJECTED": {
      const order = event.payload as OrderRow;
      const existingIndex = base.orders.findIndex((o) => o.brokerOrderId && o.brokerOrderId === order.brokerOrderId);
      const orders = existingIndex >= 0
        ? base.orders.map((o, i) => (i === existingIndex ? { ...o, ...order } : o))
        : [order, ...base.orders];
      return { ...base, orders };
    }

    case "PNL_UPDATED": {
      const pnl = event.payload as Partial<PnlState>;
      const nextPnl = { ...base.pnl, ...pnl };
      const point: EquityPoint = { t: event.occurredAt, value: nextPnl.netPnl };
      const equityCurve = [...base.equityCurve, point].slice(-MAX_EQUITY_POINTS);
      return { ...base, pnl: nextPnl, equityCurve };
    }

    case "ACCOUNT_UPDATED":
      return { ...base, account: { ...base.account, ...(event.payload as Partial<AccountState>) } };

    case "RISK_UPDATED":
      return { ...base, risk: { ...base.risk, ...(event.payload as Partial<RiskState>) } };

    case "SESSION_EVENT_CREATED": {
      const row: SessionEventRow = { eventId: event.eventId, occurredAt: event.occurredAt, eventType: event.eventType, payload: event.payload };
      const events = [row, ...base.events].slice(0, MAX_EVENTS_IN_MEMORY);
      return { ...base, events };
    }

    case "BACKTEST_PROGRESS_UPDATED":
      return { ...base, backtest: { ...(base.backtest ?? createInitialDashboardState(state.sessionId, state.mode).backtest!), ...(event.payload as Partial<BacktestProgressState>) } };

    case "BACKTEST_COMPLETED":
      return { ...base, backtest: { ...(base.backtest as BacktestProgressState), status: "COMPLETED", progressPercent: 100, resultSummary: (event.payload as { resultSummary?: string }).resultSummary ?? null } };

    case "BACKTEST_FAILED":
      return { ...base, backtest: { ...(base.backtest as BacktestProgressState), status: "FAILED", failureReason: (event.payload as { reason?: string }).reason ?? "Unknown error" } };

    case "CONNECTION_WARNING":
      return { ...base, connection: { ...base.connection, state: "RECONNECTING" } };

    case "RUNTIME_ERROR":
      return { ...base, connection: { ...base.connection, health: "ERROR" } };

    default:
      return base;
  }
}

/**
 * A session is healthy only when its dependencies are actually current —
 * never healthy merely because the page/manager is connected.
 */
export function computeHealth(state: DashboardState, now: number, staleAfterMs: number): HealthState {
  if (state.connection.health === "ERROR") return "ERROR";
  if (state.connection.state === "DISCONNECTED") return "DISCONNECTED";
  const lastBeat = state.connection.lastHeartbeatAt ? new Date(state.connection.lastHeartbeatAt).getTime() : null;
  if (!lastBeat) return "DEGRADED";
  const age = now - lastBeat;
  if (age > staleAfterMs * 2) return "STALE";
  if (age > staleAfterMs) return "DEGRADED";
  return "HEALTHY";
}

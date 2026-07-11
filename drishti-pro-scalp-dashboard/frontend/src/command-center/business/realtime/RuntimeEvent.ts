/**
 * RuntimeEvent — the CC-008 typed real-time event contract.
 *
 * Discovered production transport (see CC-008 report): ZeroScreen's
 * `/signals` page polls `GET /api/bot/status` every 8s
 * (`setInterval(_sig3Refresh, 8000)` in src/server.ts) — plain REST
 * refresh, no WebSocket/SSE/event-bus infrastructure exists. Per this
 * phase's own "preferred order" fallback rule, RuntimeEvents here are
 * produced by scoped polling adapters (one per session), not a new
 * WebSocket layer — reusing the existing production-safe mechanism
 * instead of inventing a parallel transport.
 */

export type RuntimeEventType =
  | "SESSION_STATE_UPDATED"
  | "SESSION_HEARTBEAT"
  | "MARKET_STATE_UPDATED"
  | "BROKER_STATE_UPDATED"
  | "TOKEN_STATE_UPDATED"
  | "POSITION_UPDATED"
  | "POSITION_OPENED"
  | "POSITION_CLOSED"
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "ORDER_EXECUTED"
  | "ORDER_REJECTED"
  | "PNL_UPDATED"
  | "ACCOUNT_UPDATED"
  | "RISK_UPDATED"
  | "SESSION_EVENT_CREATED"
  | "BACKTEST_PROGRESS_UPDATED"
  | "BACKTEST_COMPLETED"
  | "BACKTEST_FAILED"
  | "CONNECTION_WARNING"
  | "RUNTIME_ERROR";

export interface RuntimeEvent<TPayload = unknown> {
  eventId: string;
  userId: string;
  sessionId: string;
  mode: "LIVE" | "PAPER" | "SHADOW" | "BACKTEST";
  eventType: RuntimeEventType;
  occurredAt: string;
  sequenceNumber: number;
  payload: TPayload;
}

let eventSequence = 0;
export function nextEventId(): string {
  eventSequence += 1;
  return `evt-${eventSequence}`;
}

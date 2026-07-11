/**
 * Transport adapters — the seam between SessionRealtimeManager and an
 * actual data source. Neither adapter here talks to a real network: this
 * standalone frontend has no server to reach (same limitation carried
 * through every CC phase so far). They exist so the manager's
 * subscribe/poll/reconcile machinery is exercised end-to-end and ready to
 * be swapped for a real implementation:
 *   - LIVE would poll the discovered production mechanism,
 *     `GET /api/bot/status` (see RuntimeEvent.ts header comment).
 *   - PAPER/SHADOW/BACKTEST would poll CC-002's `cc_session_*` tables via
 *     a future API once this frontend is mounted into ZeroScreen.
 */
import { RuntimeEvent, nextEventId } from "./RuntimeEvent";
import { SessionTransport } from "./SessionSubscription";
import { SnapshotReason } from "./ConnectionRecoveryService";
import { SessionMode } from "../../types/session";

/** Single-tenant assumption carried from CC-002/CC-006 — revisit before multi-user support. */
export const LOCAL_USER_ID = "local-user";

function makeEvent(sessionId: string, mode: SessionMode, sequenceNumber: number, eventType: RuntimeEvent["eventType"], payload: unknown): RuntimeEvent {
  return {
    eventId: nextEventId(),
    userId: LOCAL_USER_ID,
    sessionId,
    mode,
    eventType,
    occurredAt: new Date().toISOString(),
    sequenceNumber,
    payload,
  };
}

/** LIVE — stub until wired to the real `/api/bot/status` poll. Never fabricates trading logic. */
export function createProductionTransport(sessionId: string): SessionTransport {
  let sequence = 0;
  const heartbeat = () => makeEvent(sessionId, "LIVE", ++sequence, "SESSION_HEARTBEAT", {});
  return {
    async fetchSnapshot(_reason: SnapshotReason): Promise<RuntimeEvent[]> {
      return [
        makeEvent(sessionId, "LIVE", ++sequence, "SESSION_STATE_UPDATED", { engineState: "MONITORING", lastAction: null }),
        makeEvent(sessionId, "LIVE", ++sequence, "BROKER_STATE_UPDATED", {}),
        makeEvent(sessionId, "LIVE", ++sequence, "ACCOUNT_UPDATED", { balance: null, available: null, usedMargin: null }),
        heartbeat(),
      ];
    },
    async fetchEvents(_since: number): Promise<RuntimeEvent[]> {
      return [heartbeat()];
    },
  };
}

/** PAPER/SHADOW/BACKTEST — deterministic simulated stream (no real market/broker connection). */
export function createSimulatedTransport(sessionId: string, mode: Exclude<SessionMode, "LIVE">): SessionTransport {
  let sequence = 0;
  return {
    async fetchSnapshot(_reason: SnapshotReason): Promise<RuntimeEvent[]> {
      const events = [
        makeEvent(sessionId, mode, ++sequence, "SESSION_STATE_UPDATED", { engineState: "MONITORING", lastAction: null }),
        makeEvent(sessionId, mode, ++sequence, "PNL_UPDATED", { unrealizedPnl: 0, realizedPnl: 0, grossPnl: 0, netPnl: 0 }),
        makeEvent(sessionId, mode, ++sequence, "SESSION_HEARTBEAT", {}),
      ];
      if (mode === "BACKTEST") {
        events.push(makeEvent(sessionId, mode, ++sequence, "BACKTEST_PROGRESS_UPDATED", { status: "QUEUED", progressPercent: 0 }));
      }
      return events;
    },
    async fetchEvents(_since: number): Promise<RuntimeEvent[]> {
      return [makeEvent(sessionId, mode, ++sequence, "SESSION_HEARTBEAT", {})];
    },
  };
}

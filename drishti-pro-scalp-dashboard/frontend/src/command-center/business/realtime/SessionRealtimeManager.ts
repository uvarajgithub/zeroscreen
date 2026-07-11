/**
 * SessionRealtimeManager — one client-side subscription manager for every
 * session's isolated real-time channel. Owns the single tick() timer the
 * UI schedules (so cleanup is one call), never places transport handling
 * inside card components, and never lets one session's data reach
 * another's DashboardState.
 */
import { RuntimeEvent, RuntimeEventType } from "./RuntimeEvent";
import { SessionTransport, SessionSubscription } from "./SessionSubscription";
import { RuntimeEventRouter, ObservabilityLogger, noopObservabilityLogger } from "./RuntimeEventRouter";
import { DashboardState, createInitialDashboardState, applyRuntimeEvent, computeHealth, HealthState } from "./SessionRuntimeStore";
import { SessionMode } from "../../types/session";

/** Notifications are raised only for these meaningful events — never per heartbeat/tick. */
const NOTIFIABLE_EVENT_TYPES: ReadonlySet<RuntimeEventType> = new Set([
  "SESSION_STATE_UPDATED", "BROKER_STATE_UPDATED", "TOKEN_STATE_UPDATED",
  "ORDER_REJECTED", "POSITION_OPENED", "POSITION_CLOSED",
  "BACKTEST_COMPLETED", "BACKTEST_FAILED", "RUNTIME_ERROR",
]);

type NotificationListener = (event: RuntimeEvent) => void;

const STALE_AFTER_MS = 20_000; // ~2.5x the discovered production poll interval (8s)

export class SessionRealtimeManager {
  private subscriptions = new Map<string, SessionSubscription>();
  private dashboards = new Map<string, DashboardState>();
  private router: RuntimeEventRouter;
  private notificationListeners = new Set<NotificationListener>();

  constructor(private log: ObservabilityLogger = noopObservabilityLogger) {
    this.router = new RuntimeEventRouter(log);
  }

  /** Idempotent — subscribing an already-subscribed session is a no-op (prevents duplicate subscriptions). */
  subscribe(sessionId: string, userId: string, mode: SessionMode, transport: SessionTransport): void {
    if (this.subscriptions.has(sessionId)) return;
    if (!this.dashboards.has(sessionId)) this.dashboards.set(sessionId, createInitialDashboardState(sessionId, mode));
    const subscription = new SessionSubscription(sessionId, userId, transport);
    this.subscriptions.set(sessionId, subscription);
    this.router.register(sessionId, userId, (event) => this.handleEvent(sessionId, event));
    this.log({ type: "subscription_created", sessionId });
  }

  /** Stops this session's client-side stream only — never stops the underlying runtime (that's SessionManager's job). */
  unsubscribe(sessionId: string): void {
    this.subscriptions.get(sessionId)?.disconnect();
    this.subscriptions.delete(sessionId);
    this.router.unregister(sessionId);
    this.log({ type: "subscription_removed", sessionId });
  }

  /** Only called when the session record itself is gone (not on a plain tab close). */
  discardDashboard(sessionId: string): void {
    this.unsubscribe(sessionId);
    this.dashboards.delete(sessionId);
  }

  getDashboard(sessionId: string): DashboardState | undefined {
    return this.dashboards.get(sessionId);
  }

  getHealth(sessionId: string, now: number = Date.now()): HealthState {
    const state = this.dashboards.get(sessionId);
    if (!state) return "DISCONNECTED";
    return computeHealth(state, now, STALE_AFTER_MS);
  }

  onNotification(listener: NotificationListener): () => void {
    this.notificationListeners.add(listener);
    return () => this.notificationListeners.delete(listener);
  }

  /** Called by the UI on its own schedule (e.g. one setInterval) — the only timer this whole layer needs. */
  async tick(now: number = Date.now()): Promise<void> {
    for (const [sessionId, subscription] of this.subscriptions) {
      const wasConnected = subscription.status === "CONNECTED";
      const events = await subscription.poll(now);
      if (events.length === 0) continue;
      const isSnapshotBatch = !wasConnected; // subscription only fetches a full snapshot while not CONNECTED
      this.applyBatch(sessionId, events, isSnapshotBatch);
    }
  }

  private applyBatch(sessionId: string, events: RuntimeEvent[], isSnapshot: boolean): void {
    const current = this.dashboards.get(sessionId);
    if (!current) return;
    const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    if (isSnapshot) {
      // Atomic replace — never a partial merge of a reconciliation snapshot.
      let next = createInitialDashboardState(sessionId, current.mode);
      for (const event of sorted) next = applyRuntimeEvent(next, event);
      this.dashboards.set(sessionId, next);
      for (const event of sorted) this.route(sessionId, event);
      return;
    }

    const firstExpected = current.lastSequenceNumber + 1;
    if (sorted[0].sequenceNumber > firstExpected) {
      this.log({ type: "sequence_gap", sessionId, expected: firstExpected, received: sorted[0].sequenceNumber });
      this.subscriptions.get(sessionId)?.requestResync(); // next tick fetches a full snapshot instead of continuing to merge
      return;
    }

    let next = current;
    for (const event of sorted) next = applyRuntimeEvent(next, event);
    this.dashboards.set(sessionId, next);
    for (const event of sorted) this.route(sessionId, event);
  }

  private route(sessionId: string, event: RuntimeEvent): void {
    this.router.route(event);
    if (NOTIFIABLE_EVENT_TYPES.has(event.eventType)) {
      this.notificationListeners.forEach((l) => l(event));
    }
  }

  /** Router delivery target — re-validates the event still belongs to this session before touching its store. */
  private handleEvent(sessionId: string, event: RuntimeEvent): void {
    if (event.sessionId !== sessionId) return; // defensive: never let a mismatched event reach this dashboard
    // The store mutation itself already happened in applyBatch (single source of truth for ordering);
    // this hook exists for future backend-push transports where events arrive outside tick().
  }
}

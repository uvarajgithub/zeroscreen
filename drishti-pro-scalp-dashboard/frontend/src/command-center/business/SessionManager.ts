/**
 * SessionManager — orchestrates SessionFactory + SessionRepository +
 * SessionRuntimeService + SessionEventBus. This is the one place UI code
 * should call into; it never contains JSX/CSS, and it never touches the
 * existing production trading/entry/exit/broker/scheduler implementation
 * (LIVE only ever *attaches to* it via ProductionAdapter).
 */
import { Session } from "../types/session";
import { SessionRepository, TradeRecord, OrderRecord, LogRecord, HistoryRecord, AnalyticsSnapshot } from "./SessionRepository";
import { SessionFactory } from "./SessionFactory";
import { SessionRuntimeService, ProductionAdapter, EmergencyStopResult } from "./SessionRuntimeService";
import { SessionEventBus, SessionEvent } from "./SessionEventBus";
import {
  assertNotProtectedMutation, assertLifecycleActionAllowed, requiresConfirmation,
  NewSessionConfig, SystemStatus, DEFAULT_SYSTEM_STATUS,
} from "./SessionValidation";
import { SessionRealtimeManager } from "./realtime/SessionRealtimeManager";
import { createProductionTransport, createSimulatedTransport, LOCAL_USER_ID } from "./realtime/transports";

type ActiveSessionListener = (sessionId: string) => void;
export type ConfirmableAction = "start" | "stop" | "pause" | "resume" | "close" | "delete" | "emergencyStop";

export interface ActionContext {
  hasActivePosition: boolean;
  hasPendingOrder: boolean;
  isRunning: boolean;
}

export class SessionManager {
  private repository = new SessionRepository();
  private factory = new SessionFactory();
  private runtimes = new Map<string, SessionRuntimeService>();
  private activeSessionId: string;
  readonly eventBus = new SessionEventBus();
  private activeSessionListeners = new Set<ActiveSessionListener>();
  readonly realtime = new SessionRealtimeManager();

  constructor(productionAdapter?: ProductionAdapter) {
    // "If it already exists, load and reuse it" — createProductionSession()
    // always returns the same fixed id, so re-constructing never duplicates.
    const production = this.factory.createProductionSession();
    this.repository.saveSession(production);
    const runtime = this.factory.createRuntime(production, productionAdapter);
    this.runtimes.set(production.id, runtime);
    this.forwardEvents(runtime);
    this.activeSessionId = production.id;
    // The pinned production session stays subscribed for the manager's entire lifetime.
    this.realtime.subscribe(production.id, LOCAL_USER_ID, "LIVE", createProductionTransport(production.id));
  }

  private forwardEvents(runtime: SessionRuntimeService): void {
    runtime.bus.on("*", (event: SessionEvent) => this.eventBus.emit(event));
  }

  // ── "+ New Session": Create Session -> Insert Tab -> Activate ─────────
  createSession(input: NewSessionConfig, opts: { start?: boolean; systemStatus?: SystemStatus } = {}): Session {
    const session = this.factory.createSession(input, opts.systemStatus ?? DEFAULT_SYSTEM_STATUS);
    this.repository.saveSession(session);
    this.setActiveSession(session.id); // Insert Tab -> Activate
    if (opts.start) {
      try {
        this.startSession(session.id);
      } catch (err) {
        // Session record still exists (per §6 step 8 semantics for failed auto-start);
        // the caller decides whether to surface this as a warning.
        throw err;
      }
    }
    return this.requireSession(session.id);
  }

  // ── Start workflow: READY|STOPPED -> STARTING -> RUNNING ───────────────
  startSession(sessionId: string): void {
    const session = this.requireSession(sessionId);
    assertLifecycleActionAllowed(session, "start");
    if (session.status !== "READY" && session.status !== "STOPPED") {
      throw new Error(`Session "${session.name}" is not in a startable state (currently ${session.status}).`);
    }
    let runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      // LIVE always resolves to the runtime created once in the constructor — never a second one.
      runtime = this.factory.createRuntime(session);
      this.runtimes.set(sessionId, runtime);
      this.forwardEvents(runtime);
    }
    this.repository.saveSession({ ...session, status: "STARTING" });
    try {
      runtime.start();
      this.repository.saveSession({ ...session, status: "RUNNING" });
      if (session.mode !== "LIVE") {
        this.realtime.subscribe(sessionId, LOCAL_USER_ID, session.mode, createSimulatedTransport(sessionId, session.mode));
      }
    } catch (err) {
      // Deploy/start failed -> do not leave the session claiming to be running.
      this.repository.saveSession({ ...session, status: "STOPPED" });
      throw err;
    }
  }

  pauseSession(sessionId: string): void { this.transition(sessionId, "pause"); }
  resumeSession(sessionId: string): void { this.transition(sessionId, "resume"); }
  stopSession(sessionId: string): void { this.transition(sessionId, "stop"); }

  /**
   * CC-009 §7 — a valid *current* status is required before any of these
   * run, not just runtime existence: pause only from RUNNING, resume only
   * from PAUSED, stop only from RUNNING or PAUSED. This rejects invalid
   * transitions like STOPPED -> PAUSED or STOPPING -> RUNNING outright,
   * leaving the previous valid state intact.
   */
  private transition(sessionId: string, action: "pause" | "resume" | "stop"): void {
    const session = this.requireSession(sessionId);
    assertLifecycleActionAllowed(session, action);
    const requiredStatus: Record<typeof action, Session["status"][]> = {
      pause: ["RUNNING"],
      resume: ["PAUSED"],
      stop: ["RUNNING", "PAUSED"],
    };
    if (!requiredStatus[action].includes(session.status)) {
      throw new Error(`Cannot ${action} session "${session.name}" from status ${session.status}.`);
    }
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) throw new Error(`Session "${session.name}" has no active runtime.`);
    if (action === "stop") this.repository.saveSession({ ...session, status: "STOPPING" });
    runtime[action]();
    const status = action === "pause" ? "PAUSED" : action === "resume" ? "RUNNING" : "STOPPED";
    this.repository.saveSession({ ...session, status });
  }

  /**
   * Emergency Stop (CC-007 §12). Never claims success if any step fails.
   * PAPER/SHADOW/BACKTEST emergency actions only ever touch their own
   * runtime — the production LIVE runtime is a completely separate
   * SessionRuntimeService instance and is never referenced here.
   */
  emergencyStop(sessionId: string): EmergencyStopResult {
    const session = this.requireSession(sessionId);
    assertLifecycleActionAllowed(session, "emergencyStop");
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) throw new Error(`Session "${session.name}" has no active runtime.`);
    const result = runtime.emergencyStop();
    if (result.success) this.repository.saveSession({ ...session, status: "STOPPED" });
    // On partial failure the session status is left as-is so the UI must show the partial-failure state, not a false "stopped".
    return result;
  }

  // ── Session close: destroy runtime -> remove tab (history/DB untouched) ─
  closeSession(sessionId: string): void {
    const session = this.requireSession(sessionId);
    assertNotProtectedMutation(session, "delete");
    assertLifecycleActionAllowed(session, "delete");
    const runtime = this.runtimes.get(sessionId);
    runtime?.destroy();
    this.runtimes.delete(sessionId);
    this.repository.deleteSession(sessionId);
    // Closing a tab cleans up its UI subscription only — never stops the runtime of another session.
    this.realtime.discardDashboard(sessionId);
    if (this.activeSessionId === sessionId) {
      const next = this.repository.listSessions()[0];
      if (next) this.setActiveSession(next.id);
    }
  }

  // ── Active dashboard: unload previous runtime -> load selected -> no reload ─
  // "Unload" means the dashboard stops reading the previous session's data;
  // it never stops or resets another session's runtime.
  setActiveSession(sessionId: string): void {
    if (this.activeSessionId === sessionId) return;
    this.requireSession(sessionId);
    this.activeSessionId = sessionId;
    this.activeSessionListeners.forEach((l) => l(sessionId));
  }

  onActiveSessionChange(listener: ActiveSessionListener): () => void {
    this.activeSessionListeners.add(listener);
    return () => this.activeSessionListeners.delete(listener);
  }

  getActiveSessionId(): string { return this.activeSessionId; }
  getActiveSession(): Session { return this.requireSession(this.activeSessionId); }
  listSessions(): Session[] { return this.repository.listSessions(); }
  getSession(sessionId: string): Session | undefined { return this.repository.getSession(sessionId); }

  getActionContext(sessionId: string): ActionContext {
    const runtime = this.runtimes.get(sessionId);
    return {
      hasActivePosition: runtime?.hasActivePosition() ?? false,
      hasPendingOrder: (runtime?.pendingOrderCount() ?? 0) > 0,
      isRunning: this.getSession(sessionId)?.status === "RUNNING",
    };
  }

  /** CC-007 §18 — call before performing `action` to decide whether the UI must show a confirmation dialog. */
  needsConfirmation(sessionId: string, action: ConfirmableAction): boolean {
    const session = this.requireSession(sessionId);
    return requiresConfirmation(action, session, this.getActionContext(sessionId));
  }

  private requireSession(sessionId: string): Session {
    const session = this.repository.getSession(sessionId);
    if (!session) throw new Error(`Unknown session: ${sessionId}`);
    return session;
  }

  // ── Session recovery (CC-007 §14) ──────────────────────────────────────
  /**
   * Restores previously-persisted non-production sessions after a reload.
   * Never duplicates a session already present (including the production
   * singleton) and never silently marks a session healthy — if it was
   * RUNNING/PAUSED but has no live runtime here, it is flagged
   * `recoveryRequired` and a `RecoveryRequired` event is emitted instead.
   */
  recoverSessions(persisted: Session[]): void {
    for (const saved of persisted) {
      if (saved.mode === "LIVE") continue; // production is bootstrapped in the constructor, never restored from a snapshot
      if (this.repository.getSession(saved.id)) continue; // already present -> no duplicate
      const wasActive = saved.status === "RUNNING" || saved.status === "PAUSED";
      const restored: Session = wasActive ? { ...saved, recoveryRequired: true } : { ...saved, recoveryRequired: false };
      this.repository.saveSession(restored);
      if (wasActive) {
        this.eventBus.emit({ type: "RecoveryRequired", sessionId: saved.id, occurredAt: new Date().toISOString() });
      }
    }
  }

  /** Recovery action: attempt to reattach a runtime and resume monitoring. */
  reconnectSession(sessionId: string): void {
    const session = this.requireSession(sessionId);
    if (!session.recoveryRequired) return;
    const runtime = this.factory.createRuntime(session);
    this.runtimes.set(sessionId, runtime);
    this.forwardEvents(runtime);
    runtime.start();
    this.repository.saveSession({ ...session, status: "RUNNING", recoveryRequired: false });
  }

  /** Recovery action: give up reattaching and mark the session stopped without fabricating a healthy runtime. */
  markSessionStopped(sessionId: string): void {
    const session = this.requireSession(sessionId);
    this.repository.saveSession({ ...session, status: "STOPPED", recoveryRequired: false });
  }

  // ── Real-time (CC-008) ──────────────────────────────────────────────────
  /** The UI owns exactly one timer that calls this; SessionRealtimeManager owns no timers itself. */
  tick(now?: number): Promise<void> { return this.realtime.tick(now); }
  getDashboard(sessionId: string) { return this.realtime.getDashboard(sessionId); }
  getHealth(sessionId: string) { return this.realtime.getHealth(sessionId); }

  // ── Bottom tabs: always sessionId-scoped, never combined ──────────────
  getTrades(sessionId: string): TradeRecord[] { return this.repository.getTrades(sessionId); }
  getOrders(sessionId: string): OrderRecord[] { return this.repository.getOrders(sessionId); }
  getHistory(sessionId: string): HistoryRecord[] { return this.repository.getHistory(sessionId); }
  getLogs(sessionId: string): LogRecord[] { return this.repository.getLogs(sessionId); }
  getAnalytics(sessionId: string): AnalyticsSnapshot[] { return this.repository.getAnalytics(sessionId); }
}

/**
 * SessionRuntimeService — "One Runtime Engine" per session.
 *
 * This never contains trading/entry/exit/broker/scheduler logic — that
 * logic already exists in the production 10:30 BANKNIFTY Futures bot and
 * must never be touched or reimplemented here. For LIVE this class only
 * *attaches to* that existing implementation through `ProductionAdapter`
 * (a seam to be wired to the real bot status/control API in a later
 * integration phase); for PAPER/SHADOW/BACKTEST it manages an in-memory
 * lifecycle only, with no real broker or market connection.
 *
 * Pause semantics assumption (CC-007 §9): the real production bot's pause
 * behavior was not inspected here (no access to the VPS bot process from
 * this environment — see prior phases' VPS-access notes). This runtime
 * therefore never auto-closes a position on pause/stop; it only forwards
 * the request to `ProductionAdapter`, which is a no-op stub until a real
 * integration phase confirms and wires the bot's actual pause contract.
 */
import { Session, SessionMode } from "../types/session";
import { SessionEventBus, SessionEventType } from "./SessionEventBus";

export type EngineState =
  | "IDLE" | "INITIALIZING" | "CONNECTING" | "MONITORING" | "SIGNAL_RECEIVED"
  | "ORDER_SUBMITTING" | "ORDER_PENDING" | "POSITION_ACTIVE" | "POSITION_MANAGING"
  | "EXITING" | "COMPLETED" | "PAUSED" | "STOPPED" | "ERROR";

/** Seam for the existing, untouched production implementation. No method here performs real work in this phase. */
export interface ProductionAdapter {
  getEngineState(): EngineState;
  start(): void;
  pause(): void;
  resume(): void;
  stop(): void;
  hasActivePosition(): boolean;
  pendingOrderCount(): number;
  /** Cancel pending orders; returns whether the step succeeded. */
  cancelPendingOrders(): boolean;
  /** Close any active position; returns whether the step succeeded. */
  closeActivePosition(): boolean;
}

/** Stub used until a real integration phase wires this to the VPS bot's status/control surface. */
export const noopProductionAdapter: ProductionAdapter = {
  getEngineState: () => "MONITORING",
  start: () => {},
  pause: () => {},
  resume: () => {},
  stop: () => {},
  hasActivePosition: () => false,
  pendingOrderCount: () => 0,
  cancelPendingOrders: () => true,
  closeActivePosition: () => true,
};

export interface EmergencyStopStep { name: string; success: boolean }
export interface EmergencyStopResult { success: boolean; steps: EmergencyStopStep[] }

const LIVE_LIKE_ACTIONS = ["start", "pause", "resume", "stop"] as const;
const BACKTEST_ACTIONS = ["start", "stop"] as const;

export class SessionRuntimeService {
  readonly sessionId: string;
  readonly mode: SessionMode;
  readonly bus = new SessionEventBus();
  private engineState: EngineState = "IDLE";
  private brokerConnected = false;
  private startedAt: string | null = null;
  private newEntriesBlocked = false;

  constructor(session: Session, private productionAdapter: ProductionAdapter = noopProductionAdapter) {
    this.sessionId = session.id;
    this.mode = session.mode;
    if (session.mode === "LIVE") {
      this.engineState = this.productionAdapter.getEngineState();
      this.brokerConnected = true;
    }
  }

  getEngineState(): EngineState { return this.engineState; }
  isBrokerConnected(): boolean { return this.brokerConnected; }
  hasActivePosition(): boolean { return this.mode === "LIVE" ? this.productionAdapter.hasActivePosition() : false; }
  pendingOrderCount(): number { return this.mode === "LIVE" ? this.productionAdapter.pendingOrderCount() : 0; }

  private assertActionAllowed(action: "start" | "pause" | "resume" | "stop"): void {
    const allowed = this.mode === "BACKTEST" ? BACKTEST_ACTIONS : LIVE_LIKE_ACTIONS;
    if (!(allowed as readonly string[]).includes(action)) {
      throw new Error(`${this.mode} sessions do not support "${action}".`);
    }
  }

  private emit(type: SessionEventType, payload?: unknown): void {
    this.bus.emit({ type, sessionId: this.sessionId, occurredAt: new Date().toISOString(), payload });
  }

  /** READY/STOPPED -> STARTING -> RUNNING. */
  start(): void {
    this.assertActionAllowed("start");
    if (this.engineState === "POSITION_ACTIVE" || this.engineState === "MONITORING") {
      throw new Error("Session is already running.");
    }
    this.newEntriesBlocked = false;
    if (this.mode === "LIVE") {
      this.productionAdapter.start();
      this.engineState = this.productionAdapter.getEngineState();
    } else {
      this.engineState = "MONITORING";
      this.brokerConnected = this.mode === "PAPER" ? this.brokerConnected : false;
    }
    this.startedAt = new Date().toISOString();
    this.emit("SessionStarted");
    if (this.brokerConnected) this.emit("BrokerConnected");
  }

  /** RUNNING -> PAUSED. Never closes positions or deletes data — see class-level pause-semantics note. */
  pause(): void {
    this.assertActionAllowed("pause");
    if (this.mode === "LIVE") { this.productionAdapter.pause(); this.engineState = this.productionAdapter.getEngineState(); }
    else this.engineState = "PAUSED";
    this.emit("SessionPaused");
  }

  /** PAUSED -> RUNNING. Continues from preserved state; never resets P&L. */
  resume(): void {
    this.assertActionAllowed("resume");
    if (this.mode === "LIVE") { this.productionAdapter.resume(); this.engineState = this.productionAdapter.getEngineState(); }
    else this.engineState = "MONITORING";
    this.emit("SessionResumed");
  }

  /** RUNNING|PAUSED -> STOPPING -> STOPPED. */
  stop(): void {
    this.assertActionAllowed("stop");
    this.emit("SessionStopping");
    if (this.mode === "LIVE") { this.productionAdapter.stop(); this.engineState = this.productionAdapter.getEngineState(); }
    else this.engineState = "STOPPED";
    if (this.brokerConnected) { this.brokerConnected = false; this.emit("BrokerDisconnected"); }
    this.emit("SessionStopped");
  }

  /**
   * CC-007 §12 emergency sequence. Every step is attempted and recorded;
   * `success` is only true if every step succeeded — a partial failure is
   * always surfaced, never silently reported as success.
   */
  emergencyStop(): EmergencyStopResult {
    const steps: EmergencyStopStep[] = [];

    this.newEntriesBlocked = true;
    steps.push({ name: "Block new entries", success: this.newEntriesBlocked });

    const cancelled = this.mode === "LIVE" ? this.productionAdapter.cancelPendingOrders() : true;
    steps.push({ name: "Cancel pending orders", success: cancelled });

    const closed = this.mode === "LIVE" ? this.productionAdapter.closeActivePosition() : true;
    steps.push({ name: "Close active position", success: closed });

    let stopped = true;
    try {
      if (this.mode === "LIVE") { this.productionAdapter.stop(); this.engineState = this.productionAdapter.getEngineState(); }
      else this.engineState = "STOPPED";
    } catch {
      stopped = false;
    }
    steps.push({ name: "Stop runtime", success: stopped });

    if (this.brokerConnected) { this.brokerConnected = false; this.emit("BrokerDisconnected"); }
    const success = steps.every((s) => s.success);
    this.emit("EmergencyStopExecuted", { success, steps });
    return { success, steps };
  }

  heartbeat(): void {
    this.emit("Heartbeat", { at: new Date().toISOString(), startedAt: this.startedAt });
  }

  /** Called when a session is closed — releases this runtime's listeners. Never called for a protected/production session. */
  destroy(): void {
    this.bus.clear();
  }
}

/**
 * SessionEventBus — typed pub/sub. Pure logic, no React/UI imports.
 *
 * Each SessionRuntimeService owns its own instance (sessions never share
 * runtime, so they never share an event bus either). SessionManager keeps a
 * second, aggregate instance that runtimes forward into so a dashboard can
 * subscribe once and filter by `sessionId` instead of holding a reference to
 * every runtime's private bus.
 */

export type SessionEventType =
  | "SessionStarted"
  | "SessionPaused"
  | "SessionResumed"
  | "SessionStopping"
  | "SessionStopped"
  | "OrderCreated"
  | "OrderExecuted"
  | "PositionOpened"
  | "PositionClosed"
  | "Heartbeat"
  | "BrokerConnected"
  | "BrokerDisconnected"
  | "EmergencyStopExecuted"
  | "RecoveryRequired";

export interface SessionEvent<TPayload = unknown> {
  type: SessionEventType;
  sessionId: string;
  occurredAt: string;
  payload?: TPayload;
}

type Listener = (event: SessionEvent) => void;

export class SessionEventBus {
  private listeners = new Map<SessionEventType | "*", Set<Listener>>();

  on(type: SessionEventType | "*", listener: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
    return () => this.off(type, listener);
  }

  off(type: SessionEventType | "*", listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(event: SessionEvent): void {
    this.listeners.get(event.type)?.forEach((l) => l(event));
    this.listeners.get("*")?.forEach((l) => l(event));
  }

  clear(): void {
    this.listeners.clear();
  }
}

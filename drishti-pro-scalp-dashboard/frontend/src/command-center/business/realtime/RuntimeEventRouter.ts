/**
 * RuntimeEventRouter — the single place an incoming RuntimeEvent is
 * validated and routed. A dashboard never applies an event whose
 * sessionId doesn't match it; ownership (userId) and session-registration
 * are checked here before the event ever reaches a DashboardState.
 */
import { RuntimeEvent } from "./RuntimeEvent";
import { DashboardState, applyRuntimeEvent } from "./SessionRuntimeStore";

export type ObservabilityEvent =
  | { type: "subscription_created"; sessionId: string }
  | { type: "subscription_removed"; sessionId: string }
  | { type: "reconnect_attempt"; sessionId: string; attempt: number }
  | { type: "snapshot_requested"; sessionId: string; reason: string }
  | { type: "sequence_gap"; sessionId: string; expected: number; received: number }
  | { type: "stale_session_detected"; sessionId: string }
  | { type: "event_rejected_ownership_mismatch"; sessionId: string; eventUserId: string }
  | { type: "event_rejected_session_mismatch"; sessionId: string; eventSessionId: string };

export type ObservabilityLogger = (event: ObservabilityEvent) => void;

/** No-op by default — never logs tokens/PII; callers may wire this to their own sink. */
export const noopObservabilityLogger: ObservabilityLogger = () => {};

interface RegisteredSession {
  sessionId: string;
  userId: string;
  onEvent: (event: RuntimeEvent) => void;
}

export class RuntimeEventRouter {
  private registry = new Map<string, RegisteredSession>();

  constructor(private log: ObservabilityLogger = noopObservabilityLogger) {}

  register(sessionId: string, userId: string, onEvent: (event: RuntimeEvent) => void): void {
    this.registry.set(sessionId, { sessionId, userId, onEvent });
  }

  unregister(sessionId: string): void {
    this.registry.delete(sessionId);
  }

  /** Validates ownership + session scope, then delivers the event only to its own session. Never broadcasts. */
  route(event: RuntimeEvent): void {
    const target = this.registry.get(event.sessionId);
    if (!target) {
      this.log({ type: "event_rejected_session_mismatch", sessionId: event.sessionId, eventSessionId: event.sessionId });
      return;
    }
    if (target.userId !== event.userId) {
      this.log({ type: "event_rejected_ownership_mismatch", sessionId: event.sessionId, eventUserId: event.userId });
      return;
    }
    target.onEvent(event);
  }
}

/** Convenience — apply an event to a DashboardState only if it actually belongs to that state's session. */
export function applyIfOwned(state: DashboardState, event: RuntimeEvent): DashboardState {
  if (event.sessionId !== state.sessionId) return state;
  return applyRuntimeEvent(state, event);
}

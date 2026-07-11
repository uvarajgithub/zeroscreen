/**
 * SessionSubscription — one isolated channel for one session. Owns no
 * timers itself (SessionRealtimeManager calls `poll(now)` on a schedule it
 * owns and can clean up); this keeps reconnect/backoff logic deterministic
 * and unit-testable without fake wall-clock timers.
 */
import { RuntimeEvent } from "./RuntimeEvent";
import { nextBackoffDelay, SnapshotReason } from "./ConnectionRecoveryService";

export type SubscriptionStatus = "CONNECTED" | "RECONNECTING" | "DISCONNECTED";

export interface SessionTransport {
  /** Incremental fetch — returns events with sequenceNumber > `since`. Reused production-safe polling adapter. */
  fetchEvents(since: number): Promise<RuntimeEvent[]>;
  /** Full snapshot — always requested on first connect, reconnect, or a detected sequence gap. */
  fetchSnapshot(reason: SnapshotReason): Promise<RuntimeEvent[]>;
}

export class SessionSubscription {
  status: SubscriptionStatus = "DISCONNECTED";
  private attempt = 0;
  private nextAttemptAt = 0;
  lastSequenceNumber = 0;

  constructor(
    readonly sessionId: string,
    readonly userId: string,
    private transport: SessionTransport,
  ) {}

  /** Returns the events to apply this tick, or an empty array while backing off / mid-cooldown. */
  async poll(now: number): Promise<RuntimeEvent[]> {
    if (this.status === "RECONNECTING" && now < this.nextAttemptAt) return [];
    try {
      const needsSnapshot = this.status !== "CONNECTED";
      const events = needsSnapshot
        ? await this.transport.fetchSnapshot(this.status === "DISCONNECTED" ? "initial" : "reconnect")
        : await this.transport.fetchEvents(this.lastSequenceNumber);
      this.status = "CONNECTED";
      this.attempt = 0;
      if (events.length > 0) this.lastSequenceNumber = Math.max(this.lastSequenceNumber, ...events.map((e) => e.sequenceNumber));
      return events;
    } catch {
      this.attempt += 1;
      this.status = "RECONNECTING";
      this.nextAttemptAt = now + nextBackoffDelay(this.attempt - 1);
      return [];
    }
  }

  /** Forces the next poll to request a full snapshot (e.g. a detected sequence gap). */
  requestResync(): void {
    this.status = "RECONNECTING";
    this.nextAttemptAt = 0;
  }

  disconnect(): void {
    this.status = "DISCONNECTED";
  }
}

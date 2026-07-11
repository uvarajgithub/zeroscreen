/**
 * ConnectionRecoveryService — exponential backoff + snapshot reconciliation
 * policy, shared by every SessionSubscription. Pure scheduling logic, no
 * timers owned here (the subscription/manager owns timer lifecycles so
 * they can be cleaned up deterministically).
 */

export const RECONNECT_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000] as const;

export function nextBackoffDelay(attempt: number): number {
  const index = Math.min(attempt, RECONNECT_BACKOFF_MS.length - 1);
  return RECONNECT_BACKOFF_MS[index];
}

/** A full snapshot must be requested after a reload, reconnect, long inactivity, or a detected sequence gap. */
export type SnapshotReason = "initial" | "reconnect" | "long_inactivity" | "sequence_gap" | "runtime_recovery";

export function shouldRequestSnapshot(reason: SnapshotReason): boolean {
  return true; // every one of CC-008's listed triggers requires a full snapshot — never a partial merge.
}

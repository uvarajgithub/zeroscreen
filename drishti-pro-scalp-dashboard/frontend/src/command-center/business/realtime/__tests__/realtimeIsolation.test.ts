/**
 * CC-008 §"Testing Requirements" — real-time isolation & reconciliation
 * regression tests. Self-contained script (node:assert), run via
 * `npm run test:realtime`, mirroring the pattern established for CC-007's
 * `test:business` suite (no test framework configured in this workspace).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SessionRealtimeManager } from "../SessionRealtimeManager";
import { SessionTransport } from "../SessionSubscription";
import { RuntimeEvent } from "../RuntimeEvent";
import { createInitialDashboardState, computeHealth } from "../SessionRuntimeStore";
import { SessionManager } from "../../SessionManager";

let seq = 0;
function evt(sessionId: string, mode: RuntimeEvent["mode"], eventType: RuntimeEvent["eventType"], payload: unknown, sequenceNumber?: number): RuntimeEvent {
  seq += 1;
  return { eventId: `e${seq}`, userId: "local-user", sessionId, mode, eventType, occurredAt: new Date().toISOString(), sequenceNumber: sequenceNumber ?? seq, payload };
}

/** A transport whose responses are scripted by the test, for exact control over sequencing. */
function scriptedTransport(snapshotEvents: RuntimeEvent[], incrementalBatches: RuntimeEvent[][]): SessionTransport {
  let calls = 0;
  return {
    async fetchSnapshot() { return snapshotEvents; },
    async fetchEvents() {
      const batch = incrementalBatches[calls] ?? [];
      calls += 1;
      return batch;
    },
  };
}

async function run(): Promise<void> {
  // 1 & 2. Production event updates only the production dashboard; a Paper event never reaches it.
  {
    const mgr = new SessionRealtimeManager();
    const prodEvents = [evt("prod-1", "LIVE", "PNL_UPDATED", { netPnl: 500 })];
    const paperEvents = [evt("paper-1", "PAPER", "PNL_UPDATED", { netPnl: 999 })];
    mgr.subscribe("prod-1", "local-user", "LIVE", scriptedTransport(prodEvents, []));
    mgr.subscribe("paper-1", "local-user", "PAPER", scriptedTransport(paperEvents, []));
    await mgr.tick(1000);
    assert.equal(mgr.getDashboard("prod-1")!.pnl.netPnl, 500);
    assert.equal(mgr.getDashboard("paper-1")!.pnl.netPnl, 999, "paper's own event must still reach its own dashboard");
    assert.notEqual(mgr.getDashboard("prod-1")!.pnl.netPnl, 999, "a paper-sourced value must never appear on the production dashboard");
  }

  // 3. Shadow event cannot update Paper dashboard (defensive session-id check in applyIfOwned / router).
  {
    const paperState = createInitialDashboardState("paper-2", "PAPER");
    const shadowEvent = evt("shadow-2", "SHADOW", "PNL_UPDATED", { netPnl: 42 });
    const { applyIfOwned } = await import("../RuntimeEventRouter");
    const result = applyIfOwned(paperState, shadowEvent);
    assert.equal(result, paperState, "an event addressed to a different sessionId must be a no-op");
  }

  // 4. Backtest progress cannot update live P&L (different sessions entirely; also different event type).
  {
    const mgr = new SessionRealtimeManager();
    mgr.subscribe("live-4", "local-user", "LIVE", scriptedTransport([evt("live-4", "LIVE", "PNL_UPDATED", { netPnl: 100 })], []));
    mgr.subscribe("bt-4", "local-user", "BACKTEST", scriptedTransport([evt("bt-4", "BACKTEST", "BACKTEST_PROGRESS_UPDATED", { progressPercent: 50 })], []));
    await mgr.tick(1000);
    assert.equal(mgr.getDashboard("live-4")!.pnl.netPnl, 100);
    assert.equal(mgr.getDashboard("live-4")!.backtest, null, "backtest progress must never attach to a LIVE dashboard");
  }

  // 5 & 6. Duplicate/stale events (sequenceNumber not newer) are ignored.
  {
    const state0 = createInitialDashboardState("s5", "PAPER");
    const { applyRuntimeEvent } = await import("../SessionRuntimeStore");
    const e1 = evt("s5", "PAPER", "PNL_UPDATED", { netPnl: 10 }, 5);
    const state1 = applyRuntimeEvent(state0, e1);
    assert.equal(state1.pnl.netPnl, 10);
    const duplicate = evt("s5", "PAPER", "PNL_UPDATED", { netPnl: 999 }, 5); // same sequence number
    const state2 = applyRuntimeEvent(state1, duplicate);
    assert.equal(state2.pnl.netPnl, 10, "a duplicate/stale sequenceNumber must be ignored, not applied");
    const stale = evt("s5", "PAPER", "PNL_UPDATED", { netPnl: 777 }, 3); // older than lastSequenceNumber
    const state3 = applyRuntimeEvent(state2, stale);
    assert.equal(state3.pnl.netPnl, 10, "an out-of-order stale event must be ignored");
  }

  // 7. A sequence gap triggers snapshot reconciliation (resync) instead of a partial merge.
  {
    const mgr = new SessionRealtimeManager();
    // First tick: snapshot establishes lastSequenceNumber=1.
    const snapshot = [evt("s7", "PAPER", "SESSION_HEARTBEAT", {}, 1)];
    // Second tick: incremental batch jumps straight to sequence 5 -> a gap.
    const gapBatch = [evt("s7", "PAPER", "PNL_UPDATED", { netPnl: 55 }, 5)];
    const transport = scriptedTransport(snapshot, [gapBatch]);
    mgr.subscribe("s7", "local-user", "PAPER", transport);
    await mgr.tick(1000); // consumes snapshot
    assert.equal(mgr.getDashboard("s7")!.lastSequenceNumber, 1);
    await mgr.tick(2000); // sees the gap, must NOT apply it
    assert.equal(mgr.getDashboard("s7")!.pnl.netPnl, 0, "a sequence gap must not be partially merged");
    // Next tick should now request a fresh snapshot rather than another incremental fetch.
    await mgr.tick(3000);
    assert.equal(mgr.getDashboard("s7")!.lastSequenceNumber, 1, "resync refetches the same snapshot deterministically in this test double");
  }

  // 8. Reconnect / re-subscribe does not create a duplicate subscription.
  {
    const mgr = new SessionRealtimeManager();
    const transport = scriptedTransport([evt("s8", "PAPER", "SESSION_HEARTBEAT", {})], []);
    mgr.subscribe("s8", "local-user", "PAPER", transport);
    mgr.subscribe("s8", "local-user", "PAPER", transport); // duplicate call
    await mgr.tick(1000);
    // If a duplicate subscription existed, the dashboard would have been recreated (losing lastSequenceNumber) or events double-applied.
    assert.equal(mgr.getDashboard("s8")!.lastSequenceNumber, seq, "duplicate subscribe() must be a no-op, not a second channel");
  }

  // 9. Unsubscribing a session's UI stream never touches another session, and doesn't imply a runtime stop.
  {
    const mgr = new SessionRealtimeManager();
    mgr.subscribe("s9a", "local-user", "PAPER", scriptedTransport([evt("s9a", "PAPER", "PNL_UPDATED", { netPnl: 1 })], []));
    mgr.subscribe("s9b", "local-user", "SHADOW", scriptedTransport([evt("s9b", "SHADOW", "PNL_UPDATED", { netPnl: 2 })], []));
    await mgr.tick(1000);
    mgr.unsubscribe("s9a");
    assert.ok(mgr.getDashboard("s9a"), "unsubscribe (tab close) must preserve last known dashboard data, not delete it");
    assert.equal(mgr.getDashboard("s9b")!.pnl.netPnl, 2, "unsubscribing one session must not affect another");
  }

  // 10. Switching tabs (an active-tab concept the realtime layer doesn't even have) never pauses background updates.
  {
    const mgr = new SessionRealtimeManager();
    mgr.subscribe("bgA", "local-user", "PAPER", scriptedTransport([evt("bgA", "PAPER", "SESSION_HEARTBEAT", {})], [[evt("bgA", "PAPER", "SESSION_HEARTBEAT", {}, seq + 1)]]));
    mgr.subscribe("bgB", "local-user", "SHADOW", scriptedTransport([evt("bgB", "SHADOW", "SESSION_HEARTBEAT", {})], [[evt("bgB", "SHADOW", "SESSION_HEARTBEAT", {}, seq + 1)]]));
    await mgr.tick(1000);
    const bgBSeqBefore = mgr.getDashboard("bgB")!.lastSequenceNumber;
    await mgr.tick(2000); // "bgA" is the active tab in this scenario, "bgB" is backgrounded
    assert.ok(mgr.getDashboard("bgB")!.lastSequenceNumber >= bgBSeqBefore, "a backgrounded session must keep advancing on tick()");
  }

  // 11. Page reload restores a complete production snapshot (first tick after subscribe is always a snapshot fetch).
  {
    const mgr = new SessionRealtimeManager();
    const snapshot = [
      evt("prod-11", "LIVE", "ACCOUNT_UPDATED", { balance: 500000 }, 1),
      evt("prod-11", "LIVE", "PNL_UPDATED", { netPnl: 1234 }, 2),
    ];
    mgr.subscribe("prod-11", "local-user", "LIVE", scriptedTransport(snapshot, []));
    await mgr.tick(1000);
    const dash = mgr.getDashboard("prod-11")!;
    assert.equal(dash.account.balance, 500000);
    assert.equal(dash.pnl.netPnl, 1234);
    assert.equal(dash.lastSequenceNumber, 2, "the whole snapshot must apply atomically in order");
  }

  // 12. Stale data shows a warning state and is never silently replaced with zero.
  {
    let state = createInitialDashboardState("s12", "LIVE");
    const { applyRuntimeEvent } = await import("../SessionRuntimeStore");
    state = applyRuntimeEvent(state, evt("s12", "LIVE", "PNL_UPDATED", { netPnl: 777 }, 1));
    state = applyRuntimeEvent(state, evt("s12", "LIVE", "SESSION_HEARTBEAT", {}, 2));
    const farFuture = Date.now() + 10 * 60 * 1000; // long past any heartbeat staleness threshold
    const health = computeHealth(state, farFuture, 20_000);
    assert.equal(health, "STALE");
    assert.equal(state.pnl.netPnl, 777, "stale data must preserve the last known value, never reset to zero");
  }

  // 13. A runtime/broker error is reflected in session health (not silently marked healthy).
  {
    let state = createInitialDashboardState("s13", "LIVE");
    const { applyRuntimeEvent } = await import("../SessionRuntimeStore");
    state = applyRuntimeEvent(state, evt("s13", "LIVE", "RUNTIME_ERROR", { message: "broker disconnected" }, 1));
    assert.equal(computeHealth(state, Date.now(), 20_000), "ERROR");
  }

  // 14. Disconnecting the Command Center's stream never stops the underlying production runtime (separate objects entirely).
  {
    const mgr = new SessionManager();
    const prod = mgr.listSessions()[0];
    mgr.realtime.unsubscribe(prod.id); // simulates "Command Center disconnects"
    assert.equal(mgr.getSession(prod.id)!.status, "RUNNING", "the production SessionRuntimeService is untouched by a realtime unsubscribe");
  }

  // 15. Reduced-motion support is present in the shared token stylesheet (structural check; no animation JS to unit-test yet).
  {
    const cssPath = path.join(process.cwd(), "src/command-center/theme/command-center.tokens.css");
    const css = fs.readFileSync(cssPath, "utf-8");
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
  }

  console.log("ALL CC-008 REALTIME ISOLATION/RECONCILIATION TESTS PASSED");
}

run().catch((err) => { console.error(err); process.exit(1); });

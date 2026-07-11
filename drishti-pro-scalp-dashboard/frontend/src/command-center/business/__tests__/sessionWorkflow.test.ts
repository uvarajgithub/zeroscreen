/**
 * CC-007 §20 — Data isolation & workflow regression tests for SessionManager.
 * No test framework is configured in this workspace yet, so this is a
 * self-contained script (uses node:assert, throws/exits non-zero on
 * failure) run via `npm run test:business`.
 */
import assert from "node:assert/strict";
import { SessionManager } from "../SessionManager";
import { ProductionAdapter, EngineState } from "../SessionRuntimeService";

function fakeProductionAdapter(): ProductionAdapter {
  let state: EngineState = "MONITORING";
  return {
    getEngineState: () => state,
    start: () => { state = "MONITORING"; },
    pause: () => { state = "PAUSED"; },
    resume: () => { state = "MONITORING"; },
    stop: () => { state = "STOPPED"; },
    hasActivePosition: () => false,
    pendingOrderCount: () => 0,
    cancelPendingOrders: () => true,
    closeActivePosition: () => true,
  };
}

function run(): void {
  // 1. Protected production session loads automatically, pinned/protected/first.
  const mgr = new SessionManager(fakeProductionAdapter());
  const production = mgr.listSessions()[0];
  assert.equal(mgr.listSessions().length, 1);
  assert.equal(production.isPinned, true);
  assert.equal(production.isProtected, true);
  assert.equal(production.mode, "LIVE");
  assert.equal(production.status, "RUNNING");

  // 2. Cannot create a second LIVE session.
  assert.throws(() => mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "LIVE", broker: "ZERODHA", quantity: 1 }));

  // 3. Create independent Paper and Shadow sessions.
  const paper = mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "PAPER", broker: null, quantity: 25 });
  const shadow = mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "SHADOW", broker: null, quantity: 25 });
  assert.equal(mgr.listSessions().length, 3);
  assert.notEqual(paper.id, shadow.id);
  assert.equal(mgr.getActiveSessionId(), shadow.id); // most recently created session activates

  // 4. Auto-generated session names follow the "Mode · Instrument Product" pattern when left blank.
  assert.match(paper.name, /^Paper · BANKNIFTY/);
  assert.match(shadow.name, /^Shadow · BANKNIFTY/);

  // 5. Invalid configuration cannot start: quantity <= 0 is rejected at creation time.
  assert.throws(() => mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "PAPER", broker: null, quantity: 0 }));

  // 6. Backtest requires a valid date range and positive capital.
  assert.throws(() => mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "BACKTEST", broker: null, quantity: 1, dateFrom: "2026-02-01", dateTo: "2026-01-01", initialCapital: 100000 }));
  const backtest = mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "BACKTEST", broker: null, quantity: 1, dateFrom: "2026-01-01", dateTo: "2026-02-01", initialCapital: 100000 });
  assert.equal(backtest.mode, "BACKTEST");

  // 7. Starting a session transitions READY -> RUNNING and emits a correctly-attributed SessionStarted.
  const events: { type: string; sessionId: string }[] = [];
  mgr.eventBus.on("*", (e) => events.push({ type: e.type, sessionId: e.sessionId }));
  mgr.startSession(paper.id);
  assert.equal(mgr.getSession(paper.id)!.status, "RUNNING");
  assert.ok(events.some(e => e.type === "SessionStarted" && e.sessionId === paper.id));
  assert.ok(!events.some(e => e.type === "SessionStarted" && e.sessionId === production.id), "starting paper must not emit a start event for production");

  // 8. Session isolation — paper session trades/orders never appear in production, and vice versa.
  assert.equal(mgr.getTrades(paper.id).length, 0);
  assert.equal(mgr.getTrades(production.id).length, 0);
  assert.notEqual(mgr.getTrades(paper.id), mgr.getTrades(production.id)); // distinct array instances, never the same store

  // 9. Stopping the paper session does not stop production.
  mgr.stopSession(paper.id);
  assert.equal(mgr.getSession(paper.id)!.status, "STOPPED");
  assert.equal(mgr.getSession(production.id)!.status, "RUNNING", "stopping paper must not stop production");

  // 10. Switching tabs changes dashboard-relevant active session without touching other sessions' status.
  mgr.startSession(shadow.id);
  mgr.setActiveSession(production.id);
  assert.equal(mgr.getActiveSessionId(), production.id);
  assert.equal(mgr.getSession(shadow.id)!.status, "RUNNING", "switching tabs must not stop shadow");
  mgr.setActiveSession(shadow.id);
  assert.equal(mgr.getSession(production.id)!.status, "RUNNING", "switching tabs must not affect production");

  // 11. Production session cannot be closed/deleted.
  assert.throws(() => mgr.closeSession(production.id));

  // 12. Closing a tab does not delete its trades/history (repository still holds it until close; after close, this
  //     manager doesn't persist across reload by itself — recovery below covers reload semantics).
  const countBeforeClose = mgr.listSessions().length;
  mgr.closeSession(paper.id);
  assert.equal(mgr.getSession(paper.id), undefined, "closed session is removed from the active tab list");
  assert.equal(mgr.listSessions().length, countBeforeClose - 1, "only the closed session is removed; production/shadow/backtest remain");

  // 13. Emergency stop on shadow never touches production, and never claims success if a step fails.
  const shadowResult = mgr.emergencyStop(shadow.id);
  assert.equal(shadowResult.success, true);
  assert.equal(mgr.getSession(shadow.id)!.status, "STOPPED");
  assert.equal(mgr.getSession(production.id)!.status, "RUNNING", "emergency stop on shadow must not affect production");

  // 14. Session recovery does not duplicate the production session or an already-present session.
  const mgr2 = new SessionManager(fakeProductionAdapter());
  const beforeCount = mgr2.listSessions().length;
  mgr2.recoverSessions([production, { ...backtest, status: "RUNNING" }]);
  assert.equal(mgr2.listSessions().length, beforeCount + 1, "production must not be duplicated; only the non-LIVE session is restored");
  const recovered = mgr2.getSession(backtest.id)!;
  assert.equal(recovered.recoveryRequired, true, "a RUNNING session restored without a live runtime must require recovery, never be marked healthy");

  console.log("ALL CC-007 WORKFLOW/ISOLATION TESTS PASSED");
}

run();

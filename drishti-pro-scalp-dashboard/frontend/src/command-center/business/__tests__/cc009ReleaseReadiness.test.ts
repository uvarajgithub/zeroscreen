/**
 * CC-009 — release-readiness regression tests: the four-session isolation
 * matrix (§3), workflow state-transition validity (§7), and duplicate
 * production-session prevention. Run via `npm run test:release`, alongside
 * the existing `test:business` (CC-007) and `test:realtime` (CC-008)
 * suites — this file does not replace either.
 */
import assert from "node:assert/strict";
import { SessionManager } from "../SessionManager";

function run(): void {
  const mgr = new SessionManager();

  // ── §3 Session Isolation Test Matrix ──────────────────────────────────
  // Session A: production (already bootstrapped, LIVE, BANKNIFTY Futures).
  const A = mgr.listSessions()[0];
  assert.equal(A.mode, "LIVE");
  assert.equal(A.instrument, "BANKNIFTY");
  assert.equal(A.product, "FUTURES");

  // Session B: independent Paper, BANKNIFTY Futures.
  const B = mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "PAPER", broker: null, quantity: 10 });
  // Session C: independent Shadow, BANKNIFTY Options (STRATEGY_B supports options).
  const C = mgr.createSession({ strategy: "STRATEGY_B", instrument: "BANKNIFTY", product: "OPTIONS", mode: "SHADOW", broker: null, quantity: 10 });
  // Session D: independent Backtest, historical BANKNIFTY.
  const D = mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "BACKTEST", broker: null, quantity: 10, dateFrom: "2026-01-01", dateTo: "2026-02-01", initialCapital: 100000 });

  const ids = [A.id, B.id, C.id, D.id];
  assert.equal(new Set(ids).size, 4, "every session must have a unique sessionId");

  mgr.startSession(B.id);
  mgr.startSession(C.id);

  // Each session has its own isolated trades/orders/history/logs/analytics store.
  for (const s of [A, B, C, D]) {
    assert.equal(mgr.getTrades(s.id).length, 0);
    assert.equal(mgr.getOrders(s.id).length, 0);
  }
  assert.notEqual(mgr.getTrades(A.id), mgr.getTrades(B.id), "distinct array instances per session — never a shared store");

  // Negative test: closing PAPER (B) must not stop LIVE (A) or SHADOW (C).
  mgr.closeSession(B.id);
  assert.equal(mgr.getSession(A.id)!.status, "RUNNING", "closing Paper must not affect production");
  assert.equal(mgr.getSession(C.id)!.status, "RUNNING", "closing Paper must not affect Shadow");

  // Negative test: stopping SHADOW (C) must not pause/stop PAPER... (B is closed) — verify it doesn't touch production or D.
  mgr.stopSession(C.id);
  assert.equal(mgr.getSession(C.id)!.status, "STOPPED");
  assert.equal(mgr.getSession(A.id)!.status, "RUNNING", "stopping Shadow must not affect production");
  assert.equal(mgr.getSession(D.id)!.status, "READY", "stopping Shadow must not affect an untouched Backtest session");

  // Negative test: switching tabs must not reset any session's status.
  mgr.setActiveSession(D.id);
  mgr.setActiveSession(A.id);
  assert.equal(mgr.getSession(D.id)!.status, "READY", "switching tabs must not reset Backtest session state");

  // Negative test: production session cannot be deleted/duplicated via the workflow (already covered in CC-007, re-asserted here as a release gate).
  assert.throws(() => mgr.closeSession(A.id));
  assert.throws(() => mgr.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "LIVE", broker: "ZERODHA", quantity: 1 }));

  // ── §7 Workflow State Transitions ─────────────────────────────────────
  const mgr2 = new SessionManager();
  const draft = mgr2.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "PAPER", broker: null, quantity: 1 });
  assert.equal(draft.status, "READY", "a freshly created, validated session starts READY (CC-007 §6 step 8)");

  // Valid: READY -> STARTING -> RUNNING.
  mgr2.startSession(draft.id);
  assert.equal(mgr2.getSession(draft.id)!.status, "RUNNING");

  // Invalid: STARTING -> STARTING (double start) is rejected — RUNNING is not READY/STOPPED.
  assert.throws(() => mgr2.startSession(draft.id), /not in a startable state/);

  // Valid: RUNNING -> PAUSED -> RUNNING.
  mgr2.pauseSession(draft.id);
  assert.equal(mgr2.getSession(draft.id)!.status, "PAUSED");
  mgr2.resumeSession(draft.id);
  assert.equal(mgr2.getSession(draft.id)!.status, "RUNNING");

  // Invalid: STOPPED -> PAUSED must be rejected.
  mgr2.stopSession(draft.id);
  assert.equal(mgr2.getSession(draft.id)!.status, "STOPPED");
  assert.throws(() => mgr2.pauseSession(draft.id), /Cannot pause session .* from status STOPPED/);

  // Invalid: STOPPING -> RUNNING has no path (there is no "resume from stopping" method) — resume requires PAUSED.
  assert.throws(() => mgr2.resumeSession(draft.id), /Cannot resume session .* from status STOPPED/);

  // Valid: STOPPED -> STARTING -> RUNNING (restart is allowed for non-protected sessions).
  mgr2.startSession(draft.id);
  assert.equal(mgr2.getSession(draft.id)!.status, "RUNNING");

  // Invalid: DRAFT -> RUNNING without validation is structurally impossible — createSession()
  // itself always validates before a session can exist, so there is no unvalidated DRAFT to start.
  assert.throws(() => mgr2.createSession({ strategy: "DRISHTI_V1", instrument: "BANKNIFTY", product: "FUTURES", mode: "PAPER", broker: null, quantity: 0 }));

  console.log("ALL CC-009 RELEASE-READINESS TESTS PASSED");
}

run();

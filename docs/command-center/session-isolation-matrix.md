# Command Center — Session Isolation Matrix

Source of truth: `src/command-center/business/__tests__/cc009ReleaseReadiness.test.ts`
(`npm run test:release` in `drishti-pro-scalp-dashboard/frontend`).

## Sessions under test

| Session | Mode | Instrument | Product | sessionId pattern |
|---|---|---|---|---|
| A | LIVE | BANKNIFTY | FUTURES | `production-10-30-banknifty-futures` (fixed) |
| B | PAPER | BANKNIFTY | FUTURES | `paper-N` |
| C | SHADOW | BANKNIFTY | OPTIONS | `shadow-N` |
| D | BACKTEST | BANKNIFTY | FUTURES (historical) | `backtest-N` |

## Isolation dimensions verified

| Dimension | Mechanism | Verified |
|---|---|---|
| Unique sessionId | `nextId()` sequence + fixed production id | Yes |
| Separate trades/orders/history/logs/analytics | `SessionRepository` — `Map<sessionId, T[]>`, never a shared array | Yes (distinct array instances asserted) |
| Separate position/engine/account/risk | `DashboardState` — one per sessionId in `SessionRealtimeManager` | Yes (CC-008 tests #1–4) |
| Separate P&L | `pnl.label` set per mode (Live/Paper/Shadow/Backtest P&L); no shared field | Yes |
| Separate risk/account context | `AccountState.label`, `RiskState` all sourced from the session's own `DashboardState` | Yes |
| Event routing | `RuntimeEventRouter` rejects events whose `sessionId` doesn't match the registered target; `applyIfOwned` is a defensive second check at the store level | Yes (CC-008 test #3) |

## Negative tests (release blockers if any fail)

| Test | Result |
|---|---|
| Paper trade must not appear in LIVE trades | PASS — distinct store instances, verified empty+distinct |
| Shadow execution must not appear in PAPER orders | PASS — same mechanism; CC-008 test #1/#3 verify cross-session event rejection generally |
| Backtest P&L must not update LIVE P&L | PASS — CC-008 test #4 |
| Backtest execution must not update broker balance | PASS by construction — `AccountState.label` for BACKTEST is "Backtest Equity", never "Broker Balance"; no code path writes a BACKTEST event into a LIVE `DashboardState` |
| Closing PAPER tab must not stop LIVE | PASS |
| Stopping SHADOW must not pause/affect PAPER or an untouched Backtest session | PASS |
| Switching tabs must not reset any session | PASS |
| Reloading must not duplicate a running session | PASS — `SessionManager.recoverSessions` skips any session already present, and never restores a second LIVE session (CC-007 test #14) |
| Background session updates must remain available | PASS — `SessionRealtimeManager.tick()` advances every subscribed session regardless of which is "active" (CC-008 test #10) |
| Production session cannot be deleted or duplicated via the workflow | PASS |

## What this matrix does NOT cover

This is an in-memory, single-process, simulated-transport verification.
It does not prove isolation under: concurrent real users, a real database
under load, a real WebSocket/SSE fan-out server, or an actual second
browser tab/session for the same user. See `known-limitations.md`.

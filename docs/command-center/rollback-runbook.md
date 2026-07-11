# Command Center — Rollback Runbook

Extends CC-009's `rollback-plan.md` with the concrete, leveled controls
CC-010 specifies. None of these levels have been exercised against a real
deployment (there isn't one yet) — this is the runbook to use once Stage 1+
is live.

## Rollback levels (fastest/safest first)

| Level | Action | How | Blast radius |
|---|---|---|---|
| 1 | Disable Command Center controls | `UPDATE app_settings SET value='false' WHERE key='commandCenterControlsEnabled'` | UI becomes observe-only; no runtime affected |
| 2 | Force read-only | `UPDATE app_settings SET value='true' WHERE key='commandCenterReadOnly'` | Same as above, explicit |
| 3 | Disable simulation sessions | `UPDATE app_settings SET value='false' WHERE key='simulationSessionsEnabled'` (and the per-mode flags) | Existing Paper/Shadow/Backtest tabs stop accepting new sessions; already-open ones are a UI-level decision (recommend: let existing sessions finish, block new creation) |
| 4 | Disable the Command Center page entirely | `UPDATE app_settings SET value='false' WHERE key='commandCenterEnabled'` | Page returns "unavailable" via the existing `featureGate` pattern; production trading is completely unaffected — `trading-bot` has no dependency on this flag or this page |
| 5 | Rollback frontend release | Redeploy the previous build artifact / revert the deploy | No data touched |
| 6 | Rollback backend release | `git revert` the relevant commits, redeploy, restart `zeroscreen` (never `trading-bot`) | No data touched if the reverted commits were additive-only, which every CC-002/CC-010 DB change has been by design |
| 7 | Rollback database migration | Only if a level 1-6 rollback is insufficient. Since every CC-002/CC-010 migration is additive (`CREATE TABLE IF NOT EXISTS`, `INSERT OR IGNORE`), "rollback" means dropping the new `cc_*` tables/rows — **never** touching `bot_state`, `bot_trades`, or `users`. See CC-002's `CC-002-data-model.md` §6 for the exact (intentionally hard-to-run) SQL, protected by the production-session triggers. |

## What rollback must never do (repeated from CC-009, because it matters)

Delete production orders, executions, positions, P&L, statements, logs, or
historical sessions. Every level above is additive-safe by construction:
levels 1-4 only flip `app_settings` values (never delete rows), levels 5-6
are code/deploy reverts (never touch the database), and level 7 is scoped
to `cc_*` tables the production session's DB triggers already make
resistant to accidental deletion.

## Verification after any rollback level

1. `trading-bot` PM2 process still running, unaffected.
2. `bot_state`/`bot_trades` row counts unchanged.
3. Existing `/signals` page still loads and shows correct data (it was
   never touched by any Command Center change).
4. If level 7 was used: confirm `cc_trading_sessions.is_production=1` row
   still exists and is intact (the production session row itself, and its
   `cc_session_configurations`/`cc_session_runtime` children).

## Not yet exercised

No rollback level above has actually been triggered against a real
deployment in this session, because no real deployment exists yet. This
runbook is the plan, verified for internal consistency against the actual
CC-002 schema and CC-006 architecture, not a drill log.

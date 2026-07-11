# Command Center — Rollback Plan

## Guiding principle

Because the Command Center has never been mounted into a real ZeroScreen
route, "rollback" today just means "don't mount it" — there is nothing live
to roll back from. This plan is written for the state *after* Stage 3+ of
`release-plan.md` is reached.

## Rollback mechanisms, by layer

| Layer | Rollback action | Data risk |
|---|---|---|
| Feature flag | Set `commandCenterEnabled=false` (reusing ZeroScreen's existing `app_settings`/`featureGate` mechanism) | None — instantly hides the route, no data touched |
| Frontend | Revert the deploy that mounted the Command Center bundle | None — static assets only |
| API (future) | Revert/disable any new API routes added to expose CC-002 data | None, if those routes are additive-only (per CC-002's own design) |
| Migration | CC-002's schema is additive-only (`cc_*` tables); rollback = drop the new tables only if truly necessary, never touch `bot_state`/`bot_trades`/`users` | See CC-002's own rollback SQL in `CC-002-data-model.md` §6 — deliberately hard to run by accident (trigger-protected production row) |
| Session runtime | Stop any non-production `SessionRuntimeService` instances (in-process, no persistence to clean up) | None — production `SessionRuntimeService` is a completely separate object per CC-006's architecture and is never touched by rolling back the Command Center UI |
| Event transport | Stop the frontend's `SessionRealtimeManager` (its `tick()` timer is owned by the page component — unmounting the page stops it) | None — it only ever reads/polls, never writes to production state |

## What rollback must NEVER do

Per CC-009's explicit requirement, rollback must not delete: production
orders, executions, positions, P&L, statements, logs, or historical
sessions. Nothing in this rollback plan touches `bot_state`, `bot_trades`,
or any `cc_*` row belonging to the protected production session — the
production-session protection triggers from CC-002 (`cc_trg_protect_
session_delete`, etc.) make this structurally hard to violate even by
mistake.

## Verification after rollback

1. Confirm the existing `/signals` page (today's real production dashboard)
   still loads and shows correct live data — it was never touched by any
   Command Center change, so this should be a no-op check.
2. Confirm `bot_state`/`bot_trades` row counts are unchanged.
3. Confirm the production PM2 process (`trading-bot`) is still the only
   bot process running (existing operational check, unrelated to this
   rollback).
4. Confirm no `cc_*` table lost rows beyond what was explicitly intended.

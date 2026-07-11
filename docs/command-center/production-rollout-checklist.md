# Command Center — Production Rollout Checklist

## Pre-deployment (this phase's actual work — executed and verified)

- [x] Deployment discovery documented (`CC-010-deployment-plan.md`).
- [x] Feature flags added additively to `app_settings` via the existing
      seeding convention in `src/db.ts`, with CC-010's exact specified
      defaults.
- [x] Flag seeding verified against a scratch copy of `zeroscreen.db`:
      all 9 flags present with correct default values, idempotent across
      repeated `initDb()` calls, `bot_trades` row count unchanged
      before/after, temp artifacts cleaned up (no writes to the real
      `zeroscreen.db`).
- [x] `npx tsc --noEmit` on the main ZeroScreen repo — no new errors
      introduced (one pre-existing, unrelated error in
      `src/backtest/BacktestEngine.ts` confirmed present on `main` before
      this change, via `git stash` comparison in CC-002).
- [x] Command Center frontend workspace's own build/typecheck/test suite
      (`test:business`, `test:realtime`, `test:release`) — 39/39 pass
      (CC-009 results, re-confirmed still green).

## Deployment steps NOT performed this phase (require real infra access)

- [ ] Database backup of production `zeroscreen.db` — **not performed**;
      no production database is reachable from this session. This step is
      mandatory before ever running this migration against the real file.
- [ ] Apply migration to the real production database.
- [ ] Restart the `zeroscreen` PM2 process to load the new `src/db.ts`.
- [ ] Verify production `bot_state`/`bot_trades`/`users` rows unchanged on
      the real system (only verified against a scratch copy here).
- [ ] Verify no duplicate `trading-bot` process exists on the real VPS.
- [ ] Run the full `production-smoke-checklist.md` against the real
      running system.
- [ ] Configure real monitoring/alerting (none exists to configure yet —
      see `monitoring-and-alerting.md`).
- [ ] Mount the Command Center frontend into an actual ZeroScreen route.

## Deployment validation (CC-010 §"Deployment Validation") — status

| # | Check | Status |
|---|---|---|
| 1 | Existing ZeroScreen website loads | Not tested against production this phase |
| 2 | Existing pages work | Not tested against production this phase |
| 3 | Existing navigation works | Not tested against production this phase |
| 4 | Market ticker works | Not tested against production this phase |
| 5 | Command Center route opens | N/A — no route exists |
| 6 | Production tab pinned | Verified in the standalone frontend only |
| 7 | No duplicate production runtime | Verified structurally (code-level singleton + DB trigger), not against live PM2 |
| 8-16 | Production status/token/broker/P&L/balance/position/orders/executions/history correct | Not verifiable — no real data source connected |
| 17 | Real-time updates work | Verified against simulated transports only |
| 18 | Refresh recovery works | Verified against simulated transports only |
| 19 | Read-only controls disabled during Stage 1 | `commandCenterReadOnly` defaults `true`; no real controls exist yet to disable |
| 20 | Logs contain no secrets | Verified by code review of what's logged in this repo's changes; no real log aggregation to inspect |

## Conclusion

This checklist is honest about being **partially complete by necessity**.
The items under "actually performed" are real and repeatable. The items
under "not performed" require access this session does not have, and
attempting to mark them complete without doing them would be the exact
kind of false confidence CC-009/CC-010 explicitly warn against.

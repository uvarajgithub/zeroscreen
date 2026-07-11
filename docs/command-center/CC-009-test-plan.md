# CC-009 — Test Plan and Results

Read `known-limitations.md` first — it explains which sections below are
real automated results and which are structurally impossible to run from
this environment.

## 1. Architecture regression check

**Method**: repo-wide grep for `LiveDashboard|PaperDashboard|ShadowDashboard|
BacktestDashboard|CommandCenterV2|CommandCenterNew|CommandCenterFinal|
CommandCenterRedesign` and a full file listing of
`drishti-pro-scalp-dashboard/frontend/src/command-center`.

**Result**: PASS. One match found, and it is a code comment in
`TradingDashboard.tsx` *disclaiming* the existence of per-mode dashboards
("no LiveDashboard/PaperDashboard/etc"), not an actual duplicate. Component
tree confirmed as exactly:

```
CommandCenterPage
├── CommandCenterHeader
├── CommandBarShell
├── SessionTabsShell (+ SessionTab, SessionConfigPanel)
├── TradingDashboard (Hero + Position/Engine/Account/Risk cards)
└── BottomWorkspaceTabsShell (Trades/Orders/History/Logs/Analytics)
```

One reusable `TradingDashboard` component, driven entirely by `session` +
`dashboard` props — confirmed by reading every file in that directory, not
just grep.

No second Command Center route exists in `src/server.ts` (only a CC-002
DB-migration import references `./command-center/...`). The frontend is not
mounted into any ZeroScreen route — see `known-limitations.md`.

## 2–23. Layered test execution

| # | Layer | Executed here? | Result |
|---|---|---|---|
| 1 | Unit tests | Yes (business layer: validation, factory, runtime service) | Covered by `test:business`, `test:release` |
| 2 | Component tests | No — no component-test runner (Jest/RTL/Vitest) configured | Not executed |
| 3 | Service tests | Yes | `SessionManager`, `SessionRealtimeManager` covered |
| 4 | DB/repository tests | Partial | CC-002 schema + ownership guard re-verified this phase (below) |
| 5 | API contract tests | No — no API exists for this frontend | Not applicable yet |
| 6 | Session-isolation tests | Yes | `test:business` #1–14, `test:release` §3 matrix |
| 7 | Real-time event tests | Yes | `test:realtime` #1–15 |
| 8 | Workflow integration tests | Yes | `test:release` §7 |
| 9 | End-to-end tests | No — no browser automation tool available | Not executed |
| 10 | Production smoke tests | No — no real production connection | See `production-smoke-checklist.md` (manual, for future use) |
| 11 | Performance tests | No — no deployed/loadable environment | Not executed |
| 12 | Security tests | Partial | Cross-user ownership rejection verified at repository layer (below) |
| 13 | Accessibility tests | Partial | Code/ARIA review only, no assistive-tech run |
| 14 | Recovery/failure-injection tests | Partial | Reconnect/backoff/gap/stale covered in `test:realtime`; real network/broker failure injection not possible |

### Session-isolation matrix (§3) — RESULT: PASS

`business/__tests__/cc009ReleaseReadiness.test.ts` builds the exact
four-session matrix from the brief:

- **A**: production, LIVE, BANKNIFTY Futures (bootstrapped singleton)
- **B**: Paper, BANKNIFTY Futures
- **C**: Shadow, BANKNIFTY Options
- **D**: Backtest, historical BANKNIFTY Futures

Verified: 4 unique sessionIds; distinct trade/order store instances per
session; closing B does not affect A or C's status; stopping C does not
affect A or D; switching the active tab does not reset D's status;
production cannot be closed or duplicated via the workflow.

### Workflow state transitions (§7) — RESULT: PASS, with one fix applied

While writing these tests, two real gaps were found in `SessionManager`
(from CC-006/CC-007) and **fixed as part of this hardening phase** (not a
trading-rule change — pure session-lifecycle bookkeeping):

1. `pauseSession`/`resumeSession`/`stopSession` previously checked only
   "does a runtime exist," not "is the *current* status legal for this
   action." This meant, e.g., `pauseSession()` could be called on a
   `STOPPED` session. Fixed: each action now requires an explicit current
   status (pause requires `RUNNING`; resume requires `PAUSED`; stop requires
   `RUNNING` or `PAUSED`), matching CC-009 §7's invalid-transition list.
2. `stopSession` jumped straight from `RUNNING`/`PAUSED` to `STOPPED`,
   skipping the `STOPPING` intermediate status the CC-006/007 lifecycle
   defines. Fixed: `STOPPING` is now persisted before the runtime's `stop()`
   call resolves.

Verified transitions: `READY→STARTING→RUNNING`, `RUNNING↔PAUSED`,
`RUNNING/PAUSED→STOPPING→STOPPED`, restart `STOPPED→STARTING→RUNNING`.
Verified rejections: double-start (`RUNNING→STARTING`), `STOPPED→PAUSED`,
`STOPPED→RUNNING` via resume, and `DRAFT→RUNNING without validation`
(structurally impossible — `createSession` always validates before a
session record can exist at all, so there is no unvalidated draft to start).

### Duplicate production-session prevention — RESULT: PASS

Re-verified in this phase: `SessionFactory.createSession` throws
immediately if `mode === "LIVE"`; `SessionManager`'s constructor creates the
production session exactly once, keyed by a fixed id, and CC-002's DB layer
additionally enforces this with a partial unique index
(`is_production = 1`) plus delete/mode-change triggers (re-confirmed by
reading `src/command-center/schema.ts`, not re-tested this phase since
CC-002 already validated it against a real SQLite copy).

### Cross-user ownership rejection (§19, partial) — RESULT: PASS

Ran a scratch-DB test (compiled + executed, then deleted, same pattern as
CC-002's own validation) against the actual `src/command-center/
repository.ts`: created a session for `user_id=1`, confirmed `user_id=2`
gets `null` from `getSessionForUser` and a thrown "does not belong to
user" error from `listPositions`. This is the real CC-002 repository code,
not a simulation — the one part of this phase's security testing that
touches actual backend code.

### Real-time event tests (§9) — RESULT: PASS (already covered by CC-008)

All 15 event types' handling, session routing, duplicate/stale rejection,
sequence-gap recovery, and atomic snapshot application were built and
tested in CC-008 (`test:realtime`); re-run this phase with no regressions.

## Build / type-check / lint

- `npx tsc --noEmit -p tsconfig.json` → clean.
- `npm run build` → succeeds (18.11 kB CSS / 184.88 kB JS).
- `npm run test:all` (business + realtime + release) → 39/39 assertions pass.
- Lint: no lint tool is configured in this workspace; none run.

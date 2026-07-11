# Command Center — Known Limitations (as of CC-009, updated CC-011)

> **CC-011 update**: everything below was still true at CC-011 acceptance
> time, plus one more foundational fact discovered this phase: **none of
> CC-001 through CC-010's work has been committed to git.**
> `git log --oneline -1` shows the last real commit as `c3fc6a1` ("Require
> close confirmation for 10:30 breakout"), which predates all Command
> Center work. Everything from CC-001 onward exists only as uncommitted
> working-tree changes (`git status` shows `M src/db.ts` and an untracked
> `docs/command-center/` directory, plus the entirely untracked
> `drishti-pro-scalp-dashboard/` workspace). There is therefore no
> "deployed version" for CC-011 to test acceptance against — see
> `CC-011-production-acceptance-report.md` for the resulting recommendation.

This is the single most important document in this set. Every other CC-009
document should be read in light of the fact below.

## The structural limitation behind every other limitation

**The Command Center frontend (`drishti-pro-scalp-dashboard/frontend`) has
never been mounted into ZeroScreen's real application.** It is a standalone
Vite/React workspace with its own `npm run dev`/`build`/`test:*` scripts. It
is not served by `src/server.ts`, has no route in ZeroScreen, and has no
network path to:

- the real production 10:30 BANKNIFTY Futures bot (VPS-hosted, file-based
  state — see `docs/command-center/CC-002-data-model.md` §1),
- ZeroScreen's SQLite database (`cc_*` tables from CC-002 exist and are
  unit-tested against a scratch DB copy, but the frontend has never queried
  them over a real API),
- any broker, token-refresh service, or market-data feed.

This was an explicit, repeatedly-confirmed decision across CC-003 through
CC-008 (see each phase's "scope caveat" — this session has no SSH/VPS access
to reconcile `src/server.ts` against the file `active_vps_server.js`, which
appears to be a snapshot of what's actually deployed and has diverged
significantly from the tracked repo).

**Consequence for CC-009**: sections of the phase brief that require a real
backend, a real broker, a real user population, or a real browser
(component/E2E/visual-regression/accessibility-with-screen-reader/security
penetration/performance-under-load tests) **cannot be executed truthfully
in this environment**. Where this document or its siblings say a check was
"performed," it means: verified against the in-memory/simulated business
layer built in CC-006–CC-008, with automated regression tests. Where it
was not executable, it says so explicitly rather than fabricating a result.

## What CC-001–CC-009 actually built and verified

- A complete, self-consistent session data model (CC-002), business/runtime
  layer (CC-006–CC-008), and UI (CC-003–CC-005) with a real design system
  (CC-004).
- 39 passing automated assertions across three regression suites
  (`test:business` 14, `test:realtime` 15, `test:release` 10) covering
  session isolation, lifecycle transitions, emergency-stop partial-failure
  handling, event ordering/reconciliation, and cross-user ownership
  rejection at the CC-002 repository layer.
- Zero duplicate Command Center implementations (verified by repo-wide
  grep — see `CC-009-test-plan.md` §1).

## What CC-009 could not execute, and why

| CC-009 section | Why it can't run truthfully here |
|---|---|
| §2 Production session tests (real token/balance/P&L/history) | No connection to the real bot or broker. |
| §10 Connection/recovery against real network/broker/token failures | No real transport exists to fail. |
| §11 Token-refresh verification against the live mechanism | No access to the VPS `.env`/token-server. |
| §12 P&L accuracy against real fixtures | No real financial data flows through this frontend. |
| §16 Responsive/visual regression at named resolutions | No browser-automation/screenshot tool available in this environment. |
| §18 Accessibility with actual assistive tech | No screen reader available; semantic/ARIA structure was code-reviewed only (see CC-003/CC-004 notes). |
| §19 Security (rate limiting, CSRF, XSS on a live endpoint) | No server endpoints exist for this frontend to attack-test. |
| §20 Performance under real concurrent load | No deployed environment to load-test. |
| §23 Production smoke test | Cannot be run against the real `/signals` route from here — see `production-smoke-checklist.md` for the checklist to run manually once integrated. |

## Recommendation

Do not treat this phase's passing test suites as evidence the Command
Center is safe to expose against the real production 10:30 engine. They
are evidence the **business-logic layer's own rules are internally
consistent and regression-tested**. Real production readiness requires, at
minimum: (1) reconciling `src/server.ts` vs. `active_vps_server.js` on the
actual VPS, (2) mounting this frontend into a real ZeroScreen route, (3)
wiring the documented seams (`ProductionAdapter`, `SessionTransport`) to
real APIs, and (4) re-running this entire test plan against that real
integration before any GO decision. See `release-plan.md` for the staged
rollout that reflects this.

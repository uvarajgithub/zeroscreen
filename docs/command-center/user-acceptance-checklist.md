# Command Center — User Acceptance Checklist

Each row: what CC-011 asks be verified, and the honest current status.
"Verified (simulated)" means confirmed true within the in-memory business
layer's own automated tests — not against a real deployment. See
`known-limitations.md` before drawing conclusions from this table.

| Item | Status |
|---|---|
| Command Center opens inside ZeroScreen | **Not verified** — no route exists in `src/server.ts`; the frontend has never been mounted |
| Production session visible | Verified (simulated) — bootstraps pinned/first in `SessionManager` |
| Production session protected | Verified (simulated + DB-trigger level from CC-002) — cannot be closed/deleted/mode-changed, both in business-layer tests and SQLite triggers |
| Correct balance | **Not verified** — no real broker connection |
| Correct P&L | **Not verified** — no real financial data source |
| Correct position | **Not verified** — no real position data source |
| Correct orders | **Not verified** — no real order data source |
| Correct execution history | **Not verified** — no real execution data source |
| Correct daily statement | **Not verified** — no real historical data source |
| Session creation is simple | Verified (simulated) — `SessionConfigPanel` shows only Strategy/Instrument/Product/Mode/Quantity/optional Name, with Backtest fields appearing only for Backtest mode |
| Paper session isolated | Verified (simulated) — CC-007/009 isolation matrix tests pass |
| Shadow session isolated | Verified (simulated) — same |
| Backtest session isolated | Verified (simulated) — same, plus explicit "backtest never touches live P&L" test (CC-008 #4) |
| Session switching clear | Verified (simulated) — `setActiveSession` never resets another session's status (tested) |
| Controls understandable | Verified (simulated) — Start/Pause-or-Resume/Stop/Emergency Stop states match engine status; not usability-tested with real users |
| No unwanted information | Verified by design review — only the 4 approved operational cards, one hero, one bottom workspace exist (CC-005 contract) |
| No exposed strategy rules | Verified by code review — `cc_strategy_definitions` and all UI copy carry only safe metadata, never formulas/thresholds (CC-002 §7) |
| Design clean and premium | Verified by design review against CC-004's token system; **not verified visually** — no screenshot/browser tool available in this environment |
| Page usable throughout trading day | **Not verified** — requires a real running day against production, which doesn't exist here |

## Summary

Of 19 checklist items, **9 are genuinely verified** (against the simulated
business layer or by direct code/architecture review) and **10 require a
real deployment, real broker connection, or real browser/visual tooling
this environment does not have**. This ratio is the basis for the REJECTED
recommendation in `CC-011-production-acceptance-report.md` — a majority of
user-facing acceptance criteria are structurally unverifiable until real
integration happens.

# Command Center — Release Plan

## Feature flags

| Flag | Default | Purpose |
|---|---|---|
| `commandCenterEnabled` | **off** | Master switch — mounts the Command Center route at all. |
| `commandCenterControlsEnabled` | **off** | Enables Start/Pause/Resume/Stop/Emergency Stop against the real production runtime. |
| `simulationSessionsEnabled` | **off** | Enables creating Paper/Shadow sessions. |
| `backtestSessionsEnabled` | **off** | Enables creating Backtest sessions. |
| `additionalLiveSessionsEnabled` | **off**, and should likely stay off indefinitely | A second LIVE session is explicitly out of scope for the current single-account production setup; CC-006's `SessionFactory` already hard-rejects this regardless of any flag. |

None of these flags exist in code yet — no flag infrastructure was found in
`src/server.ts` (it uses `featureGate("feature_x", ...)` reading
`app_settings` for other features, e.g. `feature_paper_trade_bot`; the same
mechanism should be reused, not a new flag system built, per CC-009's own
"do not introduce unrelated features" rule).

## Staged rollout

| Stage | Description | Gate to proceed |
|---|---|---|
| 1 | Local + automated tests (this phase) | `test:all` green, `tsc`/build clean — **done** |
| 2 | Staging with broker mocks + market-data replay | Requires a real staging deployment — not yet built |
| 3 | Production, read-only monitoring (`commandCenterEnabled=true`, `commandCenterControlsEnabled=false`) | Manual smoke checklist passes with zero discrepancies against `/api/bot/status` |
| 4 | Production session controls enabled for one authorized user | Confirmations/Emergency Stop manually verified against a controlled test window, not live capital, where feasible |
| 5 | Paper/Shadow sessions enabled | Isolation matrix re-verified against the real backend (this phase only verified it in-memory) |
| 6 | Backtest sessions enabled | Historical data source confirmed available |
| 7 | Additional LIVE sessions | Not recommended without an explicit product/business decision — current architecture treats LIVE as a protected singleton by design |

## Current stage

**Stage 1 only.** Nothing beyond the automated test suite in this
standalone workspace has been executed. See `known-limitations.md` for why
stages 2–7 cannot be attempted from this environment.

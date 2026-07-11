# Command Center — Support Runbook

**Status: not yet applicable to a real deployment** (see
`daily-operator-runbook.md`'s status note). Written now so the flow is
ready; not exercised against a live incident.

For each issue: symptom → likely cause → verification → safe action →
escalation condition.

## Page not loading

- **Symptom**: Command Center route errors or blank.
- **Likely cause**: frontend deploy issue, or `commandCenterEnabled=false`.
- **Verification**: check the flag value in `app_settings`; check
  `zeroscreen` process health.
- **Safe action**: none needed for trading — `trading-bot` is fully
  independent (CC-001's core architectural guarantee).
- **Escalation**: if `zeroscreen` itself is down, this is a general
  ZeroScreen incident, not Command-Center-specific.

## Live values not updating

- **Symptom**: dashboard appears frozen.
- **Likely cause**: real-time stream disconnected (CC-008).
- **Verification**: check connection/health indicator (should show
  RECONNECTING/STALE, not silently freeze).
- **Safe action**: refresh the page — CC-008's reconnect + full-snapshot
  reconciliation should recover automatically.
- **Escalation**: if the last-known values look wrong (not just stale),
  escalate as CRITICAL — that would be a genuine data bug, not staleness.

## Stale heartbeat

See `incident-playbooks.md` §2 (CC-010) — same procedure.

## Broker disconnected / Token invalid

See `incident-playbooks.md` §3/§4 (CC-010) — same procedure, existing
token-refresh mechanism unchanged by any CC phase.

## Balance mismatch

- **Symptom**: Command Center balance differs from the broker's own app.
- **Likely cause**: stale data, or a real display bug.
- **Verification**: check `lastUpdatedAt` — if recent, this is a BLOCKER-
  class defect (financial mismatch per CC-011 §24) and must be escalated
  immediately, not worked around.
- **Safe action**: treat the broker as authoritative; do not act on trades
  based on the Command Center's value alone until resolved.

## Position mismatch

Same severity and treatment as balance mismatch — CC-008's design
mandates the production engine/broker as the sole source of truth; any
disagreement is a display bug, escalate as CRITICAL/BLOCKER, never
"trust the UI."

## Order missing / Duplicate order

- **Likely cause**: event-ordering bug (sequence gap not reconciled) or a
  genuine backend issue.
- **Verification**: compare against the broker's own order book (ground
  truth) and `bot_trades`/`cc_trading_orders` if accessible.
- **Safe action**: do not manually re-submit or cancel based on the UI
  alone; verify against the broker first.
- **Escalation**: BLOCKER if it reflects an actual duplicated broker order;
  MAJOR if it's purely a display artifact confirmed not to reflect reality.

## Simulation data mismatch (Paper/Shadow/Backtest)

- **Impact**: simulation only, cannot affect production (isolation tested
  extensively in CC-007/008/009/010's test suites).
- **Safe action**: investigate/restart that specific session only.

## Backtest stuck

- **Symptom**: progress stops advancing.
- **Safe action**: cancel and re-run that specific backtest session; no
  production impact.

## Session tab not restoring after reload

- **Likely cause**: recovery logic gap (CC-007 §14) or a genuine bug.
- **Verification**: confirm the session still exists in the repository;
  check for a `recoveryRequired` flag rather than silent data loss.
- **Safe action**: use the documented recovery actions (Reconnect / Mark
  Stopped / View Logs) rather than recreating the session — recreating a
  LIVE-equivalent session is structurally blocked by design, and shouldn't
  be worked around for non-production sessions either without checking
  for actual duplication first.

## Production engine healthy but UI unavailable

Same as "page not loading" above — by design, this should never require
any trading-side action.

## Rollback procedure

See `rollback-runbook.md` (CC-010).

# Command Center — Daily Operations (for once Stage 1+ is actually live)

This is written now, ahead of real deployment, so the operator flow is
agreed before day one. It has not been executed as a live drill — see
`known-limitations.md`.

## Before market open

1. Verify the `trading-bot` PM2 process is running (and only one instance).
2. Verify token-refresh status (`/api/bot/status`'s `tokenOK`, or the
   token-server's own status page).
3. Verify broker connection.
4. Verify market-data feed is flowing.
5. Open the Command Center; confirm the production session tab is pinned,
   first, and shows LIVE.
6. Verify available balance.
7. Verify configured quantity (should be the existing 1-lot default unless
   deliberately changed through the existing bot configuration — never
   through the Command Center, which cannot alter production config).
8. Verify risk state (daily loss limits, kill-switch state) if displayed.

## During market hours

- Monitor engine state, current position, current orders, running P&L.
- Monitor broker/feed health indicators.
- Respond to WARNING-level signals promptly; escalate CRITICAL signals
  per `incident-playbooks.md`.
- **Do not restart any service while a position is active** unless an
  incident playbook explicitly calls for it — restarting `trading-bot`
  does not itself close a position, but interrupting it mid-decision is a
  risk the existing bot's design should already account for; the Command
  Center adds no new restart capability beyond what the admin panel
  already has.

## After market close

1. Confirm the final position is closed (or intentionally carried, if the
   strategy supports that — this documentation does not change or
   second-guess existing strategy behavior).
2. Confirm no orders remain pending.
3. Confirm final P&L matches the broker's own record.
4. Confirm the daily statement/history entry is present.
5. Confirm execution history is complete.
6. Confirm runtime status is STOPPED/idle as expected.
7. Spot-check logs for the day (no secrets, no unexplained errors).
8. Confirm daily history was preserved (not overwritten) — this is
   structurally protected by CC-002's schema (session-scoped, append-only
   for executions/orders) and by the production-session protection
   triggers, not by manual diligence alone.

## Simulation sessions (once Stage 3+ is enabled)

Paper/Shadow/Backtest sessions have no market-hours dependency for
creation, but Shadow sessions consume live market data during market
hours only, per CC-006's design. Closing a simulation tab at any time is
safe and does not affect production (verified in CC-007/009's isolation
tests).

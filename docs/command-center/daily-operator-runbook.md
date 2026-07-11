# Command Center — Daily Operator Runbook

**Status: not yet applicable.** This runbook is written ahead of real
deployment, per CC-010/CC-011's own pattern — nothing in this repo has
been deployed or even committed to git yet (`git log` shows the last real
commit is `c3fc6a1`, predating all of CC-001–CC-011's work; everything
since is uncommitted working-tree changes). Use this the day the Command
Center is actually live in front of the production 10:30 engine, not before.

## Before market

1. Open ZeroScreen.
2. Open Command Center.
3. Confirm the production tab (`10:30 LIVE`) is present, pinned, and
   selected by default — no manual reconfiguration should ever be needed.
4. Confirm engine state (should reflect the real bot's current state, not
   a placeholder).
5. Confirm token status (via the existing token-server-backed check).
6. Confirm broker connection.
7. Confirm market feed is live.
8. Confirm account balance matches the broker.
9. Confirm configured quantity (existing 1-lot production default unless
   deliberately changed elsewhere — never through the Command Center).
10. Confirm risk state (daily loss limits, drawdown, kill-switch) if shown.
11. Check for any WARNING/CRITICAL banners before the session starts.

## During market

- Monitor position, P&L, orders, broker state, and heartbeat continuously.
- Respond to warnings promptly (see `support-runbook.md` for specific
  symptoms).
- Use Pause/Stop only when actually needed — these act on the real engine
  once Stage 2 (CC-010) is enabled; do not exercise them casually.
- Avoid restarting `zeroscreen`, `token-server`, or especially `trading-bot`
  during an active position unless a documented incident requires it.

## After market

1. Verify the final position is closed (or intentionally carried, per
   existing strategy behavior — this runbook does not second-guess
   strategy decisions).
2. Verify no orders remain pending.
3. Verify final P&L against the broker's own record.
4. Verify execution history is complete.
5. Verify the daily statement/history entry exists and is linked to the
   correct (production) session only.
6. Verify logs for the day contain no unexplained errors and no secrets.
7. Verify final engine state is STOPPED/idle as expected.
8. Confirm daily history was preserved — this is structurally protected by
   CC-002's schema and production-session triggers, not manual diligence
   alone, but a spot-check costs nothing.

## Simulation sessions (Paper/Shadow/Backtest, once enabled per CC-010's staged flags)

- Creating, running, or closing a simulation session has no market-hours
  dependency (except Shadow, which needs live market data to be
  meaningful) and is verified isolated from production (CC-007/008/009
  automated tests).
- Closing a simulation tab never stops or affects production — verified,
  not assumed.

# Command Center — Incident Playbooks

Each playbook: symptom → impact → verification → immediate action →
recovery → escalation → post-incident check. Written ahead of real
deployment (see `known-limitations.md`) — not drilled against a live
incident.

## 1. Command Center unavailable, production engine running

- **Symptom**: Command Center page fails to load or errors.
- **Impact**: loss of visibility only — `trading-bot` is a fully
  independent process (CC-001's core rule) and keeps running.
- **Verification**: check `trading-bot` PM2 status directly; check
  `/api/bot/status` responds.
- **Immediate action**: none required for trading safety. Investigate the
  `zeroscreen` web process.
- **Recovery**: restart `zeroscreen` if needed (never `trading-bot`).
- **Escalation**: if `zeroscreen` itself is down, treat as a general
  ZeroScreen outage, not Command-Center-specific.
- **Post-incident**: confirm no data was lost — `bot_state`/`bot_trades`
  and `cc_*` tables are unaffected by the web process being down.

## 2. Production engine heartbeat stale

- **Symptom**: `isAlive` false / heartbeat age exceeds threshold.
- **Impact**: potential engine hang or crash — trading may have stopped.
- **Verification**: check `trading-bot` PM2 status/logs directly.
- **Immediate action**: if the process crashed, this is the existing bot's
  own incident, not a Command Center one — do not "fix" it by restarting
  from inside the Command Center UI (no such control exists, by design).
- **Recovery**: follow existing bot-restart procedure (admin panel or PM2).
- **Escalation**: if unclear whether a position is open, verify via broker
  directly before any restart.
- **Post-incident**: confirm no duplicate process was started.

## 3. Broker disconnected

- **Symptom**: `BROKER_STATE_UPDATED`/connection health degrades.
- **Impact**: LIVE session may be unable to place/manage orders.
- **Verification**: check token validity and broker API status.
- **Immediate action**: do not attempt Emergency Stop through simulated
  paths — verify real broker connectivity first through existing tools.
- **Recovery**: reconnect broker session per existing token-refresh flow.
- **Escalation**: if a position is open and broker is unreachable, this is
  a genuine trading risk — escalate immediately, do not wait.
- **Post-incident**: confirm final position/order state against broker.

## 4. Token refresh failed

- **Symptom**: `tokenOK=false`.
- **Impact**: LIVE session may be blocked from placing new orders soon.
- **Verification**: check token-server logs/status.
- **Immediate action**: manually refresh token via the existing
  token-server flow (`/login` → paste request_token), per existing
  documented procedure — **not changed by CC-010**.
- **Recovery**: confirm `tokenOK=true` after refresh.
- **Escalation**: if failing repeatedly near market open, treat as
  CRITICAL.
- **Post-incident**: confirm `--update-env` restart didn't affect
  in-progress trades (existing token-server behavior, unchanged).

## 5. Market feed stale

- **Symptom**: last-tick age exceeds threshold.
- **Impact**: engine may be making decisions on stale data.
- **Verification**: compare feed timestamp to wall clock.
- **Immediate action**: none from the Command Center (read-only observer);
  this is the existing bot's own feed dependency.
- **Recovery/Escalation**: per existing bot operational procedure.

## 6. Real-time UI disconnected

- **Symptom**: Command Center shows RECONNECTING/STALE.
- **Impact**: display only — CC-008's design guarantees the production
  runtime is untouched by a UI disconnect (tested in `test:realtime` #14).
- **Immediate action**: none required for trading; refresh the page.
- **Recovery**: automatic reconnect with backoff + full snapshot (CC-008).

## 7. Order rejected

- **Symptom**: `ORDER_REJECTED` event.
- **Impact**: depends on strategy — this document does not alter how the
  bot responds; it only says how the *operator* should verify it.
- **Verification**: check rejection reason (never hide it, never expose
  raw broker secrets).
- **Escalation**: if repeated/rapid rejections, treat as WARNING → CRITICAL.

## 8. Position state mismatch

- **Symptom**: Command Center's displayed position disagrees with broker.
- **Impact**: potential display bug — must never be resolved by
  "trusting" the UI over the broker.
- **Immediate action**: treat the broker/production engine as authoritative
  (CC-008's core rule); do not act on the Command Center's value alone.
- **Escalation**: CRITICAL if a live position's status is ambiguous.

## 9. Paper or Shadow runtime error

- **Symptom**: `RUNTIME_ERROR` on a non-LIVE session.
- **Impact**: simulation only — cannot affect production (isolation tested
  in CC-007/008/009).
- **Immediate action**: none for trading safety; investigate/restart that
  simulation session only.

## 10. Backtest worker stuck

- **Symptom**: `BACKTEST_PROGRESS_UPDATED` stops advancing.
- **Impact**: simulation only.
- **Immediate action**: cancel/restart the specific backtest session.

## 11. Database unavailable

- **Symptom**: `zeroscreen` process errors on DB access.
- **Impact**: web app degraded; `trading-bot` is file-based and largely
  independent of this database (it pushes to it, doesn't depend on reading
  it to keep trading).
- **Escalation**: CRITICAL for the web app; verify `trading-bot` is
  unaffected before treating this as a trading emergency.

## 12. Deployment rollback

See `rollback-runbook.md` for the full procedure.

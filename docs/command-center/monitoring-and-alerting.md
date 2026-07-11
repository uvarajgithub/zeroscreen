# Command Center — Monitoring and Alerting

## What exists today

No monitoring/alerting stack (Prometheus, Grafana, Sentry, PagerDuty, etc.)
was found anywhere in this repo. Operational visibility today is manual:
the `/api/bot/status` endpoint, the `/signals` dashboard, and direct PM2/
log inspection on the VPS (per project memory). This phase does not
introduce a new monitoring stack — CC-010 says "use existing infrastructure
wherever safe," and no existing stack exists to extend.

## What this document specifies (a plan, not a running system)

### Health checks (target shape, once a real API exists)

| Check | Signal | Currently implemented? |
|---|---|---|
| Frontend loads | Command Center route returns 200 | No route exists yet |
| Backend API reachable | `zeroscreen` process responds | Yes, implicitly — `/api/stats`, `/api/bot/status` already exist and work |
| Database reachable | A trivial `SELECT 1` | No dedicated health endpoint; `initDb()` already fails the process startup (`process.exit(1)`) if the DB can't initialize |
| Production engine alive + heartbeat current | `bot-heartbeat.json` freshness | Already implemented — `/api/bot/status`'s `isAlive` calculation (`Date.now() - hb.at < 3min`) |
| No duplicate production runtime | Exactly one `trading-bot` PM2 process | Manual PM2 check today (see `process-management.md`); no automated check exists |
| Token service alive | Last refresh timestamp available | Already implemented — `/api/bot/status`'s `tokenOK` check against `/home/ubuntu/trading-bot/.env` |
| Paper/Shadow/Backtest workers | N/A | Not applicable — these run in-browser, not as services (see `process-management.md`) |

### Metrics to track (once instrumented)

Frontend availability, API availability, DB connectivity, production
heartbeat, token-refresh success, broker connection state, market-data
freshness, real-time connection count, session count by mode, runtime
errors, order-rejection rate, stale-session count, backtest queue length,
worker memory/restarts, API response time, event-processing latency.
**None of these are currently emitted anywhere** — CC-008's
`ObservabilityLogger` seam in `SessionRealtimeManager` exists precisely so
a future integration can plug a real metrics sink in without touching the
isolation/reconciliation logic itself.

### Alerts (target severities, not configured anywhere yet)

**CRITICAL** (page immediately): production engine stopped unexpectedly,
duplicate production runtime, broker disconnected during an active
position, token refresh failed near market open, production heartbeat
stale, unauthorized session access, Paper/Shadow attempting broker
execution (should be structurally impossible per CC-006/008's design —
an alert here would indicate a real bug), database unavailable, emergency
stop partial failure.

**WARNING**: market-data delay, high order-rejection rate, rising
reconnect attempts, backtest worker unavailable, event-queue delay, DB
connection-pool pressure, high disk usage, repeated process restarts.

**INFO**: deployment completed, feature-flag changed, Paper/Shadow/Backtest
sessions enabled.

## What was verified this phase

That the CC-006–CC-008 code already has the right *seams* for this to be
wired up later without redesign: `ObservabilityLogger` (CC-008), the
`SessionEventBus`/`RuntimeEventRouter` typed event streams (CC-006/CC-008),
and the existing `/api/bot/status` heartbeat/token logic in `src/server.ts`
(unchanged). No alert was actually fired or tested, because no alerting
transport exists to fire one through.

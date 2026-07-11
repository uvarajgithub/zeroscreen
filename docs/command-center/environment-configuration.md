# Command Center — Environment Configuration

## What exists today

- `src/server.ts` loads `.env` via `dotenv.config()`. Secrets (session
  secret, Razorpay keys, SMTP credentials, etc.) live there for the
  ZeroScreen web app process.
- The production trading bot has its **own separate** `.env` at
  `/home/ubuntu/trading-bot/.env` on the VPS (Kite `API_KEY`/`ACCESS_TOKEN`),
  read directly by `/api/bot/status` to validate the token — never by the
  Command Center code added in CC-001–CC-010.
- The standalone Command Center frontend workspace
  (`drishti-pro-scalp-dashboard/frontend`) has no `.env` at all — it has no
  backend to configure a base URL for yet.

## Variables this phase defines a place for (not yet wired to real infra)

Per CC-010's list, these are the variables a real integration would need.
None of them exist yet because no API/session-service/real-time-gateway
has been deployed — see `known-limitations.md`. Listing them here now so
the shape is agreed before anyone builds the wiring:

| Variable | Purpose | Where it would live |
|---|---|---|
| `COMMAND_CENTER_API_BASE_URL` | Frontend → backend API base | Frontend build-time env (Vite `.env`, **not** committed) |
| `COMMAND_CENTER_REALTIME_URL` | Real-time/polling endpoint base | Frontend build-time env |
| `SESSION_SERVICE_URL` | Internal reference if the session service is ever split out | Backend `.env` |
| `DATABASE_URL` / existing SQLite path | Already exists implicitly (`zeroscreen.db` path in `src/db.ts`) — no change | Backend |
| `MARKET_DATA_SERVICE_URL` | If a dedicated market-data service is introduced | Backend `.env` |
| `PRODUCTION_RUNTIME_REF` | Identifies which existing bot process/host the Command Center observes | Backend `.env` |
| `PAPER_RUNTIME_SERVICE_URL`, `SHADOW_RUNTIME_SERVICE_URL` | If Paper/Shadow move out of the frontend's in-memory simulation into a real backend worker | Backend `.env` |
| `BACKTEST_WORKER_URL` | Backtest queue/worker endpoint | Backend `.env` |
| `LOG_LEVEL` | Structured log verbosity | Backend `.env` |
| `MONITORING_ENDPOINT`, `ALERT_WEBHOOK_URL` | Where metrics/alerts are sent | Backend `.env` |

## Rules enforced (by review, since no CI exists to enforce them automatically)

- **No broker access tokens, API secrets, passwords, or encryption keys in
  any frontend environment file.** Confirmed: the standalone frontend has
  no `.env` and no code path that reads a secret — it only reads the
  simulated/stub transports built in CC-008. The real bot's Kite
  credentials live exclusively in the VPS-side `/home/ubuntu/trading-bot/.env`,
  never in this repo's tracked files.
- **Startup validation of critical configuration**: `src/server.ts` already
  fails closed for some settings (e.g. Razorpay endpoints return 503 when
  `RAZORPAY_KEY_SECRET` is absent). No equivalent startup validation exists
  yet for the CC-010 variables above because no code reads them yet — this
  is a placeholder table, not a running check, and is flagged as such.

## What was NOT done this phase

No `.env.example` file was created for variables that don't correspond to
any real running code yet — that would document configuration for
non-existent integrations as if it were live, which risks misleading a
future operator. This table is deliberately a *plan*, not a deployed
configuration.

# CC-002 — Command Center Database & Data Model

Status: implemented (database layer only — no UI, no execution logic).
Depends on: CC-001 (Command Center architecture, frozen).

## 1. Discovery — existing database structures

The live production trading system is split across two places:

- **VPS trading bot** (`/home/ubuntu/trading-bot`, not in this repo): the actual
  10:30 BANKNIFTY futures engine. Runtime state is file-based
  (`user-settings.json`, `trade-state.json`, `bot-heartbeat.json`,
  `trades.json`), and credentials live in a `.env` file managed by a
  token-server with auto-refresh (`--update-env` PM2 restarts). No SQL
  database is used on the VPS.
- **This repo (`zeroscreen.db`, via `src/db.ts`)**: a single SQLite file
  accessed through a small hand-written promise wrapper (`dbRun`/`dbAll`/`dbGet`
  over `sqlite3`). There is no ORM and no migration-file directory — schema is
  applied idempotently at startup inside `initDb()` using
  `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`, with rare
  `ALTER TABLE ... ADD COLUMN` wrapped so failures (column-exists) are ignored.
  Two tables already mirror the live bot for the dashboard:
  - `bot_state` — single-row (`id=1`) JSON blob (`data_json`), overwritten via
    webhook push from the bot.
  - `bot_trades` — flat trade log (`symbol, direction, entry_price, exit_price,
    qty, pnl, exit_reason, trade_date, duration, raw_json`), append-only.
  Neither table has a `sessionId`, per-order/per-execution granularity, or a
  user relationship — they were built for a single always-on bot, not for
  multiple isolated sessions.

Naming/style conventions carried forward: `snake_case` columns,
`INTEGER PRIMARY KEY AUTOINCREMENT`, `TEXT` timestamps
(`datetime('now','localtime')`), `REFERENCES` foreign keys, indexes created
with `CREATE INDEX IF NOT EXISTS`.

## 2. What was added

All new tables are prefixed `cc_` and live in `src/command-center/schema.ts`,
wired into the existing `initDb()` in `src/db.ts` via a single additive call
(`initCommandCenterSchema(db)`). Nothing existing was renamed, dropped, or
altered. `bot_state` and `bot_trades` are untouched and keep working exactly
as before — the live 10:30 strategy's existing webhook push and `/api/bot/status`
read path have zero code changes.

### Models

| Table | Purpose |
|---|---|
| `cc_strategy_definitions` | Safe strategy metadata (code, capability flags). No formulas/thresholds stored. |
| `cc_tradable_instruments` | Instrument reference data (exchange, symbol, lot size, tick size). |
| `cc_broker_accounts` | Connection/token **status** only — no secrets (see §5). |
| `cc_trading_sessions` | One row per independent session (LIVE/PAPER/SHADOW/BACKTEST). |
| `cc_session_configurations` | 1:1 with a session — qty, risk limits, trading window. |
| `cc_session_runtime` | 1:1 with a session — live engine/market/broker state, heartbeat. |
| `cc_trading_positions` | Session-owned positions. |
| `cc_trading_orders` | Session-owned orders, optionally linked to a position. |
| `cc_trade_executions` | Session-owned fills (real, paper, shadow, or backtest — distinguished via the session's `mode`, never mixed). |
| `cc_session_pnl_snapshots` | Time-series equity/P&L points, indexed `(session_id, timestamp)`. |
| `cc_session_risk_snapshots` | Time-series risk/exposure/kill-switch points. |
| `cc_session_events` | Session-scoped audit/event log (no proprietary reasoning in `message`). |
| `cc_backtest_runs` | Backtest run metadata + aggregate result fields, linked to a `BACKTEST` session. |

Full column lists match the phase spec exactly (see `src/command-center/types.ts`
for the TypeScript mirror of every field and enum).

### Enums (enforced via `CHECK` constraints)

- `cc_trading_sessions.mode`: `LIVE | PAPER | SHADOW | BACKTEST`
- `cc_trading_sessions.status`: `DRAFT | READY | STARTING | RUNNING | PAUSED | STOPPING | STOPPED | COMPLETED | FAILED`
- `cc_trading_sessions.product_type` / `cc_trading_positions.product_type` / `cc_tradable_instruments.instrument_type`: `FUTURES | OPTIONS`
- `cc_session_runtime.engine_state`: `IDLE | INITIALIZING | CONNECTING | MONITORING | SIGNAL_RECEIVED | ORDER_SUBMITTING | ORDER_PENDING | POSITION_ACTIVE | POSITION_MANAGING | EXITING | COMPLETED | PAUSED | STOPPED | ERROR`
- `cc_trading_positions.status`: `OPENING | OPEN | CLOSING | CLOSED | REJECTED | CANCELLED`
- `cc_trading_orders.status`: `CREATED | VALIDATING | SUBMITTED | ACKNOWLEDGED | PARTIALLY_FILLED | FILLED | REJECTED | CANCELLED | FAILED`
- `cc_session_events.severity`: `INFO | SUCCESS | WARNING | ERROR | CRITICAL`
- `cc_backtest_runs.status`: `QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED`

## 3. Relationships

```
users
 └── cc_trading_sessions (user_id)
       ├── cc_strategy_definitions (strategy_id, reference)
       ├── cc_tradable_instruments (instrument_id, reference)
       ├── cc_broker_accounts (broker_account_id, reference)
       ├── cc_session_configurations (session_id, 1:1)
       ├── cc_session_runtime (session_id, 1:1)
       ├── cc_trading_positions (session_id, 1:N)
       │     └── cc_trading_orders (position_id, N:1, nullable)
       │           └── cc_trade_executions (order_id, N:1, nullable)
       ├── cc_trading_orders (session_id, 1:N)
       ├── cc_trade_executions (session_id, 1:N)
       ├── cc_session_pnl_snapshots (session_id, 1:N)
       ├── cc_session_risk_snapshots (session_id, 1:N)
       ├── cc_session_events (session_id, 1:N)
       └── cc_backtest_runs (session_id, 1:N)
```

Foreign keys use `REFERENCES`; `PRAGMA foreign_keys = ON` was already set by
the existing `initDb()`. Cascading delete (`ON DELETE CASCADE`) is used only
for session-owned child tables — deleting a session cleans up its own
children. It is never reachable for a protected/production session (see §5).

## 4. Session isolation

- Every session-owned repository function in `src/command-center/repository.ts`
  requires **both** `userId` and `sessionId` — e.g. `listPositions(userId,
  sessionId)` first calls `assertOwnedSession(userId, sessionId)`, which does
  `SELECT * FROM cc_trading_sessions WHERE user_id = ? AND id = ?` before any
  child-table query runs. A `sessionId` alone is never sufficient to read or
  write session data.
- Indexes supporting isolation and common access patterns:
  - `idx_cc_sessions_user_mode (user_id, mode)`
  - `idx_cc_sessions_user_status (user_id, status)`
  - `idx_cc_positions_session_created (session_id, created_at)`
  - `idx_cc_positions_session_status (session_id, status)`
  - `idx_cc_orders_session_created (session_id, created_at)`
  - `idx_cc_orders_session_status (session_id, status)`
  - `idx_cc_orders_broker_order_id (broker_order_id)`
  - `idx_cc_orders_position (position_id)`
  - `idx_cc_executions_session_created (session_id, created_at)`
  - `idx_cc_executions_order (order_id)`
  - `idx_cc_executions_position (position_id)`
  - `idx_cc_pnl_snapshots_session_timestamp (session_id, timestamp)`
  - `idx_cc_risk_snapshots_session_timestamp (session_id, timestamp)`
  - `idx_cc_events_session_created (session_id, created_at)`
  - `idx_cc_backtest_runs_session_created (session_id, created_at)`
  - `idx_cc_broker_accounts_user (user_id)`

## 5. Production-session protection

Enforced at the database level with `CHECK` constraints, a partial unique
index, and triggers on `cc_trading_sessions` (see `schema.ts`):

- `idx_cc_sessions_single_production` — a `UNIQUE` index on `is_production`
  `WHERE is_production = 1`. At most one session in the whole database can
  ever hold the production flag.
- `cc_trg_protect_session_delete` — aborts any `DELETE` where
  `is_protected = 1`.
- `cc_trg_protect_session_mode_change` — aborts any `UPDATE` that changes
  `mode` on a protected session (blocks LIVE → PAPER/SHADOW/BACKTEST
  conversion).
- `cc_trg_protect_session_unprotect` / `cc_trg_protect_session_unproduction` —
  abort attempts to flip `is_protected` or `is_production` back to `0` once
  set, so the flags can't be silently cleared before a delete/mode-change.
- Repository-level: `deleteNonProductionSession()` refuses to run if
  `is_protected` or `is_production` is set, in addition to the DB trigger.
- Simulation/backtest data cannot affect production accounting because every
  P&L/risk/position/order/execution row is scoped to exactly one `session_id`,
  and that session's `mode` is fixed for its lifetime (protected session's
  mode can never change; non-protected sessions can only be PAPER/SHADOW/
  BACKTEST per `createDraftSession`'s type signature, which does not accept
  `LIVE`). There is no query anywhere that aggregates P&L across sessions.

Credential handling (`cc_broker_accounts`): only `connection_status` and
`token_status` (strings, e.g. `CONNECTED`/`EXPIRED`) are stored — there is no
token/secret column. The existing VPS token-server, `.env` file, and
auto-refresh-with-`--update-env` mechanism remain the single source of truth
for credentials, unchanged.

## 6. Migration approach for existing production data

Implemented in `src/command-center/migrate-production-session.ts`, invoked
once at startup after `initDb()` (`ensureProductionSession()`), and safe to
call any number of times:

1. **Idempotency**: guarded by a `SELECT ... WHERE is_production = 1` early
   return, and belt-and-braces by the partial unique index in §5 — a second
   insert attempt would violate the index rather than create a duplicate.
2. **What is created** (all new rows, zero writes to existing tables):
   one `cc_strategy_definitions` row (`code = 'DRISHTI_V1'`), one
   `cc_tradable_instruments` row (`BANKNIFTY` futures), one
   `cc_broker_accounts` row (status `UNKNOWN` until a real sync job populates
   it), one `cc_trading_sessions` row (`mode='LIVE'`, `is_pinned=1`,
   `is_protected=1`, `is_production=1`, `status='RUNNING'`), its
   `cc_session_configurations` (best-effort defaults: qty 30, max 8
   trades/day — matching the last known live config from project memory,
   **not verified against the live `.env`/`user-settings.json` at write
   time**), a `cc_session_runtime` row (`engine_state='MONITORING'`), and one
   `cc_session_events` audit row recording the bootstrap.
3. **Owner**: `user_id` is resolved as the first row in `users` (`ORDER BY id
   ASC LIMIT 1`) — this app is currently single-tenant for the live bot, so
   this is safe, but is an explicit assumption if the app becomes multi-user.
4. **What is intentionally NOT migrated — historical trade/order/execution
   backfill.** `bot_trades` has one flat row per completed trade with no
   order id, no execution id, no distinct order-vs-fill timestamps, and no
   partial-fill data. Mechanically mapping each `bot_trades` row into a
   `cc_trading_positions` + `cc_trading_orders` + `cc_trade_executions` triple
   would require inventing execution/order identifiers and timestamps that
   were never recorded, which risks producing data that looks authoritative
   but isn't. Per the phase's own escape hatch ("if automatic migration is
   unsafe, document the mapping without executing destructive changes"), this
   backfill is documented here as a **future, manual, reviewed step** rather
   than automated:
   - Source: `bot_trades(symbol, direction, entry_price, exit_price, qty, pnl,
     exit_reason, trade_date, duration, raw_json)`.
   - Target mapping (for a future one-off script, not run by this phase):
     one `cc_trading_positions` row per `bot_trades` row
     (`status='CLOSED'`, `entry_price`/`exit_price`/`realized_pnl` copied
     directly, `opened_at`/`closed_at` derived from `trade_date` + `duration`
     where parseable), with **no** synthetic `cc_trading_orders` /
     `cc_trade_executions` rows unless real broker order/execution IDs can be
     recovered (e.g. from `raw_json` if present).
   - `bot_state` / `bot_trades` remain the system of record for existing
     historical reporting (`/api/bot/status` is unchanged) until/unless that
     backfill is explicitly requested and reviewed.
5. **Rollback**: since nothing existing is touched, rollback is simply
   deleting the new rows — no production data is at risk.
   ```sql
   -- Only if a bootstrap needs to be undone in a dev/staging DB:
   DELETE FROM cc_session_events WHERE session_id IN (SELECT id FROM cc_trading_sessions WHERE is_production = 1);
   DELETE FROM cc_session_runtime WHERE session_id IN (SELECT id FROM cc_trading_sessions WHERE is_production = 1);
   DELETE FROM cc_session_configurations WHERE session_id IN (SELECT id FROM cc_trading_sessions WHERE is_production = 1);
   DELETE FROM cc_trading_sessions WHERE is_production = 1; -- blocked by trigger; disable trigger first if truly intended
   ```
   In production this is not expected to ever be needed — the trigger
   deliberately makes the production row hard to delete by accident.

## 7. Fields intentionally excluded (strategy confidentiality / security)

- No column anywhere stores strategy entry/exit formulas, indicator
  thresholds, or decision rules — `cc_strategy_definitions` only has a safe
  `code`/`display_name`/`description`/capability flags.
- `cc_session_runtime` and `cc_session_events` are documented as holding
  operational state/messages only (e.g. "Order submitted", "Position closed")
  — not the proprietary reasoning behind a signal.
- `cc_broker_accounts` has no token/secret/credential column.

## 8. Files changed

- `src/command-center/schema.ts` (new) — additive `cc_*` tables, indexes, triggers.
- `src/command-center/types.ts` (new) — TypeScript types/enums mirroring the schema.
- `src/command-center/repository.ts` (new) — session-isolated data-access functions.
- `src/command-center/migrate-production-session.ts` (new) — idempotent production-session bootstrap.
- `src/db.ts` (modified, additive only) — one import + one call to
  `initCommandCenterSchema(db)` inside the existing `initDb()`, right before
  the final resolve.
- `src/server.ts` (modified, additive only) — one import + one
  `ensureProductionSession()` call after `initDb()` resolves, alongside the
  existing `ensureAdminEmail()` / `expireOldSubscriptions()` startup calls.
- `docs/command-center/CC-002-data-model.md` (new) — this document.

## 9. Validation performed

- `npx tsc --noEmit` run against the project after these changes (see PR/
  session notes for output) to confirm the new modules type-check against
  the existing `dbRun`/`dbAll`/`dbGet` signatures.
- Schema was applied to a throwaway copy of the dev SQLite file to confirm
  `CREATE TABLE IF NOT EXISTS` / triggers / partial unique index all apply
  cleanly on both a brand-new (clean) database and the existing
  `zeroscreen.db` without error, and that `bot_state`/`bot_trades` row counts
  are unchanged before/after.
- Not yet done: this has not been deployed to or tested against the VPS
  trading-bot process or its `.env`/token mechanism — this phase touches only
  the ZeroScreen web app's SQLite database, per the phase's own scope
  ("DATABASE ONLY").

## 10. Risks / assumptions

- Single-tenant assumption for `ensureProductionSession()`'s owner lookup
  (`first user by id`) — fine today, must be revisited before multi-user
  production trading.
- `cc_tradable_instruments.lot_size` for BANKNIFTY is a best-effort seed value
  and should be confirmed against the current exchange lot size before any
  session actually trades against this row (lot sizes are periodically
  resized by the exchange).
- `cc_broker_accounts.token_status` starts as `UNKNOWN` and is not yet wired
  to the real token-server health check — populating it is future work, not
  part of this database-only phase.

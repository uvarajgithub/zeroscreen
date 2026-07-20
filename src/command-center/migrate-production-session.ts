/**
 * CC-002 — production session bootstrap.
 *
 * Creates the protected/pinned TradingSession row that represents the
 * existing, already-live 10:30 BANKNIFTY Futures strategy. This is
 * additive only:
 *   - It never touches `bot_state` / `bot_trades` (the existing mirror
 *     tables the live bot already writes to).
 *   - It never touches `users`.
 *   - It is idempotent: a partial unique index (is_production = 1) means
 *     re-running this is a no-op after the first successful run.
 *
 * Historical trade/order/execution backfill into cc_trading_positions /
 * cc_trading_orders / cc_trade_executions is intentionally NOT performed
 * here — see docs/command-center/CC-002-data-model.md ("Migration
 * approach") for why that is deferred rather than automated.
 */

import { dbGet, dbRun } from "../db";

export const PRODUCTION_SESSION_NAME = "10:30 BANKNIFTY Futures (Production)";
export const PRODUCTION_STRATEGY_CODE = "DRISHTI_V1";
export const PRODUCTION_INSTRUMENT_SYMBOL = "BANKNIFTY";

export async function ensureProductionSession(): Promise<void> {
  const existing = await dbGet<{ id: number }>(
    "SELECT id FROM cc_trading_sessions WHERE is_production = 1"
  );
  if (existing) return; // already bootstrapped — idempotent no-op

  const owner = await dbGet<{ id: number }>("SELECT id FROM users ORDER BY id ASC LIMIT 1");
  if (!owner) return; // no user yet to own the session; safe to skip until one exists

  await dbRun(
    `INSERT INTO cc_strategy_definitions
      (code, display_name, description, is_active, supports_futures, supports_options,
       supports_live, supports_paper, supports_shadow, supports_backtest)
     VALUES (?, ?, ?, 1, 1, 0, 1, 1, 1, 1)
     ON CONFLICT(code) DO NOTHING`,
    [PRODUCTION_STRATEGY_CODE, "DRISHTI 10:30 Breakout", "Existing production 10:30 BANKNIFTY futures breakout strategy."]
  );
  const strategy = await dbGet<{ id: number }>(
    "SELECT id FROM cc_strategy_definitions WHERE code = ?",
    [PRODUCTION_STRATEGY_CODE]
  );

  await dbRun(
    `INSERT INTO cc_tradable_instruments (exchange, symbol, display_name, instrument_type, lot_size, tick_size, is_active)
     VALUES ('NFO', ?, 'BANKNIFTY Futures', 'FUTURES', 30, 0.05, 1)
     ON CONFLICT(exchange, symbol, instrument_type) DO NOTHING`,
    [PRODUCTION_INSTRUMENT_SYMBOL]
  );
  const instrument = await dbGet<{ id: number }>(
    "SELECT id FROM cc_tradable_instruments WHERE exchange = 'NFO' AND symbol = ? AND instrument_type = 'FUTURES'",
    [PRODUCTION_INSTRUMENT_SYMBOL]
  );

  await dbRun(
    `INSERT INTO cc_broker_accounts (user_id, broker_code, display_name, connection_status, token_status)
     VALUES (?, 'ZERODHA', 'Production Zerodha Account', 'UNKNOWN', 'UNKNOWN')`,
    [owner.id]
  );
  const broker = await dbGet<{ id: number }>(
    "SELECT id FROM cc_broker_accounts WHERE user_id = ? AND broker_code = 'ZERODHA' ORDER BY id DESC LIMIT 1",
    [owner.id]
  );

  await dbRun(
    `INSERT INTO cc_trading_sessions
      (user_id, name, strategy_id, instrument_id, product_type, mode, broker_account_id,
       status, is_pinned, is_protected, is_production)
     VALUES (?, ?, ?, ?, 'FUTURES', 'LIVE', ?, 'RUNNING', 1, 1, 1)`,
    [owner.id, PRODUCTION_SESSION_NAME, strategy?.id ?? null, instrument?.id ?? null, broker?.id ?? null]
  );
  const session = await dbGet<{ id: number }>(
    "SELECT id FROM cc_trading_sessions WHERE is_production = 1"
  );
  if (!session) return;

  await dbRun(
    `INSERT INTO cc_session_configurations (session_id, quantity, max_trades_per_day, auto_start_enabled, auto_stop_enabled)
     VALUES (?, 30, 8, 1, 1)`,
    [session.id]
  );

  await dbRun(
    `INSERT INTO cc_session_runtime (session_id, engine_state) VALUES (?, 'MONITORING')`,
    [session.id]
  );

  await dbRun(
    `INSERT INTO cc_session_events (session_id, event_type, severity, title, message, occurred_at)
     VALUES (?, 'SESSION_MIGRATED', 'INFO', 'Production session bootstrapped',
             'CC-002 created the protected production session record for the existing live 10:30 strategy.',
             datetime('now','localtime'))`,
    [session.id]
  );
}

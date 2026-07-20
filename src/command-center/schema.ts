/**
 * Command Center (CC-002) — additive database schema.
 *
 * All tables are prefixed `cc_` to keep them isolated from the existing
 * ZeroScreen screener schema and from the existing `bot_state` / `bot_trades`
 * mirror tables used by the live 10:30 BANKNIFTY Futures strategy.
 *
 * This module only adds new tables/indexes/triggers. It never alters,
 * renames, or drops any existing table.
 */

import sqlite3 from "sqlite3";

export function initCommandCenterSchema(db: sqlite3.Database): void {
  db.run(`CREATE TABLE IF NOT EXISTS cc_strategy_definitions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    code               TEXT NOT NULL UNIQUE,
    display_name       TEXT NOT NULL,
    description        TEXT,
    version            TEXT NOT NULL DEFAULT '1.0.0',
    is_active          INTEGER NOT NULL DEFAULT 1,
    supports_futures   INTEGER NOT NULL DEFAULT 0,
    supports_options   INTEGER NOT NULL DEFAULT 0,
    supports_live      INTEGER NOT NULL DEFAULT 0,
    supports_paper     INTEGER NOT NULL DEFAULT 0,
    supports_shadow    INTEGER NOT NULL DEFAULT 0,
    supports_backtest  INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT DEFAULT (datetime('now','localtime')),
    updated_at         TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cc_tradable_instruments (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    exchange         TEXT NOT NULL,
    symbol           TEXT NOT NULL,
    display_name     TEXT,
    instrument_type  TEXT NOT NULL CHECK (instrument_type IN ('FUTURES','OPTIONS')),
    lot_size         INTEGER NOT NULL,
    tick_size        REAL NOT NULL,
    is_active        INTEGER NOT NULL DEFAULT 1,
    created_at       TEXT DEFAULT (datetime('now','localtime')),
    updated_at       TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(exchange, symbol, instrument_type)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cc_broker_accounts (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker_code            TEXT NOT NULL,
    display_name           TEXT,
    account_reference      TEXT,
    connection_status      TEXT NOT NULL DEFAULT 'DISCONNECTED',
    token_status           TEXT NOT NULL DEFAULT 'UNKNOWN',
    last_token_refresh_at  TEXT,
    last_connected_at      TEXT,
    is_active              INTEGER NOT NULL DEFAULT 1,
    created_at             TEXT DEFAULT (datetime('now','localtime')),
    updated_at             TEXT DEFAULT (datetime('now','localtime'))
  )`);
  // NOTE: intentionally no token/secret column. The existing token-server /
  // .env / auto-refresh mechanism on the trading VPS remains the sole holder
  // of credentials; this table only tracks connection/token *status*.
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_broker_accounts_user ON cc_broker_accounts(user_id)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_trading_sessions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name               TEXT NOT NULL,
    strategy_id        INTEGER REFERENCES cc_strategy_definitions(id),
    instrument_id      INTEGER REFERENCES cc_tradable_instruments(id),
    product_type       TEXT NOT NULL CHECK (product_type IN ('FUTURES','OPTIONS')),
    mode               TEXT NOT NULL CHECK (mode IN ('LIVE','PAPER','SHADOW','BACKTEST')),
    broker_account_id  INTEGER REFERENCES cc_broker_accounts(id),
    status             TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
                         'DRAFT','READY','STARTING','RUNNING','PAUSED',
                         'STOPPING','STOPPED','COMPLETED','FAILED'
                       )),
    is_pinned          INTEGER NOT NULL DEFAULT 0,
    is_protected       INTEGER NOT NULL DEFAULT 0,
    is_production      INTEGER NOT NULL DEFAULT 0,
    started_at         TEXT,
    paused_at          TEXT,
    stopped_at         TEXT,
    completed_at       TEXT,
    created_at         TEXT DEFAULT (datetime('now','localtime')),
    updated_at         TEXT DEFAULT (datetime('now','localtime'))
  )`);
  // Only one session may ever hold the production flag at a time.
  db.run("CREATE UNIQUE INDEX IF NOT EXISTS idx_cc_sessions_single_production ON cc_trading_sessions(is_production) WHERE is_production = 1");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_sessions_user_mode ON cc_trading_sessions(user_id, mode)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_sessions_user_status ON cc_trading_sessions(user_id, status)");

  // ── Production-session protection triggers ─────────────────────────────
  db.run(`CREATE TRIGGER IF NOT EXISTS cc_trg_protect_session_delete
    BEFORE DELETE ON cc_trading_sessions
    WHEN OLD.is_protected = 1
    BEGIN
      SELECT RAISE(ABORT, 'cc_trading_sessions: protected session cannot be deleted');
    END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS cc_trg_protect_session_mode_change
    BEFORE UPDATE OF mode ON cc_trading_sessions
    WHEN OLD.is_protected = 1 AND NEW.mode <> OLD.mode
    BEGIN
      SELECT RAISE(ABORT, 'cc_trading_sessions: protected session mode cannot be changed');
    END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS cc_trg_protect_session_unprotect
    BEFORE UPDATE OF is_protected ON cc_trading_sessions
    WHEN OLD.is_protected = 1 AND NEW.is_protected = 0
    BEGIN
      SELECT RAISE(ABORT, 'cc_trading_sessions: protected flag cannot be removed');
    END`);
  db.run(`CREATE TRIGGER IF NOT EXISTS cc_trg_protect_session_unproduction
    BEFORE UPDATE OF is_production ON cc_trading_sessions
    WHEN OLD.is_production = 1 AND NEW.is_production = 0
    BEGIN
      SELECT RAISE(ABORT, 'cc_trading_sessions: production flag cannot be removed');
    END`);

  db.run(`CREATE TABLE IF NOT EXISTS cc_session_configurations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id            INTEGER NOT NULL UNIQUE REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    quantity              INTEGER,
    lot_count             INTEGER,
    capital_allocated     REAL,
    max_daily_loss        REAL,
    max_trades_per_day    INTEGER,
    stop_loss_value       REAL,
    target_value          REAL,
    trading_start_time    TEXT,
    trading_cutoff_time   TEXT,
    auto_start_enabled    INTEGER NOT NULL DEFAULT 0,
    auto_stop_enabled     INTEGER NOT NULL DEFAULT 0,
    created_at            TEXT DEFAULT (datetime('now','localtime')),
    updated_at            TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cc_session_runtime (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL UNIQUE REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    engine_state        TEXT NOT NULL DEFAULT 'IDLE' CHECK (engine_state IN (
                          'IDLE','INITIALIZING','CONNECTING','MONITORING','SIGNAL_RECEIVED',
                          'ORDER_SUBMITTING','ORDER_PENDING','POSITION_ACTIVE','POSITION_MANAGING',
                          'EXITING','COMPLETED','PAUSED','STOPPED','ERROR'
                        )),
    market_state        TEXT,
    broker_state        TEXT,
    heartbeat_at        TEXT,
    last_tick_at        TEXT,
    last_action_at      TEXT,
    last_error_at       TEXT,
    last_error_code     TEXT,
    last_error_message  TEXT,
    uptime_seconds      INTEGER NOT NULL DEFAULT 0,
    created_at          TEXT DEFAULT (datetime('now','localtime')),
    updated_at          TEXT DEFAULT (datetime('now','localtime'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS cc_trading_positions (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    instrument_symbol  TEXT NOT NULL,
    product_type       TEXT NOT NULL CHECK (product_type IN ('FUTURES','OPTIONS')),
    direction          TEXT NOT NULL,
    quantity           INTEGER NOT NULL,
    entry_price        REAL,
    current_price      REAL,
    exit_price         REAL,
    stop_loss          REAL,
    target             REAL,
    realized_pnl       REAL,
    unrealized_pnl     REAL,
    status             TEXT NOT NULL DEFAULT 'OPENING' CHECK (status IN (
                         'OPENING','OPEN','CLOSING','CLOSED','REJECTED','CANCELLED'
                       )),
    opened_at          TEXT,
    closed_at          TEXT,
    created_at         TEXT DEFAULT (datetime('now','localtime')),
    updated_at         TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_positions_session_created ON cc_trading_positions(session_id, created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_positions_session_status ON cc_trading_positions(session_id, status)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_trading_orders (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    position_id         INTEGER REFERENCES cc_trading_positions(id) ON DELETE SET NULL,
    broker_order_id     TEXT,
    order_type          TEXT,
    transaction_type    TEXT,
    quantity            INTEGER,
    requested_price     REAL,
    average_price       REAL,
    trigger_price       REAL,
    status              TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN (
                          'CREATED','VALIDATING','SUBMITTED','ACKNOWLEDGED',
                          'PARTIALLY_FILLED','FILLED','REJECTED','CANCELLED','FAILED'
                        )),
    rejection_reason    TEXT,
    submitted_at        TEXT,
    acknowledged_at     TEXT,
    executed_at         TEXT,
    cancelled_at        TEXT,
    created_at          TEXT DEFAULT (datetime('now','localtime')),
    updated_at          TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_orders_session_created ON cc_trading_orders(session_id, created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_orders_session_status ON cc_trading_orders(session_id, status)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_orders_broker_order_id ON cc_trading_orders(broker_order_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_orders_position ON cc_trading_orders(position_id)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_trade_executions (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id            INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    order_id              INTEGER REFERENCES cc_trading_orders(id) ON DELETE SET NULL,
    position_id           INTEGER REFERENCES cc_trading_positions(id) ON DELETE SET NULL,
    broker_execution_id   TEXT,
    quantity              INTEGER,
    price                 REAL,
    fees                  REAL,
    brokerage             REAL,
    taxes                 REAL,
    slippage              REAL,
    executed_at           TEXT,
    created_at            TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_executions_session_created ON cc_trade_executions(session_id, created_at)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_executions_order ON cc_trade_executions(order_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_executions_position ON cc_trade_executions(position_id)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_session_pnl_snapshots (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id          INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    timestamp           TEXT NOT NULL,
    realized_pnl        REAL,
    unrealized_pnl      REAL,
    gross_pnl           REAL,
    net_pnl             REAL,
    brokerage           REAL,
    charges             REAL,
    account_balance     REAL,
    available_balance   REAL,
    used_margin         REAL,
    drawdown            REAL,
    created_at          TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_pnl_snapshots_session_timestamp ON cc_session_pnl_snapshots(session_id, timestamp)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_session_risk_snapshots (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id               INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    timestamp                TEXT NOT NULL,
    capital_allocated        REAL,
    capital_used             REAL,
    exposure                 REAL,
    daily_loss_used          REAL,
    daily_loss_remaining     REAL,
    current_drawdown         REAL,
    max_drawdown             REAL,
    trade_count              INTEGER,
    remaining_trade_count    INTEGER,
    kill_switch_active       INTEGER NOT NULL DEFAULT 0,
    created_at               TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_risk_snapshots_session_timestamp ON cc_session_risk_snapshots(session_id, timestamp)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_session_events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    severity      TEXT NOT NULL DEFAULT 'INFO' CHECK (severity IN ('INFO','SUCCESS','WARNING','ERROR','CRITICAL')),
    title         TEXT,
    message       TEXT,
    metadata      TEXT,
    occurred_at   TEXT NOT NULL,
    created_at    TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_events_session_created ON cc_session_events(session_id, created_at)");

  db.run(`CREATE TABLE IF NOT EXISTS cc_backtest_runs (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id         INTEGER NOT NULL REFERENCES cc_trading_sessions(id) ON DELETE CASCADE,
    date_from          TEXT,
    date_to            TEXT,
    initial_capital    REAL,
    status             TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN (
                         'QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED'
                       )),
    progress_percent   REAL NOT NULL DEFAULT 0,
    started_at         TEXT,
    completed_at       TEXT,
    total_trades       INTEGER,
    winning_trades     INTEGER,
    losing_trades      INTEGER,
    gross_pnl          REAL,
    net_pnl            REAL,
    max_drawdown       REAL,
    profit_factor      REAL,
    win_rate           REAL,
    result_summary     TEXT,
    created_at         TEXT DEFAULT (datetime('now','localtime')),
    updated_at         TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run("CREATE INDEX IF NOT EXISTS idx_cc_backtest_runs_session_created ON cc_backtest_runs(session_id, created_at)");
}

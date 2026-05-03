/**
 * db.ts — SQLite database layer for ZeroScreen
 * Uses sqlite3 with promise wrappers
 */

import sqlite3 from "sqlite3";
import path from "path";

const DB_PATH = path.join(__dirname, "..", "zeroscreen.db");

let _db: sqlite3.Database | null = null;

export function getDb(): sqlite3.Database {
  if (_db) return _db;
  _db = new sqlite3.Database(DB_PATH);
  return _db;
}

export function dbRun(sql: string, params: any[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, (err) => { if (err) reject(err); else resolve(); });
  });
}

export function dbAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => { if (err) reject(err); else resolve(rows as T[]); });
  });
}

export function dbGet<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => { if (err) reject(err); else resolve((row as T) || null); });
  });
}

export async function initDb(): Promise<void> {
  const db = getDb();
  await new Promise<void>((resolve, reject) => {
    db.serialize(() => {
      db.run("PRAGMA journal_mode = WAL");
      db.run("PRAGMA foreign_keys = ON");
      db.run(`CREATE TABLE IF NOT EXISTS stocks (
        symbol          TEXT PRIMARY KEY,
        company_name    TEXT,
        sector          TEXT,
        market_cap      REAL,
        pe_ratio        REAL,
        roce            REAL,
        roe             REAL,
        de_ratio        REAL,
        promoter_pct    REAL,
        net_profit_1    REAL,
        net_profit_2    REAL,
        net_profit_3    REAL,
        revenue_1       REAL,
        revenue_2       REAL,
        revenue_3       REAL,
        eps             REAL,
        book_value      REAL,
        dividend_yield  REAL,
        current_ratio   REAL,
        all_profitable  INTEGER DEFAULT 0,
        profit_uptrend  INTEGER DEFAULT 0,
        screener_data   TEXT,
        fetched_at      TEXT,
        fetch_error     TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS prices (
        symbol     TEXT PRIMARY KEY,
        price      REAL,
        volume     INTEGER,
        day_high   REAL,
        day_low    REAL,
        prev_close REAL,
        change_pct REAL,
        updated_at TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS watchlists (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        description TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        updated_at  TEXT DEFAULT (datetime('now'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS watchlist_stocks (
        watchlist_id INTEGER REFERENCES watchlists(id) ON DELETE CASCADE,
        symbol       TEXT NOT NULL,
        added_at     TEXT DEFAULT (datetime('now')),
        notes        TEXT,
        PRIMARY KEY (watchlist_id, symbol)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL UNIQUE,
        password   TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'user',
        created_at TEXT DEFAULT (datetime('now'))
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_stocks_roce ON stocks(roce)");
      db.run("CREATE INDEX IF NOT EXISTS idx_stocks_de ON stocks(de_ratio)");
      db.run("CREATE INDEX IF NOT EXISTS idx_prices_volume ON prices(volume)");
      db.run("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)");
      // Migrations (safe — errors ignored if column already exists)
      db.run("ALTER TABLE watchlists ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE SET NULL", () => {});
      db.run(`CREATE TABLE IF NOT EXISTS alerts (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name         TEXT NOT NULL,
        filters_json TEXT NOT NULL,
        last_sent    TEXT,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT DEFAULT (datetime('now'))
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id)");
      db.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
        token      TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_watchlists_user ON watchlists(user_id)");
      // 52-week range columns (migration — safe if already exist)
      db.run("ALTER TABLE stocks ADD COLUMN week52_high REAL", () => {});
      db.run("ALTER TABLE stocks ADD COLUMN week52_low  REAL", () => {});
      // Company about / incorporation year (migration)
      db.run("ALTER TABLE stocks ADD COLUMN about TEXT", () => {});
      db.run("ALTER TABLE stocks ADD COLUMN incorporated INTEGER", () => {});
      db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user ON password_reset_tokens(user_id)");
      // ── Analytics ───────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS page_views (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        path        TEXT NOT NULL,
        ip_hash     TEXT,
        user_agent  TEXT,
        referrer    TEXT,
        is_logged_in INTEGER DEFAULT 0,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path)");
      db.run("CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at)");
      // ── Custom strategies ────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS custom_strategies (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        description TEXT,
        text_input  TEXT,
        filters_json TEXT NOT NULL,
        created_at  TEXT DEFAULT (datetime('now','localtime'))
      )`);
      // ── Google OAuth ─────────────────────────────────────────────────────────
      db.run("ALTER TABLE users ADD COLUMN google_id TEXT", () => {});
      db.run("ALTER TABLE users ADD COLUMN avatar_url TEXT", () => {});
      // ── Picks ────────────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS picks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_symbol TEXT NOT NULL,
        company_name TEXT,
        direction    TEXT NOT NULL DEFAULT 'LONG',
        pick_type    TEXT NOT NULL DEFAULT 'intraday',
        entry_low    REAL NOT NULL,
        entry_high   REAL NOT NULL,
        target       REAL,
        stop_loss    REAL,
        reason       TEXT NOT NULL,
        risk_level   TEXT NOT NULL DEFAULT 'Medium',
        status       TEXT NOT NULL DEFAULT 'active',
        published_at TEXT DEFAULT (datetime('now','localtime')),
        expires_at   TEXT,
        created_by   INTEGER REFERENCES users(id)
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_picks_status ON picks(status)");
      db.run(`ALTER TABLE picks ADD COLUMN pick_type TEXT NOT NULL DEFAULT 'intraday'`, () => {});
      // ── App settings ─────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS app_settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
      )`);
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('telegram_link','')");
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('home_headline','India''s sharpest NSE screener')");
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('signals_mode','live')");
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('banner_text','')");
      // ── Subscriptions ─────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         INTEGER NOT NULL REFERENCES users(id),
        razorpay_order_id    TEXT,
        razorpay_payment_id  TEXT,
        razorpay_sub_id      TEXT,
        plan            TEXT NOT NULL DEFAULT 'monthly',
        amount          INTEGER NOT NULL DEFAULT 49900,
        currency        TEXT NOT NULL DEFAULT 'INR',
        status          TEXT NOT NULL DEFAULT 'pending',
        starts_at       TEXT,
        expires_at      TEXT,
        coupon_code     TEXT,
        created_at      TEXT DEFAULT (datetime('now','localtime'))
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_subs_user ON subscriptions(user_id)");
      db.run("CREATE INDEX IF NOT EXISTS idx_subs_status ON subscriptions(status)");
      // ── Referrals ──────────────────────────────────────────────────────────────
      db.run(`ALTER TABLE users ADD COLUMN referral_code TEXT`, () => {});
      db.run(`ALTER TABLE users ADD COLUMN referred_by   TEXT`, () => {});
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('razorpay_enabled','false')");
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('premium_price_paise','49900')");
      // ── User Paper Trading ────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS paper_portfolio (
        user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance    REAL    NOT NULL DEFAULT 100000,
        created_at TEXT    DEFAULT (datetime('now','localtime'))
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS paper_positions (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol       TEXT    NOT NULL,
        company_name TEXT,
        qty          INTEGER NOT NULL,
        avg_price    REAL    NOT NULL,
        invested     REAL    NOT NULL,
        entry_date   TEXT    DEFAULT (datetime('now','localtime')),
        UNIQUE(user_id, symbol)
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS paper_trades (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        symbol       TEXT    NOT NULL,
        company_name TEXT,
        action       TEXT    NOT NULL,
        qty          INTEGER NOT NULL,
        price        REAL    NOT NULL,
        total        REAL    NOT NULL,
        pnl          REAL,
        pnl_pct      REAL,
        balance_after REAL   NOT NULL,
        traded_at    TEXT    DEFAULT (datetime('now','localtime'))
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_pt_user ON paper_trades(user_id)");
      db.run("CREATE INDEX IF NOT EXISTS idx_pp_user ON paper_positions(user_id)");
      // ── Mobile OTP ───────────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS phone_otps (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        mobile     TEXT NOT NULL,
        otp        TEXT NOT NULL,
        purpose    TEXT NOT NULL DEFAULT 'verify',
        expires_at INTEGER NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime'))
      )`);
      db.run("CREATE INDEX IF NOT EXISTS idx_otps_mobile ON phone_otps(mobile)");
      // ── Paper Trade Config ────────────────────────────────────────────────────
      db.run(`CREATE TABLE IF NOT EXISTS paper_trade_config (
        user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        trade_type      TEXT    NOT NULL DEFAULT 'INTRADAY',
        default_qty     INTEGER NOT NULL DEFAULT 1,
        default_sl_pct  REAL    NOT NULL DEFAULT 2.0,
        default_tgt_pct REAL    NOT NULL DEFAULT 4.0,
        max_positions   INTEGER NOT NULL DEFAULT 10,
        updated_at      TEXT    DEFAULT (datetime('now','localtime'))
      )`);
      // Mobile verification & trade_type migrations (safe — errors ignored)
      db.run("ALTER TABLE users ADD COLUMN mobile TEXT", () => {});
      db.run("ALTER TABLE users ADD COLUMN mobile_verified INTEGER NOT NULL DEFAULT 0", () => {});
      db.run("ALTER TABLE paper_positions ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'INTRADAY'", () => {});
      db.run("ALTER TABLE paper_trades ADD COLUMN trade_type TEXT NOT NULL DEFAULT 'INTRADAY'", () => {});
      db.run("INSERT OR IGNORE INTO app_settings (key,value) VALUES ('paper_free_limit','10')");
      db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user3 ON password_reset_tokens(user_id)", (err) => {
        if (err) resolve(); else resolve();
      });
    });
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StockRow {
  symbol: string; company_name: string | null; sector: string | null;
  market_cap: number | null; pe_ratio: number | null; roce: number | null;
  roe: number | null; de_ratio: number | null; promoter_pct: number | null;
  net_profit_1: number | null; net_profit_2: number | null; net_profit_3: number | null;
  revenue_1: number | null; revenue_2: number | null; revenue_3: number | null;
  eps: number | null; book_value: number | null; dividend_yield: number | null;
  current_ratio: number | null; all_profitable: number; profit_uptrend: number;
  week52_high: number | null; week52_low: number | null;
  about: string | null; incorporated: number | null;
  screener_data: string | null; fetched_at: string | null; fetch_error: string | null;
}

export interface PriceRow {
  symbol: string; price: number | null; volume: number | null;
  day_high: number | null; day_low: number | null; prev_close: number | null;
  change_pct: number | null; updated_at: string | null;
}

// ── Upserts ───────────────────────────────────────────────────────────────────
export async function upsertStock(s: Partial<StockRow> & { symbol: string }): Promise<void> {
  const d = {
    company_name: null, sector: null, market_cap: null, pe_ratio: null, roce: null,
    roe: null, de_ratio: null, promoter_pct: null,
    net_profit_1: null, net_profit_2: null, net_profit_3: null,
    revenue_1: null, revenue_2: null, revenue_3: null,
    eps: null, book_value: null, dividend_yield: null, current_ratio: null,
    all_profitable: 0, profit_uptrend: 0,
    week52_high: null, week52_low: null,
    about: null, incorporated: null,
    screener_data: null, fetched_at: null, fetch_error: null,
    ...s,
  };
  await dbRun(`
    INSERT INTO stocks (symbol,company_name,sector,market_cap,pe_ratio,roce,roe,de_ratio,
      promoter_pct,net_profit_1,net_profit_2,net_profit_3,revenue_1,revenue_2,revenue_3,
      eps,book_value,dividend_yield,current_ratio,all_profitable,profit_uptrend,
      week52_high,week52_low,about,incorporated,screener_data,fetched_at,fetch_error)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      company_name=excluded.company_name,sector=excluded.sector,market_cap=excluded.market_cap,
      pe_ratio=excluded.pe_ratio,roce=excluded.roce,roe=excluded.roe,de_ratio=excluded.de_ratio,
      promoter_pct=excluded.promoter_pct,net_profit_1=excluded.net_profit_1,
      net_profit_2=excluded.net_profit_2,net_profit_3=excluded.net_profit_3,
      revenue_1=excluded.revenue_1,revenue_2=excluded.revenue_2,revenue_3=excluded.revenue_3,
      eps=excluded.eps,book_value=excluded.book_value,dividend_yield=excluded.dividend_yield,
      current_ratio=excluded.current_ratio,all_profitable=excluded.all_profitable,
      profit_uptrend=excluded.profit_uptrend,week52_high=excluded.week52_high,
      week52_low=excluded.week52_low,about=excluded.about,incorporated=excluded.incorporated,
      screener_data=excluded.screener_data,
      fetched_at=excluded.fetched_at,fetch_error=excluded.fetch_error
  `, [d.symbol,d.company_name,d.sector,d.market_cap,d.pe_ratio,d.roce,d.roe,d.de_ratio,
      d.promoter_pct,d.net_profit_1,d.net_profit_2,d.net_profit_3,
      d.revenue_1,d.revenue_2,d.revenue_3,
      d.eps,d.book_value,d.dividend_yield,d.current_ratio,
      d.all_profitable,d.profit_uptrend,d.week52_high,d.week52_low,
      d.about,d.incorporated,
      d.screener_data,d.fetched_at,d.fetch_error]);
}

export async function upsertPrice(p: PriceRow): Promise<void> {
  await dbRun(`
    INSERT INTO prices (symbol,price,volume,day_high,day_low,prev_close,change_pct,updated_at)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      price=excluded.price,volume=excluded.volume,day_high=excluded.day_high,
      day_low=excluded.day_low,prev_close=excluded.prev_close,change_pct=excluded.change_pct,
      updated_at=excluded.updated_at
  `, [p.symbol,p.price,p.volume,p.day_high,p.day_low,p.prev_close,p.change_pct,p.updated_at]);
}

// ── Screener ──────────────────────────────────────────────────────────────────
export interface ScreenerFilter {
  minRoce?: number; maxRoce?: number; maxDe?: number;
  minPromoter?: number; maxPromoter?: number;
  minPe?: number; maxPe?: number;
  minPrice?: number; maxPrice?: number; minVolume?: number;
  minMarketCap?: number; maxMarketCap?: number;
  minDividendYield?: number;
  // Indicator filters
  minRoe?: number;                // ROE >= X%
  minEps?: number;                // EPS >= X (positive earnings)
  minCurrentRatio?: number;       // Current Ratio >= X (liquidity)
  maxPbRatio?: number;            // Price/Book <= X (value)
  minChangePct?: number;          // Day change % >= X (momentum/gainer)
  maxChangePct?: number;          // Day change % <= X (dip/loser)
  near52High?: number;            // Price within X% below 52W high (breakout)
  near52Low?: number;             // Price within X% above 52W low (value zone)
  allProfitable?: boolean; profitUptrend?: boolean;
  sector?: string; sortBy?: string; sortDir?: "asc" | "desc";
  limit?: number; offset?: number;
}

export async function screenStocks(f: ScreenerFilter): Promise<Array<StockRow & PriceRow>> {
  const wheres: string[] = ["s.fetched_at IS NOT NULL", "(s.fetch_error IS NULL OR s.fetch_error = '')"];
  const params: any[] = [];

  const add = (w: string, v: any) => { wheres.push(w); params.push(v); };
  if (f.minRoce     != null) add("s.roce >= ?",         f.minRoce);
  if (f.maxRoce     != null) add("s.roce <= ?",         f.maxRoce);
  if (f.maxDe       != null) add("(s.de_ratio <= ? OR s.de_ratio IS NULL)", f.maxDe);
  if (f.minPromoter != null) add("s.promoter_pct >= ?", f.minPromoter);
  if (f.maxPromoter != null) add("s.promoter_pct <= ?", f.maxPromoter);
  if (f.minPe       != null) add("s.pe_ratio >= ?",     f.minPe);
  if (f.maxPe       != null) add("s.pe_ratio <= ?",     f.maxPe);
  if (f.minPrice    != null) add("p.price >= ?",        f.minPrice);
  if (f.maxPrice    != null) add("p.price <= ?",        f.maxPrice);
  if (f.minVolume   != null) add("p.volume >= ?",       f.minVolume);
  if (f.minMarketCap!= null) add("s.market_cap >= ?",   f.minMarketCap);
  if (f.maxMarketCap!= null) add("s.market_cap <= ?",   f.maxMarketCap);
  if (f.minDividendYield != null) add("s.dividend_yield >= ?", f.minDividendYield);
  if (f.minRoe           != null) add("s.roe >= ?",            f.minRoe);
  if (f.minEps           != null) add("s.eps >= ?",            f.minEps);
  if (f.minCurrentRatio  != null) add("s.current_ratio >= ?",  f.minCurrentRatio);
  // Price/Book: computed as p.price / s.book_value <= maxPbRatio
  if (f.maxPbRatio    != null) add("(s.book_value > 0 AND (p.price / s.book_value) <= ?)", f.maxPbRatio);
  if (f.minChangePct  != null) add("p.change_pct >= ?",  f.minChangePct);
  if (f.maxChangePct  != null) add("p.change_pct <= ?",  f.maxChangePct);
  // near52High: price within X% below 52W high  =>  price >= 52W_high * (1 - X/100)
  if (f.near52High != null) add(
    "(s.week52_high IS NOT NULL AND p.price IS NOT NULL AND p.price >= s.week52_high * (1.0 - ? / 100.0))",
    f.near52High
  );
  // near52Low: price within X% above 52W low  =>  price <= 52W_low * (1 + X/100)
  if (f.near52Low != null) add(
    "(s.week52_low IS NOT NULL AND p.price IS NOT NULL AND p.price <= s.week52_low * (1.0 + ? / 100.0))",
    f.near52Low
  );
  if (f.allProfitable) wheres.push("s.all_profitable = 1");
  if (f.profitUptrend) wheres.push("s.profit_uptrend = 1");
  if (f.sector) add("s.sector = ?", f.sector);

  const allowedSort: Record<string, string> = {
    roce: "s.roce", roe: "s.roe", de: "s.de_ratio", promoter: "s.promoter_pct",
    pe: "s.pe_ratio", price: "p.price", volume: "p.volume",
    market_cap: "s.market_cap", change_pct: "p.change_pct", dividend: "s.dividend_yield",
    eps: "s.eps", book_value: "s.book_value", current_ratio: "s.current_ratio",
  };
  const sortCol = allowedSort[f.sortBy || "roce"] ?? "s.roce";
  const sortDir = f.sortDir === "asc" ? "ASC" : "DESC";
  const limit   = Math.min(f.limit ?? 100, 500);
  const offset  = f.offset ?? 0;

  return dbAll(`
    SELECT s.*, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at
    FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol
    WHERE ${wheres.join(" AND ")}
    ORDER BY ${sortCol} ${sortDir}
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);
}

export async function getStock(symbol: string): Promise<(StockRow & PriceRow) | null> {
  return dbGet(`
    SELECT s.*, p.price, p.volume, p.day_high, p.day_low, p.prev_close, p.change_pct, p.updated_at
    FROM stocks s LEFT JOIN prices p ON p.symbol = s.symbol
    WHERE s.symbol = ?
  `, [symbol.toUpperCase()]);
}

export async function getAllSymbols(): Promise<string[]> {
  const rows = await dbAll<{ symbol: string }>("SELECT symbol FROM stocks ORDER BY symbol");
  return rows.map(r => r.symbol);
}

export async function getStaleSymbols(olderThanHours = 168): Promise<string[]> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600 * 1000).toISOString();
  const rows = await dbAll<{ symbol: string }>(
    "SELECT symbol FROM stocks WHERE fetched_at IS NULL OR fetched_at < ? ORDER BY fetched_at ASC LIMIT 500",
    [cutoff]
  );
  return rows.map(r => r.symbol);
}

// Known NSE sectors — used as fallback when DB is sparse
const NSE_SECTORS = [
  "Automobiles", "Aviation", "Banks", "Capital Goods", "Cement",
  "Chemicals", "Construction", "Consumer Goods", "Defence",
  "Diversified", "Electrical Equipment", "Finance", "FMCG",
  "Healthcare", "Information Technology", "Infrastructure",
  "Insurance", "Logistics", "Media & Entertainment", "Metals & Mining",
  "Oil & Gas", "Paints", "Pharmaceuticals", "Power", "Real Estate",
  "Retail", "Sugar", "Telecom", "Textiles", "Trading",
];

export async function getSectors(): Promise<string[]> {
  const rows = await dbAll<{ sector: string }>(
    "SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL AND sector != '' ORDER BY sector"
  );
  const dbSectors = rows.map(r => r.sector);
  // Merge DB sectors with known NSE sectors, deduplicate, sort
  const merged = Array.from(new Set([...dbSectors, ...NSE_SECTORS])).sort();
  return merged;
}

export async function getDbStats() {
  const [total, fetched, priced, priceRow] = await Promise.all([
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM stocks"),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM stocks WHERE fetched_at IS NOT NULL"),
    dbGet<{ c: number }>("SELECT COUNT(*) as c FROM prices"),
    dbGet<{ d: string }>("SELECT MAX(updated_at) as d FROM prices"),
  ]);
  return {
    total: total?.c || 0, fetched: fetched?.c || 0,
    priced: priced?.c || 0, lastPriceUpdate: priceRow?.d || null,
  };
}

// ── Watchlists ────────────────────────────────────────────────────────────────
export async function getWatchlists(userId?: number) {
  if (userId != null) {
    return dbAll(`
      SELECT w.*, COUNT(ws.symbol) as stock_count
      FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
      WHERE w.user_id = ?
      GROUP BY w.id ORDER BY w.created_at DESC
    `, [userId]);
  }
  return dbAll(`
    SELECT w.*, COUNT(ws.symbol) as stock_count
    FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
    GROUP BY w.id ORDER BY w.created_at DESC
  `);
}

export async function getWatchlist(id: number, userId?: number) {
  const wl = userId != null
    ? await dbGet("SELECT * FROM watchlists WHERE id = ? AND user_id = ?", [id, userId])
    : await dbGet("SELECT * FROM watchlists WHERE id = ?", [id]);
  if (!wl) return null;
  const stocks = await dbAll(`
    SELECT ws.symbol, ws.notes, ws.added_at, s.roce, s.de_ratio, s.promoter_pct, s.pe_ratio,
           p.price, p.volume, p.change_pct
    FROM watchlist_stocks ws
    LEFT JOIN stocks s ON s.symbol = ws.symbol
    LEFT JOIN prices p ON p.symbol = ws.symbol
    WHERE ws.watchlist_id = ?
    ORDER BY ws.added_at DESC
  `, [id]);
  return { ...(wl as any), stocks };
}

export async function createWatchlist(name: string, description = "", userId?: number): Promise<number> {
  return new Promise((resolve, reject) => {
    getDb().run(
      "INSERT INTO watchlists (name, description, user_id) VALUES (?, ?, ?)",
      [name, description, userId ?? null],
      function (err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}

export async function addToWatchlist(watchlistId: number, symbol: string, notes = "") {
  await dbRun(
    "INSERT OR REPLACE INTO watchlist_stocks (watchlist_id, symbol, notes) VALUES (?, ?, ?)",
    [watchlistId, symbol.toUpperCase(), notes]
  );
}

export async function removeFromWatchlist(watchlistId: number, symbol: string) {
  await dbRun(
    "DELETE FROM watchlist_stocks WHERE watchlist_id = ? AND symbol = ?",
    [watchlistId, symbol.toUpperCase()]
  );
}

export async function deleteWatchlist(id: number) {
  await dbRun("DELETE FROM watchlists WHERE id = ?", [id]);
}

// ── Users ─────────────────────────────────────────────────────────────────────
export interface UserRow {
  id: number;
  name: string;
  email: string;
  password: string;
  role: string;
  created_at: string;
}

export async function createUser(name: string, email: string, hashedPassword: string): Promise<number> {
  return new Promise((resolve, reject) => {
    getDb().run(
      "INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
      [name, email.toLowerCase(), hashedPassword],
      function (err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  return dbGet<UserRow>("SELECT * FROM users WHERE email = ?", [email.toLowerCase()]);
}

export async function getUserById(id: number): Promise<UserRow | null> {
  return dbGet<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
}

export async function countUsers(): Promise<number> {
  const row = await dbGet<{ c: number }>("SELECT COUNT(*) as c FROM users");
  return row?.c ?? 0;
}

export async function getAllUsers(): Promise<Omit<UserRow, "password">[]> {
  return dbAll<Omit<UserRow, "password">>(
    "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC"
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────
export interface AlertRow {
  id: number; user_id: number; name: string;
  filters_json: string; last_sent: string | null;
  active: number; created_at: string;
}

export async function getAlerts(userId: number): Promise<AlertRow[]> {
  return dbAll<AlertRow>(
    "SELECT * FROM alerts WHERE user_id = ? AND active = 1 ORDER BY created_at DESC",
    [userId]
  );
}

export async function createAlert(userId: number, name: string, filtersJson: string): Promise<number> {
  return new Promise((resolve, reject) => {
    getDb().run(
      "INSERT INTO alerts (user_id, name, filters_json) VALUES (?, ?, ?)",
      [userId, name, filtersJson],
      function (err) { if (err) reject(err); else resolve(this.lastID); }
    );
  });
}

export async function deleteAlert(id: number, userId: number): Promise<void> {
  await dbRun("DELETE FROM alerts WHERE id = ? AND user_id = ?", [id, userId]);
}

export async function updateAlertLastSent(id: number): Promise<void> {
  await dbRun("UPDATE alerts SET last_sent = datetime('now') WHERE id = ?", [id]);
}

export async function getAllActiveAlerts(): Promise<(AlertRow & { user_email: string; user_name: string })[]> {
  return dbAll(`
    SELECT a.*, u.email as user_email, u.name as user_name
    FROM alerts a JOIN users u ON u.id = a.user_id
    WHERE a.active = 1
  `);
}

// ── Password Reset ────────────────────────────────────────────────────────────
export async function createResetToken(userId: number, token: string): Promise<void> {
  // Expire existing tokens for this user first
  await dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [userId]);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  await dbRun(
    "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)",
    [token, userId, expiresAt]
  );
}

export async function getResetToken(token: string): Promise<{ user_id: number; expires_at: string; used: number } | null> {
  return dbGet("SELECT user_id, expires_at, used FROM password_reset_tokens WHERE token = ?", [token]);
}

export async function markResetTokenUsed(token: string): Promise<void> {
  await dbRun("UPDATE password_reset_tokens SET used = 1 WHERE token = ?", [token]);
}

export async function updateUserPassword(userId: number, hashedPassword: string): Promise<void> {
  await dbRun("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, userId]);
}

export async function updateUserName(userId: number, name: string): Promise<void> {
  await dbRun("UPDATE users SET name = ? WHERE id = ?", [name, userId]);
}

// ── Search ────────────────────────────────────────────────────────────────────
export async function searchStocks(q: string, limit = 10): Promise<{ symbol: string; company_name: string | null; sector: string | null }[]> {
  const esc = q.replace(/[%_]/g, "\\$&");
  const like = "%" + esc + "%";
  const query = `SELECT symbol, company_name, sector FROM stocks
     WHERE (symbol LIKE ? ESCAPE '\\' OR company_name LIKE ? ESCAPE '\\')
       AND fetched_at IS NOT NULL
     ORDER BY
       CASE WHEN symbol LIKE ? ESCAPE '\\' THEN 0 ELSE 1 END,
       market_cap DESC NULLS LAST
     LIMIT ?`;
  const results: { symbol: string; company_name: string | null; sector: string | null }[] = await dbAll(query, [like, like, like, limit]);

  // Fuzzy prefix fallback: if few results and query >= 3 chars, also try first-4-chars prefix
  if (results.length < 2 && q.length >= 3) {
    const prefix = esc.slice(0, 4) + "%";
    const fuzzy: { symbol: string; company_name: string | null; sector: string | null }[] = await dbAll(query, [prefix, prefix, prefix, limit]);
    const seen = new Set(results.map(r => r.symbol));
    for (const r of fuzzy) if (!seen.has(r.symbol)) results.push(r);
  }
  return results.slice(0, limit);
}

// ── Picks ─────────────────────────────────────────────────────────────────────
export interface PickRow {
  id: number; stock_symbol: string; company_name: string | null;
  direction: string; pick_type: string; entry_low: number; entry_high: number;
  target: number | null; stop_loss: number | null;
  reason: string; risk_level: string; status: string;
  published_at: string; expires_at: string | null; created_by: number | null;
}

export async function getActivePicks(): Promise<PickRow[]> {
  return dbAll<PickRow>("SELECT * FROM picks WHERE status='active' ORDER BY published_at DESC");
}

export async function getAllPicks(): Promise<PickRow[]> {
  return dbAll<PickRow>("SELECT * FROM picks ORDER BY published_at DESC LIMIT 100");
}

export async function createPick(p: {
  stock_symbol: string; company_name?: string; direction: string; pick_type?: string;
  entry_low: number; entry_high: number; target?: number; stop_loss?: number;
  reason: string; risk_level: string; status: string; created_by?: number;
}): Promise<void> {
  await dbRun(
    `INSERT INTO picks (stock_symbol,company_name,direction,pick_type,entry_low,entry_high,target,stop_loss,reason,risk_level,status,created_by)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [p.stock_symbol, p.company_name ?? null, p.direction, p.pick_type ?? 'intraday', p.entry_low, p.entry_high,
     p.target ?? null, p.stop_loss ?? null, p.reason, p.risk_level, p.status, p.created_by ?? null]
  );
}

export async function updatePickStatus(id: number, status: string): Promise<void> {
  await dbRun("UPDATE picks SET status=? WHERE id=?", [status, id]);
}

export async function deletePick(id: number): Promise<void> {
  await dbRun("DELETE FROM picks WHERE id=?", [id]);
}

// ── App Settings ──────────────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string> {
  const r = await dbGet<{ value: string }>("SELECT value FROM app_settings WHERE key=?", [key]);
  return r?.value ?? "";
}

export async function setSetting(key: string, value: string): Promise<void> {
  await dbRun("INSERT OR REPLACE INTO app_settings (key,value) VALUES (?,?)", [key, value]);
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await dbAll<{ key: string; value: string }>("SELECT key, value FROM app_settings");
  const out: Record<string, string> = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ── Subscriptions ─────────────────────────────────────────────────────────────
export interface SubRow {
  id: number; user_id: number; razorpay_order_id: string | null;
  razorpay_payment_id: string | null; plan: string; amount: number;
  status: string; starts_at: string | null; expires_at: string | null;
  coupon_code: string | null; created_at: string;
}

export async function createOrder(userId: number, orderId: string, amountPaise: number): Promise<void> {
  await dbRun(
    "INSERT INTO subscriptions (user_id,razorpay_order_id,amount,status) VALUES (?,?,?,'pending')",
    [userId, orderId, amountPaise]
  );
}

export async function activateSubscription(orderId: string, paymentId: string): Promise<number | null> {
  const sub = await dbGet<{ user_id: number; id: number }>(
    "SELECT id, user_id FROM subscriptions WHERE razorpay_order_id=? AND status='pending'",
    [orderId]
  );
  if (!sub) return null;
  const now    = new Date();
  const starts = now.toISOString();
  const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await dbRun(
    "UPDATE subscriptions SET razorpay_payment_id=?,status='active',starts_at=?,expires_at=? WHERE id=?",
    [paymentId, starts, expiry, sub.id]
  );
  await dbRun("UPDATE users SET role='premium' WHERE id=?", [sub.user_id]);
  return sub.user_id;
}

export async function getActiveSubscription(userId: number): Promise<SubRow | null> {
  return dbGet<SubRow>(
    "SELECT * FROM subscriptions WHERE user_id=? AND status='active' AND (expires_at IS NULL OR expires_at > datetime('now')) ORDER BY id DESC LIMIT 1",
    [userId]
  );
}

export async function expireOldSubscriptions(): Promise<void> {
  const expired = await dbAll<{ user_id: number }>(
    "SELECT user_id FROM subscriptions WHERE status='active' AND expires_at < datetime('now')"
  );
  if (!expired.length) return;
  await dbRun(
    "UPDATE subscriptions SET status='expired' WHERE status='active' AND expires_at < datetime('now')"
  );
  for (const r of expired) {
    const still = await getActiveSubscription(r.user_id);
    if (!still) await dbRun("UPDATE users SET role='user' WHERE id=? AND role='premium'", [r.user_id]);
  }
}

export async function getAllSubscriptions(): Promise<(SubRow & { user_name: string; user_email: string })[]> {
  return dbAll(`
    SELECT s.*, u.name as user_name, u.email as user_email
    FROM subscriptions s JOIN users u ON u.id=s.user_id
    ORDER BY s.created_at DESC LIMIT 200
  `);
}

// ── User Paper Trading ────────────────────────────────────────────────────────
export interface PaperPosition {
  id: number; user_id: number; symbol: string; company_name: string | null;
  qty: number; avg_price: number; invested: number; entry_date: string;
  trade_type: string;
}

export interface PaperTrade {
  id: number; user_id: number; symbol: string; company_name: string | null;
  action: string; qty: number; price: number; total: number;
  pnl: number | null; pnl_pct: number | null; balance_after: number; traded_at: string;
  trade_type: string;
}

export interface PaperTradeConfig {
  user_id: number; trade_type: string; default_qty: number;
  default_sl_pct: number; default_tgt_pct: number; max_positions: number;
}

export async function getPaperPortfolio(userId: number): Promise<{ balance: number }> {
  const row = await dbGet<{ balance: number }>("SELECT balance FROM paper_portfolio WHERE user_id=?", [userId]);
  if (!row) {
    await dbRun("INSERT OR IGNORE INTO paper_portfolio (user_id,balance) VALUES (?,100000)", [userId]);
    return { balance: 100000 };
  }
  return row;
}

export async function getPaperPositions(userId: number): Promise<PaperPosition[]> {
  return dbAll<PaperPosition>("SELECT * FROM paper_positions WHERE user_id=? ORDER BY entry_date DESC", [userId]);
}

export async function getPaperTrades(userId: number, limit = 50): Promise<PaperTrade[]> {
  return dbAll<PaperTrade>(
    "SELECT * FROM paper_trades WHERE user_id=? ORDER BY traded_at DESC LIMIT ?",
    [userId, limit]
  );
}

export async function paperBuy(userId: number, symbol: string, companyName: string | null, qty: number, price: number, tradeType = 'INTRADAY'): Promise<{ ok: boolean; msg: string; balance: number }> {
  const total = parseFloat((qty * price).toFixed(2));
  const port = await getPaperPortfolio(userId);
  if (port.balance < total) return { ok: false, msg: `Insufficient balance. Need ₹${total.toFixed(0)}, have ₹${port.balance.toFixed(0)}`, balance: port.balance };

  const newBal = parseFloat((port.balance - total).toFixed(2));
  // Upsert position (avg price if already held)
  const existing = await dbGet<PaperPosition>("SELECT * FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol]);
  if (existing) {
    const newQty   = existing.qty + qty;
    const newAvg   = parseFloat(((existing.avg_price * existing.qty + price * qty) / newQty).toFixed(4));
    const newInv   = parseFloat((existing.invested + total).toFixed(2));
    await dbRun("UPDATE paper_positions SET qty=?,avg_price=?,invested=? WHERE user_id=? AND symbol=?", [newQty, newAvg, newInv, userId, symbol]);
  } else {
    await dbRun(
      "INSERT INTO paper_positions (user_id,symbol,company_name,qty,avg_price,invested,trade_type) VALUES (?,?,?,?,?,?,?)",
      [userId, symbol, companyName, qty, price, total, tradeType]
    );
  }
  await dbRun("UPDATE paper_portfolio SET balance=? WHERE user_id=?", [newBal, userId]);
  await dbRun(
    "INSERT INTO paper_trades (user_id,symbol,company_name,action,qty,price,total,balance_after,trade_type) VALUES (?,?,?,?,?,?,?,?,?)",
    [userId, symbol, companyName, "BUY", qty, price, total, newBal, tradeType]
  );
  return { ok: true, msg: `Bought ${qty} × ${symbol} @ ₹${price}`, balance: newBal };
}

export async function paperSell(userId: number, symbol: string, qty: number, price: number): Promise<{ ok: boolean; msg: string; balance: number }> {
  const pos = await dbGet<PaperPosition>("SELECT * FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol]);
  if (!pos || pos.qty < qty) return { ok: false, msg: `Not enough shares. You hold ${pos?.qty ?? 0} of ${symbol}`, balance: (await getPaperPortfolio(userId)).balance };

  const total      = parseFloat((qty * price).toFixed(2));
  const costBasis  = parseFloat((pos.avg_price * qty).toFixed(2));
  const pnl        = parseFloat((total - costBasis).toFixed(2));
  const pnlPct     = parseFloat((((total - costBasis) / costBasis) * 100).toFixed(2));
  const port = await getPaperPortfolio(userId);
  const newBal     = parseFloat((port.balance + total).toFixed(2));

  const remainQty = pos.qty - qty;
  if (remainQty === 0) {
    await dbRun("DELETE FROM paper_positions WHERE user_id=? AND symbol=?", [userId, symbol]);
  } else {
    const remainInv = parseFloat((pos.invested - costBasis).toFixed(2));
    await dbRun("UPDATE paper_positions SET qty=?,invested=? WHERE user_id=? AND symbol=?", [remainQty, remainInv, userId, symbol]);
  }
  await dbRun("UPDATE paper_portfolio SET balance=? WHERE user_id=?", [newBal, userId]);
  await dbRun(
    "INSERT INTO paper_trades (user_id,symbol,company_name,action,qty,price,total,pnl,pnl_pct,balance_after,trade_type) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [userId, symbol, pos.company_name, "SELL", qty, price, total, pnl, pnlPct, newBal, pos.trade_type || 'INTRADAY']
  );
  return { ok: true, msg: `Sold ${qty} × ${symbol} @ ₹${price} · PnL ${pnl >= 0 ? "+" : ""}₹${pnl}`, balance: newBal };
}

export async function paperReset(userId: number): Promise<void> {
  await dbRun("DELETE FROM paper_positions WHERE user_id=?", [userId]);
  await dbRun("DELETE FROM paper_trades WHERE user_id=?", [userId]);
  await dbRun("INSERT OR REPLACE INTO paper_portfolio (user_id,balance) VALUES (?,100000)", [userId]);
}

// ── Mobile OTP ─────────────────────────────────────────────────────────────────
export async function storePhoneOtp(mobile: string, otp: string): Promise<void> {
  await dbRun("DELETE FROM phone_otps WHERE mobile=? AND used=0", [mobile]);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await dbRun("INSERT INTO phone_otps (mobile,otp,expires_at) VALUES (?,?,?)", [mobile, otp, expiresAt]);
}

export async function verifyPhoneOtp(mobile: string, otp: string): Promise<boolean> {
  const row = await dbGet<{ id: number; expires_at: number; used: number }>(
    "SELECT id, expires_at, used FROM phone_otps WHERE mobile=? AND otp=? ORDER BY id DESC LIMIT 1",
    [mobile, otp]
  );
  if (!row || row.used || row.expires_at < Date.now()) return false;
  await dbRun("UPDATE phone_otps SET used=1 WHERE id=?", [row.id]);
  return true;
}

export async function setUserMobile(userId: number, mobile: string): Promise<void> {
  await dbRun("UPDATE users SET mobile=?, mobile_verified=1 WHERE id=?", [mobile, userId]);
}

export async function getUserByMobile(mobile: string): Promise<UserRow | null> {
  return dbGet<UserRow>("SELECT * FROM users WHERE mobile=?", [mobile]);
}

export async function countPaperTrades(userId: number): Promise<number> {
  const r = await dbGet<{ c: number }>("SELECT COUNT(*) as c FROM paper_trades WHERE user_id=?", [userId]);
  return r?.c ?? 0;
}

// ── Paper Trade Config ─────────────────────────────────────────────────────────
export async function getPaperTradeConfig(userId: number): Promise<PaperTradeConfig> {
  const row = await dbGet<PaperTradeConfig>("SELECT * FROM paper_trade_config WHERE user_id=?", [userId]);
  if (!row) {
    const def: PaperTradeConfig = { user_id: userId, trade_type: 'INTRADAY', default_qty: 1, default_sl_pct: 2.0, default_tgt_pct: 4.0, max_positions: 10 };
    await dbRun(
      "INSERT OR IGNORE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions) VALUES (?,?,?,?,?,?)",
      [userId, def.trade_type, def.default_qty, def.default_sl_pct, def.default_tgt_pct, def.max_positions]
    );
    return def;
  }
  return row;
}

export async function savePaperTradeConfig(userId: number, config: Partial<PaperTradeConfig>): Promise<void> {
  const cur = await getPaperTradeConfig(userId);
  const m = { ...cur, ...config };
  await dbRun(
    `INSERT OR REPLACE INTO paper_trade_config (user_id,trade_type,default_qty,default_sl_pct,default_tgt_pct,max_positions,updated_at)
     VALUES (?,?,?,?,?,?,datetime('now','localtime'))`,
    [userId, m.trade_type, m.default_qty, m.default_sl_pct, m.default_tgt_pct, m.max_positions]
  );
}

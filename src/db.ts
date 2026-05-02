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
      db.run("CREATE INDEX IF NOT EXISTS idx_stocks_roce ON stocks(roce)");
      db.run("CREATE INDEX IF NOT EXISTS idx_stocks_de ON stocks(de_ratio)");
      db.run("CREATE INDEX IF NOT EXISTS idx_prices_volume ON prices(volume)", (err) => {
        if (err) reject(err); else resolve();
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
    screener_data: null, fetched_at: null, fetch_error: null,
    ...s,
  };
  await dbRun(`
    INSERT INTO stocks (symbol,company_name,sector,market_cap,pe_ratio,roce,roe,de_ratio,
      promoter_pct,net_profit_1,net_profit_2,net_profit_3,revenue_1,revenue_2,revenue_3,
      eps,book_value,dividend_yield,current_ratio,all_profitable,profit_uptrend,
      screener_data,fetched_at,fetch_error)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(symbol) DO UPDATE SET
      company_name=excluded.company_name,sector=excluded.sector,market_cap=excluded.market_cap,
      pe_ratio=excluded.pe_ratio,roce=excluded.roce,roe=excluded.roe,de_ratio=excluded.de_ratio,
      promoter_pct=excluded.promoter_pct,net_profit_1=excluded.net_profit_1,
      net_profit_2=excluded.net_profit_2,net_profit_3=excluded.net_profit_3,
      revenue_1=excluded.revenue_1,revenue_2=excluded.revenue_2,revenue_3=excluded.revenue_3,
      eps=excluded.eps,book_value=excluded.book_value,dividend_yield=excluded.dividend_yield,
      current_ratio=excluded.current_ratio,all_profitable=excluded.all_profitable,
      profit_uptrend=excluded.profit_uptrend,screener_data=excluded.screener_data,
      fetched_at=excluded.fetched_at,fetch_error=excluded.fetch_error
  `, [d.symbol,d.company_name,d.sector,d.market_cap,d.pe_ratio,d.roce,d.roe,d.de_ratio,
      d.promoter_pct,d.net_profit_1,d.net_profit_2,d.net_profit_3,
      d.revenue_1,d.revenue_2,d.revenue_3,
      d.eps,d.book_value,d.dividend_yield,d.current_ratio,
      d.all_profitable,d.profit_uptrend,d.screener_data,d.fetched_at,d.fetch_error]);
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
  if (f.allProfitable) wheres.push("s.all_profitable = 1");
  if (f.profitUptrend) wheres.push("s.profit_uptrend = 1");
  if (f.sector) add("s.sector = ?", f.sector);

  const allowedSort: Record<string, string> = {
    roce: "s.roce", roe: "s.roe", de: "s.de_ratio", promoter: "s.promoter_pct",
    pe: "s.pe_ratio", price: "p.price", volume: "p.volume",
    market_cap: "s.market_cap", change_pct: "p.change_pct",
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

export async function getSectors(): Promise<string[]> {
  const rows = await dbAll<{ sector: string }>(
    "SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL ORDER BY sector"
  );
  return rows.map(r => r.sector);
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
export async function getWatchlists() {
  return dbAll(`
    SELECT w.*, COUNT(ws.symbol) as stock_count
    FROM watchlists w LEFT JOIN watchlist_stocks ws ON ws.watchlist_id = w.id
    GROUP BY w.id ORDER BY w.created_at DESC
  `);
}

export async function getWatchlist(id: number) {
  const wl = await dbGet("SELECT * FROM watchlists WHERE id = ?", [id]);
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

export async function createWatchlist(name: string, description = ""): Promise<number> {
  return new Promise((resolve, reject) => {
    getDb().run(
      "INSERT INTO watchlists (name, description) VALUES (?, ?)",
      [name, description],
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

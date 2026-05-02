/**
 * scheduler.ts — background jobs for ZeroScreen
 *
 * Jobs:
 *   1. refreshPrices()       — daily: fetch NSE bhavcopy → update prices table
 *   2. refreshFundamentals() — weekly: fetch screener.in for all/stale stocks
 *   3. seedSymbols()         — one-time: populate stocks table from bhavcopy
 *
 * CLI:
 *   npx ts-node src/scheduler.ts --seed
 *   npx ts-node src/scheduler.ts --prices
 *   npx ts-node src/scheduler.ts --fundamentals
 */

import cron from "node-cron";
import { fetchLatestBhavcopy } from "./nse";
import { fetchFundamentals }   from "./scraper";
import { dbRun, dbAll, upsertStock, upsertPrice, getStaleSymbols, getAllSymbols, initDb } from "./db";

const FETCH_DELAY_MS = 800;
function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── Prices refresh ────────────────────────────────────────────────────────────
export async function refreshPrices(): Promise<number> {
  console.log("[Scheduler] Refreshing prices from NSE bhavcopy...");
  const rows = await fetchLatestBhavcopy();
  if (rows.length === 0) { console.warn("[Scheduler] No bhavcopy data"); return 0; }

  const now = new Date().toISOString();
  for (const r of rows) {
    await upsertPrice({
      symbol: r.symbol, price: r.price, volume: r.volume,
      day_high: r.dayHigh, day_low: r.dayLow, prev_close: r.prevClose,
      change_pct: r.changePct, updated_at: now,
    });
  }

  // Also seed any new symbols not yet in stocks table
  const existingSet = new Set(await getAllSymbols());
  const newSymbols  = rows.filter(r => !existingSet.has(r.symbol));
  for (const r of newSymbols) {
    await dbRun("INSERT OR IGNORE INTO stocks (symbol) VALUES (?)", [r.symbol]);
  }

  console.log(`[Scheduler] Prices updated: ${rows.length} stocks, ${newSymbols.length} new symbols`);
  return rows.length;
}

// ── Fundamentals refresh ──────────────────────────────────────────────────────
export async function refreshFundamentals(symbols?: string[]): Promise<void> {
  const targets = symbols ?? (await getStaleSymbols(168));
  if (targets.length === 0) { console.log("[Scheduler] All fundamentals fresh"); return; }

  console.log(`[Scheduler] Fetching fundamentals for ${targets.length} stocks...`);
  let done = 0, errors = 0;

  for (const symbol of targets) {
    try {
      const f = await fetchFundamentals(symbol);

      if (f.error && f.error.includes("Not found")) {
        await upsertStock({ symbol, fetch_error: f.error, fetched_at: new Date().toISOString() });
        errors++;
      } else if (!f.error) {
        await upsertStock({
          symbol,
          company_name:   f.companyName,
          sector:         f.sector,
          market_cap:     f.marketCap,
          pe_ratio:       f.peRatio,
          roce:           f.roce,
          roe:            f.roe,
          de_ratio:       f.deRatio,
          promoter_pct:   f.promoterPct,
          eps:            f.eps,
          book_value:     f.bookValue,
          dividend_yield: f.dividendYield,
          current_ratio:  f.currentRatio,
          net_profit_1:   f.netProfits[f.netProfits.length - 3] ?? null,
          net_profit_2:   f.netProfits[f.netProfits.length - 2] ?? null,
          net_profit_3:   f.netProfits[f.netProfits.length - 1] ?? null,
          revenue_1:      f.revenues[f.revenues.length - 3] ?? null,
          revenue_2:      f.revenues[f.revenues.length - 2] ?? null,
          revenue_3:      f.revenues[f.revenues.length - 1] ?? null,
          all_profitable: f.allProfitable ? 1 : 0,
          profit_uptrend: f.profitUptrend ? 1 : 0,
          screener_data:  JSON.stringify({ netProfits: f.netProfits, revenues: f.revenues }),
          fetch_error:    null,
          fetched_at:     new Date().toISOString(),
        });
        done++;
        if (done % 20 === 0) console.log(`[Scheduler] ${done}/${targets.length} done, ${errors} errors`);
      }
    } catch (e: any) {
      console.error(`[Scheduler] Error ${symbol}: ${e.message}`);
      errors++;
    }
    await sleep(FETCH_DELAY_MS);
  }

  console.log(`[Scheduler] Done: ${done} updated, ${errors} errors`);
}

// ── Seed ──────────────────────────────────────────────────────────────────────
export async function seedSymbols(): Promise<void> {
  console.log("[Scheduler] Seeding symbols from NSE bhavcopy...");
  const rows = await fetchLatestBhavcopy();
  if (rows.length === 0) { console.error("[Scheduler] Cannot seed — no bhavcopy data"); return; }

  const now = new Date().toISOString();
  let i = 0;
  for (const r of rows) {
    await upsertPrice({
      symbol: r.symbol, price: r.price, volume: r.volume,
      day_high: r.dayHigh, day_low: r.dayLow, prev_close: r.prevClose,
      change_pct: r.changePct, updated_at: now,
    });
    await dbRun("INSERT OR IGNORE INTO stocks (symbol) VALUES (?)", [r.symbol]);
    i++;
  }
  console.log(`[Scheduler] Seeded ${i} symbols. Run --fundamentals to fetch data.`);
}

// ── Cron ──────────────────────────────────────────────────────────────────────
export function startScheduler() {
  // Daily prices: weekdays at 6:30 PM IST (13:00 UTC)
  cron.schedule("0 13 * * 1-5", async () => {
    console.log("[Cron] Daily price refresh");
    await refreshPrices();
  }, { timezone: "UTC" });

  // Weekly fundamentals: Sunday 2:00 AM IST (Saturday 20:30 UTC)
  cron.schedule("30 20 * * 6", async () => {
    console.log("[Cron] Weekly fundamentals refresh");
    await refreshFundamentals();
  }, { timezone: "UTC" });

  console.log("[Scheduler] Cron jobs registered");
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const args = process.argv.slice(2);
  initDb().then(async () => {
    if (args.includes("--seed")) {
      await seedSymbols();
    } else if (args.includes("--prices")) {
      await refreshPrices();
    } else if (args.includes("--fundamentals")) {
      await refreshFundamentals();
    } else {
      console.log("Usage: ts-node src/scheduler.ts [--seed | --prices | --fundamentals]");
    }
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
}

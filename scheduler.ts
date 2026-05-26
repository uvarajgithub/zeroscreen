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
import { dbRun, dbAll, upsertStock, upsertPrice, getStaleSymbols, getAllSymbols, initDb, screenStocks, getAllActiveAlerts, updateAlertLastSent, createPick, getUsersWithAutoPicks, paperBuy, paperSell, getPaperPositions, getAllActivePriceAlerts, triggerPriceAlert, updatePickEntry, getPaperTradeConfig } from "./db";
import { sendAlertEmail, sendPriceAlertEmail } from "./mailer";

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
          week52_high:    f.week52High,
          week52_low:     f.week52Low,
          about:          f.about,
          incorporated:   f.incorporated,
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
// ── Alert digest ────────────────────────────────────────────────────────────────────
export async function checkAlerts(): Promise<void> {
  const alerts = await getAllActiveAlerts();
  const today = new Date().toISOString().slice(0, 10);
  let sent = 0;
  for (const alert of alerts) {
    if (alert.last_sent?.slice(0, 10) === today) continue; // already sent today
    try {
      const filters = JSON.parse(alert.filters_json);
      // Convert string query params back to typed ScreenerFilter
      const f = {
        minRoce:          filters.minRoce     ? parseFloat(filters.minRoce)     : undefined,
        maxDe:            filters.maxDe       ? parseFloat(filters.maxDe)       : undefined,
        minPromoter:      filters.minPromoter ? parseFloat(filters.minPromoter) : undefined,
        maxPe:            filters.maxPe       ? parseFloat(filters.maxPe)       : undefined,
        minPe:            filters.minPe       ? parseFloat(filters.minPe)       : undefined,
        minPrice:         filters.minPrice    ? parseFloat(filters.minPrice)    : undefined,
        maxPrice:         filters.maxPrice    ? parseFloat(filters.maxPrice)    : undefined,
        minMarketCap:     filters.minMc       ? parseFloat(filters.minMc)       : undefined,
        maxMarketCap:     filters.maxMc       ? parseFloat(filters.maxMc)       : undefined,
        minDividendYield: filters.minDivYield ? parseFloat(filters.minDivYield) : undefined,
        allProfitable:    filters.allProfit === "1",
        profitUptrend:    filters.uptrend === "1",
        sector:           filters.sector || undefined,
        sortBy:           filters.sortBy || "roce",
        sortDir:          "desc" as const,
        limit:            20,
      };
      const stocks = await screenStocks(f);
      if (stocks.length > 0) {
        await sendAlertEmail(alert.user_email, alert.user_name, alert.name, stocks);
        await updateAlertLastSent(alert.id);
        sent++;
      }
    } catch (e: any) {
      console.error(`[Alerts] Error processing alert ${alert.id}:`, e.message);
    }
  }
  console.log(`[Alerts] Checked ${alerts.length} alerts, sent ${sent} emails`);
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

// ── Auto-pick generation ───────────────────────────────────────────────────────
export async function generateDailyPicks(): Promise<void> {
  console.log("[Picks] Generating daily auto-picks from last market close...");

  const today = new Date().toISOString().slice(0, 10);

  // Expire all previous auto-picks (created_by IS NULL = auto-generated)
  await dbRun(
    `UPDATE picks SET status='expired' WHERE status='active' AND created_by IS NULL AND date(published_at) < ?`,
    [today]
  );

  // Check if auto-picks already generated today
  const existing = await dbAll(
    `SELECT id FROM picks WHERE status='active' AND created_by IS NULL AND date(published_at) = ?`,
    [today]
  );
  if (existing.length > 0) {
    console.log(`[Picks] Already have ${existing.length} auto-picks for today, skipping`);
    return;
  }

  // Fetch stocks with recent price data (up to 7 days back to cover weekends)
  const stocks = await dbAll<any>(`
    SELECT s.symbol, s.company_name, s.sector,
           s.roce, s.roe, s.de_ratio, s.promoter_pct, s.pe_ratio,
           s.all_profitable, s.profit_uptrend, s.market_cap,
           s.week52_high, s.week52_low,
           p.price, p.volume, p.change_pct, p.day_high, p.day_low, p.prev_close
    FROM stocks s
    JOIN prices p ON s.symbol = p.symbol
    WHERE p.price > 0 AND p.price IS NOT NULL
      AND p.updated_at >= date('now', '-7 days')
  `);

  if (stocks.length === 0) {
    console.log("[Picks] No price data available, skipping pick generation");
    return;
  }
  console.log(`[Picks] Pool: ${stocks.length} stocks with price data`);

  let intradayCount = 0, swingCount = 0, longtermCount = 0;

  // ── INTRADAY PICKS — high volume movers with price momentum ─────────────────
  const intradayPool = stocks
    .filter(s => s.price > 50 && s.price < 8000 && (s.volume ?? 0) > 300_000 && Math.abs(s.change_pct ?? 0) > 0.5)
    .map(s => ({
      ...s,
      score: ((s.volume ?? 0) / 1_000_000) * Math.abs(s.change_pct ?? 0) * (s.roce != null && s.roce > 0 ? Math.min(s.roce / 10, 2) : 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const s of intradayPool) {
    const price = s.price;
    const dir = (s.change_pct ?? 0) >= 0 ? "LONG" : "SHORT";
    const entryLow   = parseFloat((price * (dir === "LONG" ? 0.997 : 1.003)).toFixed(2));
    const entryHigh  = parseFloat((price * (dir === "LONG" ? 1.003 : 0.997)).toFixed(2));
    const target     = parseFloat((price * (dir === "LONG" ? 1.018 : 0.982)).toFixed(2));
    const stopLoss   = parseFloat((price * (dir === "LONG" ? 0.990 : 1.010)).toFixed(2));

    const parts: string[] = [];
    if ((s.change_pct ?? 0) > 0) parts.push(`Up ${(s.change_pct as number).toFixed(1)}% today`);
    else parts.push(`Down ${Math.abs(s.change_pct as number).toFixed(1)}% today`);
    if ((s.volume ?? 0) > 1_000_000) parts.push(`Volume ${((s.volume as number) / 1e6).toFixed(1)}M`);
    if ((s.roce ?? 0) > 15) parts.push(`ROCE ${(s.roce as number).toFixed(0)}%`);
    const reason = parts.slice(0, 3).join(" · ");

    await createPick({
      stock_symbol: s.symbol, company_name: s.company_name,
      direction: dir, pick_type: "intraday",
      entry_low: entryLow, entry_high: entryHigh,
      target, stop_loss: stopLoss,
      reason, risk_level: "medium", status: "active",
    });
    intradayCount++;
  }

  // ── SWING PICKS — momentum + quality fundamentals, 1–2 week horizon ─────────
  const swingPool = stocks
    .filter(s =>
      s.price > 100 && s.price < 15000 &&
      (s.roce ?? 0) > 8 &&
      (s.de_ratio == null || s.de_ratio < 2.5) &&
      (s.change_pct ?? 0) > 0 && (s.change_pct ?? 0) < 8
    )
    .map(s => ({
      ...s,
      score:
        (s.roce ?? 0) * 0.4 +
        (s.roe ?? 0) * 0.3 +
        (s.promoter_pct ?? 0) * 0.1 +
        (s.change_pct ?? 0) * 2 +
        (s.all_profitable ? 10 : 0) +
        (s.profit_uptrend ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  for (const s of swingPool) {
    const price = s.price;
    const entryLow  = parseFloat((price * 0.995).toFixed(2));
    const entryHigh = parseFloat((price * 1.005).toFixed(2));
    const target    = parseFloat((price * 1.09).toFixed(2));
    const stopLoss  = parseFloat((price * 0.945).toFixed(2));

    const parts: string[] = [];
    if ((s.roce ?? 0) > 0) parts.push(`ROCE ${(s.roce as number).toFixed(0)}%`);
    if ((s.roe ?? 0) > 0)  parts.push(`ROE ${(s.roe as number).toFixed(0)}%`);
    if (s.all_profitable)  parts.push("Consistently profitable");
    if (s.profit_uptrend)  parts.push("Profit uptrend");
    if ((s.change_pct ?? 0) > 0) parts.push(`Momentum +${(s.change_pct as number).toFixed(1)}%`);
    const reason = parts.slice(0, 4).join(" · ") || `Swing setup — ROCE ${(s.roce ?? 0).toFixed(0)}%`;

    await createPick({
      stock_symbol: s.symbol, company_name: s.company_name,
      direction: "LONG", pick_type: "swing",
      entry_low: entryLow, entry_high: entryHigh,
      target, stop_loss: stopLoss,
      reason, risk_level: "medium", status: "active",
    });
    swingCount++;
  }

  // ── LONGTERM PICKS — strong balance sheets, multi-month horizon ───────────────
  const longtermPool = stocks
    .filter(s =>
      s.price > 100 &&
      (s.roce ?? 0) > 15 && (s.roe ?? 0) > 12 &&
      (s.de_ratio == null || s.de_ratio < 1) &&
      (s.pe_ratio ?? 0) > 5 && (s.pe_ratio ?? 0) < 50 &&
      s.all_profitable === 1
    )
    .map(s => ({
      ...s,
      score:
        (s.roce ?? 0) * 0.35 +
        (s.roe ?? 0) * 0.35 +
        (s.all_profitable ? 15 : 0) +
        (s.profit_uptrend ? 10 : 0) +
        ((s.promoter_pct ?? 0) > 50 ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  for (const s of longtermPool) {
    const price = s.price;
    const entryLow  = parseFloat((price * 0.99).toFixed(2));
    const entryHigh = parseFloat((price * 1.01).toFixed(2));
    const target    = parseFloat((price * 1.25).toFixed(2));
    const stopLoss  = parseFloat((price * 0.90).toFixed(2));

    const parts: string[] = [];
    if ((s.roce ?? 0) > 0) parts.push(`ROCE ${(s.roce as number).toFixed(0)}%`);
    if ((s.roe ?? 0) > 0)  parts.push(`ROE ${(s.roe as number).toFixed(0)}%`);
    if (s.de_ratio != null && s.de_ratio < 0.5) parts.push("Near debt-free");
    else if (s.de_ratio != null && s.de_ratio < 1) parts.push(`Low D/E ${(s.de_ratio as number).toFixed(2)}`);
    if (s.all_profitable)  parts.push("All years profitable");
    if (s.profit_uptrend)  parts.push("Profit uptrend");
    const reason = parts.slice(0, 4).join(" · ") || `Strong fundamentals — ROCE ${(s.roce ?? 0).toFixed(0)}%, ROE ${(s.roe ?? 0).toFixed(0)}%`;

    await createPick({
      stock_symbol: s.symbol, company_name: s.company_name,
      direction: "LONG", pick_type: "longterm",
      entry_low: entryLow, entry_high: entryHigh,
      target, stop_loss: stopLoss,
      reason, risk_level: "low", status: "active",
    });
    longtermCount++;
  }

  console.log(`[Picks] Done — ${intradayCount} intraday, ${swingCount} swing, ${longtermCount} longterm (total ${intradayCount + swingCount + longtermCount})`);
  // autoPaperTradeFromPicks() runs separately at 9:15 AM IST using live open price
}

// ── Auto paper trade from today's picks ───────────────────────────────────────
export async function autoPaperTradeFromPicks(): Promise<void> {
  const users = await getUsersWithAutoPicks();
  if (users.length === 0) { console.log("[AutoPaper] No users opted in"); return; }

  // Get today's active picks
  const picks = await dbAll<any>(
    `SELECT * FROM picks WHERE status='active' AND date(published_at) = date('now','localtime')`
  );
  if (picks.length === 0) { console.log("[AutoPaper] No picks available today"); return; }

  console.log(`[AutoPaper] Auto-buying ${picks.length} picks for ${users.length} user(s)`);

  for (const user of users) {
    let bought = 0;
    // Fetch all open positions for this user once per user (avoid per-pick DB calls)
    const openPositions = await getPaperPositions(user.id);
    const openSymbols = new Set(openPositions.map((p: any) => p.symbol.toUpperCase()));
    const ptCfg = await getPaperTradeConfig(user.id);

    for (const pick of picks) {
      // Skip if user already holds an open position in this stock
      if (openSymbols.has(pick.stock_symbol.toUpperCase())) {
        console.log(`[AutoPaper] ⏭️  ${user.email} skip ${pick.stock_symbol}: already in open position`);
        continue;
      }

      // Use midpoint of pick's entry zone as entry price
      const entryMid = parseFloat(((pick.entry_low + pick.entry_high) / 2).toFixed(2));
      // Fallback: live price from prices table (same data, but use midpoint first)
      const priceRow = await dbAll<{ price: number }>(
        "SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]
      );
      const price = entryMid > 0 ? entryMid : (priceRow[0]?.price && priceRow[0].price > 0 ? priceRow[0].price : pick.entry_low);
      const qty = ptCfg.picks_capital > 0
        ? Math.max(1, Math.floor(ptCfg.picks_capital / price))
        : Math.max(1, ptCfg.default_qty ?? 1);
      const tradeType = pick.pick_type === "intraday" ? "INTRADAY" : "HOLDING";

      const result = await paperBuy(
        user.id,
        pick.stock_symbol,
        pick.company_name ?? null,
        qty,
        price,
        tradeType,
        pick.stop_loss ?? null,
        pick.target    ?? null,
        "LIMIT"
      );

      if (result.ok) {
        bought++;
        console.log(`[AutoPaper] ✅ ${user.email} bought ${pick.stock_symbol} @ ₹${price} (${tradeType})`);
        // Mark the pick as entry_triggered so it shows as "In Position" everywhere
        // (only needs to happen once — subsequent users will find it already triggered)
        if (pick.result !== 'entry_triggered') {
          await updatePickEntry(pick.id, price).catch(() => {});
        }
      } else {
        console.log(`[AutoPaper] ⚠️ ${user.email} skip ${pick.stock_symbol}: ${result.msg}`);
      }
    }
    console.log(`[AutoPaper] ${user.email} — ${bought}/${picks.length} picks executed`);
  }
}

// ── Monitor open auto-paper positions for SL / target hits ────────────────────
export async function monitorAutoPaperPositions(): Promise<void> {
  const users = await getUsersWithAutoPicks();
  if (users.length === 0) return;

  for (const user of users) {
    const positions = await getPaperPositions(user.id);
    if (positions.length === 0) continue;

    for (const pos of positions) {
      // Get live price from prices table
      const priceRow = await dbAll<{ price: number }>(
        "SELECT price FROM prices WHERE symbol = ?", [pos.symbol]
      );
      const livePrice = priceRow[0]?.price;
      if (!livePrice || livePrice <= 0) continue;

      const hit =
        (pos.target_price && livePrice >= pos.target_price) ? "TARGET" :
        (pos.sl_price     && livePrice <= pos.sl_price)     ? "STOPLOSS" :
        null;

      if (hit) {
        const result = await paperSell(user.id, pos.symbol, pos.qty, livePrice);
        console.log(`[AutoPaper] ${hit} hit — ${user.email} sold ${pos.symbol} @ ₹${livePrice} → ${result.msg}`);
      }
    }
  }
}

// ── Price Alert checker ──────────────────────────────────────────────────────
export async function checkPriceAlerts(): Promise<void> {
  const activeAlerts = await getAllActivePriceAlerts();
  let triggered = 0;
  for (const a of activeAlerts) {
    if (a.current_price == null) continue;
    const hit = a.direction === "above"
      ? a.current_price >= a.target_price
      : a.current_price <= a.target_price;
    if (!hit) continue;
    try {
      await triggerPriceAlert(a.id);
      await sendPriceAlertEmail(a.user_email, a.user_name, a.symbol, a.direction, a.target_price, a.current_price);
      triggered++;
    } catch (e: any) {
      console.error(`[PriceAlerts] Error triggering alert ${a.id}:`, e.message);
    }
  }
  if (triggered > 0) console.log(`[PriceAlerts] Triggered ${triggered}/${activeAlerts.length} alerts`);
}

// ── Cron ──────────────────────────────────────────────────────────────────────
export function startScheduler() {
  // Daily prices: weekdays at 6:30 PM IST (13:00 UTC)
  cron.schedule("0 13 * * 1-5", async () => {
    console.log("[Cron] Daily price refresh");
    await refreshPrices();
  }, { timezone: "UTC" });

  // Daily alerts: weekdays at 7:30 AM IST (02:00 UTC)
  cron.schedule("0 2 * * 1-5", async () => {
    console.log("[Cron] Daily alert digest");
    await checkAlerts();
  }, { timezone: "UTC" });

  // Weekly fundamentals: Sunday 2:00 AM IST (Saturday 20:30 UTC)
  cron.schedule("30 20 * * 6", async () => {
    console.log("[Cron] Weekly fundamentals refresh");
    await refreshFundamentals();
  }, { timezone: "UTC" });

  // Daily picks: weekdays at 6:45 PM IST (13:15 UTC) — runs after price refresh at 13:00 UTC
  cron.schedule("15 13 * * 1-5", async () => {
    console.log("[Cron] Daily auto-picks generation");
    await generateDailyPicks();
  }, { timezone: "UTC" });

  // Auto paper trade buy at market open: 9:15 AM IST (03:45 UTC) — uses live open price
  cron.schedule("45 3 * * 1-5", async () => {
    console.log("[Cron] Auto paper trade from picks at market open");
    await autoPaperTradeFromPicks();
  }, { timezone: "UTC" });

  // Monitor auto-paper SL/target: every 5 min on weekdays during market hours 9:15–3:30 IST (3:45–10:00 UTC)
  cron.schedule("*/5 3-10 * * 1-5", async () => {
    await monitorAutoPaperPositions();
  }, { timezone: "UTC" });

  // Price alerts: every 30 min on weekdays during market hours (3:45–10:30 UTC = 9:15–16:00 IST)
  cron.schedule("*/30 3-10 * * 1-5", async () => {
    await checkPriceAlerts();
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
    } else if (args.includes("--picks")) {
      await generateDailyPicks();
    } else {
      console.log("Usage: ts-node src/scheduler.ts [--seed | --prices | --fundamentals | --picks]");
    }
    process.exit(0);
  }).catch(e => { console.error(e); process.exit(1); });
}

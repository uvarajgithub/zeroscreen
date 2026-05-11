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
import { dbRun, dbAll, upsertStock, upsertPrice, getStaleSymbols, getAllSymbols, initDb, screenStocks, getAllActiveAlerts, updateAlertLastSent, createPick, getUsersWithAutoPicks, paperBuy, paperSell, getPaperPositions, getAllActivePriceAlerts, triggerPriceAlert, updatePickEntry, updatePickResult } from "./db";
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

  // ── Technical Helpers ─────────────────────────────────────────────────────────

  // Where did the stock close within today's candle? 0 = at day low, 1 = at day high
  // This is the single best intraday signal — "buyers controlled the close" or "sellers did"
  function closePosition(s: any): number {
    const hi = s.day_high ?? 0, lo = s.day_low ?? 0;
    const range = hi - lo;
    if (range <= 0) return 0.5;
    return Math.max(0, Math.min(1, (s.price - lo) / range));
  }

  // Day range as % of price — measures volatility/opportunity
  function dayRangePct(s: any): number {
    if (!s.price || s.price === 0) return 0;
    return ((s.day_high ?? s.price) - (s.day_low ?? s.price)) / s.price * 100;
  }

  // Where is price in its 52-week range? 0 = at 52W low, 1 = at 52W high
  function week52Pos(s: any): number {
    const hi = s.week52_high ?? 0, lo = s.week52_low ?? 0;
    const range = hi - lo;
    if (range <= 0) return 0.5;
    return Math.max(0, Math.min(1, (s.price - lo) / range));
  }

  // Did the stock gap up from previous close? (opening already gapped — late entry risk)
  function gapPct(s: any): number {
    if (!s.prev_close || s.prev_close === 0) return 0;
    return ((s.day_low ?? s.price) - s.prev_close) / s.prev_close * 100;
  }

  // Sector strength: % of stocks in the same sector that closed positive today
  const sectorMap: Record<string, { up: number; total: number }> = {};
  for (const s of stocks) {
    const sec = s.sector ?? "Other";
    if (!sectorMap[sec]) sectorMap[sec] = { up: 0, total: 0 };
    sectorMap[sec].total++;
    if ((s.change_pct ?? 0) > 0) sectorMap[sec].up++;
  }
  function sectorBullishPct(s: any): number {
    const sec = sectorMap[s.sector ?? "Other"];
    if (!sec || sec.total < 3) return 0.5;
    return sec.up / sec.total;
  }

  // Confidence score (0-100): honest signal quality based on how many filters agree
  function calcConfidence(signals: boolean[]): number {
    const passed = signals.filter(Boolean).length;
    return Math.round(50 + (passed / signals.length) * 35);
  }

  // Select best picks: sector-diverse, above median quality, no duplicates
  function selectBest(pool: any[], maxPicks: number, maxPerSector: number, usedSymbols: Set<string>): any[] {
    if (pool.length === 0) return [];
    const medianScore = pool[Math.floor(pool.length / 2)]?.score ?? 0;
    const sectorCount: Record<string, number> = {};
    const result: any[] = [];
    for (const s of pool) {
      if (result.length >= maxPicks) break;
      if (s.score < medianScore) break;
      if (usedSymbols.has(s.symbol)) continue;
      const sector = s.sector ?? "Other";
      if ((sectorCount[sector] ?? 0) >= maxPerSector) continue;
      result.push(s);
      usedSymbols.add(s.symbol);
      sectorCount[sector] = (sectorCount[sector] ?? 0) + 1;
    }
    return result;
  }

  function riskLevel(drPct: number, de: number | null): "low" | "medium" | "high" {
    if (drPct > 3.5 || (de != null && de > 1.5)) return "high";
    if (drPct > 1.8 || (de != null && de > 0.7)) return "medium";
    return "low";
  }

  const usedSymbols = new Set<string>();
  let intradayCount = 0, swingCount = 0;

  // ── INTRADAY PICKS ────────────────────────────────────────────────────────────
  //
  // Signal logic (all must agree for a high-confidence pick):
  //   1. CLOSE POSITION — stock closed in top 30% of day range (LONG) or bottom 30% (SHORT)
  //      This is the most reliable next-day bias signal. Strong buyers/sellers showed up at close.
  //   2. SECTOR ALIGNMENT — majority of same-sector stocks moved in the same direction
  //      Confirms it's a sector move, not a random stock spike
  //   3. VOLUME SURGE — >750K volume confirms institutional interest (not retail noise)
  //   4. NO LATE ENTRY — reject stocks that already gapped >1.5% from prev close
  //      (gap means the move is done; entry is risky)
  //   5. RANGE QUALITY — day range between 0.8% and 4.5% (enough room to trade, not too wild)
  //   6. PRICE ZONE — not a penny stock (<₹80), not overpriced (>₹6000)
  //
  // Entry zone: yesterday's intraday support/resistance level (not arbitrary %)
  //   LONG  → entry at lower 20–40% of previous day's range (buy the pullback to support)
  //   SHORT → entry at upper 60–80% of previous day's range (sell the bounce to resistance)
  //
  // SL: just beyond the previous day's extreme (below day_low for LONG, above day_high for SHORT)
  // Target: 1.5× the previous day's range (range expansion is the standard intraday target)

  const intradayPool = stocks
    .filter(s => {
      const cp  = closePosition(s);
      const drP = dayRangePct(s);
      const vol = s.volume ?? 0;
      const gap = gapPct(s);
      return (
        s.price >= 80 && s.price <= 6000 &&
        vol > 750_000 &&                          // institutional volume
        drP >= 0.8 && drP <= 4.5 &&               // meaningful range, not crazy
        (cp >= 0.70 || cp <= 0.30) &&             // clear directional close
        Math.abs(gap) < 1.5                        // no huge overnight gap (late entry)
      );
    })
    .map(s => {
      const cp       = closePosition(s);
      const isLong   = cp >= 0.70;
      const secBull  = sectorBullishPct(s);
      const secAlign = isLong ? secBull > 0.55 : secBull < 0.45;
      const vol      = s.volume ?? 0;
      const drP      = dayRangePct(s);

      // Score components (all real signals):
      const closeStrength  = isLong ? (cp - 0.70) * 30 : (0.30 - cp) * 30;  // how extreme the close was
      const volScore       = Math.min(vol / 1_000_000, 8);                    // volume up to 8M = max
      const sectorScore    = secAlign ? 6 : -3;                               // sector agrees = +6, opposes = -3
      const qualBonus      = (s.roce ?? 0) > 12 ? 2 : 0;                     // fundamentally sound = small bonus
      const breakoutBonus  = isLong && (s.week52_high ?? 0) > 0 && s.price >= s.week52_high * 0.98 ? 4 : 0;

      // Confidence signals
      const confidence = calcConfidence([
        cp >= 0.70 || cp <= 0.30,   // strong directional close
        secAlign,                    // sector confirms direction
        vol > 1_000_000,             // high volume
        drP >= 1.2 && drP <= 3.5,   // healthy range
        Math.abs(gapPct(s)) < 0.5,  // no gap
      ]);

      return { ...s, isLong, secAlign, secBull, confidence,
        score: (closeStrength + volScore + sectorScore + qualBonus + breakoutBonus) * (secAlign ? 1.0 : 0.5),
      };
    })
    .filter(s => s.secAlign)  // only keep sector-confirmed signals
    .sort((a, b) => b.score - a.score);

  for (const s of selectBest(intradayPool, 5, 2, usedSymbols)) {
    const price    = s.price;
    const dayLo    = s.day_low  ?? price * 0.99;
    const dayHi    = s.day_high ?? price * 1.01;
    const dayRange = dayHi - dayLo;
    const dir      = s.isLong ? "LONG" : "SHORT";

    // Entry zone: pullback to support (LONG) or bounce to resistance (SHORT)
    const entryLow  = s.isLong
      ? parseFloat((dayLo + dayRange * 0.05).toFixed(2))   // near day's low (support)
      : parseFloat((dayHi - dayRange * 0.35).toFixed(2));  // near day's high (resistance)
    const entryHigh = s.isLong
      ? parseFloat((dayLo + dayRange * 0.35).toFixed(2))
      : parseFloat((dayHi - dayRange * 0.05).toFixed(2));

    // SL: just beyond previous day's extreme — hard structural level
    const stopLoss = s.isLong
      ? parseFloat((dayLo * 0.994).toFixed(2))   // 0.6% below day low
      : parseFloat((dayHi * 1.006).toFixed(2));  // 0.6% above day high

    // Target: 1.5× day range from entry midpoint (range expansion)
    const entryMid = (entryLow + entryHigh) / 2;
    const target   = s.isLong
      ? parseFloat((entryMid + dayRange * 1.5).toFixed(2))
      : parseFloat((entryMid - dayRange * 1.5).toFixed(2));

    const cp      = closePosition(s);
    const secPct  = Math.round(s.secBull * 100);
    const parts: string[] = [];
    parts.push(`Closed at ${(cp * 100).toFixed(0)}% of day range — ${dir === "LONG" ? "strong buying at close" : "strong selling at close"}`);
    parts.push(`Sector ${secPct}% stocks ${dir === "LONG" ? "bullish" : "bearish"} — aligned`);
    if ((s.volume ?? 0) > 1_000_000) parts.push(`Volume ${((s.volume as number) / 1e6).toFixed(1)}M — institutional activity`);
    else parts.push(`Volume ${((s.volume as number) / 1000).toFixed(0)}K`);
    if (s.breakoutBonus > 0 || ((s.week52_high ?? 0) > 0 && price >= s.week52_high * 0.98)) parts.push("Near 52W breakout zone");
    parts.push(`Confidence ${s.confidence}%`);
    const reason = parts.slice(0, 3).join(" · ");

    await createPick({
      stock_symbol: s.symbol, company_name: s.company_name,
      direction: dir, pick_type: "intraday",
      entry_low: entryLow, entry_high: entryHigh,
      target, stop_loss: stopLoss,
      reason,
      risk_level: riskLevel(dayRangePct(s), s.de_ratio),
      status: "active",
    });
    intradayCount++;
  }

  // ── SWING PICKS ───────────────────────────────────────────────────────────────
  //
  // Signal logic (all must agree for a pick):
  //   1. CLOSE POSITION > 60% of day range — buyers in control at close (bullish structure)
  //   2. SECTOR STRENGTH > 55% — sector is in an uptrend, not a single-stock pump
  //   3. 52W RANGE POSITION 35–90% — stock is in an uptrend (not at bottom) but not overextended
  //      Below 35% = downtrend, Above 90% = likely to face resistance and reverse
  //   4. FUNDAMENTALS — ROCE > 12%, D/E < 1.8, profitable business (not a speculation bet)
  //   5. MOMENTUM — positive change today, but not already gapped >5% (don't chase)
  //   6. VOLUME CONFIRMATION — good volume on up day = conviction move
  //
  // Entry: wait for small pullback (entry_low = 0.8% below close, entry_high = at close)
  // SL: below the day's low (structural support broken = thesis invalidated)
  // Target: 52W high as natural target (stocks in uptrend aim for prior highs)

  const swingPool = stocks
    .filter(s => {
      const cp    = closePosition(s);
      const w52p  = week52Pos(s);
      const secB  = sectorBullishPct(s);
      const chg   = s.change_pct ?? 0;
      return (
        s.price >= 100 && s.price <= 15000 &&
        (s.roce ?? 0) > 12 &&                        // quality filter — must be a real business
        (s.de_ratio == null || s.de_ratio < 1.8) &&  // not over-leveraged
        cp >= 0.60 &&                                 // closed strong — buyers in control
        w52p >= 0.35 && w52p <= 0.90 &&              // in uptrend, not overextended
        secB > 0.55 &&                               // sector is bullish
        chg > 0.2 && chg < 6.0 &&                   // positive momentum, not already chased
        (s.volume ?? 0) > 200_000                    // minimum liquidity
      );
    })
    .map(s => {
      const cp    = closePosition(s);
      const w52p  = week52Pos(s);
      const secB  = sectorBullishPct(s);

      // Confidence signals — each one that fires increases our conviction
      const confidence = calcConfidence([
        cp >= 0.75,                                  // very strong close (top 25% of range)
        w52p >= 0.50 && w52p <= 0.85,               // ideal 52W position (mid-to-upper range)
        secB > 0.65,                                 // strongly bullish sector
        (s.all_profitable === 1),                    // all years profitable
        (s.profit_uptrend === 1),                    // profits growing
        (s.roce ?? 0) > 18,                         // excellent capital efficiency
        (s.promoter_pct ?? 0) > 50,                 // promoter conviction (skin in game)
        (s.volume ?? 0) > 500_000,                  // good volume confirmation
      ]);

      // Score: blend of technical quality + fundamental quality
      const closeScore   = (cp - 0.60) * 25;                  // how strong the close was
      const w52Score     = (w52p - 0.35) * 15;                // how far into the uptrend
      const secScore     = (secB - 0.55) * 20;                // sector strength
      const fundScore    =
        (s.roce ?? 0) * 0.4 +
        (s.roe  ?? 0) * 0.25 +
        (s.promoter_pct ?? 0) * 0.05 +
        (s.all_profitable ? 8 : 0) +
        (s.profit_uptrend ? 5 : 0);
      const volBonus     = (s.volume ?? 0) > 500_000 ? 3 : 0;

      return { ...s, confidence, w52p, secB, cp,
        score: closeScore + w52Score + secScore + fundScore + volBonus,
      };
    })
    .sort((a, b) => b.score - a.score);

  for (const s of selectBest(swingPool, 5, 2, usedSymbols)) {
    const price   = s.price;
    const dayLo   = s.day_low  ?? price * 0.98;
    const dayHi   = s.day_high ?? price * 1.02;
    const w52hi   = s.week52_high ?? price * 1.15;

    // Entry: wait for a small dip tomorrow (buy the pullback, not the gap)
    const entryLow  = parseFloat((price * 0.992).toFixed(2));  // -0.8% from close
    const entryHigh = parseFloat((price * 1.002).toFixed(2));  // at close or slight up

    // SL: below the structural support (today's day low + small buffer)
    const stopLoss = parseFloat((dayLo * 0.993).toFixed(2));

    // Target: towards 52W high (natural resistance/target for uptrending stocks)
    // Capped at 12% if 52W high is very far (avoid over-optimistic targets)
    const naturalTarget = w52hi > price ? Math.min(w52hi, price * 1.12) : price * 1.08;
    const target = parseFloat(naturalTarget.toFixed(2));

    const cp     = s.cp;
    const w52p   = s.w52p;
    const secPct = Math.round(s.secB * 100);
    const parts: string[] = [];
    parts.push(`Closed at ${(cp * 100).toFixed(0)}% of day's range — buyers in control`);
    parts.push(`In ${(w52p * 100).toFixed(0)}% of 52W range — uptrend, room to grow`);
    parts.push(`Sector ${secPct}% bullish · ROCE ${(s.roce ?? 0).toFixed(0)}%${s.profit_uptrend ? " · Profit uptrend" : ""}${s.all_profitable ? " · All years profitable" : ""}`);
    parts.push(`Confidence ${s.confidence}%`);
    const reason = parts.slice(0, 3).join(" · ");

    await createPick({
      stock_symbol: s.symbol, company_name: s.company_name,
      direction: "LONG", pick_type: "swing",
      entry_low: entryLow, entry_high: entryHigh,
      target, stop_loss: stopLoss,
      reason,
      risk_level: riskLevel(dayRangePct(s), s.de_ratio),
      status: "active",
    });
    swingCount++;
  }

  // ── SCALPER PICKS ─────────────────────────────────────────────────────────────
  //
  // Signal logic — pure price action, no fundamentals required:
  //   1. LIQUIDITY — volume > 1,500,000 (tight bid-ask spread, easy entry/exit)
  //   2. VOLATILITY SWEET SPOT — day range 1.5–7% (enough movement, not erratic)
  //   3. STRONG DIRECTIONAL CLOSE — top/bottom 32% of day range (momentum confirmed)
  //   4. MOMENTUM — change_pct 0.5–8% (stock is moving, not overextended)
  //   5. NO LARGE GAP — overnight gap < 2% (clean setup, no trap entry)
  //   6. PRICE ZONE — ₹80–₹3,000 (liquid, affordable, tight spreads)
  //
  // Entry: ±0.25% of close (scalper enters near current level at open)
  // SL: 0.4% from entry midpoint (tight — exit immediately if wrong)
  // Target: 0.7% from entry midpoint (quick 1:1.75 R:R ratio)
  // Hold time: 15–60 minutes max — NOT for overnight holding

  const scalperPool = stocks
    .filter(s => {
      const cp  = closePosition(s);
      const drP = dayRangePct(s);
      const vol = s.volume ?? 0;
      const chg = Math.abs(s.change_pct ?? 0);
      return (
        s.price >= 80 && s.price <= 3000 &&
        vol > 1_500_000 &&               // high liquidity — tight spreads
        drP >= 1.5 && drP <= 7.0 &&      // volatile enough to scalp
        (cp >= 0.68 || cp <= 0.32) &&    // strong directional close
        chg >= 0.5 && chg <= 8.0 &&      // active mover, not exhausted
        Math.abs(gapPct(s)) < 2.0        // no large overnight gap
      );
    })
    .map(s => {
      const cp       = closePosition(s);
      const isLong   = cp >= 0.68;
      const vol      = s.volume ?? 0;
      const drP      = dayRangePct(s);
      const secBull  = sectorBullishPct(s);
      const secAlign = isLong ? secBull > 0.50 : secBull < 0.50;

      const confidence = calcConfidence([
        cp >= 0.75 || cp <= 0.25,           // very strong close position
        vol > 3_000_000,                     // very high volume
        drP >= 2.0 && drP <= 5.0,           // ideal scalping range
        secAlign,                             // sector agrees direction
        Math.abs(gapPct(s)) < 0.5,          // clean open (no gap)
        Math.abs(s.change_pct ?? 0) < 5.0,  // not already overextended
      ]);

      const closeStr  = isLong ? (cp - 0.68) * 30 : (0.32 - cp) * 30;
      const volScore  = Math.min(vol / 2_000_000, 6);
      const rangeScore = drP >= 2.0 && drP <= 5.0 ? 4 : 2;
      const secScore  = secAlign ? 3 : 0;

      return { ...s, isLong, secAlign, secBull, confidence,
        score: closeStr + volScore + rangeScore + secScore,
      };
    })
    .sort((a, b) => b.score - a.score);

  let scalperCount = 0;
  for (const s of selectBest(scalperPool, 10, 3, new Set<string>())) {
    const price    = s.price;
    const dir      = s.isLong ? "LONG" : "SHORT";

    // Entry: within 0.25% of close (scalper enters at/near current level)
    const entryLow  = parseFloat((price * 0.9975).toFixed(2));
    const entryHigh = parseFloat((price * 1.0025).toFixed(2));
    const entryMid  = (entryLow + entryHigh) / 2;

    // SL: 0.4% from mid — tight exit if momentum fails
    const stopLoss = s.isLong
      ? parseFloat((entryMid * 0.996).toFixed(2))
      : parseFloat((entryMid * 1.004).toFixed(2));

    // Target: 0.7% from mid — quick scalp target (1:1.75 R:R)
    const target = s.isLong
      ? parseFloat((entryMid * 1.007).toFixed(2))
      : parseFloat((entryMid * 0.993).toFixed(2));

    const cp      = closePosition(s);
    const drP     = dayRangePct(s);
    const secPct  = Math.round(s.secBull * 100);
    const parts: string[] = [];
    parts.push(`Closed at ${(cp * 100).toFixed(0)}% of range — ${dir === "LONG" ? "buyers controlled" : "sellers controlled"}`);
    parts.push(`Volume ${((s.volume as number) / 1e6).toFixed(1)}M — high liquidity scalp`);
    parts.push(`Range ${drP.toFixed(1)}% · Sector ${secPct}% ${s.isLong ? "bullish" : "bearish"} · Confidence ${s.confidence}%`);
    const reason = parts.join(" · ");

    await createPick({
      stock_symbol: s.symbol, company_name: s.company_name,
      direction: dir, pick_type: "scalper",
      entry_low: entryLow, entry_high: entryHigh,
      target, stop_loss: stopLoss,
      reason,
      risk_level: riskLevel(drP, null),
      status: "active",
    });
    scalperCount++;
  }

  console.log(`[Picks] Done — ${intradayCount} intraday, ${swingCount} swing, ${scalperCount} scalper`);
  // autoPaperTradeFromPicks() runs separately at 9:15 AM IST using live open price
}

// ── Auto paper trade from today's picks ───────────────────────────────────────
export async function autoPaperTradeFromPicks(): Promise<void> {
  const users = await getUsersWithAutoPicks();
  if (users.length === 0) { console.log("[AutoPaper] No users opted in"); return; }

  // Get recent active picks — exclude longterm only (not suitable for daily auto-trade)
  // Use last 2 days to cover overnight window: picks generated at 6:45 PM yesterday are
  // valid for auto-trade at 9:15 AM today (date would be yesterday, not today)
  const picks = await dbAll<any>(
    `SELECT * FROM picks WHERE status='active' AND pick_type != 'longterm' AND date(published_at) >= date('now','localtime','-2 days')`
  );
  if (picks.length === 0) { console.log("[AutoPaper] No picks available today"); return; }

  console.log(`[AutoPaper] Auto-buying ${picks.length} picks for ${users.length} user(s)`);

  for (const user of users) {
    let bought = 0;
    // Fetch all open positions for this user once per user (avoid per-pick DB calls)
    const openPositions = await getPaperPositions(user.id);
    const openSymbols = new Set(openPositions.map((p: any) => p.symbol.toUpperCase()));

    for (const pick of picks) {
      // Skip if user already holds an open position in this stock
      if (openSymbols.has(pick.stock_symbol.toUpperCase())) {
        console.log(`[AutoPaper] ⏭️  ${user.email} skip ${pick.stock_symbol}: already in open position`);
        continue;
      }

      const qty   = 1;
      // Use midpoint of pick's entry zone — this IS yesterday's close ± 0.3% buffer,
      // the intended entry price. Far more meaningful than raw prices table at 9:15 AM.
      const entryMid = parseFloat(((pick.entry_low + pick.entry_high) / 2).toFixed(2));
      // Fallback: live price from prices table (same data, but use midpoint first)
      const priceRow = await dbAll<{ price: number }>(
        "SELECT price FROM prices WHERE symbol = ?", [pick.stock_symbol]
      );
      const price = entryMid > 0 ? entryMid : (priceRow[0]?.price && priceRow[0].price > 0 ? priceRow[0].price : pick.entry_low);
      const tradeType = (pick.pick_type === "intraday" || pick.pick_type === "scalper") ? "INTRADAY" : "HOLDING";

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

// ── Telegram helper ───────────────────────────────────────────────────────────
async function sendTelegram(message: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const body = JSON.stringify({ chat_id: chatId, text: message, parse_mode: "Markdown" });
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body });
    if (!res.ok) console.error("[Telegram] Send failed:", await res.text());
  } catch (e: any) {
    console.error("[Telegram] Error:", e.message);
  }
}

// ── Morning token reminder ─────────────────────────────────────────────────────
export async function sendMorningReminder(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Get yesterday's bot P&L from bot_trades table
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const ytrades = await dbAll<{ pnl: number }>(
    `SELECT pnl FROM bot_trades WHERE trade_date = ?`, [yesterday]
  );
  const yPnL  = ytrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const yLine  = ytrades.length > 0
    ? `Yesterday: ${yPnL >= 0 ? "+" : ""}${yPnL.toFixed(0)} pts (${ytrades.length} trade${ytrades.length !== 1 ? "s" : ""})`
    : "Yesterday: No trades recorded";

  // Today's picks
  const picks = await dbAll<{ stock_symbol: string; pick_type: string; direction: string; reason: string }>(
    `SELECT stock_symbol, pick_type, direction, reason FROM picks WHERE status='active' AND date(published_at)=? AND pick_type != 'longterm' ORDER BY pick_type`, [today]
  );
  const pickLines = picks.length > 0
    ? picks.map(p => `  • *${p.stock_symbol}* ${p.direction} (${p.pick_type})`).join("\n")
    : "  No picks yet — will generate at 6:45 PM";

  const ist = new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" });
  const msg =
    `⏰ *Good Morning — Market opens in 45 mins*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${yLine}\n\n` +
    `📌 *Today's Picks (${picks.length}):*\n${pickLines}\n\n` +
    `🔑 *Submit Zerodha token now:*\n` +
    `http://139.59.18.52/submit\n\n` +
    `⚡ Bot auto-restarts at 9:00 AM IST`;

  await sendTelegram(msg);
  console.log("[Reminder] Morning Telegram sent");
}

// ── EOD summary ───────────────────────────────────────────────────────────────
export async function sendEODSummary(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Bot trades today
  const botTrades = await dbAll<{ pnl: number; direction: string; exit_reason: string }>(
    `SELECT pnl, direction, exit_reason FROM bot_trades WHERE trade_date = ?`, [today]
  );
  const botPnL    = botTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const botWins   = botTrades.filter(t => (t.pnl ?? 0) > 0).length;
  const botLine   = botTrades.length > 0
    ? `BANKNIFTY Bot: ${botPnL >= 0 ? "+" : ""}${botPnL.toFixed(0)} pts | ${botWins}W/${botTrades.length - botWins}L`
    : "BANKNIFTY Bot: No trades today";

  // Paper trade PnL today (all users)
  const paperToday = await dbAll<{ pnl: number }>(
    `SELECT pnl FROM paper_trades WHERE date(traded_at)=? AND action='SELL' AND pnl IS NOT NULL`, [today]
  );
  const paperPnL   = paperToday.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const paperLine  = paperToday.length > 0
    ? `Paper Trades: ₹${paperPnL >= 0 ? "+" : ""}${paperPnL.toFixed(0)} (${paperToday.length} closed)`
    : "Paper Trades: None closed today";

  // Tomorrow's picks (just generated at 6:45 PM)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const tmrPicks = await dbAll<{ stock_symbol: string; pick_type: string; direction: string; reason: string }>(
    `SELECT stock_symbol, pick_type, direction, reason FROM picks WHERE status='active' AND date(published_at)=? AND pick_type != 'longterm' ORDER BY pick_type LIMIT 8`, [today]
  );
  const pickLines = tmrPicks.length > 0
    ? tmrPicks.map(p => {
        const conf = p.reason.match(/Confidence (\d+)%/);
        const confStr = conf ? ` — ${conf[1]}% conf` : "";
        return `  • *${p.stock_symbol}* ${p.direction} (${p.pick_type})${confStr}`;
      }).join("\n")
    : "  Picks generate at 6:45 PM";

  const msg =
    `📊 *Day Summary — ${today}*\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `${botLine}\n` +
    `${paperLine}\n\n` +
    `📌 *Tomorrow's Picks (${tmrPicks.length}):*\n${pickLines}\n\n` +
    `🔑 Submit tomorrow's token by 8:30 AM:\nhttp://139.59.18.52/submit`;

  await sendTelegram(msg);
  console.log("[EOD] Summary Telegram sent");
}

// ── Pick result tracker — check if picks hit SL or target ────────────────────
export async function trackPickResults(): Promise<void> {
  // Get active picks that have entry_price set (entry_triggered) but no result yet
  const activePicks = await dbAll<any>(
    `SELECT id, stock_symbol, direction, target, stop_loss, entry_price FROM picks
     WHERE status='active' AND result IS NULL AND entry_price IS NOT NULL AND entry_price > 0`
  );
  if (activePicks.length === 0) return;

  // Get current prices
  const symbols  = [...new Set(activePicks.map((p: any) => p.stock_symbol))];
  const priceRows = await dbAll<{ symbol: string; price: number }>(
    `SELECT symbol, price FROM prices WHERE symbol IN (${symbols.map(() => "?").join(",")})`,
    symbols
  );
  const priceMap: Record<string, number> = {};
  for (const r of priceRows) priceMap[r.symbol] = r.price;

  for (const pick of activePicks) {
    const livePrice = priceMap[pick.stock_symbol];
    if (!livePrice) continue;

    const isLong = pick.direction === "LONG";
    const targetHit = pick.target && (isLong ? livePrice >= pick.target : livePrice <= pick.target);
    const slHit     = pick.stop_loss && (isLong ? livePrice <= pick.stop_loss : livePrice >= pick.stop_loss);

    if (targetHit) {
      await updatePickResult(pick.id, "target_hit", livePrice);
      console.log(`[PickTracker] TARGET HIT — ${pick.stock_symbol} @ ₹${livePrice}`);
    } else if (slHit) {
      await updatePickResult(pick.id, "sl_hit", livePrice);
      console.log(`[PickTracker] SL HIT — ${pick.stock_symbol} @ ₹${livePrice}`);
    }
  }
}

// ── Weekly P&L email to admin ─────────────────────────────────────────────────
export async function sendWeeklyAdminSummary(): Promise<void> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const today   = new Date().toISOString().slice(0, 10);

  // Bot trades this week
  const botTrades = await dbAll<{ pnl: number; trade_date: string }>(
    `SELECT pnl, trade_date FROM bot_trades WHERE trade_date >= ? ORDER BY trade_date`, [weekAgo]
  );
  const botPnL   = botTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);
  const botWins  = botTrades.filter(t => (t.pnl ?? 0) > 0).length;

  // Paper trades this week
  const paperTrades = await dbAll<{ pnl: number; user_id: number }>(
    `SELECT pnl, user_id FROM paper_trades WHERE date(traded_at) >= ? AND action='SELL' AND pnl IS NOT NULL`, [weekAgo]
  );
  const paperPnL = paperTrades.reduce((s, t) => s + (t.pnl ?? 0), 0);

  // Pick accuracy this week
  const picksThisWeek = await dbAll<{ result: string }>(
    `SELECT result FROM picks WHERE date(published_at) >= ? AND result IS NOT NULL`, [weekAgo]
  );
  const pickWins   = picksThisWeek.filter(p => p.result === "target_hit").length;
  const pickLosses = picksThisWeek.filter(p => p.result === "sl_hit").length;
  const pickWinRate = (pickWins + pickLosses) > 0
    ? ((pickWins / (pickWins + pickLosses)) * 100).toFixed(1)
    : "N/A";

  // Users
  const userCount = await dbAll<{ c: number }>("SELECT COUNT(*) as c FROM users");
  const totalUsers = userCount[0]?.c ?? 0;

  const { sendWeeklyAdminEmail } = await import("./mailer");
  await sendWeeklyAdminEmail(adminEmail, {
    weekStart: weekAgo, weekEnd: today,
    botPnL: botPnL.toFixed(1), botTrades: botTrades.length, botWins, botLosses: botTrades.length - botWins,
    paperPnL: paperPnL.toFixed(1), paperTrades: paperTrades.length,
    pickWins, pickLosses, pickWinRate,
    totalUsers,
  });
  console.log("[Weekly] Admin summary email sent to", adminEmail);
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

  // Pick result tracker: every 5 min during market hours (same window as monitor)
  cron.schedule("*/5 3-10 * * 1-5", async () => {
    await trackPickResults();
  }, { timezone: "UTC" });

  // Morning token reminder: 8:30 AM IST = 03:00 UTC, weekdays
  cron.schedule("0 3 * * 1-5", async () => {
    console.log("[Cron] Morning reminder Telegram");
    await sendMorningReminder();
  }, { timezone: "UTC" });

  // EOD summary: 3:31 PM IST = 10:01 UTC, weekdays (after market close)
  cron.schedule("1 10 * * 1-5", async () => {
    console.log("[Cron] EOD Telegram summary");
    await sendEODSummary();
  }, { timezone: "UTC" });

  // Weekly admin summary email: Monday 8:00 AM IST = 02:30 UTC Monday
  cron.schedule("30 2 * * 1", async () => {
    console.log("[Cron] Weekly admin summary email");
    await sendWeeklyAdminSummary();
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

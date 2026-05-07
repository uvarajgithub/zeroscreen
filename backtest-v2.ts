/**
 * backtest-v2.ts — 5-way strategy comparison
 * Find which improvements handle ALL market conditions best.
 *
 *  BEST  = current live (body-past reverse + recovery + cap 350)
 *  TRAIL = BEST + trailing stop (break-even lock at +100pts, trail SL at +200pts)
 *  ATR   = BEST + ATR-based dynamic SL (avg first-candles range, capped 75–130 pts)
 *  TIME  = BEST + no new entries after 14:00 IST (avoids EOD reversal traps)
 *  V2    = TRAIL + ATR + TIME combined (the "handle all markets" version)
 *
 * Usage:
 *   npx ts-node backtest-v2.ts
 *   npx ts-node backtest-v2.ts --from 2021-01-01 --to 2026-04-30
 */
import * as KiteConnect from "kiteconnect";
import dotenv from "dotenv";
dotenv.config();

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : fallback;
}
const FROM = getArg("from", "2021-01-01");
const TO   = getArg("to",   "2026-04-30");
const QTY  = 30;

const kite = new (KiteConnect as any).KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

interface Candle { date: Date; open: number; high: number; low: number; close: number; }
interface S {
  inTrade: boolean; dir: "CE" | "PE" | null; entry: number; sl: number; refHigh: number;
  firstDone: boolean; reUsed: boolean; waitReEntry: boolean; isC1: boolean;
}
const fresh = (): S => ({
  inTrade: false, dir: null, entry: 0, sl: 0, refHigh: 0,
  firstDone: false, reUsed: false, waitReEntry: false, isC1: false,
});

const BASE_SL = 100, BUF = 25, C1 = 3;

// ── Options for each variant ───────────────────────────────────────────────
interface Opts {
  cap:        number;  // daily loss cap in pts
  trail:      boolean; // trailing stop: break-even at +100, trail at +200
  atrSL:      boolean; // dynamic SL = avg(first candles range), capped 75–130
  timeFilter: boolean; // no new breakout entries after 14:00 IST
}

// ── Simulate one day with given options ────────────────────────────────────
function simDay(dayCandles: Candle[], opts: Opts): number {
  let s = fresh();
  let prev: Candle | null = null;
  let pts = 0, dayLoss = 0;
  let peakProfit = 0;

  // ATR tracking: rolling average of candle ranges seen so far in the day
  let atrSum = 0, atrCount = 0;

  for (const cur of dayCandles) {
    // Update ATR accumulator from every candle
    atrSum += cur.high - cur.low;
    atrCount++;
    // dynSL: avg candle range (capped 75–130). Uses range = realistic SL width.
    const dynSL = opts.atrSL
      ? Math.max(75, Math.min(130, Math.round(atrSum / atrCount)))
      : BASE_SL;

    if (!prev) { prev = cur; continue; }

    const ist = new Date(cur.date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const h = ist.getHours(), m = ist.getMinutes();
    const eod = h > 15 || (h === 15 && m >= 15);
    // Time filter: block NEW breakout entries at or after 14:00 IST
    const afterCutoff = opts.timeFilter && (h >= 14);

    const bH = Math.max(prev.open, prev.close);
    const bL = Math.min(prev.open, prev.close);

    if (dayLoss <= -opts.cap) { prev = cur; continue; }

    // ── IN TRADE ──────────────────────────────────────────────────────────
    if (s.inTrade) {

      // C1 early exit: first candle after entry closes 3+ pts against direction
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        if (p < -C1) {
          pts -= C1; dayLoss -= C1;
          s = fresh(); peakProfit = 0;
          prev = cur; continue;
        }
      }

      // SL check (before updating trail — conservative: assume worst happens first)
      const slHit = s.dir === "CE" ? cur.low <= s.sl : cur.high >= s.sl;
      if (slHit) {
        // slPts: negative = loss, positive = locked profit (if trailing SL above entry)
        const slPts = s.dir === "CE" ? s.sl - s.entry : s.entry - s.sl;
        pts += slPts; dayLoss += slPts;

        // Body-past reverse: candle BODY (close) commits past the SL level
        const bodyPast = s.dir === "CE" ? cur.close < s.sl : cur.close > s.sl;
        if (bodyPast && !s.reUsed) {
          const revDir: "CE" | "PE" = s.dir === "CE" ? "PE" : "CE";
          const revSL = revDir === "CE" ? cur.close - dynSL : cur.close + dynSL;
          s = {
            ...fresh(),
            dir: revDir, entry: cur.close, sl: revSL,
            refHigh: revDir === "CE" ? cur.high : cur.low,
            inTrade: true, firstDone: true, reUsed: true, isC1: true,
          };
          peakProfit = 0;
        } else {
          if (!s.reUsed) {
            s.inTrade = false; s.waitReEntry = true;
          } else {
            // Recovery: both slots used → reset firstDone for one more trade
            s.inTrade = false; s.firstDone = false;
          }
          peakProfit = 0;
        }
        prev = cur; continue;
      }

      // SL not hit this candle → update trailing SL for next candle (conservative)
      if (opts.trail) {
        const hp = s.dir === "CE" ? cur.high - s.entry : s.entry - cur.low;
        if (hp > peakProfit) {
          peakProfit = hp;
          if (peakProfit >= 200) {
            // Move SL to entry + 100 (lock in 100pt profit)
            if (s.dir === "CE") s.sl = Math.max(s.sl, s.entry + 100);
            else                 s.sl = Math.min(s.sl, s.entry - 100);
          } else if (peakProfit >= 100) {
            // Move SL to entry + 20 (break-even+ lock)
            if (s.dir === "CE") s.sl = Math.max(s.sl, s.entry + 20);
            else                 s.sl = Math.min(s.sl, s.entry - 20);
          }
        }
      }

      // EOD exit
      if (eod) {
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        pts += p; dayLoss += p;
        s = fresh(); peakProfit = 0;
      }

    // ── WAIT FOR SAME-DIR RE-ENTRY ─────────────────────────────────────────
    } else if (s.waitReEntry) {
      const hit = (s.dir === "CE" && cur.close > s.refHigh) ||
                  (s.dir === "PE" && cur.close < s.refHigh);
      if (hit) {
        const e = cur.close;
        const sl = s.dir === "CE" ? e - dynSL : e + dynSL;
        s.entry = e; s.sl = sl;
        s.inTrade = true; s.waitReEntry = false; s.reUsed = true; s.isC1 = true;
        peakProfit = 0;
      } else {
        // If price has moved 150+ pts away from re-entry level → invalidated, look fresh
        const distAway = s.dir === "CE"
          ? s.refHigh - cur.close
          : cur.close - s.refHigh;
        if (distAway > 150) {
          s.waitReEntry = false;
          if (!afterCutoff && !eod) {
            if (cur.close > bH + BUF) {
              const e = cur.close, sl = e - dynSL;
              s = { ...fresh(), dir: "CE", entry: e, sl, refHigh: cur.high,
                    inTrade: true, reUsed: true, firstDone: true, isC1: true };
              peakProfit = 0;
            } else if (cur.close < bL - BUF) {
              const e = cur.close, sl = e + dynSL;
              s = { ...fresh(), dir: "PE", entry: e, sl, refHigh: cur.low,
                    inTrade: true, reUsed: true, firstDone: true, isC1: true };
              peakProfit = 0;
            } else {
              s.firstDone = false; s.reUsed = true;
            }
          }
        }
      }

    // ── FIRST SIGNAL DETECTION ─────────────────────────────────────────────
    } else if (!s.firstDone && !eod && !afterCutoff) {
      if (cur.close > bH + BUF) {
        const e = cur.close, sl = e - dynSL;
        s = { ...fresh(), dir: "CE", entry: e, sl, refHigh: cur.high,
              inTrade: true, firstDone: true, isC1: true, reUsed: s.reUsed };
        peakProfit = 0;
      } else if (cur.close < bL - BUF) {
        const e = cur.close, sl = e + dynSL;
        s = { ...fresh(), dir: "PE", entry: e, sl, refHigh: cur.low,
              inTrade: true, firstDone: true, isC1: true, reUsed: s.reUsed };
        peakProfit = 0;
      }
    }

    prev = cur;
  }
  return pts;
}

// Pre-configured variant runners (per day)
const optBest:  Opts = { cap: 350, trail: false, atrSL: false, timeFilter: false };
const optTrail: Opts = { cap: 350, trail: true,  atrSL: false, timeFilter: false };
const optATR:   Opts = { cap: 350, trail: false, atrSL: true,  timeFilter: false };
const optTime:  Opts = { cap: 350, trail: false, atrSL: false, timeFilter: true  };
const optV2:    Opts = { cap: 350, trail: true,  atrSL: true,  timeFilter: true  };

// ── Data fetching ──────────────────────────────────────────────────────────
async function fetchCandles(from: string, to: string): Promise<Candle[]> {
  const data: any[] = await kite.getHistoricalData(260105, "15minute", from, to, false) as any[];
  return data.map((c: any) => {
    const raw = c.date ?? c[0];
    const d = raw instanceof Date ? raw : new Date(String(raw).replace(" ", "T"));
    return { date: d, open: c.open ?? c[1], high: c.high ?? c[2], low: c.low ?? c[3], close: c.close ?? c[4] };
  });
}

function groupByDay(cs: Candle[]) {
  const m = new Map<string, Candle[]>();
  for (const c of cs) {
    const k = c.date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(c);
  }
  return m;
}

const inr = (pts: number) => {
  const r = Math.round(pts * QTY * 0.5);
  return (r >= 0 ? "+" : "") + "\u20b9" + Math.abs(r).toLocaleString("en-IN");
};
const diff = (d: number) => {
  const r = Math.round(d * QTY * 0.5);
  return (r >= 0 ? "++" : "--") + "\u20b9" + Math.abs(r).toLocaleString("en-IN");
};

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log("\nFetching 5yr BANKNIFTY 15min data...");
  const all: Candle[] = [];
  let cursor = new Date(FROM + "T00:00:00Z");
  const end = new Date(TO + "T23:59:59Z");
  while (cursor <= end) {
    const ce = new Date(cursor); ce.setDate(ce.getDate() + 59);
    if (ce > end) ce.setTime(end.getTime());
    const f = cursor.toISOString().slice(0, 10), t = ce.toISOString().slice(0, 10);
    process.stdout.write(`  ${f} -> ${t} ...`);
    try {
      const chunk = await fetchCandles(f, t);
      all.push(...chunk);
      console.log(` ${chunk.length} candles`);
    } catch (e: any) { console.log(` ERROR: ${e.message}`); }
    await new Promise(r => setTimeout(r, 350));
    cursor.setDate(cursor.getDate() + 60);
  }
  if (!all.length) {
    console.error("\nNo candles. Refresh token at http://139.59.18.52/submit");
    process.exit(1);
  }

  const days = groupByDay(all);
  interface Row { best: number; trail: number; atr: number; time: number; v2: number; }
  const months = new Map<string, Row>();
  const years  = new Map<string, Row>();
  let tot: Row = { best: 0, trail: 0, atr: 0, time: 0, v2: 0 };

  for (const [d, cs] of [...days.entries()].sort()) {
    if (cs.length < 3) continue;
    const r: Row = {
      best:  simDay(cs, optBest),
      trail: simDay(cs, optTrail),
      atr:   simDay(cs, optATR),
      time:  simDay(cs, optTime),
      v2:    simDay(cs, optV2),
    };
    tot.best += r.best; tot.trail += r.trail; tot.atr += r.atr; tot.time += r.time; tot.v2 += r.v2;
    const mo = d.slice(0, 7), yr = d.slice(0, 4);
    const me = months.get(mo) ?? { best: 0, trail: 0, atr: 0, time: 0, v2: 0 };
    me.best += r.best; me.trail += r.trail; me.atr += r.atr; me.time += r.time; me.v2 += r.v2;
    months.set(mo, me);
    const ye = years.get(yr) ?? { best: 0, trail: 0, atr: 0, time: 0, v2: 0 };
    ye.best += r.best; ye.trail += r.trail; ye.atr += r.atr; ye.time += r.time; ye.v2 += r.v2;
    years.set(yr, ye);
  }

  const LINE  = "=".repeat(108);
  const LINE2 = "-".repeat(96);

  console.log("\n" + LINE);
  console.log("  MONTHLY P&L — 5-WAY COMPARISON (finding best for ALL market conditions)");
  console.log("  BEST  = current live (body-past reverse + recovery + cap 350)");
  console.log("  TRAIL = BEST + trailing stop (break-even at +100pts, trail at +200pts)");
  console.log("  ATR   = BEST + dynamic SL (avg candle range, capped 75-130 pts)");
  console.log("  TIME  = BEST + no new entries after 14:00 IST");
  console.log("  V2    = TRAIL + ATR + TIME combined");
  console.log("  Qty: 30 units · Rs15/pt · Entry: bodyBreak+25");
  console.log(LINE);
  console.log("  " +
    "Month".padEnd(10) +
    "BEST Rs".padStart(12) +
    "TRAIL Rs".padStart(12) +
    "ATR Rs".padStart(12) +
    "TIME Rs".padStart(12) +
    "V2 Rs".padStart(12) +
    "V2-BEST".padStart(12));
  console.log("  " + LINE2);

  for (const [m, v] of [...months.entries()].sort()) {
    const d = v.v2 - v.best;
    console.log("  " + m.padEnd(10) +
      inr(v.best).padStart(12) +
      inr(v.trail).padStart(12) +
      inr(v.atr).padStart(12) +
      inr(v.time).padStart(12) +
      inr(v.v2).padStart(12) +
      diff(d).padStart(12));
  }

  console.log("  " + LINE2);
  const d = tot.v2 - tot.best;
  console.log("  " + "TOTAL".padEnd(10) +
    inr(tot.best).padStart(12) +
    inr(tot.trail).padStart(12) +
    inr(tot.atr).padStart(12) +
    inr(tot.time).padStart(12) +
    inr(tot.v2).padStart(12) +
    diff(d).padStart(12));

  console.log("\n" + LINE);
  console.log("  YEARLY SUMMARY");
  console.log(LINE);
  console.log("  " +
    "Year".padEnd(8) +
    "BEST Rs".padStart(14) +
    "TRAIL Rs".padStart(14) +
    "ATR Rs".padStart(14) +
    "TIME Rs".padStart(14) +
    "V2 Rs".padStart(14) +
    "V2-BEST".padStart(14));
  console.log("  " + LINE2);

  for (const [y, v] of [...years.entries()].sort()) {
    const d = v.v2 - v.best;
    console.log("  " + y.padEnd(8) +
      inr(v.best).padStart(14) +
      inr(v.trail).padStart(14) +
      inr(v.atr).padStart(14) +
      inr(v.time).padStart(14) +
      inr(v.v2).padStart(14) +
      diff(d).padStart(14));
  }
  console.log("  " + LINE2);
  const dt = tot.v2 - tot.best;
  console.log("  " + "5-YR TOTAL".padEnd(8) +
    inr(tot.best).padStart(14) +
    inr(tot.trail).padStart(14) +
    inr(tot.atr).padStart(14) +
    inr(tot.time).padStart(14) +
    inr(tot.v2).padStart(14) +
    diff(dt).padStart(14));
  console.log("");

  // Winner per metric
  console.log(LINE);
  console.log("  WINNER SUMMARY (which variant wins each year)");
  console.log(LINE);
  const variants = ["best", "trail", "atr", "time", "v2"] as const;
  const wins: Record<string, number> = { best: 0, trail: 0, atr: 0, time: 0, v2: 0 };
  for (const [y, v] of [...years.entries()].sort()) {
    const best = variants.reduce((a, b) => v[a] >= v[b] ? a : b);
    wins[best]++;
    console.log(`  ${y}: winner = ${best.toUpperCase().padEnd(6)} (${inr(v[best as keyof Row])})`);
  }
  console.log("\n  Overall win count:", Object.entries(wins).map(([k,n]) => `${k.toUpperCase()}:${n}`).join("  "));

  const overallWinner = variants.reduce((a, b) => tot[a] >= tot[b] ? a : b);
  console.log(`\n  ★ BEST 5-YEAR STRATEGY: ${overallWinner.toUpperCase()} (${inr(tot[overallWinner])})`);
  console.log("");
})();

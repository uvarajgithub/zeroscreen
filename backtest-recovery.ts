/**
 * backtest-recovery.ts
 * Compares 2 strategies on 5yr BANKNIFTY 15min data:
 *   OLD = original deployed (loss cap 200, no recovery after 2nd SL)
 *   NEW = recovery trade after 2nd SL + loss cap 350
 *
 * Usage:
 *   npx ts-node backtest-recovery.ts
 *   npx ts-node backtest-recovery.ts --from 2021-01-01 --to 2026-04-30
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
const fresh = (): S => ({ inTrade: false, dir: null, entry: 0, sl: 0, refHigh: 0, firstDone: false, reUsed: false, waitReEntry: false, isC1: false });
const SL = 100, BUF = 25, C1 = 3;

// ── OLD strategy: loss cap 200, dead after 2nd SL hit ────────────────────────
function simOld(candles: Candle[]): number {
  let s = fresh(), prev: Candle | null = null, pts = 0, dayLoss = 0;
  for (const cur of candles) {
    if (!prev) { prev = cur; continue; }
    const ist = new Date(cur.date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const eod = ist.getHours() > 15 || (ist.getHours() === 15 && ist.getMinutes() >= 15);
    const bH = Math.max(prev.open, prev.close), bL = Math.min(prev.open, prev.close);
    if (dayLoss <= -200) { prev = cur; continue; }  // OLD cap

    if (s.inTrade) {
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        if (p < -C1) { pts -= C1; dayLoss -= C1; s = fresh(); prev = cur; continue; }
      }
      const slHit = s.dir === "CE" ? cur.low <= s.sl : cur.high >= s.sl;
      if (slHit) {
        pts -= SL; dayLoss -= SL;
        if (!s.reUsed) { s.inTrade = false; s.waitReEntry = true; }
        else s = fresh();
        prev = cur; continue;
      }
      if (eod) { const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close; pts += p; dayLoss += p; s = fresh(); }
    } else if (s.waitReEntry) {
      const hit = (s.dir === "CE" && cur.close > s.refHigh) || (s.dir === "PE" && cur.close < s.refHigh);
      if (hit) {
        s.entry = cur.close; s.sl = s.dir === "CE" ? cur.close - SL : cur.close + SL;
        s.inTrade = true; s.waitReEntry = false; s.reUsed = true; s.isC1 = true;
      }
    } else if (!s.firstDone && !eod) {
      if (cur.close > bH + BUF) {
        s = { ...fresh(), dir: "CE", entry: cur.close, sl: cur.close - SL, refHigh: cur.high, inTrade: true, firstDone: true, isC1: true };
      } else if (cur.close < bL - BUF) {
        s = { ...fresh(), dir: "PE", entry: cur.close, sl: cur.close + SL, refHigh: cur.low, inTrade: true, firstDone: true, isC1: true };
      }
    }
    prev = cur;
  }
  return pts;
}

// ── FIXED strategy: body-past reverse on SL candle, loss cap 200 ─────────────
function simFixed(candles: Candle[]): number {
  let s = fresh(), prev: Candle | null = null, pts = 0, dayLoss = 0;
  for (const cur of candles) {
    if (!prev) { prev = cur; continue; }
    const ist = new Date(cur.date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const eod = ist.getHours() > 15 || (ist.getHours() === 15 && ist.getMinutes() >= 15);
    const bH = Math.max(prev.open, prev.close), bL = Math.min(prev.open, prev.close);
    if (dayLoss <= -200) { prev = cur; continue; }

    if (s.inTrade) {
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        if (p < -C1) { pts -= C1; dayLoss -= C1; s = fresh(); prev = cur; continue; }
      }
      const slHit = s.dir === "CE" ? cur.low <= s.sl : cur.high >= s.sl;
      if (slHit) {
        const bodyPast = s.dir === "CE" ? cur.close < s.sl : cur.close > s.sl;
        if (bodyPast && !s.reUsed) {
          const revDir: "CE" | "PE" = s.dir === "CE" ? "PE" : "CE";
          pts -= SL; dayLoss -= SL;
          s = { ...fresh(), dir: revDir, entry: cur.close, sl: revDir === "CE" ? cur.close - SL : cur.close + SL, refHigh: revDir === "CE" ? cur.high : cur.low, inTrade: true, firstDone: true, reUsed: true, isC1: true };
        } else {
          pts -= SL; dayLoss -= SL;
          if (!s.reUsed) { s.inTrade = false; s.waitReEntry = true; }
          else s = fresh();
        }
        prev = cur; continue;
      }
      if (eod) { const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close; pts += p; dayLoss += p; s = fresh(); }
    } else if (s.waitReEntry) {
      const hit = (s.dir === "CE" && cur.close > s.refHigh) || (s.dir === "PE" && cur.close < s.refHigh);
      if (hit) {
        s.entry = cur.close; s.sl = s.dir === "CE" ? cur.close - SL : cur.close + SL;
        s.inTrade = true; s.waitReEntry = false; s.reUsed = true; s.isC1 = true;
      }
    } else if (!s.firstDone && !eod) {
      if (cur.close > bH + BUF) {
        s = { ...fresh(), dir: "CE", entry: cur.close, sl: cur.close - SL, refHigh: cur.high, inTrade: true, firstDone: true, isC1: true };
      } else if (cur.close < bL - BUF) {
        s = { ...fresh(), dir: "PE", entry: cur.close, sl: cur.close + SL, refHigh: cur.low, inTrade: true, firstDone: true, isC1: true };
      }
    }
    prev = cur;
  }
  return pts;
}

// ── BEST: FIXED (body-past reverse) + recovery trade + loss cap 350 ───────────
function simNew(candles: Candle[]): number {
  let s = fresh(), prev: Candle | null = null, pts = 0, dayLoss = 0;
  for (const cur of candles) {
    if (!prev) { prev = cur; continue; }
    const ist = new Date(cur.date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const eod = ist.getHours() > 15 || (ist.getHours() === 15 && ist.getMinutes() >= 15);
    const bH = Math.max(prev.open, prev.close), bL = Math.min(prev.open, prev.close);
    if (dayLoss <= -350) { prev = cur; continue; }  // BEST cap

    if (s.inTrade) {
      if (s.isC1) {
        s.isC1 = false;
        const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close;
        if (p < -C1) { pts -= C1; dayLoss -= C1; s = fresh(); prev = cur; continue; }
      }
      const slHit = s.dir === "CE" ? cur.low <= s.sl : cur.high >= s.sl;
      if (slHit) {
        const bodyPast = s.dir === "CE" ? cur.close < s.sl : cur.close > s.sl;
        if (bodyPast && !s.reUsed) {
          // FIXED: body-past reverse entry
          const revDir: "CE" | "PE" = s.dir === "CE" ? "PE" : "CE";
          pts -= SL; dayLoss -= SL;
          s = { ...fresh(), dir: revDir, entry: cur.close, sl: revDir === "CE" ? cur.close - SL : cur.close + SL, refHigh: revDir === "CE" ? cur.high : cur.low, inTrade: true, firstDone: true, reUsed: true, isC1: true };
        } else {
          pts -= SL; dayLoss -= SL;
          if (!s.reUsed) {
            s.inTrade = false; s.waitReEntry = true;
          } else {
            // RECOVERY: reset firstDone for one more trade
            s.inTrade = false; s.firstDone = false;
          }
        }
        prev = cur; continue;
      }
      if (eod) { const p = s.dir === "CE" ? cur.close - s.entry : s.entry - cur.close; pts += p; dayLoss += p; s = fresh(); }
    } else if (s.waitReEntry) {
      const hit = (s.dir === "CE" && cur.close > s.refHigh) || (s.dir === "PE" && cur.close < s.refHigh);
      if (hit) {
        s.entry = cur.close; s.sl = s.dir === "CE" ? cur.close - SL : cur.close + SL;
        s.inTrade = true; s.waitReEntry = false; s.reUsed = true; s.isC1 = true;
      }
    } else if (!s.firstDone && !eod) {
      if (cur.close > bH + BUF) {
        s = { ...fresh(), dir: "CE", entry: cur.close, sl: cur.close - SL, refHigh: cur.high, inTrade: true, firstDone: true, isC1: true, reUsed: s.reUsed };
      } else if (cur.close < bL - BUF) {
        s = { ...fresh(), dir: "PE", entry: cur.close, sl: cur.close + SL, refHigh: cur.low, inTrade: true, firstDone: true, isC1: true, reUsed: s.reUsed };
      }
    }
    prev = cur;
  }
  return pts;
}

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
  if (!all.length) { console.error("\nNo candles. Refresh token at http://139.59.18.52/submit"); process.exit(1); }

  const days = groupByDay(all);
  const months = new Map<string, { old: number; fix: number; best: number }>();
  const years  = new Map<string, { old: number; fix: number; best: number }>();
  let totOld = 0, totFix = 0, totBest = 0;

  for (const [d, cs] of [...days.entries()].sort()) {
    if (cs.length < 3) continue;
    const o = simOld(cs), f = simFixed(cs), b = simNew(cs);
    totOld += o; totFix += f; totBest += b;
    const mo = d.slice(0, 7), yr = d.slice(0, 4);
    const me = months.get(mo) ?? { old: 0, fix: 0, best: 0 }; me.old += o; me.fix += f; me.best += b; months.set(mo, me);
    const ye = years.get(yr)  ?? { old: 0, fix: 0, best: 0 }; ye.old += o; ye.fix += f; ye.best += b; years.set(yr, ye);
  }

  const LINE = "=".repeat(100);
  const LINE2 = "-".repeat(88);

  console.log("\n" + LINE);
  console.log("  MONTHLY P&L — 3-WAY COMPARISON");
  console.log("  OLD  = original (cap 200, no reverse, no recovery)");
  console.log("  FIXED= body-past reverse on SL candle (cap 200)");
  console.log("  BEST = FIXED + recovery trade after 2nd SL (cap 350)");
  console.log("  Qty: 30 units · Rs15/pt · Entry: bodyBreak+25 · SL +/-100 pts");
  console.log(LINE);
  console.log("  " + "Month".padEnd(10) + "OLD Rs".padStart(12) + "FIXED Rs".padStart(12) + "BEST Rs".padStart(12) + "  FIXED-OLD".padStart(12) + "  BEST-OLD".padStart(12));
  console.log("  " + LINE2);
  for (const [m, v] of [...months.entries()].sort()) {
    const d1 = v.fix - v.old, d2 = v.best - v.old;
    console.log("  " + m.padEnd(10) +
      inr(v.old).padStart(12) +
      inr(v.fix).padStart(12) +
      inr(v.best).padStart(12) +
      ((d1 >= 0 ? "  +" : "  ") + inr(d1)).padStart(14) +
      ((d2 >= 0 ? "  +" : "  ") + inr(d2)).padStart(14));
  }
  console.log("  " + LINE2);
  const d1 = totFix - totOld, d2 = totBest - totOld;
  console.log("  " + "TOTAL".padEnd(10) +
    inr(totOld).padStart(12) +
    inr(totFix).padStart(12) +
    inr(totBest).padStart(12) +
    ((d1 >= 0 ? "  +" : "  ") + inr(d1)).padStart(14) +
    ((d2 >= 0 ? "  +" : "  ") + inr(d2)).padStart(14));

  console.log("\n" + LINE);
  console.log("  YEARLY SUMMARY");
  console.log(LINE);
  console.log("  " + "Year".padEnd(8) + "OLD Rs".padStart(14) + "FIXED Rs".padStart(14) + "BEST Rs".padStart(14) + "  FIXED-OLD".padStart(14) + "  BEST-OLD".padStart(14));
  console.log("  " + LINE2);
  for (const [y, v] of [...years.entries()].sort()) {
    const d1 = v.fix - v.old, d2 = v.best - v.old;
    console.log("  " + y.padEnd(8) +
      inr(v.old).padStart(14) +
      inr(v.fix).padStart(14) +
      inr(v.best).padStart(14) +
      ((d1 >= 0 ? "  +" : "  ") + inr(d1)).padStart(16) +
      ((d2 >= 0 ? "  +" : "  ") + inr(d2)).padStart(16));
  }
  console.log("  " + LINE2);
  console.log("  " + "5-YR TOTAL".padEnd(8) +
    inr(totOld).padStart(14) +
    inr(totFix).padStart(14) +
    inr(totBest).padStart(14) +
    ((d1 >= 0 ? "  +" : "  ") + inr(d1)).padStart(16) +
    ((d2 >= 0 ? "  +" : "  ") + inr(d2)).padStart(16));
  console.log("");
})();

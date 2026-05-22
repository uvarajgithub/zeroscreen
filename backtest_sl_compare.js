/**
 * AMINA 100 Backtest: SL=60 vs SL=100 comparison
 * Uses existing candles_detail.json on VPS
 *
 * Strategy rules (matching amina-live.js):
 *   Entry: close > prevBodyHigh + 25 => CE  |  close < prevBodyLow - 25 => PE
 *   SL   : entry ± SL_PTS (configurable)
 *   RE-ENTRY: if SL hit and close breaks through, reverse trade at candle close
 *   EOD exit : at 15:15 IST
 *   Day cap  : stop after -350 pts cumulative
 *
 * Modes:
 *   "wick"   = exit at SL price intrabar (current live behavior - lossy on wicks)
 *   "candle" = exit only at candle CLOSE (proposed)
 */

const fs = require("fs");
const path = require("path");

const CANDLE_FILE = "/home/ubuntu/trading-bot/research-candles-cache.json";
const QTY = 30;
const BUF = 25;           // breakout buffer
const CAP = 350;          // day loss cap (pts)
const TRAIL_GAP = 100;    // trail activation

// ── helpers ──────────────────────────────────────────────────────
function toIST(d) {
  return new Date(d.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}
function isEOD(d) {
  const ist = toIST(d);
  return ist.getHours() > 15 || (ist.getHours() === 15 && ist.getMinutes() >= 15);
}
function fmtRs(pts) {
  const r = Math.round(pts * QTY * 0.5);
  return (r >= 0 ? "+" : "") + "₹" + Math.abs(r).toLocaleString("en-IN");
}
function fmtPt(n) { return (n >= 0 ? "+" : "") + n.toFixed(0); }

// ── single day simulator ──────────────────────────────────────────
function simDay(candles, SL_PTS, exitMode) {
  // exitMode: "wick" | "candle"
  let inTrade = false, dir = null, entry = 0, sl = 0, refHigh = 0, refLow = 0;
  let firstDone = false, reUsed = false, waitRE = false;
  let peakProfit = 0;
  let pts = 0, dayLoss = 0, trades = 0, slippage = 0;
  let prev = null;

  for (const cur of candles) {
    if (!prev) { prev = cur; continue; }
    const eod = isEOD(cur.date);
    const bH = Math.max(prev.open, prev.close);
    const bL = Math.min(prev.open, prev.close);

    if (dayLoss <= -CAP) { prev = cur; continue; }

    if (inTrade) {
      // ── SL check ──
      const wickHit = dir === "CE" ? cur.low <= sl : cur.high >= sl;
      const closeHit = dir === "CE" ? cur.close <= sl : cur.close >= sl;
      const slHit = exitMode === "wick" ? wickHit : closeHit;

      if (slHit) {
        // Actual exit price: wick mode exits at SL price, candle mode exits at close
        const exitPrice = exitMode === "wick" ? sl : cur.close;
        const tradePts = dir === "CE" ? exitPrice - entry : entry - exitPrice;
        const slip = Math.abs(tradePts) - SL_PTS;  // extra loss beyond configured SL
        pts += tradePts; dayLoss += tradePts; trades++;
        slippage += Math.max(0, -tradePts - SL_PTS); // only count extra losses

        // Reverse (re-entry) if close went past SL and no re-entry used yet
        const bodyPast = dir === "CE" ? cur.close < sl : cur.close > sl;
        if (bodyPast && !reUsed) {
          const rev = dir === "CE" ? "PE" : "CE";
          const revSL = rev === "CE" ? cur.close - SL_PTS : cur.close + SL_PTS;
          dir = rev; entry = cur.close; sl = revSL;
          refHigh = rev === "CE" ? cur.high : null;
          refLow = rev === "PE" ? cur.low : null;
          reUsed = true; peakProfit = 0; // stay inTrade=true
        } else {
          inTrade = false; firstDone = false; waitRE = false; reUsed = false; peakProfit = 0;
        }
        prev = cur; continue;
      }

      // ── trail ──
      const hp = dir === "CE" ? cur.high - entry : entry - cur.low;
      if (hp > peakProfit) {
        peakProfit = hp;
        // Trail: if profit > TRAIL_GAP, lock in (profit - TRAIL_GAP)
        if (peakProfit > TRAIL_GAP) {
          const lock = entry + (dir === "CE" ? peakProfit - TRAIL_GAP : -(peakProfit - TRAIL_GAP));
          sl = dir === "CE" ? Math.max(sl, lock) : Math.min(sl, lock);
        }
      }

      // ── EOD exit ──
      if (eod) {
        const exitPts = dir === "CE" ? cur.close - entry : entry - cur.close;
        pts += exitPts; trades++; inTrade = false; firstDone = false; reUsed = false; peakProfit = 0;
      }

    } else if (!firstDone && !eod) {
      // ── Entry signal ──
      if (cur.close > bH + BUF) {
        dir = "CE"; entry = cur.close; sl = cur.close - SL_PTS;
        refHigh = cur.high; inTrade = true; firstDone = true; reUsed = false; peakProfit = 0; trades++;
      } else if (cur.close < bL - BUF) {
        dir = "PE"; entry = cur.close; sl = cur.close + SL_PTS;
        refLow = cur.low; inTrade = true; firstDone = true; reUsed = false; peakProfit = 0; trades++;
      }
    }

    prev = cur;
  }
  return { pts, trades, slippage };
}

// ── load and group candles ────────────────────────────────────────
console.log("Loading candle data...");
let raw;
try {
  raw = JSON.parse(fs.readFileSync(CANDLE_FILE, "utf8"));
} catch (e) {
  console.error("Cannot read candles_detail.json:", e.message);
  process.exit(1);
}

// Normalize: raw may be array of {date,open,high,low,close} or {data:[...]}
let candles = Array.isArray(raw) ? raw : (raw.data || raw.candles || []);
console.log(`Loaded ${candles.length} candles`);

// Parse dates
candles = candles.map(c => ({
  date: c.date instanceof Date ? c.date : new Date(String(c.date || c[0]).replace(" ", "T")),
  open: c.open ?? c[1], high: c.high ?? c[2], low: c.low ?? c[3], close: c.close ?? c[4]
})).filter(c => !isNaN(c.date.getTime()) && c.close > 0);

// Group by trading day (IST date)
const byDay = new Map();
for (const c of candles) {
  const k = c.date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  if (!byDay.has(k)) byDay.set(k, []);
  byDay.get(k).push(c);
}
const days = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
console.log(`Trading days: ${days.length}  (${days[0][0]} → ${days[days.length-1][0]})\n`);

// ── Run 4 scenarios ───────────────────────────────────────────────
const scenarios = [
  { label: "SL=60  WICK-EXIT  (current live)", sl: 60,  mode: "wick"   },
  { label: "SL=60  CANDLE-SL  (close-only SL)", sl: 60,  mode: "candle" },
  { label: "SL=100 WICK-EXIT  (wider SL, same exit)", sl: 100, mode: "wick"   },
  { label: "SL=100 CANDLE-SL  (wider + candle-close)", sl: 100, mode: "candle" },
];

const results = scenarios.map(s => {
  let totPts = 0, totTrades = 0, totSlip = 0;
  let wins = 0, losses = 0, bigLoss = 0, bigWin = 0;
  const monthly = {};
  
  for (const [date, cs] of days) {
    if (cs.length < 3) continue;
    const r = simDay(cs, s.sl, s.mode);
    totPts += r.pts; totTrades += r.trades; totSlip += r.slippage;
    if (r.pts > 0) wins++; else if (r.pts < 0) losses++;
    if (r.pts < bigLoss) bigLoss = r.pts;
    if (r.pts > bigWin) bigWin = r.pts;
    const mo = date.slice(0, 7);
    if (!monthly[mo]) monthly[mo] = 0;
    monthly[mo] += r.pts;
  }
  
  return { ...s, totPts, totTrades, totSlip, wins, losses, bigLoss, bigWin, monthly, days: days.length };
});

// ── Print results ──────────────────────────────────────────────────
const LINE = "=".repeat(100);
const SEP  = "-".repeat(88);
console.log("\n" + LINE);
console.log("  AMINA 100 BACKTEST  —  SL=60 vs SL=100  ×  WICK-EXIT vs CANDLE-EXIT");
console.log("  BUF=25, TRAIL_GAP=100, DAY_CAP=350, QTY=30, LOT=0.5x");
console.log(LINE);
console.log(`  ${"Scenario".padEnd(42)} ${"Total Pts".padStart(10)} ${"Total ₹".padStart(14)} ${"W Days".padStart(8)} ${"L Days".padStart(8)} ${"BigLoss".padStart(9)} ${"AvgSlip".padStart(9)}`);
console.log("  " + SEP);
for (const r of results) {
  console.log(`  ${r.label.padEnd(42)} ${fmtPt(r.totPts).padStart(10)} ${fmtRs(r.totPts).padStart(14)} ${r.wins.toString().padStart(8)} ${r.losses.toString().padStart(8)} ${fmtPt(r.bigLoss).padStart(9)} ${fmtPt(r.totSlip/r.days).padStart(9)}`);
}
console.log(LINE);

// Compare SL=60-wick (baseline) vs others
const base = results[0];
console.log("\n  IMPROVEMENT vs current (SL=60 WICK-EXIT):");
for (const r of results.slice(1)) {
  const diff = r.totPts - base.totPts;
  console.log(`  ${r.label.padEnd(42)}  ${fmtPt(diff).padStart(10)} pts  ${fmtRs(diff).padStart(14)}`);
}

// ── Year-by-year for all 4 scenarios ──────────────────────────────
const years = {};
for (const r of results) {
  for (const [mo, pts] of Object.entries(r.monthly)) {
    const yr = mo.slice(0, 4);
    if (!years[yr]) years[yr] = results.map(() => 0);
    years[yr][results.indexOf(r)] += pts;
  }
}
console.log("\n  YEAR-BY-YEAR  (index pts)");
console.log(`  ${"Year".padEnd(6)} ${"SL60-WICK".padStart(12)} ${"SL60-CNDL".padStart(12)} ${"SL100-WICK".padStart(12)} ${"SL100-CNDL".padStart(12)}  |  ${"SL100W vs SL60W".padStart(16)}`);
console.log("  " + SEP);
for (const [yr, vals] of Object.entries(years).sort()) {
  const diff = vals[2] - vals[0];
  console.log(`  ${yr.padEnd(6)} ${fmtPt(vals[0]).padStart(12)} ${fmtPt(vals[1]).padStart(12)} ${fmtPt(vals[2]).padStart(12)} ${fmtPt(vals[3]).padStart(12)}  |  ${fmtPt(diff).padStart(16)}`);
}
console.log("\n");

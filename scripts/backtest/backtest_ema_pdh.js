'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_ema_pdh.js — EMA21 MOMENTUM STRATEGY v2 (My Own Design)
// ════════════════════════════════════════════════════════════════════════════
//
// Strategy (completely different from BHAV):
//   1. EMA21 of daily closing prices → trend bias for the day
//      - Open > EMA21 + 30: BULL bias (prefer CE)
//      - Open < EMA21 - 30: BEAR bias (prefer PE)
//      - Open near EMA21:   NEUTRAL  (both sides possible, stronger filter)
//
//   2. EARLY ENTRY: scan C0–C5 (9:15–10:15 AM) for first strong candle
//      matching EMA bias.  Enter at that candle's close.
//      - BULL/BEAR: body% > 45%,  close confirms direction vs prev close
//      - NEUTRAL:   body% > 60%,  close must be above PDH (CE) / below PDL (PE)
//      → Entering early (C0–C5) gives full-day runway for the trail to run
//
//   3. Re-entries (up to 3): after any profitable TRAIL exit during the day,
//      scan for next strong candle in same direction → re-enter
//      This multiplies P&L on strong trend days
//
//   4. Filters:
//      - PDR (prev day range) < 200 pts → skip (flat day)
//      - Whipsaw guard: 2+ alternating 65%+ body candles in first 3 → skip
//
//   5. Exit: LOCK20 intrabar trail + candle-close SL at -150 pts (honest)
//
// Usage: node backtest_ema_pdh.js cache/banknifty_5yr.json

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(process.cwd(), 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;
const TRAIL_GAP  = 20;
const EMA_PERIOD = 21;

// ── Helpers ──────────────────────────────────────────────────────────────────
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

function calcEMA(prevEma, price, period) {
  const k = 2 / (period + 1);
  return price * k + prevEma * (1 - k);
}

// ── Exit Calculator: LOCK20 intrabar trail + candle-close SL ─────────────────
// TRAIL: checked intrabar (adverse extreme) — exits at trail level
// SL:    checked at candle close — exits at actual close price (honest)
function calcPL(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peakPts   = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    // Favorable extreme first (assume high before low for CE, low before high for PE)
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    // Intrabar trail check (only when trail is in profit zone)
    if (trailStop > 0) {
      const adversePts = side === 'CE' ? (c.low - entryPrice) : (entryPrice - c.high);
      if (adversePts <= trailStop) {
        return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL',
                 entryPrice, exitPrice: entryPrice + sign * trailStop };
      }
    }
    // Candle-close SL check (SL zone only: trailStop <= 0)
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      return { pl: closePts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL',
               entryPrice, exitPrice: c.close };
    }
  }
  // EOD exit
  const exitPrice = candles[candles.length - 1].close;
  return { pl: sign * (exitPrice - entryPrice) * PTS_PER_RS, peakPts,
           exitIdx: candles.length - 1, exitType: 'EOD', entryPrice, exitPrice };
}

// ── Entry Scanner ─────────────────────────────────────────────────────────────
// Returns {idx, side, bias} or null
// Enters EARLY (C0-C5) on first strong candle matching EMA bias
function findEntry(candles, prevClose, ema21, fromIdx) {
  const openPrice = candles[0].open;
  let bias;
  if      (openPrice > ema21 + 30)  bias = 'BULL';
  else if (openPrice < ema21 - 30)  bias = 'BEAR';
  else                               bias = 'NEUTRAL';

  const PH = pdh_val;  // set in caller
  const PL = pdl_val;  // set in caller

  // Entry window: C0 to C5 (9:15 – 10:15 AM) for initial entry
  // Re-entries from fromIdx onwards (up to C20 = 2:15 PM)
  const maxIdx = fromIdx ? Math.min(candles.length - 2, 20) : Math.min(candles.length - 2, 5);

  for (let i = (fromIdx || 0); i <= maxIdx; i++) {
    const c   = candles[i];
    const cbp = bp(c);

    if (bias === 'NEUTRAL') {
      // Neutral: need strong body AND PDH/PDL break
      if (cbp > 60 && c.close > PH + 10)  return { idx: i, side: 'CE', bias };
      if (cbp < -60 && c.close < PL - 10) return { idx: i, side: 'PE', bias };
    } else if (bias === 'BULL') {
      // Bull: enter CE on any strong bullish candle (close above prev close)
      if (cbp > 45 && c.close > prevClose) return { idx: i, side: 'CE', bias };
      // If strong bearish break of PDL despite bull bias → PE (fade)
      if (cbp < -60 && c.close < PL - 20) return { idx: i, side: 'PE', bias: 'FADE' };
    } else {  // BEAR
      // Bear: enter PE on any strong bearish candle (close below prev close)
      if (cbp < -45 && c.close < prevClose) return { idx: i, side: 'PE', bias };
      // If strong bullish break of PDH despite bear bias → CE (fade)
      if (cbp > 60 && c.close > PH + 20)   return { idx: i, side: 'CE', bias: 'FADE' };
    }
  }
  return null;
}

// ── Main Backtest ─────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

let ema21        = null;
const closeHist  = [];

let totalPL = 0, wins = 0, losses = 0, noTrade = 0, reEntries = 0;
let peakPL  = 0, maxDD = 0;
const daily   = [];
const monthly = {};
const yearly  = {};

// module-level so findEntry can access them
let pdh_val = 0, pdl_val = 0;

for (let di = 0; di < ALL.length; di++) {
  const date = ALL[di];
  const cs   = raw[date];
  const prev = di > 0 ? raw[ALL[di - 1]] : null;

  // ema21 at start = reflects closes up to di-1 (no lookahead)
  const canTrade = prev && ema21 !== null;

  if (!canTrade) {
    daily.push({ date, bbPnL: 0 });
    const dc = pdc(cs);
    closeHist.push(dc);
    if (closeHist.length === EMA_PERIOD)
      ema21 = closeHist.reduce((a, b) => a + b, 0) / EMA_PERIOD;
    else if (closeHist.length > EMA_PERIOD)
      ema21 = calcEMA(ema21, dc, EMA_PERIOD);
    continue;
  }

  pdh_val = pdh(prev);
  pdl_val = pdl(prev);
  const PDR     = pdh_val - pdl_val;
  const prevClosePrice = pdc(prev);

  let dayPL   = 0;
  let traded  = false;

  if (PDR < 200) {
    noTrade++;
  } else {
    // Whipsaw guard
    const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
    let wipsaws = 0;
    for (let i = 1; i < bps.length; i++)
      if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) wipsaws++;

    if (wipsaws >= 2) {
      noTrade++;
    } else {
      const entry = findEntry(cs, prevClosePrice, ema21, 0);
      if (!entry) {
        noTrade++;
      } else {
        traded = true;
        const res1 = calcPL(cs, entry.idx, entry.side);
        dayPL += res1.pl;

        // ── Re-entries: up to 3 after profitable TRAIL exits
        let curExit = res1;
        let curSide = entry.side;
        for (let re = 0; re < 3; re++) {
          if (curExit.exitType !== 'TRAIL' || curExit.pl <= 0) break;
          if (curExit.exitIdx >= cs.length - 2) break;
          // Scan from exitIdx+1 for next strong same-direction entry
          const reEntry = findEntry(cs, prevClosePrice, ema21, curExit.exitIdx + 1);
          if (!reEntry || reEntry.side !== curSide) break;
          reEntries++;
          const resRe = calcPL(cs, reEntry.idx, curSide);
          dayPL += resRe.pl;
          curExit = resRe;
        }
      }
    }
  }

  totalPL += dayPL;
  const plPts = dayPL / PTS_PER_RS;

  const ym = date.slice(0, 7);
  const yr = date.slice(0, 4);
  if (!monthly[ym]) monthly[ym] = { bbTotal: 0, bbTrades: 0, bbWins: 0 };
  if (!yearly[yr])  yearly[yr]  = 0;

  if (traded) {
    monthly[ym].bbTrades++;
    yearly[yr] += dayPL;
    if (dayPL > 0) { wins++; monthly[ym].bbWins++; }
    else losses++;
  }
  monthly[ym].bbTotal += plPts;

  if (totalPL > peakPL) peakPL = totalPL;
  const dd = peakPL - totalPL;
  if (dd > maxDD) maxDD = dd;

  daily.push({ date, bbPnL: Math.round(plPts * 10) / 10 });

  // Update EMA with today's close for NEXT day
  const dc = pdc(cs);
  closeHist.push(dc);
  ema21 = calcEMA(ema21, dc, EMA_PERIOD);
}

// ── Results ──────────────────────────────────────────────────────────────────
const traded = wins + losses;
const wr     = traded > 0 ? (wins / traded * 100).toFixed(1) : 0;
const winDays  = daily.filter(x => x.bbPnL > 0);
const lossDays = daily.filter(x => x.bbPnL < 0);
const pf = lossDays.length > 0
  ? Math.abs(winDays.reduce((s,x)=>s+x.bbPnL,0) / lossDays.reduce((s,x)=>s+x.bbPnL,0)).toFixed(2)
  : 'inf';

const sep = '═'.repeat(55);
console.log('\n' + sep);
console.log('   EMA21-PDH BREAKOUT — 5YR BACKTEST RESULTS');
console.log(sep);
console.log(`Total P&L:     ₹${Math.round(totalPL).toLocaleString('en-IN')}  (${(totalPL/PTS_PER_RS).toFixed(1)} pts)`);
console.log(`Traded days:   ${traded}  (wins: ${wins}  losses: ${losses})`);
console.log(`Win Rate:      ${wr}%`);
console.log(`No Trade:      ${noTrade}  |  Re-entries: ${reEntries}`);
console.log(`Max Drawdown:  ₹${Math.round(maxDD).toLocaleString('en-IN')}  (${(maxDD/PTS_PER_RS).toFixed(1)} pts)`);
console.log(`Profit Factor: ${pf}`);
if (winDays.length)  console.log(`Avg Win:       ${(winDays.reduce((s,x)=>s+x.bbPnL,0)/winDays.length).toFixed(1)} pts = ₹${Math.round(winDays.reduce((s,x)=>s+x.bbPnL,0)/winDays.length*15)}`);
if (lossDays.length) console.log(`Avg Loss:      ${(lossDays.reduce((s,x)=>s+x.bbPnL,0)/lossDays.length).toFixed(1)} pts = ₹${Math.round(lossDays.reduce((s,x)=>s+x.bbPnL,0)/lossDays.length*15)}`);

console.log('\nYEARLY P&L:');
for (const [yr, pl] of Object.entries(yearly).sort())
  console.log(`  ${yr}: ₹${Math.round(pl).toLocaleString('en-IN')}`);

console.log('\nMONTHLY P&L (last 12):');
const months = Object.keys(monthly).sort().slice(-12);
for (const m of months)
  console.log(`  ${m}: ₹${Math.round(monthly[m].bbTotal*15).toLocaleString('en-IN').padStart(10)}  (${monthly[m].bbTrades} trades, ${monthly[m].bbWins}W)`);

// ── Save JSON for dashboard ───────────────────────────────────────────────────
const monthlyJson = {};
for (const [m, d] of Object.entries(monthly)) {
  monthlyJson[m] = {
    bbTotal:  Math.round(d.bbTotal * 10) / 10,  // pts (already in pts)
    bbTrades: d.bbTrades,
    bbWins:   d.bbWins
  };
}
const totalPts = Math.round(totalPL / PTS_PER_RS * 10) / 10;
const resultJson = {
  strategy:    'EMA21-PDH-Breakout',
  totals: {
    bodyBreakout:  totalPts,
    totalPnlPts:   totalPts,
    totalPnlRs:    Math.round(totalPL),
    wins, losses,
    winRate:       parseFloat(wr),
    maxDDPts:      Math.round(maxDD / PTS_PER_RS * 10) / 10,
    maxDDRs:       Math.round(maxDD),
    profitFactor:  parseFloat(pf),
  },
  monthly: monthlyJson,
  daily,
  noTradeDays: noTrade,
};
const outPath = path.join(path.dirname(CACHE_FILE), '..', '5year-backtest-result.json');
// Write to same dir as cache parent (trading-bot folder)
const outAbs = path.resolve(path.dirname(CACHE_FILE), '..', '5year-backtest-result.json');
fs.writeFileSync(outAbs, JSON.stringify(resultJson, null, 2));
console.log(`\nJSON saved: ${outAbs}`);
console.log(sep + '\n');

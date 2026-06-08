const path = require('path');
'use strict';
// bt_compare2.js  — CORRECTED comparison
// Mode A: Candle-close only  — trail/SL triggered only when CLOSE crosses level
// Mode B: Intrabar LTP       — trail/SL triggered when intrabar HIGH/LOW crosses level
//                              4 pts slippage (5-second monitor interval)
//
// Key fix vs bt_compare_ltp.js:
//   Old: Mode B exited when close <= trail (same as Mode A) + fixed 12-pt penalty
//   New: Mode B exits when candle's LOW (CE) or HIGH (PE) crosses trail intrabar,
//        even if CLOSE recovers. This is the real behavioral difference.
//
// OHLC ordering assumption: for CE (long), high is reached before low in same candle.
//   This is the standard backtest convention.

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const MAX_TRADES    = 5;
const TRAIL_GAP     = 10;
const SL_PTS        = 150;
const LTP_SLIPPAGE  = 4;   // 5-second interval → ~3-4 pts observed slippage

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

// ─────────────────────────────────────────────────────────────────────────────
// MODE A: Candle-close exit only (no intrabar detection)
// Peak updated from intrabar high/low; trail trigger only at close
// ─────────────────────────────────────────────────────────────────────────────
function simulateDayCandle(todayCandles, prevCandles) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts   = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null;
        state.peakPts = 0; state.trailStop = -SL_PTS;
      }
      continue;
    }

    if (tradeCount >= MAX_TRADES || isEOD) continue;

    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -SL_PTS;
      state.firstDone = true; tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    dayPts += trail.pts;
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), trades: tradeCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// MODE B: Intrabar exit (LTP monitor simulation)
// Peak updated from intrabar high/low.
// Trail/SL triggered when candle's adverse extreme crosses stop level.
// For CE: favorable = high, adverse = low
// For PE: favorable = low, adverse = high
// OHLC ordering: assume favorable extreme is set first within the candle.
// ─────────────────────────────────────────────────────────────────────────────
function simulateDayLTP(todayCandles, prevCandles) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;
  let ltpExitCandle = -1;  // candle where LTP exit happened (skip same-candle re-entry)

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const dir   = state.dir;
      const entry = state.entry;
      let peakPts   = state.peakPts;
      let trailStop = state.trailStop;   // in pts from entry (starts -SL_PTS)

      // ── Step 1: Update peak from intrabar extreme (favorable side first) ──
      const intrabarFav = dir === 'CE' ? c.high - entry : entry - c.low;
      if (intrabarFav > peakPts) {
        peakPts   = intrabarFav;
        trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
      }

      // ── Step 2: Check intrabar adverse extreme against trail/SL ──
      // For CE: adverse is LOW.  intrabarAdverse = c.low - entry  (negative = bad)
      // For PE: adverse is HIGH. intrabarAdverse = entry - c.high (negative = bad)
      const intrabarAdverse = dir === 'CE' ? c.low - entry : entry - c.high;
      const closeAdverse    = dir === 'CE' ? c.close - entry : entry - c.close;

      let exitPts = null;
      let isIntrabarExit = false;

      if (isEOD) {
        // EOD: exit at close regardless, no slippage
        exitPts = Math.max(closeAdverse, -SL_PTS);
      } else if (intrabarAdverse <= trailStop) {
        // Intrabar hit: LTP monitor fires
        isIntrabarExit = true;
        if (trailStop <= 0) {
          // Hard SL hit: exit at SL (already a loss, no extra slippage)
          exitPts = -SL_PTS;
        } else {
          // Profitable trail: exit at trail level minus slippage
          exitPts = trailStop - LTP_SLIPPAGE;
          if (exitPts < -SL_PTS) exitPts = -SL_PTS;
        }
      } else if (closeAdverse <= trailStop) {
        // Close crossed trail but intrabar didn't? Only possible if high < entry in a CE
        // (no favorable move), close dropped. Exit at close.
        exitPts = closeAdverse < -SL_PTS ? -SL_PTS : closeAdverse;
      }

      if (exitPts !== null) {
        dayPts += exitPts;
        state.lastExitPts = exitPts;
        state.lastExitIdx = i;
        state.lastExitDir = dir;
        state.peakPts = peakPts;
        if (isIntrabarExit) ltpExitCandle = i;
        state.inTrade = false; state.dir = null;
        state.peakPts = 0; state.trailStop = -SL_PTS;
        // fall through to re-entry check
      } else {
        // Still in trade, update peak/trail
        state.peakPts = peakPts;
        state.trailStop = trailStop;
        continue;
      }
    }

    if (tradeCount >= MAX_TRADES || isEOD) continue;
    if (i === ltpExitCandle) continue;   // skip re-entry on same candle as intrabar LTP exit

    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -SL_PTS;
      state.firstDone = true; tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const dir = state.dir, entry = state.entry;
    const closeAdverse = dir === 'CE' ? lastC.close - entry : entry - lastC.close;
    dayPts += Math.max(closeAdverse, -SL_PTS);
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), trades: tradeCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main loop
// ─────────────────────────────────────────────────────────────────────────────
const results = [];
const monthlyCandle = {}, monthlyLTP = {};

for (let di = 1; di < dates.length; di++) {
  const date    = dates[di];
  const today   = raw[date];
  const prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  const todayC = today.map(c => ({
    open:  c.open,  high: c.high, low: c.low, close: c.close,
    h: new Date(c.date).getUTCHours(),
    m: new Date(c.date).getUTCMinutes()
  }));
  const prevC = prevDay.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close
  }));

  const resCandle = simulateDayCandle(todayC, prevC);
  const resLTP    = simulateDayLTP(todayC, prevC);

  if (resCandle.trades === 0 && resLTP.trades === 0) continue;

  const mon = date.slice(0, 7);
  if (!monthlyCandle[mon]) monthlyCandle[mon] = { pts: 0, W: 0, L: 0, days: 0 };
  if (!monthlyLTP[mon])    monthlyLTP[mon]    = { pts: 0, W: 0, L: 0, days: 0 };

  monthlyCandle[mon].pts += resCandle.dayPts; monthlyCandle[mon].days++;
  if (resCandle.dayPts > 0) monthlyCandle[mon].W++;
  else if (resCandle.dayPts < 0) monthlyCandle[mon].L++;

  monthlyLTP[mon].pts += resLTP.dayPts; monthlyLTP[mon].days++;
  if (resLTP.dayPts > 0) monthlyLTP[mon].W++;
  else if (resLTP.dayPts < 0) monthlyLTP[mon].L++;

  results.push({
    date,
    candle:  resCandle.dayPts,
    candelT: resCandle.trades,
    ltp:     resLTP.dayPts,
    ltpT:    resLTP.trades,
    diff:    parseFloat((resCandle.dayPts - resLTP.dayPts).toFixed(1))
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nDRISHTI_V1 — Candle-Close vs Intrabar LTP Monitor (CORRECTED)');
console.log('LTP slippage: ' + LTP_SLIPPAGE + ' pts (5-second interval)');
console.log('='.repeat(72));

console.log('\n── Monthly Summary ──');
console.log('Month    | Candle PnL  WR%  | LTP PnL    WR%  | Diff');
console.log('-'.repeat(62));

const months = Object.keys(monthlyCandle).sort();
let totalC = 0, totalL = 0;
for (const m of months) {
  const c = monthlyCandle[m];
  const l = monthlyLTP[m];
  const cWR = c.W + c.L > 0 ? ((c.W / (c.W + c.L)) * 100).toFixed(0) : '-';
  const lWR = l.W + l.L > 0 ? ((l.W / (l.W + l.L)) * 100).toFixed(0) : '-';
  const diff = (c.pts - l.pts).toFixed(1);
  const sign = parseFloat(diff) >= 0 ? '+' : '';
  console.log(
    m + ' | ' +
    c.pts.toFixed(1).padStart(9) + ' ' + cWR.padStart(4) + '% | ' +
    l.pts.toFixed(1).padStart(9) + ' ' + lWR.padStart(4) + '% | ' +
    sign + diff
  );
  totalC += c.pts; totalL += l.pts;
}

const allDays = results.length;
const cWins   = results.filter(r => r.candle > 0).length;
const lWins   = results.filter(r => r.ltp    > 0).length;
const cLoss   = results.filter(r => r.candle < 0).length;
const lLoss   = results.filter(r => r.ltp    < 0).length;

// Days where intrabar fires but close WOULDN'T have triggered (key stat)
const intrabarOnlyHits = results.filter(r => {
  // LTP got a different P&L than candle (intrabar fired on different candle timing)
  return r.ltp !== r.candle;
}).length;
const ltpWorseDays  = results.filter(r => r.ltp < r.candle).length;
const ltpBetterDays = results.filter(r => r.ltp > r.candle).length;

console.log('-'.repeat(62));
console.log('\n── 5-Year Totals ──');
console.log('Mode            | Total PnL     | Win Days | Loss Days | WR%  | Avg/Day');
console.log('-'.repeat(75));
console.log(
  'Candle-close    | ' + totalC.toFixed(1).padStart(10) + ' pts | ' +
  String(cWins).padStart(8) + ' | ' + String(cLoss).padStart(9) + ' | ' +
  (cWins/allDays*100).toFixed(1).padStart(4) + '% | ' +
  (totalC/allDays).toFixed(1) + ' pts'
);
console.log(
  'LTP intrabar(5s)| ' + totalL.toFixed(1).padStart(10) + ' pts | ' +
  String(lWins).padStart(8) + ' | ' + String(lLoss).padStart(9) + ' | ' +
  (lWins/allDays*100).toFixed(1).padStart(4) + '% | ' +
  (totalL/allDays).toFixed(1) + ' pts'
);
console.log('-'.repeat(75));
const grandDiff = totalC - totalL;
const sign = grandDiff >= 0 ? '+' : '';
console.log('Difference      | ' + (sign + grandDiff.toFixed(1)).padStart(11) + ' pts |');

console.log('\n── Behavioral Breakdown ──');
console.log('Days with different outcome (intrabar fired differently) : ' + intrabarOnlyHits);
console.log('Days LTP was WORSE than candle-close                     : ' + ltpWorseDays);
console.log('Days LTP was BETTER than candle-close                    : ' + ltpBetterDays);
console.log('Days identical result                                     : ' + (allDays - intrabarOnlyHits));

// Save results
const out = {
  generated: new Date().toISOString(),
  ltpSlippage: LTP_SLIPPAGE,
  note: 'Mode B correctly uses intrabar high/low for trail detection (not just close)',
  summary: {
    candleTotal:    parseFloat(totalC.toFixed(1)),
    ltpTotal:       parseFloat(totalL.toFixed(1)),
    diff:           parseFloat((totalC - totalL).toFixed(1)),
    tradingDays:    allDays,
    ltpWorseDays,
    ltpBetterDays,
    sameDays:       allDays - intrabarOnlyHits
  },
  daily: results
};
fs.writeFileSync('./bt_compare2_result.json', JSON.stringify(out, null, 2));
console.log('\nFull daily results saved to bt_compare2_result.json');

const path = require('path');
'use strict';
// bt_compare_ltp.js
// Compares DRISHTI_V1 with two exit modes:
//   A) Candle-close (no LTP monitor) — same as bt_drishti_5yr.js
//   B) LTP monitor simulated — intrabar exit with 15s slippage penalty
//
// LTP simulation logic (using OHLC approximation):
//   For PE trade:
//     favPts = entry - candle.LOW  (intrabar peak)
//     trailLevel = favPts - TRAIL_GAP (= favPts - 10)
//     LTP fires if favPts >= TRAIL_GAP AND candle.CLOSE >= entry - trailLevel
//              i.e. price bounced back to trail level intrabar
//     LTP exit pts = trailLevel - LTP_SLIPPAGE  (15s interval overshoot)
//   For CE: symmetric
//
// LTP_SLIPPAGE = 12 pts (observed today: trail=39, actual exit=26.6 => ~12 pts slip)

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const MAX_TRADES   = 5;
const TRAIL_GAP    = 10;
const SL_PTS       = 150;
const LTP_SLIPPAGE = 12;  // pts lost due to 15s monitor interval

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

// ── simulateDay (Mode A: candle-close, no LTP monitor) ──────────────────────
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
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -SL_PTS;
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

// ── simulateDay (Mode B: LTP monitor simulated) ──────────────────────────────
// Same entries, but:
//   1. Peak = candle extreme (same as candle-close — OHLC best approximation)
//   2. Exit when candle.close crosses trail level (same trigger)
//   3. Exit pts = trail - LTP_SLIPPAGE (models 15s interval overshoot)
//   4. Re-entry: after LTP exit at candle i, lastExitIdx = i (same as candle-close)
//      BUT skip re-entry for this same candle i (already mid-candle exit)
function simulateDayLTP(todayCandles, prevCandles) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;
  let ltpExitedAtCandle = -1;  // track candle where LTP exited (skip re-entry same candle)

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const dir   = state.dir;
      const entry = state.entry;
      const sign  = dir === 'CE' ? 1 : -1;

      // Intrabar extreme (same as updateDrishtiTrail)
      const favPts = dir === 'CE' ? c.high - entry : entry - c.low;
      let peakPts   = state.peakPts;
      let trailStop = state.trailStop;

      if (favPts > peakPts) {
        peakPts   = favPts;
        trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
      }

      const closePts = sign * (c.close - entry);

      if (isEOD || closePts <= trailStop) {
        let exitPts;
        if (isEOD) {
          exitPts = closePts;  // EOD: exit at close (no slippage, market closes)
        } else if (trailStop <= 0) {
          exitPts = trailStop; // Hard SL: no slippage model (already a loss)
        } else {
          exitPts = trailStop - LTP_SLIPPAGE;  // LTP slippage on profitable exits
          if (exitPts < -SL_PTS) exitPts = -SL_PTS;
        }

        dayPts += exitPts;
        state.lastExitPts = exitPts;
        state.lastExitIdx = i;
        state.lastExitDir = dir;
        state.peakPts = peakPts;
        ltpExitedAtCandle = i;
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -SL_PTS;
        // fall through to re-entry check (but skip same candle)
      } else {
        state.peakPts = peakPts; state.trailStop = trailStop;
        continue;
      }
    }

    if (tradeCount >= MAX_TRADES || isEOD) continue;
    if (i === ltpExitedAtCandle) continue;  // skip re-entry on same candle as LTP exit

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
    const sign = state.dir === 'CE' ? 1 : -1;
    const closePts = sign * (lastC.close - state.entry);
    dayPts += closePts < -SL_PTS ? -SL_PTS : closePts;
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), trades: tradeCount };
}

// ── Main loop ────────────────────────────────────────────────────────────────
const results = [];
const monthlyCandle = {}, monthlyLTP = {};

for (let di = 1; di < dates.length; di++) {
  const date    = dates[di];
  const today   = raw[date];
  const prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  const todayC = today.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, h: new Date(c.date).getUTCHours(), m: new Date(c.date).getUTCMinutes() }));
  const prevC  = prevDay.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));

  // Also pass h/m for isEOD in prevCandles (only todayC needs h/m)
  const resCandle = simulateDayCandle(todayC, prevC);
  const resLTP    = simulateDayLTP(todayC, prevC);

  if (resCandle.trades === 0 && resLTP.trades === 0) continue;

  const mon = date.slice(0, 7);
  if (!monthlyCandle[mon]) monthlyCandle[mon] = { pts: 0, W: 0, L: 0, days: 0 };
  if (!monthlyLTP[mon])    monthlyLTP[mon]    = { pts: 0, W: 0, L: 0, days: 0 };

  monthlyCandle[mon].pts += resCandle.dayPts; monthlyCandle[mon].days++;
  if (resCandle.dayPts > 0) monthlyCandle[mon].W++; else if (resCandle.dayPts < 0) monthlyCandle[mon].L++;

  monthlyLTP[mon].pts += resLTP.dayPts; monthlyLTP[mon].days++;
  if (resLTP.dayPts > 0) monthlyLTP[mon].W++; else if (resLTP.dayPts < 0) monthlyLTP[mon].L++;

  results.push({ date, candle: resCandle.dayPts, ltp: resLTP.dayPts, diff: parseFloat((resCandle.dayPts - resLTP.dayPts).toFixed(1)) });
}

// ── Output ───────────────────────────────────────────────────────────────────
console.log('\nDRISHTI_V1 — Candle-Close vs LTP Monitor Comparison');
console.log('LTP slippage model: ' + LTP_SLIPPAGE + ' pts per profitable exit');
console.log('='.repeat(72));

// Monthly summary
console.log('\n── Monthly Summary ──');
console.log('Month    | Candle PnL  WR%  | LTP PnL    WR%  | Diff');
console.log('-'.repeat(60));
const months = Object.keys(monthlyCandle).sort();
let totalC = 0, totalL = 0;
for (const m of months) {
  const c = monthlyCandle[m];
  const l = monthlyLTP[m];
  const cWR = ((c.W / (c.W + c.L)) * 100).toFixed(0);
  const lWR = ((l.W / (l.W + l.L)) * 100).toFixed(0);
  const diff = (c.pts - l.pts).toFixed(1);
  console.log(m + ' | ' + c.pts.toFixed(1).padStart(8) + ' ' + cWR.padStart(4) + '% | ' + l.pts.toFixed(1).padStart(8) + ' ' + lWR.padStart(4) + '% | ' + diff);
  totalC += c.pts; totalL += l.pts;
}

console.log('-'.repeat(60));
const allDays = results.length;
const cWins = results.filter(r => r.candle > 0).length;
const lWins = results.filter(r => r.ltp > 0).length;
console.log('\n── 5-Year Totals ──');
console.log('Mode         | Total PnL     | Win Days | Win Rate | Avg/Day');
console.log('-'.repeat(65));
console.log('Candle-close | ' + totalC.toFixed(1).padStart(10) + ' pts | ' + String(cWins).padStart(8) + ' | ' + (cWins/allDays*100).toFixed(1).padStart(7) + '% | ' + (totalC/allDays).toFixed(1) + ' pts');
console.log('LTP monitor  | ' + totalL.toFixed(1).padStart(10) + ' pts | ' + String(lWins).padStart(8) + ' | ' + (lWins/allDays*100).toFixed(1).padStart(7) + '% | ' + (totalL/allDays).toFixed(1) + ' pts');
console.log('Difference   | ' + (totalC - totalL).toFixed(1).padStart(10) + ' pts |');
console.log('\nLTP costs ~' + ((totalC - totalL)/allDays).toFixed(1) + ' pts/day vs candle-close');

// Save daily comparison JSON
const out = { generated: new Date().toISOString(), ltpSlippage: LTP_SLIPPAGE, summary: { candleTotal: parseFloat(totalC.toFixed(1)), ltpTotal: parseFloat(totalL.toFixed(1)), diff: parseFloat((totalC-totalL).toFixed(1)), tradingDays: allDays }, daily: results };
fs.writeFileSync('./bt_compare_result.json', JSON.stringify(out, null, 2));
console.log('\nFull daily results saved to bt_compare_result.json');

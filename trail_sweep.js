'use strict';
// trail_sweep.js — Compare TRAIL_GAP values on 5yr DRISHTI data
// Tests: 5, 10, 15, 20, 30, 50 pts
// SL=150, MAX_TRADES=5/day — entry logic unchanged

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, createDrishtiState } = require('./dist/src/drishti_strategy.js');

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

const SL_PTS     = 150;
const MAX_TRADES = 5;
const RS_PER_PT  = 15;

// Inline trail function with configurable TRAIL_GAP
function updateTrail(state, candle, isEOD, TRAIL_GAP) {
  const sign = state.dir === 'CE' ? 1 : -1;
  const favPts = state.dir === 'CE'
    ? candle.high  - state.entry
    : state.entry  - candle.low;

  let peakPts   = state.peakPts;
  let trailStop = state.trailStop;

  if (favPts > peakPts) {
    peakPts   = favPts;
    trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
  }

  const closePts = sign * (candle.close - state.entry);

  if (isEOD || closePts <= trailStop) {
    const exitType  = isEOD ? 'EXIT_EOD' : trailStop <= 0 ? 'EXIT_SL' : 'EXIT_TRAIL';
    const lockedPts = isEOD ? closePts : trailStop;
    const exitPrice = isEOD ? candle.close : state.entry + sign * trailStop;
    return { action: exitType, pts: lockedPts, exitPrice, trailStop, peakPts };
  }

  return { action: 'HOLD', pts: closePts, exitPrice: candle.close, trailStop, peakPts };
}

function simulateDay(todayCandles, prevCandles, TRAIL_GAP) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0, wins = 0, losses = 0;

  for (let i = 0; i < todayCandles.length; i++) {
    const c      = todayCandles[i];
    const isEOD  = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateTrail(state, c, isEOD, TRAIL_GAP);
      state.peakPts   = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        if (trail.pts > 0) wins++; else losses++;
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade   = false;
        state.dir       = null;
        state.peakPts   = 0;
        state.trailStop = -SL_PTS;
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
      state.inTrade   = true;
      state.dir       = sig.side;
      state.entry     = c.close;
      state.entryIdx  = i;
      state.peakPts   = 0;
      state.trailStop = -SL_PTS;
      state.firstDone = true;
      tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateTrail(state, lastC, true, TRAIL_GAP);
    dayPts += trail.pts;
    if (trail.pts > 0) wins++; else losses++;
    tradeCount++;
  }

  return { dayPts, trades: tradeCount, wins, losses };
}

function runBacktest(TRAIL_GAP) {
  let totalPts = 0, totalTrades = 0, tradedDays = 0, wins = 0, losses = 0;

  for (let di = 1; di < dates.length; di++) {
    const date    = dates[di];
    const today   = raw[date];
    const prevDay = raw[dates[di - 1]];
    if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

    const todayC = today.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, h: c.h, m: c.m }));
    const prevC  = prevDay.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));

    const { dayPts, trades, wins: dw, losses: dl } = simulateDay(todayC, prevC, TRAIL_GAP);
    if (trades > 0) {
      tradedDays++;
      totalTrades += trades;
      totalPts    += dayPts;
      wins        += dw;
      losses      += dl;
    }
  }

  const wr  = ((wins / (wins + losses)) * 100).toFixed(1);
  const rs  = Math.round(totalPts * RS_PER_PT);
  return { totalPts: totalPts.toFixed(1), rs, tradedDays, totalTrades, wins, losses, wr };
}

// ── Run sweep ──────────────────────────────────────────────────────────────
const gaps = [5, 10, 20, 50, 75, 100, 150, 200, 300];

console.log('\nDRISHTI_V1 — TRAIL_GAP Sweep');
console.log('SL=150 | MAX_TRADES=5/day | Data: ' + dates[0] + ' → ' + dates[dates.length - 1]);
console.log('─'.repeat(85));
console.log('TRAIL_GAP │  Total Pts  │     ₹ P&L    │ Trades │ Win%  │  Wins  │ Losses │ Days');
console.log('─'.repeat(85));

for (const gap of gaps) {
  const r = runBacktest(gap);
  console.log(
    `   ${String(gap).padStart(2)} pts  │ ${String(r.totalPts).padStart(10)} │ ₹${String(r.rs.toLocaleString()).padStart(11)} │  ${String(r.totalTrades).padStart(4)} │ ${r.wr}% │  ${String(r.wins).padStart(4)} │  ${String(r.losses).padStart(4)} │ ${r.tradedDays}`
  );
}
console.log('─'.repeat(85));

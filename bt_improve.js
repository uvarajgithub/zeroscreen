'use strict';
// Compare DRISHTI_V1 variants to find improvements
const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require('./dist/src/drishti_strategy.js');

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

function getDTE(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear(), month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0);
  const dow = lastDay.getDay();
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - (dow >= 4 ? dow - 4 : dow + 3));
  if (d >= lastThursday) {
    const nm = new Date(year, month + 2, 0);
    const ndow = nm.getDay();
    nm.setDate(nm.getDate() - (ndow >= 4 ? ndow - 4 : ndow + 3));
    return Math.max(1, Math.ceil((nm - d) / 86400000));
  }
  return Math.max(1, Math.ceil((lastThursday - d) / 86400000));
}

// Variants to test
const VARIANTS = [
  { name: 'Current (LOCK10, C0-C22, SL150, cap150)',    TRAIL: 10, MAX_ENTRY_C: 22, SL: 150, CAP: 150, MAX_T: 5 },
  { name: 'LOCK15 (increase trail gap)',                  TRAIL: 15, MAX_ENTRY_C: 22, SL: 150, CAP: 150, MAX_T: 5 },
  { name: 'LOCK20 (trail=20)',                            TRAIL: 20, MAX_ENTRY_C: 22, SL: 150, CAP: 150, MAX_T: 5 },
  { name: 'Early entry only (C0-C14 = up to 1 PM)',      TRAIL: 10, MAX_ENTRY_C: 14, SL: 150, CAP: 150, MAX_T: 5 },
  { name: 'Tight SL (-100 pts)',                          TRAIL: 10, MAX_ENTRY_C: 22, SL: 100, CAP: 100, MAX_T: 5 },
  { name: 'Max 3 trades/day',                             TRAIL: 10, MAX_ENTRY_C: 22, SL: 150, CAP: 150, MAX_T: 3 },
  { name: 'LOCK15 + early entry (C0-C14)',               TRAIL: 15, MAX_ENTRY_C: 14, SL: 150, CAP: 150, MAX_T: 5 },
  { name: 'Skip expiry week (DTE<=5 no trade)',           TRAIL: 10, MAX_ENTRY_C: 22, SL: 150, CAP: 150, MAX_T: 5, SKIP_EXPIRY: true },
];

function simulateDay(todayCandles, prevCandles, cfg) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;

  const _pdrH = prevCandles.length > 0 ? Math.max(...prevCandles.map(c => c.high)) : 0;
  const _pdrL = prevCandles.length > 0 ? Math.min(...prevCandles.map(c => c.low))  : 0;
  const _pdrOk = _pdrH > 0 && _pdrL > 0 && (_pdrH - _pdrL) >= 150;

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h !== undefined ? (c.h > 15 || (c.h === 15 && c.m >= 15)) : (i === todayCandles.length - 1);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      // Use variant's SL in updateDrishtiTrail — we need to modify state.trailStop initial
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -(cfg.SL);
        if (dayPts <= -(cfg.CAP)) break;
      }
      continue;
    }

    if (tradeCount >= cfg.MAX_T || isEOD || dayPts <= -(cfg.CAP)) continue;
    if (i > cfg.MAX_ENTRY_C) continue;  // entry window filter

    let sig = null;
    if (!state.firstDone) {
      if (!_pdrOk) continue;
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -(cfg.SL);
      state.firstDone = true;
      tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    dayPts += trail.pts;
  }

  return { dayPts, trades: tradeCount };
}

// Note: LOCK10 is hardcoded in drishti_strategy.ts — for TRAIL variants we need to
// simulate the trail manually since updateDrishtiTrail uses TRAIL_GAP=10 always.
// We'll compare the variants using a custom trail function.
function customTrail(state, candle, isEOD, SL, TRAIL_GAP) {
  const sign = state.dir === 'CE' ? 1 : -1;
  const favPts = state.dir === 'CE' ? candle.high - state.entry : state.entry - candle.low;
  let peakPts = state.peakPts, trailStop = state.trailStop;
  if (favPts > peakPts) {
    peakPts = favPts;
    trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL;
  }
  const closePts = sign * (candle.close - state.entry);
  if (isEOD || closePts <= trailStop) {
    const exitType = isEOD ? 'EXIT_EOD' : trailStop <= 0 ? 'EXIT_SL' : 'EXIT_TRAIL';
    const lockedPts = isEOD ? closePts : trailStop;
    const exitPrice = isEOD ? candle.close : state.entry + sign * trailStop;
    return { action: exitType, pts: lockedPts, exitPrice, trailStop, peakPts };
  }
  return { action: 'HOLD', pts: closePts, exitPrice: candle.close, trailStop, peakPts };
}

function simulateDayCustom(todayCandles, prevCandles, cfg) {
  const state = createDrishtiState();
  state.trailStop = -(cfg.SL);
  let tradeCount = 0, dayPts = 0;

  const _pdrH = prevCandles.length > 0 ? Math.max(...prevCandles.map(c => c.high)) : 0;
  const _pdrL = prevCandles.length > 0 ? Math.min(...prevCandles.map(c => c.low))  : 0;
  const _pdrOk = _pdrH > 0 && _pdrL > 0 && (_pdrH - _pdrL) >= 150;

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h !== undefined ? (c.h > 15 || (c.h === 15 && c.m >= 15)) : (i === todayCandles.length - 1);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = customTrail(state, c, isEOD, cfg.SL, cfg.TRAIL);
      state.peakPts = trail.peakPts;
      state.trailStop = trail.trailStop;
      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts; state.lastExitIdx = i; state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -(cfg.SL);
        if (dayPts <= -(cfg.CAP)) break;
      }
      continue;
    }

    if (tradeCount >= cfg.MAX_T || isEOD || dayPts <= -(cfg.CAP)) continue;
    if (i > cfg.MAX_ENTRY_C) continue;

    let sig = null;
    if (!state.firstDone) {
      if (!_pdrOk) continue;
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -(cfg.SL);
      state.firstDone = true;
      tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = customTrail(state, lastC, true, cfg.SL, cfg.TRAIL);
    dayPts += trail.pts;
  }
  return { dayPts, trades: tradeCount };
}

const results = VARIANTS.map(cfg => ({ cfg, pts: 0, wins: 0, losses: 0, days: 0, trades: 0 }));

for (let di = 1; di < dates.length; di++) {
  const date = dates[di];
  const today = raw[date], prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  const dte = getDTE(date);
  const todayC = today.slice(1).map((c, i) => {
    const totalMin = 9*60 + 30 + i*15;
    return { open:c.open, high:c.high, low:c.low, close:c.close,
             h: c.h !== undefined ? c.h : Math.floor(totalMin/60),
             m: c.m !== undefined ? c.m : totalMin % 60 };
  });
  const prevC = prevDay.map(c => ({ open:c.open, high:c.high, low:c.low, close:c.close }));

  for (let vi = 0; vi < VARIANTS.length; vi++) {
    const cfg = VARIANTS[vi];
    if (cfg.SKIP_EXPIRY && dte <= 5) continue;  // skip expiry week

    const { dayPts, trades } = simulateDayCustom(todayC, prevC, cfg);
    if (trades === 0) continue;
    results[vi].days++;
    results[vi].trades += trades;
    results[vi].pts += dayPts;
    if (dayPts > 0) results[vi].wins++;
    else if (dayPts < 0) results[vi].losses++;
  }
}

console.log('\n' + '═'.repeat(95));
console.log(' DRISHTI V1 — STRATEGY IMPROVEMENT COMPARISON (5-Year Backtest)');
console.log('═'.repeat(95));
console.log(' Variant                                      P&L pts      Rs Gross     WR  Avg/day  Trades');
console.log('─'.repeat(95));

results.forEach(r => {
  if (r.days === 0) return;
  const wr = (r.wins / (r.wins + r.losses) * 100).toFixed(1) + '%';
  const pts = (r.pts > 0 ? '+' : '') + r.pts.toFixed(0);
  const rs = '₹' + (r.pts * 30).toLocaleString('en-IN', {maximumFractionDigits:0});
  const avg = (r.pts / r.days).toFixed(0);
  console.log(`${r.cfg.name.padEnd(45)} ${pts.padStart(10)} ${rs.padStart(12)} ${wr.padStart(6)} ${avg.padStart(8)} ${r.trades.toString().padStart(7)}`);
});
console.log('═'.repeat(95));

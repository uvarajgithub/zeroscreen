'use strict';
// Compare DRISHTI variants with REAL PREMIUM P&L for both futures and options
// Futures: pnl = indexPts x 30 (approx real since premium stable intraday)
// Options: pnl = delta*indexPts - theta*candles - spread (realistic options model)

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, createDrishtiState } = require('./dist/src/drishti_strategy.js');

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

const QTY   = 30;
const IV    = 0.20;   // 20% annual implied vol
const SPREAD = 3;     // bid-ask per side (x2 = 6 pts round trip)
const DELTA  = 0.5;   // ATM delta

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

function atmPremium(index, dte) {
  return Math.max(50, Math.round(IV * Math.sqrt(dte / 365) * index * 0.4));
}

// Custom trail with configurable SL and trail gap
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
    const lockedPts = isEOD ? closePts : trailStop;
    const action = isEOD ? 'EXIT_EOD' : trailStop <= 0 ? 'EXIT_SL' : 'EXIT_TRAIL';
    return { action, pts: lockedPts, peakPts };
  }
  return { action: 'HOLD', pts: closePts, peakPts };
}

// Variants to test
const VARIANTS = [
  { name: 'LOCK10 (current)',    TRAIL: 10, SL: 150, CAP: 150, MAX_T: 5, MAX_C: 22 },
  { name: 'LOCK15',              TRAIL: 15, SL: 150, CAP: 150, MAX_T: 5, MAX_C: 22 },
  { name: 'LOCK20',              TRAIL: 20, SL: 150, CAP: 150, MAX_T: 5, MAX_C: 22 },
  { name: 'LOCK25',              TRAIL: 25, SL: 150, CAP: 150, MAX_T: 5, MAX_C: 22 },
  { name: 'LOCK30',              TRAIL: 30, SL: 150, CAP: 150, MAX_T: 5, MAX_C: 22 },
  { name: 'LOCK10 + SL100',      TRAIL: 10, SL: 100, CAP: 100, MAX_T: 5, MAX_C: 22 },
  { name: 'LOCK15 + early C14',  TRAIL: 15, SL: 150, CAP: 150, MAX_T: 5, MAX_C: 14 },
  { name: 'LOCK20 + SL120',      TRAIL: 20, SL: 120, CAP: 120, MAX_T: 5, MAX_C: 22 },
];

const results = VARIANTS.map(cfg => ({
  cfg, futPts: 0, optPts: 0, futRs: 0, optRs: 0,
  futWins: 0, futLosses: 0, optWins: 0, optLosses: 0,
  days: 0, trades: 0, totalTrades: 0
}));

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

  const _pdrH = Math.max(...prevC.map(c=>c.high));
  const _pdrL = Math.min(...prevC.map(c=>c.low));
  const _pdrOk = _pdrH > 0 && _pdrL > 0 && (_pdrH - _pdrL) >= 150;

  for (let vi = 0; vi < VARIANTS.length; vi++) {
    const cfg = VARIANTS[vi];
    const state = createDrishtiState();
    state.trailStop = -(cfg.SL);
    let tradeCount = 0, dayFutPts = 0, dayOptPts = 0;

    for (let i = 0; i < todayC.length; i++) {
      const c = todayC[i];
      const isEOD = c.h !== undefined ? (c.h > 15 || (c.h === 15 && c.m >= 15)) : (i === todayC.length - 1);
      const partial = todayC.slice(0, i+1);

      if (state.inTrade) {
        const trail = customTrail(state, c, isEOD, cfg.SL, cfg.TRAIL);
        state.peakPts = trail.peakPts;
        if (trail.peakPts >= cfg.TRAIL) state.trailStop = trail.peakPts - cfg.TRAIL;

        if (trail.action !== 'HOLD') {
          const idxPts = trail.pts;
          dayFutPts += idxPts;

          // Options P&L: delta × indexPts - theta × candlesHeld - spread
          const entryPrem = atmPremium(state.entry, dte);
          const thetaPerCandle = entryPrem / (dte * 26);
          const candlesHeld = Math.max(1, i - state.entryIdx);
          const optPts = DELTA * idxPts - thetaPerCandle * candlesHeld - SPREAD * 2;
          dayOptPts += optPts;

          if (trail.action !== 'EXIT_EOD') {
            state.lastExitPts = idxPts; state.lastExitIdx = i; state.lastExitDir = state.dir;
          }
          state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -(cfg.SL);
          if (dayFutPts <= -(cfg.CAP)) break;
        }
        continue;
      }

      if (tradeCount >= cfg.MAX_T || isEOD || dayFutPts <= -(cfg.CAP)) continue;
      if (i > cfg.MAX_C) continue;

      let sig = null;
      if (!state.firstDone) {
        if (!_pdrOk) continue;
        sig = findDrishtiEntry(partial, prevC);
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

    // Force close if still open
    if (state.inTrade) {
      const lastC = todayC[todayC.length - 1];
      const trail = customTrail(state, lastC, true, cfg.SL, cfg.TRAIL);
      const idxPts = trail.pts;
      dayFutPts += idxPts;
      const entryPrem = atmPremium(state.entry, dte);
      const thetaPerCandle = entryPrem / (dte * 26);
      const candlesHeld = Math.max(1, todayC.length - 1 - state.entryIdx);
      dayOptPts += DELTA * idxPts - thetaPerCandle * candlesHeld - SPREAD * 2;
    }

    if (tradeCount === 0) continue;
    results[vi].days++;
    results[vi].totalTrades += tradeCount;
    results[vi].futPts  += dayFutPts;
    results[vi].optPts  += dayOptPts;
    results[vi].futRs   += Math.round(dayFutPts * QTY);
    results[vi].optRs   += Math.round(dayOptPts * QTY);
    if (dayFutPts > 0) results[vi].futWins++; else if (dayFutPts < 0) results[vi].futLosses++;
    if (dayOptPts > 0) results[vi].optWins++; else if (dayOptPts < 0) results[vi].optLosses++;
  }
}

console.log('\n' + '='.repeat(105));
console.log(' DRISHTI — REAL PREMIUM P&L COMPARISON (5-Year)');
console.log(' Futures: indexPts x 30  |  Options: delta(0.5) x indexPts - theta - spread(6pts)');
console.log('='.repeat(105));
console.log(' Variant           FUT P&L (pts)   FUT Rs        FUT WR  OPT P&L (pts)   OPT Rs        OPT WR');
console.log('-'.repeat(105));

results.forEach(r => {
  if (r.days === 0) return;
  const fwr = (r.futWins/(r.futWins+r.futLosses)*100).toFixed(0)+'%';
  const owr = (r.optWins/(r.optWins+r.optLosses)*100).toFixed(0)+'%';
  const fp = (r.futPts>0?'+':'')+r.futPts.toFixed(0);
  const op = (r.optPts>0?'+':'')+r.optPts.toFixed(0);
  const fr = '₹'+(r.futRs).toLocaleString('en-IN',{maximumFractionDigits:0});
  const or_ = (r.optRs>=0?'₹':'−₹')+Math.abs(r.optRs).toLocaleString('en-IN',{maximumFractionDigits:0});
  console.log(' '+r.cfg.name.padEnd(17)+fp.padStart(14)+fr.padStart(14)+fwr.padStart(9)+op.padStart(15)+or_.padStart(16)+owr.padStart(9));
});

console.log('='.repeat(105));
console.log('\n OPTIONS BREAKEVEN ANALYSIS per variant:');
console.log('-'.repeat(65));
console.log(' Variant           Min index win needed   Avg theta/candle');
console.log('-'.repeat(65));
const avgDTE = 16, avgIdx = 53500;
VARIANTS.forEach(cfg => {
  const entryPrem = atmPremium(avgIdx, avgDTE);
  const theta = entryPrem / (avgDTE * 26);
  // breakeven: DELTA * indexWin - theta * 1 - SPREAD*2 = 0
  const minWin = (theta * 1 + SPREAD * 2) / DELTA;
  // But with trail, minimum locked = TRAIL_GAP (LOCK10=0, LOCK15=5, LOCK20=10)
  const minLocked = Math.max(0, cfg.TRAIL - 10);  // minimum pts locked above SL
  const lockedOptPts = DELTA * minLocked - theta * 1 - SPREAD * 2;
  console.log(' '+cfg.name.padEnd(18)+('index >'+minWin.toFixed(0)+' pts').padStart(22)+('₹'+theta.toFixed(1)+'/candle').padStart(18)+'  min locked opt: '+(lockedOptPts>=0?'+':'')+lockedOptPts.toFixed(1)+' pts');
});
console.log('='.repeat(65));

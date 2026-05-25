'use strict';
// backtest_sl_comparison.js
// 3-way comparison using REAL BHAV backtest_bhav.js logic:
//   A) Current backtest (exits at locked SL level = optimistic)
//   B) Realistic live (exits at actual candle close = how bot really behaves)
//   C) Realistic + 200pt emergency intrabar SL (the proposed fix)
// Shows how much the emergency SL closes the gap between backtest and live

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(__dirname, 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;
const TRAIL_GAP  = 20;
const ENTRY_WINDOW = 8;
const EMERGENCY_SL = 200;

// Load cache
let raw;
try { raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
catch(e) { console.error('Cannot read cache:', CACHE_FILE); process.exit(1); }
const dayEntries = Object.entries(raw).sort(([a],[b]) => a < b ? -1 : 1);
console.log(`Loaded ${dayEntries.length} trading days from ${path.basename(CACHE_FILE)}`);

// ── helpers ──────────────────────────────────────────────────────────────────
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;

// Full BHAV entry logic (copied from backtest_bhav.js)
function getCtx(c0, ph, pl, pc) {
  if (c0.open > ph + 30)  return 'ABOVE_PDH';
  if (c0.open < pl - 30)  return 'BELOW_PDL';
  if (c0.open > pc)        return 'CE_SIDE';
  return 'PE_SIDE';
}

function findEntry(cs, prev) {
  if (!cs || cs.length < 2 || !prev || prev.length === 0) return null;
  const PH = pdh(prev), PL = pdl(prev), PC = pdc(prev);
  const C0 = cs[0];
  const ctx = getCtx(C0, PH, PL, PC);

  for (let i = 0; i < Math.min(ENTRY_WINDOW, cs.length - 1); i++) {
    const c = cs[i];
    const b = bp(c);
    let signal = null;
    if (ctx === 'ABOVE_PDH') {
      if (b > 50) signal = 'CE';
      else if (b < -50) signal = 'PE';
    } else if (ctx === 'BELOW_PDL') {
      if (b < -50) signal = 'PE';
      else if (b > 50) signal = 'CE';
    } else if (ctx === 'CE_SIDE') {
      if (b > 50) signal = 'CE';
      else if (b < -60) signal = 'PE';
    } else { // PE_SIDE
      if (b < -50) signal = 'PE';
      else if (b > 60) signal = 'CE';
    }
    if (signal) return { idx: i, side: signal, ctx };
  }
  return null;
}

function findReEntry(cs, fromIdx, side) {
  for (let i = fromIdx + 1; i <= cs.length - 2; i++) {
    const b = bp(cs[i]);
    if (side === 'CE' && b > 35) return i;
    if (side === 'PE' && b < -35) return i;
  }
  return -1;
}

// ── 3 VARIANTS OF calcPL ─────────────────────────────────────────────────────

// Variant A: Current backtest — exit at locked SL level (optimistic)
function calcPL_A(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS, peakPts = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx: i,
               exitType: trailStop <= 0 ? 'SL' : 'TRAIL',
               entryPrice, exitPrice: entryPrice + sign * trailStop };
    }
  }
  const ep = candles[candles.length-1].close;
  return { pl: sign*(ep-entryPrice)*PTS_PER_RS, peakPts, exitIdx: candles.length-1, exitType:'EOD', entryPrice, exitPrice: ep };
}

// Variant B: Realistic live — exit at actual candle close (not locked level)
function calcPL_B(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS, peakPts = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      // EXIT AT ACTUAL CANDLE CLOSE (realistic) — not locked SL level
      return { pl: closePts * PTS_PER_RS, peakPts, exitIdx: i,
               exitType: trailStop <= 0 ? 'SL' : 'TRAIL',
               entryPrice, exitPrice: c.close };
    }
  }
  const ep = candles[candles.length-1].close;
  return { pl: sign*(ep-entryPrice)*PTS_PER_RS, peakPts, exitIdx: candles.length-1, exitType:'EOD', entryPrice, exitPrice: ep };
}

// Variant C: Realistic + 200pt emergency intrabar SL
function calcPL_C(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS, peakPts = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];

    // Emergency SL: if intrabar adverse move >= 200pts → cap exit at -200pts
    const adversePts = side === 'CE' ? (entryPrice - c.low) : (c.high - entryPrice);
    if (adversePts >= EMERGENCY_SL) {
      return { pl: -EMERGENCY_SL * PTS_PER_RS, peakPts, exitIdx: i,
               exitType: 'EMRG_SL', entryPrice,
               exitPrice: side === 'CE' ? entryPrice - EMERGENCY_SL : entryPrice + EMERGENCY_SL };
    }

    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      return { pl: closePts * PTS_PER_RS, peakPts, exitIdx: i,
               exitType: trailStop <= 0 ? 'SL' : 'TRAIL',
               entryPrice, exitPrice: c.close };
    }
  }
  const ep = candles[candles.length-1].close;
  return { pl: sign*(ep-entryPrice)*PTS_PER_RS, peakPts, exitIdx: candles.length-1, exitType:'EOD', entryPrice, exitPrice: ep };
}

// ── Full day simulation (re-entry logic same for all variants) ────────────────
function simulateDay(cs, prev, calcFn) {
  const entry = findEntry(cs, prev);
  if (!entry) return { pl: 0, trades: 0 };

  const res1 = calcFn(cs, entry.idx, entry.side);
  let { pl, exitIdx, exitType, peakPts } = res1;
  let rePL = 0, curExitIdx = exitIdx, curExitType = exitType, curPL = pl, curSide = entry.side;

  if (peakPts >= 100 && exitType !== 'EOD' && pl > 0) {
    const revSide = entry.side === 'CE' ? 'PE' : 'CE';
    let revIdx = -1;
    for (let i = exitIdx+1; i <= cs.length-3; i++) {
      const b = bp(cs[i]);
      if ((revSide==='CE'&&b>65)||(revSide==='PE'&&b<-65)) { revIdx=i; break; }
    }
    const sameFirst = findReEntry(cs, exitIdx, entry.side);
    if (revIdx > 0 && (sameFirst < 0 || revIdx < sameFirst)) {
      const resRev = calcFn(cs, revIdx, revSide);
      rePL += resRev.pl;
      curExitIdx=resRev.exitIdx; curExitType=resRev.exitType; curPL=resRev.pl; curSide=revSide;
    }
  }

  for (let re = 0; re < 3; re++) {
    if (curExitType !== 'EOD' && curPL > 0) {
      const reIdx = findReEntry(cs, curExitIdx, curSide);
      if (reIdx > 0) {
        const resRE = calcFn(cs, reIdx, curSide);
        rePL += resRE.pl;
        curExitIdx=resRE.exitIdx; curExitType=resRE.exitType; curPL=resRE.pl;
      } else break;
    } else break;
  }

  return { pl: pl + rePL, trades: 1 };
}

// ── Run full backtest ──────────────────────────────────────────────────────────
function runBacktest(calcFn) {
  let totalPL = 0, wins = 0, losses = 0, tradedDays = 0;
  const monthly = {};

  for (let d = 1; d < dayEntries.length; d++) {
    const [date, cs]   = dayEntries[d];
    const [,     prev] = dayEntries[d-1];
    if (!cs || cs.length < 3) continue;

    const result = simulateDay(cs, prev, calcFn);
    if (result.trades > 0) {
      tradedDays++;
      totalPL += result.pl;
      if (result.pl > 0) wins++; else losses++;
      const ym = date.slice(0,7);
      monthly[ym] = (monthly[ym]||0) + result.pl;
    }
  }

  const wr = tradedDays > 0 ? (wins/tradedDays*100).toFixed(1) : 0;
  const rupees = Math.round(totalPL);
  const maxDD = Math.min(...Object.values(monthly).map((_,i,arr) => {
    let cum = 0; for(let j=0;j<=i;j++) cum+=arr[j]; return cum;
  }), 0);

  return { totalPL: parseFloat(totalPL.toFixed(0)), rupees, wins, losses, tradedDays, wr };
}

// ── RESULTS ───────────────────────────────────────────────────────────────────
console.log('\nRunning 3-way comparison...\n');

console.log('A) Backtest-style (locked SL level = optimistic)...');
const rA = runBacktest(calcPL_A);

console.log('B) Realistic live (candle-close exit = how bot behaves today)...');
const rB = runBacktest(calcPL_B);

console.log('C) Realistic + 200pt emergency intrabar SL (proposed fix)...');
const rC = runBacktest(calcPL_C);

const fmtRs = n => (n>=0?'+₹':'-₹') + Math.abs(Math.round(n)).toLocaleString('en-IN');

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('  3-WAY SL COMPARISON — 5yr BHAV Backtest');
console.log('╠══════════════════════════════════════════════════════════╣');
console.log(`  A) Backtest (locked SL)  : ${fmtRs(rA.rupees).padEnd(14)} WR: ${rA.wr}%`);
console.log(`  B) Realistic live        : ${fmtRs(rB.rupees).padEnd(14)} WR: ${rB.wr}%`);
console.log(`  C) Live + 200pt EmergSL  : ${fmtRs(rC.rupees).padEnd(14)} WR: ${rC.wr}%`);
console.log('╠══════════════════════════════════════════════════════════╣');
const gapAB = rA.rupees - rB.rupees;
const gapBC = rC.rupees - rB.rupees;
console.log(`  Gap A→B (backtest vs real): -₹${Math.abs(gapAB).toLocaleString('en-IN')} (how much you lose vs backtest)`);
console.log(`  Gap B→C (live improvement): +₹${Math.abs(gapBC).toLocaleString('en-IN')} (emergency SL adds this)`);
console.log(`  Gap covered: ${gapAB!==0?Math.round(gapBC/Math.abs(gapAB)*100):0}% of backtest-vs-reality gap closed`);
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`\nTraded days: ${rA.tradedDays} | W:${rA.wins} L:${rA.losses}`);

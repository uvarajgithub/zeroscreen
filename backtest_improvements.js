'use strict';
// backtest_improvements.js — Test two BHAV improvements:
// 1. Re-entry threshold variants (peakPts >= 50/75/100/125/150 for reverse RE)
// 2. Hybrid SL variants (candle-SL + emergency cap at 200/250/300 pts)
// Usage: node backtest_improvements.js [cacheFile]

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(__dirname, 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;
const TRAIL_GAP  = 20;
const ENTRY_WINDOW = 8;

const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;

// Load candle data — cache format: {"YYYY-MM-DD": [{open,high,low,close,h,m},...]}
let raw;
try { raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); }
catch(e) { console.error('Cannot read cache:', CACHE_FILE); process.exit(1); }

let dayEntries;
if (Array.isArray(raw)) {
  // flat array with date/timestamp fields
  const days = {};
  for (const c of raw) {
    const d = c.date ? c.date.slice(0,10) : new Date(c.timestamp||c.time).toISOString().slice(0,10);
    if (!days[d]) days[d] = [];
    days[d].push(c);
  }
  dayEntries = Object.entries(days).sort(([a],[b]) => a < b ? -1 : 1);
} else {
  // date-keyed object (banknifty_5yr.json format)
  dayEntries = Object.entries(raw).sort(([a],[b]) => a < b ? -1 : 1);
}

if (dayEntries.length === 0) { console.error('No candles found'); process.exit(1); }
console.log(`Loaded ${dayEntries.length} trading days from ${path.basename(CACHE_FILE)}`);

// Market context
function getCtx(c0, ph, pl, pc) {
  if (c0.open > ph + 30) return 'ABOVE_PDH';
  if (c0.open < pl - 30) return 'BELOW_PDL';
  if (c0.open > pc) return 'CE_SIDE';
  return 'PE_SIDE';
}

// BHAV entry signal
function findEntry(cs, prev) {
  if (!cs || cs.length < 2 || !prev || prev.length === 0) return null;
  const PH = pdh(prev), PL = pdl(prev), PC = pdc(prev);
  const C0 = cs[0];
  const ctx = getCtx(C0, PH, PL, PC);

  for (let i = 0; i < Math.min(ENTRY_WINDOW, cs.length - 1); i++) {
    const c = cs[i];
    const b = bp(c);
    let signal = null;
    if (ctx === 'ABOVE_PDH' || ctx === 'CE_SIDE') {
      if (b > 50) signal = 'CE';
      else if (b < -50) signal = 'PE';
    } else {
      if (b < -50) signal = 'PE';
      else if (b > 50) signal = 'CE';
    }
    if (signal) return { idx: i, side: signal, ctx };
  }
  return null;
}

// Re-entry finder
function findReEntry(cs, fromIdx, side, bpThresh = 35) {
  for (let i = fromIdx + 1; i <= cs.length - 2; i++) {
    const b = bp(cs[i]);
    if (side === 'CE' && b > bpThresh) return i;
    if (side === 'PE' && b < -bpThresh) return i;
  }
  return -1;
}

// Core P&L calculator with optional emergency SL cap
function calcPL(cs, fromIdx, side, emergencySL = null) {
  const entryPrice = cs[fromIdx].close;
  let peakPts = 0;
  let trailStop = -SL_PTS;

  for (let i = fromIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const isEOD = i === cs.length - 1;

    // Emergency tick-SL: use candle LOW/HIGH as proxy for intrabar extreme
    if (emergencySL !== null) {
      const intrabarAdverse = side === 'CE'
        ? (entryPrice - c.low)   // how far LOW went against CE
        : (c.high - entryPrice); // how far HIGH went against PE
      if (intrabarAdverse >= emergencySL) {
        // Exit capped at emergencySL (better than full candle-close loss)
        return { pl: -emergencySL, peakPts, exitIdx: i, exitType: 'EMRG_SL', entryPrice, exitPrice: side === 'CE' ? entryPrice - emergencySL : entryPrice + emergencySL };
      }
    }

    const favPts = side === 'CE' ? c.close - entryPrice : entryPrice - c.close;
    if (favPts > peakPts) {
      peakPts = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }

    if (favPts <= trailStop || isEOD) {
      const exitType = isEOD ? 'EOD' : (favPts <= -SL_PTS ? 'SL' : 'TRAIL');
      return { pl: parseFloat(favPts.toFixed(1)), peakPts, exitIdx: i, exitType, entryPrice, exitPrice: c.close };
    }
  }
  const last = cs[cs.length-1];
  const finalPts = side === 'CE' ? last.close - entryPrice : entryPrice - last.close;
  return { pl: parseFloat(finalPts.toFixed(1)), peakPts, exitIdx: cs.length-1, exitType: 'EOD', entryPrice, exitPrice: last.close };
}

// Full day simulation with configurable thresholds
function simulateDay(cs, prev, reversePeakThresh, emergencySL) {
  const entry = findEntry(cs, prev);
  if (!entry) return { pl: 0, trades: 0, reEntries: 0 };

  const res1 = calcPL(cs, entry.idx, entry.side, emergencySL);
  let { pl, exitIdx, exitType, peakPts } = res1;
  let rePL = 0, reCount = 0;
  let curExitIdx = exitIdx, curExitType = exitType, curPL = pl, curSide = entry.side;

  // Reverse RE: peakPts >= reversePeakThresh (configurable)
  if (peakPts >= reversePeakThresh && exitType !== 'EOD' && pl > 0) {
    const revSide = entry.side === 'CE' ? 'PE' : 'CE';
    let revIdx = -1;
    for (let i = exitIdx + 1; i <= cs.length - 3; i++) {
      const b = bp(cs[i]);
      if ((revSide === 'CE' && b > 65) || (revSide === 'PE' && b < -65)) { revIdx = i; break; }
    }
    const sameFirst = findReEntry(cs, exitIdx, entry.side);
    if (revIdx > 0 && (sameFirst < 0 || revIdx < sameFirst)) {
      reCount++;
      const resRev = calcPL(cs, revIdx, revSide, emergencySL);
      rePL += resRev.pl;
      curExitIdx = resRev.exitIdx; curExitType = resRev.exitType;
      curPL = resRev.pl; curSide = revSide;
    }
  }

  // Same-direction RE loop (up to 3)
  for (let re = 0; re < 3; re++) {
    if (curExitType !== 'EOD' && curPL > 0) {
      const reIdx = findReEntry(cs, curExitIdx, curSide);
      if (reIdx > 0) {
        reCount++;
        const resRE = calcPL(cs, reIdx, curSide, emergencySL);
        rePL += resRE.pl;
        curExitIdx = resRE.exitIdx; curExitType = resRE.exitType;
        curPL = resRE.pl;
      } else break;
    } else break;
  }

  // Post-loop reverse check
  if (curSide === entry.side && curExitType !== 'EOD' && curPL > 0) {
    const revSide2 = curSide === 'CE' ? 'PE' : 'CE';
    let rev2Idx = -1;
    for (let i = curExitIdx + 1; i <= cs.length - 3; i++) {
      const b = bp(cs[i]);
      if ((revSide2 === 'CE' && b > 65) || (revSide2 === 'PE' && b < -65)) { rev2Idx = i; break; }
    }
    if (rev2Idx > 0) {
      reCount++;
      const resRev2 = calcPL(cs, rev2Idx, revSide2, emergencySL);
      rePL += resRev2.pl;
    }
  }

  return { pl: pl + rePL, trades: 1, reEntries: reCount };
}

// Run full backtest for a configuration
function runBacktest(reversePeakThresh, emergencySL) {
  let totalPL = 0, wins = 0, losses = 0, tradedDays = 0, totalTrades = 0, totalRE = 0;

  for (let d = 1; d < dayEntries.length; d++) {
    const [, cs]   = dayEntries[d];
    const [, prev] = dayEntries[d - 1];
    if (!cs || cs.length < 3) continue;

    const result = simulateDay(cs, prev, reversePeakThresh, emergencySL);
    if (result.trades > 0) {
      tradedDays++;
      totalPL += result.pl;
      totalTrades += result.trades;
      totalRE += result.reEntries;
      if (result.pl > 0) wins++; else losses++;
    }
  }

  const wr = tradedDays > 0 ? (wins / tradedDays * 100).toFixed(1) : 0;
  const rs = Math.round(totalPL * PTS_PER_RS);
  return { totalPL: parseFloat(totalPL.toFixed(0)), rs, wins, losses, tradedDays, totalTrades, totalRE, wr };
}

// ── EXPERIMENT 1: RE-ENTRY THRESHOLD (emergency SL = null = disabled) ────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  EXPERIMENT 1: Reverse Re-entry Peak Threshold');
console.log('  (Emergency SL disabled — pure candle-SL baseline)');
console.log('══════════════════════════════════════════════════════════');
console.log('Threshold │ Total P&L  │ ₹ Return   │ Win%  │ RE count');
console.log('──────────┼────────────┼────────────┼───────┼──────────');

const reThresholds = [50, 75, 100, 125, 150, 200];
let bestRE = null;
for (const thresh of reThresholds) {
  const r = runBacktest(thresh, null);
  const label = thresh === 100 ? `${thresh} (live)` : `${thresh}      `;
  console.log(`${label.padEnd(9)} │ ${String(r.totalPL+' pts').padEnd(10)} │ ₹${String(r.rs.toLocaleString('en-IN')).padEnd(10)} │ ${r.wr}% │ ${r.totalRE}`);
  if (!bestRE || r.rs > bestRE.rs) bestRE = { thresh, ...r };
}
console.log('──────────┴────────────┴────────────┴───────┴──────────');
console.log(`Best threshold: ${bestRE.thresh} pts → ₹${bestRE.rs.toLocaleString('en-IN')}`);

// ── EXPERIMENT 2: HYBRID SL (re-entry threshold = 100 = current) ─────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  EXPERIMENT 2: Emergency SL Cap (candle-SL + intrabar cap)');
console.log('  (Re-entry threshold = 100 = current live setting)');
console.log('══════════════════════════════════════════════════════════');
console.log('EmergSL   │ Total P&L  │ ₹ Return   │ Win%  │ Diff vs baseline');
console.log('──────────┼────────────┼────────────┼───────┼──────────────────');

const baseline = runBacktest(100, null);
const slCaps = [null, 200, 250, 300, 400];
for (const cap of slCaps) {
  const r = runBacktest(100, cap);
  const diff = r.rs - baseline.rs;
  const diffStr = diff >= 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
  const label = cap === null ? 'Disabled  ' : `${cap} pts   `;
  const marker = cap === null ? ' ← baseline' : '';
  console.log(`${label.padEnd(9)} │ ${String(r.totalPL+' pts').padEnd(10)} │ ₹${String(r.rs.toLocaleString('en-IN')).padEnd(10)} │ ${r.wr}% │ ${diffStr}${marker}`);
}
console.log('──────────┴────────────┴────────────┴───────┴──────────────────');

// ── COMBINED BEST ──────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  COMBINED: Best RE threshold + Best Emergency SL');
console.log('══════════════════════════════════════════════════════════');
const slCapsTest = [null, 200, 250, 300];
for (const thresh of [50, 75, 100]) {
  for (const cap of slCapsTest) {
    const r = runBacktest(thresh, cap);
    const diff = r.rs - baseline.rs;
    const diffStr = diff >= 0 ? `+₹${diff.toLocaleString('en-IN')}` : `-₹${Math.abs(diff).toLocaleString('en-IN')}`;
    const capLabel = cap === null ? 'no-cap' : `cap${cap}`;
    console.log(`RE≥${thresh} + ${capLabel.padEnd(7)}: ₹${String(r.rs.toLocaleString('en-IN')).padEnd(12)} ${diffStr}`);
  }
}
console.log('\nBaseline (RE≥100, no cap): ₹' + baseline.rs.toLocaleString('en-IN'));

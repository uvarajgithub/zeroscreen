// daily_trace.js — detailed candle-by-candle trace for ONE day, BOTH strategies
// Usage: node daily_trace.js [date]   default: last trading day in cache

'use strict';
const https = require('https');
const fs    = require('fs');

// ── helpers ──────────────────────────────────────────────────────────────────
const bp   = c => (c.high - c.low) === 0 ? 0 : (c.close - c.open) / (c.high - c.low) * 100;
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const smma = (arr, n, i) => {
  if (i < n - 1) return null;
  if (i === n - 1) return arr.slice(0, n).reduce((s, v) => s + v, 0) / n;
  return (smma(arr, n, i - 1) * (n - 1) + arr[i]) / n;
};
const time = i => { const m = 9*60+15+i*15; return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`; };

// ── fetch intraday from Zerodha historical (or NSE fallback) ─────────────────
// Use the local cache file since we already have accurate data there
const CACHE = process.argv[3] || './cache/banknifty_2026.json';
const raw   = JSON.parse(fs.readFileSync(CACHE));
const ALL   = Object.keys(raw).sort().filter(k => raw[k].length > 0);

const targetDate = process.argv[2] || ALL[ALL.length - 1];
const cs   = raw[targetDate];
const prev = raw[ALL[ALL.indexOf(targetDate) - 1]];
const PH   = pdh(prev), PL = pdl(prev);
const SL   = 150, TRAIL = 20;

console.log(`\n${'═'.repeat(72)}`);
console.log(`  DAY TRACE — ${targetDate}   PDH=${PH.toFixed(0)}  PDL=${PL.toFixed(0)}`);
console.log(`  Context: C0 opens at ${cs[0].open.toFixed(0)}  (${(cs[0].open-PH).toFixed(0)} vs PDH | ${(cs[0].open-PL).toFixed(0)} vs PDL)`);
console.log(`${'═'.repeat(72)}`);

// ── print candle table ────────────────────────────────────────────────────────
console.log('\nCandles:');
console.log('  Cx  Time   Open      Close     High      Low       Body%');
console.log('  ' + '─'.repeat(63));
for (let i = 0; i < cs.length; i++) {
  const c = cs[i];
  const b = bp(c).toFixed(1).padStart(6);
  console.log(`  C${String(i).padEnd(2)} ${time(i)}  ${c.open.toFixed(2).padStart(8)}  ${c.close.toFixed(2).padStart(8)}  ${c.high.toFixed(2).padStart(8)}  ${c.low.toFixed(2).padStart(8)}  ${b}%`);
}

// ── BHAV STRATEGY TRACE ───────────────────────────────────────────────────────
const PTS = 15;
function traceTrade(label, entryIdx, side, cs) {
  const entry = cs[entryIdx].close;
  const sign  = side === 'CE' ? 1 : -1;
  let peak = 0, trail = -SL;
  console.log(`\n  Entry at C${entryIdx} (${time(entryIdx)}) ${side}  @ ${entry.toFixed(2)}`);
  for (let i = entryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const fav = side === 'CE' ? c.high - entry : entry - c.low;
    if (fav > peak) {
      peak  = fav;
      trail = peak >= TRAIL ? peak - TRAIL : -SL;
    }
    const closeP = sign * (c.close - entry);
    const status = closeP <= trail ? '← EXIT' : '';
    console.log(`    C${String(i).padEnd(2)} ${time(i)}  close=${c.close.toFixed(2)}  fav=${fav.toFixed(1).padStart(6)}pts  peak=${peak.toFixed(1).padStart(6)}pts  trail=${trail.toFixed(1).padStart(6)}pts  closeP=${closeP.toFixed(1).padStart(7)}pts  ${status}`);
    if (closeP <= trail) {
      const pl = trail * PTS;
      const type = trail <= 0 ? 'SL' : 'TRAIL';
      console.log(`  → ${label} EXIT [${type}] C${i} (${time(i)})  locked=${trail.toFixed(1)}pts  P&L=${pl >= 0 ? '+' : ''}₹${Math.abs(pl).toLocaleString('en-IN')} ${pl >= 0 ? '✓' : '✗'}`);
      return { exitIdx: i, pl, type, peakPts: peak };
    }
  }
  const exitPr = cs[cs.length-1].close;
  const pl = sign * (exitPr - entry) * PTS;
  console.log(`  → ${label} EXIT [EOD] C${cs.length-1} (${time(cs.length-1)})  P&L=${pl >= 0 ? '+' : ''}₹${Math.abs(pl).toLocaleString('en-IN')} ${pl >= 0 ? '✓' : '✗'}`);
  return { exitIdx: cs.length-1, pl, type: 'EOD', peakPts: peak };
}

// ── determine BHAV entry ─────────────────────────────────────────────────────
const C0 = cs[0], C1 = cs[1];
const C0bp = bp(C0), C1bp = bp(C1);
const vsPDH = C0.open - PH, vsPDL = C0.open - PL;
const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
const gap = C0.open - prev[prev.length-1].close;

console.log(`\n${'─'.repeat(72)}`);
console.log(`BHAV STRATEGY`);
console.log(`  Context: ${ctx}   C0bp=${C0bp.toFixed(1)}%   Gap=${gap.toFixed(0)}pts`);

// Simple entry detection matching backtest_bhav.js logic
let bEntry = null, bReason = '';
if (ctx === 'INSIDE') {
  if (C0.close < PL)  { bEntry = {i:0, side:'PE'}; bReason='C0 breaks below PDL'; }
  else if (C0.close > PH) { bEntry = {i:0, side:'CE'}; bReason='C0 breaks above PDH'; }
  else if (Math.abs(C0bp) > 55) {
    const aligned = (C0bp > 0 && gap >= -50) || (C0bp < 0 && gap <= 50);
    if (aligned) {
      if (C1bp * C0bp < 0 && Math.abs(C1bp) > 65) { bEntry={i:1,side:C1bp>0?'CE':'PE'}; bReason='C0 trap → C1 signal'; }
      else { bEntry={i:0,side:C0bp>0?'CE':'PE'}; bReason='Strong C0 aligned momentum'; }
    } else {
      if (C1bp*C0bp > 0 && Math.abs(C1bp)>35) { bEntry={i:1,side:C1bp>0?'CE':'PE'}; bReason='Strong C0 gap-trap C1 confirms'; }
    }
  } else if (Math.abs(C0bp) > 30) {
    if (C1bp * C0bp > 0) { bEntry={i:0,side:C0bp>0?'CE':'PE'}; bReason='Moderate C0+C1 same dir'; }
  }
}
if (bEntry) {
  console.log(`  Signal: ${bEntry.side} at C${bEntry.i} (${time(bEntry.i)})  [${bReason}]`);
  const r1 = traceTrade('T1', bEntry.i, bEntry.side, cs);
  if (r1.type !== 'EOD' && r1.pl > 0) {
    // check RE
    const oppSide = bEntry.side === 'CE' ? 'PE' : 'CE';
    // reverse RE if peak >= 100
    if (r1.peakPts >= 100) {
      for (let i = r1.exitIdx+1; i < cs.length-2; i++) {
        const b = bp(cs[i]);
        if ((oppSide==='CE'&&b>65)||(oppSide==='PE'&&b<-65)) {
          console.log(`\n  Reverse RE: ${oppSide} at C${i} (${time(i)}) [peakPts=${r1.peakPts.toFixed(0)}, opposite signal]`);
          traceTrade('REV-RE', i, oppSide, cs);
          break;
        }
      }
    }
    // same direction RE
    for (let i = r1.exitIdx+1; i < cs.length-2; i++) {
      const b = bp(cs[i]);
      if ((bEntry.side==='CE'&&b>35)||(bEntry.side==='PE'&&b<-35)) {
        console.log(`\n  Same-dir RE: ${bEntry.side} at C${i} (${time(i)})`);
        traceTrade('RE', i, bEntry.side, cs);
        break;
      }
    }
  }
} else {
  console.log(`  No signal fired (or complex rule — check backtest_bhav.js for full logic)`);
}

// ── AMINA STRATEGY TRACE ──────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(72)}`);
console.log(`AMINA STRATEGY (SMMA7 SL)`);
// Build SMMA7 across entire data for correct values
const allCandles = [];
for (const d of ALL) for (const c of raw[d]) allCandles.push(c.close);
const dayStart = ALL.indexOf(targetDate);
let offset = 0;
for (let d = 0; d < dayStart; d++) offset += raw[ALL[d]].length;

const smma7 = [];
let s = null;
for (let i = 0; i < allCandles.length; i++) {
  if (i === 6) s = allCandles.slice(0,7).reduce((a,b)=>a+b,0)/7;
  else if (i > 6) s = (s * 6 + allCandles[i]) / 7;
  smma7.push(s);
}

// Amina entry: SMMA scan — simple Rule A: close crosses SMMA7 from below/above
// Find entry on current day
let aEntry = null;
for (let i = 1; i < cs.length; i++) {
  const gi = offset + i;
  const sm = smma7[gi], smPrev = smma7[gi-1];
  const prev_c = cs[i-1].close, cur_c = cs[i].close;
  if (prev_c < smPrev && cur_c > sm) { aEntry = {i, side:'CE', smma:sm}; break; }
  if (prev_c > smPrev && cur_c < sm) { aEntry = {i, side:'PE', smma:sm}; break; }
}
if (!aEntry) {
  // Check C0
  const gi = offset;
  const sm = smma7[gi], smPrev = smma7[gi-1] || sm;
  if (cs[0].close > sm) aEntry = {i:0, side:'CE', smma:sm};
  else                  aEntry = {i:0, side:'PE', smma:sm};
}

if (aEntry) {
  console.log(`  Signal: ${aEntry.side} at C${aEntry.i} (${time(aEntry.i)})  SMMA7=${aEntry.smma.toFixed(2)}`);
  const entry = cs[aEntry.i].close;
  const sign  = aEntry.side === 'CE' ? 1 : -1;
  console.log(`\n  Entry at C${aEntry.i} (${time(aEntry.i)}) ${aEntry.side}  @ ${entry.toFixed(2)}`);
  let exited = false;
  for (let i = aEntry.i + 1; i < cs.length; i++) {
    const gi = offset + i;
    const sm = smma7[gi];
    const c  = cs[i];
    const crossed = aEntry.side === 'CE' ? c.close < sm : c.close > sm;
    console.log(`    C${String(i).padEnd(2)} ${time(i)}  close=${c.close.toFixed(2)}  SMMA7=${sm.toFixed(2)}  diff=${(sign*(c.close-sm)).toFixed(1)}  ${crossed ? '← EXIT (close crossed SMMA7)' : ''}`);
    if (crossed) {
      const pl = sign * (c.close - entry) * PTS;
      console.log(`  → AMINA EXIT [SMMA7] C${i} (${time(i)})  P&L=${pl >= 0 ? '+' : ''}₹${Math.abs(pl).toLocaleString('en-IN')} ${pl >= 0 ? '✓' : '✗'}`);
      exited = true;
      break;
    }
  }
  if (!exited) {
    const pl = sign * (cs[cs.length-1].close - entry) * PTS;
    console.log(`  → AMINA EXIT [EOD] C${cs.length-1} (${time(cs.length-1)})  P&L=${pl >= 0 ? '+' : ''}₹${Math.abs(pl).toLocaleString('en-IN')} ${pl >= 0 ? '✓' : '✗'}`);
  }
}
console.log(`\n${'═'.repeat(72)}\n`);

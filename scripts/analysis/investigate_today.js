'use strict';
// investigate_today.js — Why no entry on today's data?
const fs = require('fs');
const path = require('path');
const { findDrishtiEntry, findDrishtiReEntry, createDrishtiState } = require(path.join(process.cwd(), 'dist', 'src', 'drishti_strategy.js'));

const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf-8'));
const allDates = Object.keys(raw).sort();
const today = allDates[allDates.length - 1];
const prev  = allDates[allDates.length - 2];
const tc = raw[today];
const pc = raw[prev];

const PH = Math.max(...pc.map(c => c.high));
const PL = Math.min(...pc.map(c => c.low));
const PC = pc[pc.length - 1].close;

console.log('=== TODAY CANDLE-BY-CANDLE INVESTIGATION ===');
console.log(`Date: ${today}  prev: ${prev}`);
console.log(`PDH=${PH.toFixed(2)}  PDL=${PL.toFixed(2)}  PC=${PC.toFixed(2)}  PDR=${(PH-PL).toFixed(0)}`);
console.log('');

// Cache structure: tc[0] = seed (9:15-9:30), tc[1] = first 5-min candle after open, etc.
// In strategy: todayCandles = tc.slice(1) (seed excluded)
// BUT the bt_lastweek.js used raw[date] directly — let's check what index.ts does

// Print all raw candles
console.log('--- RAW CACHE CANDLES (index as stored) ---');
for (let i = 0; i <= Math.min(12, tc.length - 1); i++) {
  const c = tc[i];
  const body = (c.high - c.low) > 0 ? ((c.close - c.open) / (c.high - c.low) * 100).toFixed(0) : '0';
  const vsPDH = (c.close - PH).toFixed(0);
  const vsPDL = (c.close - PL).toFixed(0);
  console.log(`  [${i}] O=${c.open} H=${c.high} L=${c.low} C=${c.close}  body=${body}%  C-PDH=${vsPDH}  C-PDL=${vsPDL}`);
}
console.log('');

// Determine context from C0.open
const C0 = tc[0];
const vsPDH_open = C0.open - PH;
const vsPDL_open = C0.open - PL;
const ctx = vsPDH_open > 120 ? 'ABOVE_PDH' : vsPDL_open < 0 ? 'BELOW_PDL' : 'INSIDE';
console.log(`C0.open=${C0.open}  vsPDH=${vsPDH_open.toFixed(1)}  vsPDL=${vsPDL_open.toFixed(1)}  ctx=${ctx}`);
console.log('');

// Simulate findDrishtiEntry candle by candle
console.log('--- ENTRY SCAN (partial array passed each candle) ---');
const state = createDrishtiState();
for (let i = 0; i < Math.min(15, tc.length); i++) {
  const partial = tc.slice(0, i + 1);
  const sig = findDrishtiEntry(partial, pc);
  if (sig && sig.idx === i) {
    console.log(`  *** ENTRY SIGNAL at idx ${i}: ${sig.side} reason=${sig.reason} ***`);
    break;
  } else {
    const c = tc[i];
    const body = (c.high - c.low) > 0 ? ((c.close - c.open) / (c.high - c.low) * 100).toFixed(0) : '0';
    // Check structural break vs prev candle
    let structNote = '';
    if (i > 0) {
      const prev = tc[i-1];
      if (c.close < prev.low)  structNote = ` [STRUCT BREAK DOWN: C<prev.low=${prev.low}]`;
      if (c.close > prev.high) structNote = ` [STRUCT BREAK UP:   C>prev.high=${prev.high}]`;
    }
    console.log(`  idx ${i}: no signal  body=${body}% close=${c.close}${structNote}`);
  }
}

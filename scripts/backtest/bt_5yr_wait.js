const path = require('path');
'use strict';
// bt_5yr_wait.js — For every day in 5yr cache:
// 1. What candle index was the FIRST entry (max wait time analysis)?
// 2. How many days had ZERO trades?
// 3. How many days had zero trades after 11:30 AM (idx >= 8)?

const fs = require('fs');
const { findDrishtiEntry, updateDrishtiTrail, createDrishtiState } = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const MAX_TRADES = 5, DAILY_LOSS_CAP = 150, RS_PER_PT = 30;
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const allDates = Object.keys(raw).sort();

console.log(`Analyzing ${allDates.length} trading days...`);

let noTradeCount = 0;
let noTradeAfter1130 = 0;
const waitTimes = [];           // [entryIdx, date] for all first entries
const noTradeDays = [];
const lateEntryDays = [];       // first entry at idx >= 8 (after 11:30)

for (let di = 1; di < allDates.length; di++) {
  const date = allDates[di];
  const prevDate = allDates[di - 1];
  const tc = raw[date];
  const pc = raw[prevDate];
  if (!tc || !pc) continue;

  const _pdrH = Math.max(...pc.map(c => c.high));
  const _pdrL = Math.min(...pc.map(c => c.low));
  const pdrOk = (_pdrH - _pdrL) >= 150;

  if (!pdrOk) continue;  // PDR filter — skip these days (same as live bot)

  const state = createDrishtiState();
  let firstEntryIdx = -1;
  let tradeCount = 0, dayPts = 0;

  for (let i = 0; i < tc.length; i++) {
    const c = tc[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = tc.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts = trail.peakPts;
      state.trailStop = trail.trailStop;
      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        state.lastExitPts = trail.pts;
        state.lastExitIdx = i;
        state.lastExitDir = state.dir;
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -150;
        if (dayPts <= -DAILY_LOSS_CAP) break;
      }
      continue;
    }

    if (isEOD || tradeCount >= MAX_TRADES) continue;

    // First entry only (no re-entry here for this analysis)
    if (!state.firstDone && pdrOk) {
      const sig = findDrishtiEntry(partial, pc);
      if (sig && sig.idx === i) {
        firstEntryIdx = i;
        state.inTrade = true; state.dir = sig.side; state.entry = c.close;
        state.entryIdx = i; state.trailStop = -150; state.peakPts = 0;
        state.firstDone = true;
        tradeCount++;
      }
    }
  }

  if (firstEntryIdx === -1) {
    noTradeCount++;
    noTradeDays.push(date);
    // Check if market was open all day (at least 15 candles)
    if (tc.length >= 8) {  // idx 8 = candle closing at ~11:30
      noTradeAfter1130++;
    }
  } else {
    waitTimes.push({ idx: firstEntryIdx, date });
    // idx 8 = first candle closing at 11:30 (9:15 seed + 8 × 15min = 11:15, closes at 11:30)
    if (firstEntryIdx >= 8) {
      lateEntryDays.push({ idx: firstEntryIdx, date });
    }
  }
}

// Sort wait times
waitTimes.sort((a, b) => b.idx - a.idx);

const pdrDays = waitTimes.length + noTradeCount;
console.log(`\n=== 5YR WAIT TIME ANALYSIS ===`);
console.log(`Days with PDR >= 150: ${pdrDays}`);
console.log(`Days with at least 1 trade: ${waitTimes.length}`);
console.log(`Days with ZERO trades (PDR passed): ${noTradeCount} (${(noTradeCount/pdrDays*100).toFixed(1)}%)`);
console.log(`  of which: all-day no-trade (>= 8 candles): ${noTradeAfter1130}`);
console.log('');
console.log(`First entry came AFTER 11:30 (idx >= 8): ${lateEntryDays.length} days`);
console.log('');
console.log('TOP 20 LATEST FIRST ENTRIES:');
for (const w of waitTimes.slice(0, 20)) {
  // Convert idx to approx time: idx 0 = 9:15 seed, idx 1 = 9:45 (first real candle close), etc.
  // Actually in the cache: idx 0 = first candle. If seed is included, idx 0 = 9:30 close
  // 9:15 + (i * 15 min) = close time
  const closeMin = 9 * 60 + 15 + (w.idx * 15);
  const hh = Math.floor(closeMin / 60);
  const mm = closeMin % 60;
  const timeStr = `${hh}:${mm.toString().padStart(2,'0')}`;
  console.log(`  ${w.date}  candle_idx=${w.idx}  entry@${timeStr}`);
}
console.log('');
console.log('ZERO TRADE DAYS (last 20 of ' + noTradeDays.length + '):');
for (const d of noTradeDays.slice(-20)) {
  console.log(`  ${d}`);
}

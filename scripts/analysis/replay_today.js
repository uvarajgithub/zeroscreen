'use strict';
// replay_today.js — candle-by-candle replay of June 2, 2026
// Shows EXACTLY what the strategy did and why, then compares to bot actual

const fs = require('fs');
const path = require('path');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require(path.join(process.cwd(), 'dist', 'src', 'drishti_strategy.js'));

const TODAY    = '2026-06-02';
const PREV_DAY = '2026-06-01';
const LOT      = 30;
const SL_PTS   = 150;
const TRAIL_GAP = 10;

const raw    = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf-8'));
const todayC = raw[TODAY];
const prevC  = raw[PREV_DAY];

if (!todayC || !prevC) { console.log('No data for', TODAY); process.exit(1); }

const toIST = c => {
  const d = new Date(c.date);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  // UTC+5:30
  let tm = h * 60 + m + 330;
  if (tm >= 1440) tm -= 1440;
  return String(Math.floor(tm/60)).padStart(2,'0') + ':' + String(tm%60).padStart(2,'0');
};

const prevClose = prevC[prevC.length - 1].close;
const prevHigh  = Math.max(...prevC.map(c => c.high));
const prevLow   = Math.min(...prevC.map(c => c.low));

console.log('\n' + '═'.repeat(72));
console.log('  LIVE REPLAY — June 2, 2026 — DRISHTI_V1 Candle-by-Candle');
console.log('═'.repeat(72));
console.log('  Prev Day Close : ' + prevClose);
console.log('  Prev Day High  : ' + prevHigh + '  (PDH — CE trigger level)');
console.log('  Prev Day Low   : ' + prevLow  + '  (PDL — PE trigger level)');
console.log('');

const fmt1 = n => n.toFixed(1).padStart(8);
const fmtP = n => (n >= 0 ? '+' : '') + n.toFixed(1);

const state = createDrishtiState();
let tradeCount = 0, dayPts = 0;

console.log('Time  | Open      High      Low       Close   | Action');
console.log('─'.repeat(72));

for (let i = 0; i < todayC.length; i++) {
  const c      = todayC[i];
  const ist    = toIST(c);
  const isEOD  = new Date(c.date).getUTCHours() > 9 ||
                 (new Date(c.date).getUTCHours() === 9 && new Date(c.date).getUTCMinutes() >= 0 && false) ||
                 (() => { const h=new Date(c.date).getUTCHours(),m=new Date(c.date).getUTCMinutes(); return h>15||(h===15&&m>=30); })();
  const partial = todayC.slice(0, i + 1).map(x => ({
    open: x.open, high: x.high, low: x.low, close: x.close,
    h: new Date(x.date).getUTCHours(), m: new Date(x.date).getUTCMinutes()
  }));
  const c2 = { open: c.open, high: c.high, low: c.low, close: c.close,
    h: new Date(c.date).getUTCHours(), m: new Date(c.date).getUTCMinutes() };

  let action = '';

  if (state.inTrade) {
    const trail = updateDrishtiTrail(state, c2, isEOD);
    const peakBefore = state.peakPts;
    state.peakPts   = trail.peakPts;
    state.trailStop = trail.trailStop;

    const pts   = (state.dir === 'CE' ? c.high - state.entry : state.entry - c.low);
    const close = (state.dir === 'CE' ? c.close - state.entry : state.entry - c.close);

    action = `IN ${state.dir} @ ${state.entry.toFixed(1)} | peak=${fmtP(trail.peakPts)} trail=${fmtP(trail.trailStop)} close=${fmtP(close)}`;

    if (trail.action !== 'HOLD') {
      action = `EXIT ${state.dir} | pts=${fmtP(trail.pts)} | reason=${trail.action}`;
      dayPts += trail.pts;
      if (trail.action !== 'EXIT_EOD') {
        state.lastExitPts = trail.pts;
        state.lastExitIdx = i;
        state.lastExitDir = state.dir;
      }
      state.inTrade = false; state.dir = null;
      state.peakPts = 0; state.trailStop = -SL_PTS;
    }
  } else if (tradeCount < 5 && !isEOD) {
    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prevC.map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close })));
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -SL_PTS;
      state.firstDone = true; tradeCount++;
      action = `▶ ENTER ${sig.side} @ ${c.close.toFixed(1)}  (trade #${tradeCount})`;
    } else {
      action = sig ? `signal=${sig.side} at idx=${sig.idx} (not yet)` : 'watching...';
    }
  } else if (isEOD) {
    action = 'EOD — market closed';
  }

  console.log(
    ist + ' | ' +
    fmt1(c.open) + ' ' + fmt1(c.high) + ' ' + fmt1(c.low) + ' ' + fmt1(c.close) +
    ' | ' + action
  );
}

if (state.inTrade) {
  const lastC = todayC[todayC.length - 1];
  const c2 = { open: lastC.open, high: lastC.high, low: lastC.low, close: lastC.close,
    h: new Date(lastC.date).getUTCHours(), m: new Date(lastC.date).getUTCMinutes() };
  const trail = updateDrishtiTrail(state, c2, true);
  dayPts += trail.pts;
  console.log('\n  EOD exit: ' + fmtP(trail.pts) + ' pts');
}

console.log('\n' + '═'.repeat(72));
console.log('  BACKTEST RESULT  — June 2: ' + fmtP(dayPts) + ' pts  = Rs ' + (dayPts * LOT).toFixed(0));
console.log('  BOT ACTUAL       — June 2: +105.0 pts = Rs ' + (105 * LOT).toFixed(0));
console.log('  MATCH            — ' + (Math.abs(dayPts - 105) < 1 ? '✅ YES — exact match' : '❌ DIFF: ' + (dayPts - 105).toFixed(1) + ' pts'));
console.log('═'.repeat(72));

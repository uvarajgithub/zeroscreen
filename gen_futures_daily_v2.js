'use strict';
// gen_futures_daily_v2.js
// Runs from /home/ubuntu/trading-bot — outputs futures-daily-results.json
// Uses same DRISHTI_V1 logic as bt_futures_real.js

const fs  = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require('./dist/src/drishti_strategy.js');

const LOT          = 30;
const SL_PTS       = 150;
const MAX_TRADES   = 5;
const COST_PER_TRADE = 452;

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

function simulateDay(todayCandles, prevCandles) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;
  const trades = [];

  for (let i = 0; i < todayCandles.length; i++) {
    const c     = todayCandles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts   = trail.peakPts;
      state.trailStop = trail.trailStop;
      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        trades.push({ exitPts: trail.pts, reason: trail.action });
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null;
        state.peakPts = 0; state.trailStop = -SL_PTS;
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
    trades.push({ exitPts: trail.pts, reason: 'EXIT_EOD' });
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), trades };
}

const dailyMap = {};

for (let di = 1; di < dates.length; di++) {
  const date    = dates[di];
  const today   = raw[date];
  const prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  const todayC = today.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close,
    h: c.h !== undefined ? c.h : (c.date ? new Date(c.date).getUTCHours() : 15),
    m: c.m !== undefined ? c.m : (c.date ? new Date(c.date).getUTCMinutes() : 30)
  }));
  const prevC = prevDay.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close
  }));

  const res = simulateDay(todayC, prevC);
  if (res.trades.length === 0) continue;

  const grossRs = res.dayPts * LOT;
  const costRs  = res.trades.length * COST_PER_TRADE;
  const netRs   = Math.round(grossRs - costRs);

  dailyMap[date] = {
    grossPts: res.dayPts,
    netRs,
    trades: res.trades.length
  };
}

const out = { generated: new Date().toISOString(), lot: LOT, daily: dailyMap };
fs.writeFileSync('./futures-daily-results.json', JSON.stringify(out));
console.log('Written futures-daily-results.json, days:', Object.keys(dailyMap).length);

// Spot-check monthly totals
const moCheck = {};
for (const [date, v] of Object.entries(dailyMap)) {
  const mo = date.slice(0, 7);
  moCheck[mo] = (moCheck[mo] || 0) + v.netRs;
}
for (const mo of Object.keys(moCheck).sort().slice(0, 3)) {
  const fmt = n => n.toLocaleString('en-IN');
  console.log(`  ${mo}: net ₹${fmt(moCheck[mo])}`);
}

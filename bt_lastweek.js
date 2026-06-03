'use strict';
// bt_lastweek.js — DRISHTI V1 last 7 trading days fresh backtest
const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } = require('./dist/src/drishti_strategy.js');

const MAX_TRADES = 5, DAILY_LOSS_CAP = 150, RS_PER_PT = 30;
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const allDates = Object.keys(raw).sort();

// Last 7 trading days
const lastWeek = allDates.slice(-7);
console.log('Testing dates:', lastWeek.join(', '));
console.log('PDR=prev day range  |  trades shown as DIR+pts(exit reason)');
console.log('');

let totalPts = 0, wins = 0, losses = 0, noTrades = 0;

for (const date of lastWeek) {
  const dateIdx = allDates.indexOf(date);
  if (dateIdx < 1) continue;
  const prevDate = allDates[dateIdx - 1];
  const todayCandles = raw[date];
  const prevCandles  = raw[prevDate];
  if (!todayCandles || !prevCandles) continue;

  const _pdrH = Math.max(...prevCandles.map(c => c.high));
  const _pdrL = Math.min(...prevCandles.map(c => c.low));
  const pdrOk = (_pdrH - _pdrL) >= 150;

  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;
  const trades = [];

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts = trail.peakPts;
      state.trailStop = trail.trailStop;
      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        trades.push({ pts: trail.pts, reason: trail.action, dir: state.dir });
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false;
        state.dir = null;
        state.peakPts = 0;
        state.trailStop = -150;
        if (dayPts <= -DAILY_LOSS_CAP) break;
      }
      continue;
    }

    if (isEOD || tradeCount >= MAX_TRADES) continue;

    let sig = null;
    if (state.firstDone && state.reCount < 5 && state.lastExitIdx >= 0 && state.lastExitDir) {
      const re = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
      if (re && re.idx === i) sig = { idx: re.idx, side: re.side, ctx: 'INSIDE', reason: re.reason };
    } else if (!state.firstDone) {
      if (pdrOk) sig = findDrishtiEntry(partial, prevCandles);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true;
      state.dir = sig.side;
      state.entry = c.close;
      state.entryIdx = i;
      state.trailStop = -150;
      state.peakPts = 0;
      state.firstDone = true;
      if (sig.reason.startsWith('re_')) state.reCount++;
      tradeCount++;
    }
  }

  totalPts += dayPts;
  const rs = dayPts * RS_PER_PT;
  const pdr = Math.round(_pdrH - _pdrL);
  const status = trades.length === 0 ? 'NO TRADE' : (dayPts > 0 ? 'WIN' : dayPts < 0 ? 'LOSS' : 'FLAT');
  if (trades.length === 0) noTrades++;
  else if (dayPts > 0) wins++;
  else losses++;
  const tradeStr = trades.map(t =>
    `${t.dir} ${t.pts >= 0 ? '+' : ''}${t.pts.toFixed(0)}pts (${t.reason.replace('EXIT_', '')})`
  ).join(' | ');
  console.log(`${date}  PDR=${pdr}  [${status}]  ${dayPts.toFixed(0)}pts = ₹${rs.toFixed(0)}  ${tradeStr}`);
}

console.log('');
console.log('──────────────────────────────────────────');
console.log(`TOTAL  7 days: ${totalPts.toFixed(0)} pts = ₹${(totalPts * RS_PER_PT).toFixed(0)}`);
console.log(`W / L / No-trade: ${wins} / ${losses} / ${noTrades}`);

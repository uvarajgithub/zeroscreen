'use strict';

const fs = require('fs');
const path = require('path');
const {
  findDrishtiEntry,
  findDrishtiReEntry,
  updateDrishtiTrail,
  createDrishtiState,
} = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const FROM = process.argv[2] || '2026-06-01';
const TO = process.argv[3] || '2026-06-09';
const QTY = 30;
const TRAIL_GAP = 10;
const SL_PTS = 150;
const MAX_TRADES = 5;
const DAILY_LOSS_CAP = 200;

const indexRaw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf8'));
const futMinuteRaw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_futures_minute_recent.json'), 'utf8'));

function hmKey(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function candleCloseHM(idx) {
  const total = 9 * 60 + 30 + idx * 15;
  return { h: Math.floor(total / 60), m: total % 60 };
}

function parseToday(rawDay) {
  return rawDay.slice(1).map((c, i) => {
    const hm = candleCloseHM(i);
    return {
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      h: c.h !== undefined ? c.h : hm.h,
      m: c.m !== undefined ? c.m : hm.m,
    };
  });
}

function parsePrev(rawDay) {
  return rawDay.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
}

function minuteMapForDate(date) {
  const arr = futMinuteRaw[date] || [];
  const map = new Map();
  for (const c of arr) {
    map.set(hmKey(c.h, c.m), c.close);
  }
  return map;
}

function minuteSliceForCandle(allMinutes, ci) {
  const close = candleCloseHM(ci);
  const startMin = close.h * 60 + close.m - 14;
  const endMin = close.h * 60 + close.m;
  return allMinutes.filter(m => {
    const t = m.h * 60 + m.m;
    return t >= startMin && t <= endMin;
  });
}

function pdrOk(prev) {
  const h = Math.max(...prev.map(c => c.high));
  const l = Math.min(...prev.map(c => c.low));
  return h > 0 && l > 0 && (h - l) >= 150;
}

function runMode(date, today, prev, mode) {
  const minuteArr = futMinuteRaw[date] || [];
  if (!minuteArr.length) return null;

  const futMap = minuteMapForDate(date);
  const state = createDrishtiState();
  let dayIdxPts = 0;
  let dayFutRs = 0;
  let tradeCount = 0;

  for (let i = 0; i < today.length; i++) {
    const c = today[i];
    const isEOD = i === today.length - 1;
    const partial = today.slice(0, i + 1);

    if (state.inTrade) {
      if (mode === 'close') {
        const tr = updateDrishtiTrail(state, c, isEOD);
        state.peakPts = tr.peakPts;
        state.trailStop = tr.trailStop;
        if (tr.action !== 'HOLD') {
          dayIdxPts += tr.pts;

          const eKey = hmKey(state._entryH, state._entryM);
          const xKey = hmKey(c.h, c.m);
          const futEntry = futMap.get(eKey);
          const futExit = futMap.get(xKey);
          if (futEntry !== undefined && futExit !== undefined) {
            const fpts = state.dir === 'CE' ? (futExit - futEntry) : (futEntry - futExit);
            dayFutRs += fpts * QTY;
          }

          if (tr.action !== 'EXIT_EOD') {
            state.lastExitPts = tr.pts;
            state.lastExitIdx = i;
            state.lastExitDir = state.dir;
          }
          state.inTrade = false;
          state.dir = null;
          state.peakPts = 0;
          state.trailStop = -SL_PTS;
          if (dayIdxPts <= -DAILY_LOSS_CAP) break;
        }
      } else {
        const mins = minuteSliceForCandle(minuteArr, i);
        let exited = false;
        const sign = state.dir === 'CE' ? 1 : -1;

        for (const m of mins) {
          const futNow = m.close;
          const favPts = sign * (futNow - state._futEntry);
          if (favPts > state.peakPts) {
            state.peakPts = favPts;
            state.trailStop = state.peakPts >= TRAIL_GAP ? state.peakPts - TRAIL_GAP : -SL_PTS;
          }

          const curPts = sign * (futNow - state._futEntry);
          if (curPts <= state.trailStop || isEOD) {
            const exitPts = isEOD ? curPts : state.trailStop;
            dayIdxPts += exitPts;
            dayFutRs += exitPts * QTY;

            if (!isEOD) {
              state.lastExitPts = exitPts;
              state.lastExitIdx = i;
              state.lastExitDir = state.dir;
            }
            state.inTrade = false;
            state.dir = null;
            state.peakPts = 0;
            state.trailStop = -SL_PTS;
            exited = true;
            break;
          }
        }
        if (exited && dayIdxPts <= -DAILY_LOSS_CAP) break;
      }
      continue;
    }

    if (tradeCount >= MAX_TRADES || isEOD || dayIdxPts <= -DAILY_LOSS_CAP) continue;

    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prev);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true;
      state.dir = sig.side;
      state.entry = c.close;
      state.entryIdx = i;
      state.peakPts = 0;
      state.trailStop = -SL_PTS;
      state.firstDone = true;
      state._entryH = c.h;
      state._entryM = c.m;
      const eKey = hmKey(c.h, c.m);
      state._futEntry = futMap.get(eKey);
      if (state._futEntry === undefined) {
        state.inTrade = false;
        state.dir = null;
        continue;
      }
      tradeCount++;
    }
  }

  return {
    traded: tradeCount > 0,
    wins: dayFutRs > 0 ? 1 : 0,
    losses: dayFutRs < 0 ? 1 : 0,
    flat: dayFutRs === 0 ? 1 : 0,
    futRs: dayFutRs,
  };
}

const dates = Object.keys(indexRaw).sort().filter(d => d >= FROM && d <= TO);
let closeDays = 0, closeWins = 0, closeLoss = 0, closeFlat = 0, closeRs = 0;
let intraDays = 0, intraWins = 0, intraLoss = 0, intraFlat = 0, intraRs = 0;

for (let di = 1; di < dates.length; di++) {
  const date = dates[di];
  const todayRaw = indexRaw[date];
  const prevRaw = indexRaw[dates[di - 1]];
  if (!todayRaw || !prevRaw || todayRaw.length < 5 || prevRaw.length < 5) continue;

  const today = parseToday(todayRaw);
  const prev = parsePrev(prevRaw);
  if (!pdrOk(prev)) continue;
  if (!futMinuteRaw[date]) continue;

  const closeRes = runMode(date, today, prev, 'close');
  const intraRes = runMode(date, today, prev, 'intrabar');
  if (!closeRes || !intraRes) continue;

  if (closeRes.traded) {
    closeDays++;
    closeWins += closeRes.wins;
    closeLoss += closeRes.losses;
    closeFlat += closeRes.flat;
    closeRs += closeRes.futRs;
  }
  if (intraRes.traded) {
    intraDays++;
    intraWins += intraRes.wins;
    intraLoss += intraRes.losses;
    intraFlat += intraRes.flat;
    intraRs += intraRes.futRs;
  }
}

const closeWr = closeDays ? (closeWins / closeDays * 100) : 0;
const intraWr = intraDays ? (intraWins / intraDays * 100) : 0;

console.log('=== Exit Compare (real futures minute cache) ===');
console.log(`Range: ${FROM} to ${TO}`);
console.log(`Close-exit: days=${closeDays} W/L/F=${closeWins}/${closeLoss}/${closeFlat} WR=${closeWr.toFixed(2)}% Rs=${Math.round(closeRs).toLocaleString('en-IN')}`);
console.log(`Intrabar-exit: days=${intraDays} W/L/F=${intraWins}/${intraLoss}/${intraFlat} WR=${intraWr.toFixed(2)}% Rs=${Math.round(intraRs).toLocaleString('en-IN')}`);
console.log(`Delta (intrabar-close): WR ${(intraWr - closeWr).toFixed(2)}% | Rs ${Math.round(intraRs - closeRs).toLocaleString('en-IN')}`);

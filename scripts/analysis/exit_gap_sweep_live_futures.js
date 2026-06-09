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
const GAPS = (process.argv[4] || '5,10,15,20,25,30').split(',').map(n => Number(n.trim())).filter(n => Number.isFinite(n) && n > 0);
const QTY = 30;
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

function pdrOk(prev) {
  const h = Math.max(...prev.map(c => c.high));
  const l = Math.min(...prev.map(c => c.low));
  return h > 0 && l > 0 && (h - l) >= 150;
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

function runDay(date, today, prev, trailGap) {
  const minuteArr = futMinuteRaw[date] || [];
  if (!minuteArr.length) return null;

  const futMap = minuteMapForDate(date);
  const state = createDrishtiState();
  let dayRs = 0;
  let tradeCount = 0;

  for (let i = 0; i < today.length; i++) {
    const c = today[i];
    const isEOD = i === today.length - 1;
    const partial = today.slice(0, i + 1);

    if (state.inTrade) {
      const mins = minuteSliceForCandle(minuteArr, i);
      let exited = false;
      const sign = state.dir === 'CE' ? 1 : -1;

      for (const m of mins) {
        const futNow = m.close;
        const favPts = sign * (futNow - state._futEntry);
        if (favPts > state.peakPts) {
          state.peakPts = favPts;
          state.trailStop = state.peakPts >= trailGap ? state.peakPts - trailGap : -SL_PTS;
        }

        const curPts = sign * (futNow - state._futEntry);
        if (isEOD || curPts <= state.trailStop) {
          const exitPts = isEOD ? curPts : state.trailStop;
          dayRs += exitPts * QTY;
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
      if (exited && dayRs <= -DAILY_LOSS_CAP) break;
      continue;
    }

    if (tradeCount >= MAX_TRADES || isEOD || dayRs <= -DAILY_LOSS_CAP) continue;

    let sig = null;
    if (!state.firstDone) {
      if (!pdrOk(prev)) continue;
      sig = findDrishtiEntry(partial, prev);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      const eKey = hmKey(c.h, c.m);
      const futEntry = futMap.get(eKey);
      if (futEntry === undefined) continue;

      state.inTrade = true;
      state.dir = sig.side;
      state.entry = c.close;
      state.entryIdx = i;
      state.peakPts = 0;
      state.trailStop = -SL_PTS;
      state.firstDone = true;
      state._futEntry = futEntry;
      tradeCount++;
    }
  }

  return { traded: tradeCount > 0, rs: dayRs };
}

const dates = Object.keys(indexRaw).sort().filter(d => d >= FROM && d <= TO);
const results = {};
for (const g of GAPS) results[g] = { days: 0, wins: 0, losses: 0, flat: 0, rs: 0 };

let baseline = { days: 0, wins: 0, losses: 0, flat: 0, rs: 0 };

for (let di = 1; di < dates.length; di++) {
  const date = dates[di];
  const todayRaw = indexRaw[date];
  const prevRaw = indexRaw[dates[di - 1]];
  if (!todayRaw || !prevRaw || todayRaw.length < 5 || prevRaw.length < 5) continue;

  const today = parseToday(todayRaw);
  const prev = parsePrev(prevRaw);
  if (!pdrOk(prev)) continue;
  if (!futMinuteRaw[date]) continue;

  const baseRes = runDay(date, today, prev, 10);
  if (!baseRes || !baseRes.traded) continue;
  baseline.days++;
  baseline.rs += baseRes.rs;
  if (baseRes.rs > 0) baseline.wins++; else if (baseRes.rs < 0) baseline.losses++; else baseline.flat++;

  for (const g of GAPS) {
    const r = runDay(date, today, prev, g);
    if (!r || !r.traded) continue;
    const s = results[g];
    s.days++;
    s.rs += r.rs;
    if (r.rs > 0) s.wins++; else if (r.rs < 0) s.losses++; else s.flat++;
  }
}

function wr(s) {
  const d = s.wins + s.losses + s.flat;
  return d ? (s.wins / d * 100) : 0;
}

console.log('=== Exit Trail Gap Sweep (real futures minute cache) ===');
console.log(`Range: ${FROM} to ${TO}`);
console.log(`Baseline close-exit: days=${baseline.days} W/L/F=${baseline.wins}/${baseline.losses}/${baseline.flat} WR=${wr(baseline).toFixed(2)}% Rs=${Math.round(baseline.rs).toLocaleString('en-IN')}`);
for (const g of GAPS) {
  const s = results[g];
  console.log(`Gap ${g}: days=${s.days} W/L/F=${s.wins}/${s.losses}/${s.flat} WR=${wr(s).toFixed(2)}% Rs=${Math.round(s.rs).toLocaleString('en-IN')} | deltaRs=${Math.round(s.rs - baseline.rs).toLocaleString('en-IN')}`);
}

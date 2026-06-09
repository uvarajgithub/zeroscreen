'use strict';

const fs = require('fs');
const path = require('path');
const { KiteConnect } = require('kiteconnect');
require('dotenv').config({ path: process.env.TRADING_BOT_ENV_PATH || path.join(process.cwd(), '.env') });

const {
  findDrishtiEntry,
  findDrishtiReEntry,
  updateDrishtiTrail,
  createDrishtiState,
} = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const TOKEN = 260105;
const FROM = process.argv[2] || '2026-01-01';
const TO = process.argv[3] || '2026-06-09';
const HOLD_MIN = Number(process.argv[4] || 2);

const MAX_TRADES = 5;
const DAILY_LOSS_CAP = 200;

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

function toMin(h, m) {
  return h * 60 + m;
}

function istHM(d) {
  const x = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000);
  return { h: x.getUTCHours(), m: x.getUTCMinutes() };
}

function slotFromMinute(h, m) {
  const t = toMin(h, m);
  const start = 9 * 60 + 30;
  const end = 15 * 60 + 15;
  if (t < start || t > end) return -1;
  return Math.floor((t - start) / 15);
}

function dayCandlesFromCache(dayRaw) {
  return dayRaw.slice(1).map((c, i) => {
    const totalMin = 9 * 60 + 30 + i * 15;
    return {
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      h: c.h !== undefined ? c.h : Math.floor(totalMin / 60),
      m: c.m !== undefined ? c.m : totalMin % 60,
    };
  });
}

function prevCandlesFromCache(prevRaw) {
  return prevRaw.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
}

function guardedFirstEntryFrom1m(oneMin, prev15m, holdMin) {
  const agg = [];

  for (const c of oneMin) {
    const hm = istHM(c.date);
    const slot = slotFromMinute(hm.h, hm.m);
    if (slot < 0 || slot > 23) continue;

    if (!agg[slot]) {
      agg[slot] = { open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      agg[slot].high = Math.max(agg[slot].high, c.high);
      agg[slot].low = Math.min(agg[slot].low, c.low);
      agg[slot].close = c.close;
    }

    const slotStartMin = (9 * 60 + 30) + slot * 15;
    const curMin = toMin(hm.h, hm.m);
    if (curMin < slotStartMin + holdMin) continue;

    const snap = [];
    for (let i = 0; i <= slot; i++) {
      if (agg[i]) snap.push({ ...agg[i] });
      else break;
    }
    if (snap.length === 0) continue;

    const sig = findDrishtiEntry(snap, prev15m);
    if (sig && sig.idx === slot) {
      return { idx: slot, side: sig.side, entry: c.close };
    }
  }

  return null;
}

function simulateDay(todayCandles, prevCandles, mode, firstEntryOverride) {
  const state = createDrishtiState();
  let tradeCount = 0;
  let dayPts = 0;

  const pdrHigh = prevCandles.length > 0 ? Math.max(...prevCandles.map(c => c.high)) : 0;
  const pdrLow = prevCandles.length > 0 ? Math.min(...prevCandles.map(c => c.low)) : 0;
  const pdrOk = pdrHigh > 0 && pdrLow > 0 && (pdrHigh - pdrLow) >= 150;

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h !== undefined
      ? (c.h > 15 || (c.h === 15 && c.m >= 15))
      : (i === todayCandles.length - 1);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
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

    if (tradeCount >= MAX_TRADES || isEOD || dayPts <= -DAILY_LOSS_CAP) continue;

    let sig = null;
    let entryPrice = c.close;

    if (!state.firstDone) {
      if (!pdrOk) continue;
      if (mode === 'guarded' && firstEntryOverride && firstEntryOverride.idx === i) {
        sig = { idx: i, side: firstEntryOverride.side };
        entryPrice = firstEntryOverride.entry;
      } else {
        sig = findDrishtiEntry(partial, prevCandles);
      }
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true;
      state.dir = sig.side;
      state.entry = entryPrice;
      state.entryIdx = i;
      state.peakPts = 0;
      state.trailStop = -150;
      state.firstDone = true;
      tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    dayPts += trail.pts;
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), traded: tradeCount > 0 };
}

function initSummary() {
  return {
    days: 0,
    tradedDays: 0,
    wins: 0,
    losses: 0,
    flat: 0,
    totalPts: 0,
  };
}

function updateSummary(sum, dayPts, traded) {
  sum.days++;
  if (!traded) return;
  sum.tradedDays++;
  sum.totalPts += dayPts;
  if (dayPts > 0) sum.wins++;
  else if (dayPts < 0) sum.losses++;
  else sum.flat++;
}

function wrPct(w, l, f) {
  const d = w + l + f;
  return d > 0 ? (w / d * 100) : 0;
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf8'));
  const dates = Object.keys(raw).sort().filter(d => d >= FROM && d <= TO);

  const base = initSummary();
  const guard = initSummary();
  const perDay = [];

  let oneMinFetchFail = 0;

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = dates[i - 1];
    const todayRaw = raw[date];
    const prevRaw = raw[prevDate];
    if (!todayRaw || !prevRaw || todayRaw.length < 5 || prevRaw.length < 5) continue;

    const todayCandles = dayCandlesFromCache(todayRaw);
    const prevCandles = prevCandlesFromCache(prevRaw);

    const baseDay = simulateDay(todayCandles, prevCandles, 'baseline', null);

    let firstOverride = null;
    try {
      const oneMin = await kite.getHistoricalData(TOKEN, 'minute', date, date, false);
      firstOverride = guardedFirstEntryFrom1m(oneMin, prevCandles, HOLD_MIN);
    } catch (_) {
      oneMinFetchFail++;
    }

    const guardDay = simulateDay(todayCandles, prevCandles, 'guarded', firstOverride);

    updateSummary(base, baseDay.dayPts, baseDay.traded);
    updateSummary(guard, guardDay.dayPts, guardDay.traded);

    perDay.push({
      date,
      baseline: baseDay.dayPts,
      guarded: guardDay.dayPts,
      diff: parseFloat((guardDay.dayPts - baseDay.dayPts).toFixed(1)),
    });
  }

  const betterDays = perDay.filter(d => d.diff > 0).length;
  const worseDays = perDay.filter(d => d.diff < 0).length;
  const sameDays = perDay.filter(d => d.diff === 0).length;

  const baseWr = wrPct(base.wins, base.losses, base.flat);
  const guardWr = wrPct(guard.wins, guard.losses, guard.flat);

  console.log('=== Full Backtest Compare: Baseline vs Guarded Intrabar First Entry ===');
  console.log(`Range: ${FROM} to ${TO}`);
  console.log(`Guard holdMin: ${HOLD_MIN}`);
  console.log(`1-minute fetch failures: ${oneMinFetchFail}`);

  console.log('\nBaseline');
  console.log(`  Traded days: ${base.tradedDays}`);
  console.log(`  Wins/Loss/Flat: ${base.wins}/${base.losses}/${base.flat}`);
  console.log(`  Success rate: ${baseWr.toFixed(2)}%`);
  console.log(`  Total PnL: ${base.totalPts.toFixed(1)} pts`);

  console.log('\nGuarded (intrabar first entry only)');
  console.log(`  Traded days: ${guard.tradedDays}`);
  console.log(`  Wins/Loss/Flat: ${guard.wins}/${guard.losses}/${guard.flat}`);
  console.log(`  Success rate: ${guardWr.toFixed(2)}%`);
  console.log(`  Total PnL: ${guard.totalPts.toFixed(1)} pts`);

  console.log('\nDelta (Guarded - Baseline)');
  console.log(`  Success rate delta: ${(guardWr - baseWr).toFixed(2)}%`);
  console.log(`  PnL delta: ${(guard.totalPts - base.totalPts).toFixed(1)} pts`);
  console.log(`  Better/Worse/Same days: ${betterDays}/${worseDays}/${sameDays}`);

  const worst = perDay.slice().sort((a, b) => a.diff - b.diff).slice(0, 5);
  const best = perDay.slice().sort((a, b) => b.diff - a.diff).slice(0, 5);

  console.log('\nWorst guarded-vs-baseline days');
  for (const d of worst) {
    console.log(`  ${d.date}  base:${d.baseline.toFixed(1)}  guard:${d.guarded.toFixed(1)}  diff:${d.diff.toFixed(1)}`);
  }

  console.log('\nBest guarded-vs-baseline days');
  for (const d of best) {
    console.log(`  ${d.date}  base:${d.baseline.toFixed(1)}  guard:${d.guarded.toFixed(1)}  diff:+${d.diff.toFixed(1)}`);
  }
})();

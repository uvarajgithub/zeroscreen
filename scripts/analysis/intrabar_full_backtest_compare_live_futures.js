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

const INDEX_TOKEN = 260105;
const FROM = process.argv[2] || '2026-05-01';
const TO = process.argv[3] || '2026-06-09';
const HOLD_MIN = Number(process.argv[4] || 2);
const QTY = 30;

const MAX_TRADES = 5;
const DAILY_LOSS_CAP = 200;
const FUT_MINUTE_CACHE_PATH = path.join(process.cwd(), 'cache', 'banknifty_futures_minute_recent.json');

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

function toMin(h, m) {
  return h * 60 + m;
}

function istHM(d) {
  const x = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000);
  return { h: x.getUTCHours(), m: x.getUTCMinutes() };
}

function candleHM(c) {
  if (c && c.h !== undefined && c.m !== undefined) {
    return { h: c.h, m: c.m };
  }
  return istHM(c.date);
}

function hmKey(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
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
    const hm = candleHM(c);
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
      return { idx: slot, side: sig.side, entry: c.close, h: hm.h, m: hm.m };
    }
  }

  return null;
}

function getExitTimestamp(candle) {
  return { h: candle.h, m: candle.m };
}

function simulateDay(todayCandles, prevCandles, mode, firstEntryOverride) {
  const state = createDrishtiState();
  let tradeCount = 0;
  let dayPts = 0;
  const trades = [];

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
        trades.push({
          side: state.dir,
          entryH: state._entryH,
          entryM: state._entryM,
          exitH: getExitTimestamp(c).h,
          exitM: getExitTimestamp(c).m,
          idxPts: trail.pts,
        });

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
    let entryH = c.h;
    let entryM = c.m;

    if (!state.firstDone) {
      if (!pdrOk) continue;
      if (mode === 'guarded' && firstEntryOverride && firstEntryOverride.idx === i) {
        sig = { idx: i, side: firstEntryOverride.side };
        entryH = firstEntryOverride.h;
        entryM = firstEntryOverride.m;
      } else {
        sig = findDrishtiEntry(partial, prevCandles);
      }
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true;
      state.dir = sig.side;
      state.entry = c.close;
      state.entryIdx = i;
      state.peakPts = 0;
      state.trailStop = -150;
      state.firstDone = true;
      state._entryH = entryH;
      state._entryM = entryM;
      tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    dayPts += trail.pts;
    trades.push({
      side: state.dir,
      entryH: state._entryH,
      entryM: state._entryM,
      exitH: lastC.h,
      exitM: lastC.m,
      idxPts: trail.pts,
    });
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), traded: tradeCount > 0, trades };
}

function initSummary() {
  return { days: 0, tradedDays: 0, wins: 0, losses: 0, flat: 0, totalPts: 0, totalRs: 0 };
}

function wrPct(w, l, f) {
  const d = w + l + f;
  return d > 0 ? (w / d * 100) : 0;
}

async function getFuturesToken() {
  const all = await kite.getInstruments('NFO');
  const toDate = new Date(`${TO}T00:00:00+05:30`);
  const futs = all
    .filter(x => x.segment === 'NFO-FUT' && x.name === 'BANKNIFTY' && String(x.tradingsymbol || '').endsWith('FUT'))
    .map(x => ({ ...x, exp: new Date(x.expiry) }))
    .filter(x => x.exp >= toDate)
    .sort((a, b) => a.exp - b.exp);

  if (!futs.length) throw new Error('No BANKNIFTY futures contract found for range');
  return futs[0];
}

function mapMinuteCandlesByHm(oneMinFut) {
  const map = new Map();
  for (const c of oneMinFut) {
    const hm = candleHM(c);
    map.set(hmKey(hm.h, hm.m), c.close);
  }
  return map;
}

function realizedFuturesRs(trades, futMap) {
  let rs = 0;
  for (const t of trades) {
    const entry = futMap.get(hmKey(t.entryH, t.entryM));
    const exit = futMap.get(hmKey(t.exitH, t.exitM));
    if (entry === undefined || exit === undefined) return null;
    const pts = t.side === 'CE' ? (exit - entry) : (entry - exit);
    rs += pts * QTY;
  }
  return rs;
}

function loadFuturesMinuteCache() {
  if (!fs.existsSync(FUT_MINUTE_CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(FUT_MINUTE_CACHE_PATH, 'utf8'));
  } catch (_) {
    return null;
  }
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf8'));
  const dates = Object.keys(raw).sort().filter(d => d >= FROM && d <= TO);
  const futMinuteCache = loadFuturesMinuteCache();

  const futContract = await getFuturesToken();
  console.log(`Using futures contract: ${futContract.tradingsymbol} (${futContract.instrument_token})`);
  console.log(`Minute cache: ${futMinuteCache ? 'available' : 'missing'}`);

  const base = initSummary();
  const guard = initSummary();
  const perDay = [];

  let oneMinIndexFail = 0;
  let oneMinFutFail = 0;
  let futMissingTs = 0;

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = dates[i - 1];
    const todayRaw = raw[date];
    const prevRaw = raw[prevDate];
    if (!todayRaw || !prevRaw || todayRaw.length < 5 || prevRaw.length < 5) continue;

    const todayCandles = dayCandlesFromCache(todayRaw);
    const prevCandles = prevCandlesFromCache(prevRaw);

    let oneMinIndex = null;
    try {
      oneMinIndex = await kite.getHistoricalData(INDEX_TOKEN, 'minute', date, date, false);
    } catch (_) {
      oneMinIndexFail++;
    }

    let oneMinFut = null;
    if (futMinuteCache && futMinuteCache[date]) {
      oneMinFut = futMinuteCache[date];
    } else {
      try {
        oneMinFut = await kite.getHistoricalData(futContract.instrument_token, 'minute', date, date, false);
      } catch (_) {
        oneMinFutFail++;
        continue;
      }
    }
    const futMap = mapMinuteCandlesByHm(oneMinFut);

    const firstOverride = oneMinIndex ? guardedFirstEntryFrom1m(oneMinIndex, prevCandles, HOLD_MIN) : null;

    const baseDay = simulateDay(todayCandles, prevCandles, 'baseline', null);
    const guardDay = simulateDay(todayCandles, prevCandles, 'guarded', firstOverride);

    const baseRs = realizedFuturesRs(baseDay.trades, futMap);
    const guardRs = realizedFuturesRs(guardDay.trades, futMap);
    if (baseRs === null || guardRs === null) {
      futMissingTs++;
      continue;
    }

    base.days++;
    guard.days++;

    if (baseDay.traded) {
      base.tradedDays++;
      base.totalPts += baseDay.dayPts;
      base.totalRs += baseRs;
      if (baseRs > 0) base.wins++; else if (baseRs < 0) base.losses++; else base.flat++;
    }
    if (guardDay.traded) {
      guard.tradedDays++;
      guard.totalPts += guardDay.dayPts;
      guard.totalRs += guardRs;
      if (guardRs > 0) guard.wins++; else if (guardRs < 0) guard.losses++; else guard.flat++;
    }

    perDay.push({
      date,
      baselineRs: baseRs,
      guardedRs: guardRs,
      diffRs: guardRs - baseRs,
    });
  }

  const baseWr = wrPct(base.wins, base.losses, base.flat);
  const guardWr = wrPct(guard.wins, guard.losses, guard.flat);

  const betterDays = perDay.filter(d => d.diffRs > 0).length;
  const worseDays = perDay.filter(d => d.diffRs < 0).length;
  const sameDays = perDay.filter(d => d.diffRs === 0).length;

  console.log('\n=== Live-Futures Priced Compare (no index-point PnL) ===');
  console.log(`Range: ${FROM} to ${TO}`);
  console.log(`Guard holdMin: ${HOLD_MIN}`);
  console.log(`Index 1m fetch failures: ${oneMinIndexFail}`);
  console.log(`Futures 1m fetch failures: ${oneMinFutFail}`);
  console.log(`Skipped days (missing futures timestamps): ${futMissingTs}`);

  console.log('\nBaseline');
  console.log(`  Traded days: ${base.tradedDays}`);
  console.log(`  Wins/Loss/Flat: ${base.wins}/${base.losses}/${base.flat}`);
  console.log(`  Success rate (futures Rs): ${baseWr.toFixed(2)}%`);
  console.log(`  Total futures PnL: Rs ${Math.round(base.totalRs).toLocaleString('en-IN')}`);

  console.log('\nGuarded');
  console.log(`  Traded days: ${guard.tradedDays}`);
  console.log(`  Wins/Loss/Flat: ${guard.wins}/${guard.losses}/${guard.flat}`);
  console.log(`  Success rate (futures Rs): ${guardWr.toFixed(2)}%`);
  console.log(`  Total futures PnL: Rs ${Math.round(guard.totalRs).toLocaleString('en-IN')}`);

  console.log('\nDelta (Guarded - Baseline)');
  console.log(`  Success rate delta: ${(guardWr - baseWr).toFixed(2)}%`);
  console.log(`  Futures PnL delta: Rs ${Math.round(guard.totalRs - base.totalRs).toLocaleString('en-IN')}`);
  console.log(`  Better/Worse/Same days: ${betterDays}/${worseDays}/${sameDays}`);
})();

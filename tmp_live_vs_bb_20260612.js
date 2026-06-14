const { KiteConnect } = require('kiteconnect');
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const strategy = require('/home/ubuntu/trading-bot/dist/src/drishti_strategy.js');
const QTY = 30;
const BB_PERIOD = 20;
const BB_STDDEV = 2;
const BODY_THRESH = 50;
const SL_PTS = 100;
const MAX_TRADES = 8;
const DAILY_LOSS_CAP = 200;

function bodyPct(c) {
  return (c.high === c.low) ? 0 : ((c.close - c.open) / (c.high - c.low)) * 100;
}

function computeBB(closes, period, mult) {
  const out = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      out.push(null);
      continue;
    }
    const w = closes.slice(i - period + 1, i + 1);
    const mean = w.reduce((a, b) => a + b, 0) / period;
    const varr = w.reduce((a, b) => a + (b - mean) * (b - mean), 0) / period;
    const sd = Math.sqrt(varr);
    const upper = mean + mult * sd;
    const lower = mean - mult * sd;
    const pctB = upper === lower ? null : (closes[i] - lower) / (upper - lower);
    out.push({ basis: mean, upper, lower, pctB });
  }
  return out;
}

function toIstDate(dt) {
  const d = new Date(dt);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function simulateBB(candles, date) {
  const today = candles.filter(c => c.date === date);
  const prev = candles.filter(c => c.date === '2026-06-11');
  if (today.length === 0 || prev.length === 0) {
    return { points: null, reason: 'insufficient_data', trades: [] };
  }

  const closes = candles.map(c => c.close);
  const bb = computeBB(closes, BB_PERIOD, BB_STDDEV);
  const startIdx = candles.findIndex(c => c.date === date);
  const firstIdx = startIdx;
  const lastIdx = startIdx + today.length - 1;

  let bias = null;
  const prevLast = bb[startIdx - 1];
  if (prevLast && prevLast.pctB != null) {
    if (prevLast.pctB >= 1) bias = 'CE';
    else if (prevLast.pctB <= 0) bias = 'PE';
  }
  if (!bias) {
    for (let i = firstIdx; i <= Math.min(firstIdx + 2, lastIdx); i++) {
      const p = bb[i];
      if (!p || p.pctB == null) continue;
      if (p.pctB >= 1) { bias = 'CE'; break; }
      if (p.pctB <= 0) { bias = 'PE'; break; }
    }
  }

  if (!bias) {
    return { points: 0, reason: 'no_bias', trades: [] };
  }

  const sign = bias === 'CE' ? 1 : -1;
  let entryIdx = -1;
  for (let i = firstIdx; i <= lastIdx; i++) {
    const bp = bodyPct(today[i - firstIdx]);
    if (bias === 'CE' && bp >= BODY_THRESH) { entryIdx = i; break; }
    if (bias === 'PE' && bp <= -BODY_THRESH) { entryIdx = i; break; }
  }
  if (entryIdx < 0) {
    return { points: 0, reason: 'no_entry_body', bias, trades: [] };
  }

  const entry = candles[entryIdx].close;
  let exitIdx = -1;
  let exitType = 'EOD';
  let points = 0;
  for (let i = entryIdx + 1; i <= lastIdx; i++) {
    const c = candles[i];
    const raw = sign * (c.close - entry);
    if (raw <= -SL_PTS) {
      points = -SL_PTS;
      exitType = 'SL';
      exitIdx = i;
      break;
    }
    if (i === lastIdx) {
      points = raw;
      exitIdx = i;
    }
  }

  const trade = {
    direction: bias,
    entryIdx,
    entryTime: candles[entryIdx].time,
    entry,
    exitIdx,
    exitTime: candles[exitIdx].time,
    exitType,
    points: Number(points.toFixed(4)),
    reason: 'BB%_trend_continuation',
  };

  return {
    points: Number(points.toFixed(4)),
    trades: [trade],
    reason: `bias_${bias}`,
  };
}

function simulateLive(today, prev) {
  const state = strategy.createDrishtiState();
  const trades = [];
  let dayPts = 0;
  let tradeCount = 0;

  const isEOD = (_i) => _i >= today.length - 1;
  const _p = (c) => {
    if (!c || c.high === undefined) return 0;
    return (c.high - c.low) > 0 ? ((c.close - c.open) / (c.high - c.low)) * 100 : 0;
  };

  // PDR filter
  let pdrOk = false;
  if (prev && prev.length >= 3) {
    const h = Math.max(...prev.map(c => c.high));
    const l = Math.min(...prev.map(c => c.low));
    if (h > 0 && l > 0 && (h - l) >= 150) pdrOk = true;
  }

  for (let i = 0; i < today.length; i++) {
    const c = today[i];
    const slice = today.slice(0, i + 1);

    if (state.inTrade) {
      const tr = strategy.updateDrishtiTrail(state, c, isEOD(i));
      state.peakPts = tr.peakPts;
      state.trailStop = tr.trailStop;
      if (tr.action !== 'HOLD') {
        dayPts += tr.pts;
        trades.push({
          action: tr.action,
          dir: state.dir,
          entryIdx: state.entryIdx,
          exitIdx: i,
          entry: state.entry,
          exit: tr.exitPrice,
          points: Number(tr.pts.toFixed(4)),
          reason: tr.reason || null,
        });
        state.inTrade = false;
        state.isTrendEntry = false;
        state.lastExitIdx = i;
        state.lastExitDir = trades[trades.length - 1].dir;
        state.lastExitPts = tr.pts;
        state.dir = null;
        state.entry = 0;
        state.entryIdx = -1;
        state.trailStop = -100;
        state.peakPts = 0;
        if (tradeCount >= 0 && state.reCount !== undefined && !Number.isNaN(state.reCount)) {
          // keep
        }
      }
      continue;
    }

    if (!pdrOk || tradeCount >= MAX_TRADES || isEOD(i)) continue;
    if (dayPts <= -DAILY_LOSS_CAP) continue;

    let sig = null;
    if (!state.firstDone) {
      sig = strategy.findDrishtiEntry(slice, prev);
      if (sig && sig.idx !== i) sig = null;
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = strategy.findDrishtiReEntry(slice, state.lastExitIdx, state.lastExitDir, true, prev);
      if (sig && sig.idx !== i) sig = null;
    }

    if (!sig) continue;

    state.inTrade = true;
    state.dir = sig.side;
    state.entry = c.close;
    state.entryIdx = i;
    state.peakPts = 0;
    state.trailStop = -SL_PTS;
    state.firstDone = true;
    tradeCount++;
    if (tradeCount > 1) state.reCount = (state.reCount || 0) + 1;
    trades.push({
      action: 'ENTRY',
      dir: state.dir,
      idx: i,
      reason: sig.reason || null,
      close: c.close,
      bodyPct: Number(_p(c).toFixed(2)),
    });

    if (strategy && typeof strategy.isTrendDayEntry === 'function') {
      state.trendEntry = !!strategy.isTrendDayEntry(sig.reason || '');
    }
  }

  if (state.inTrade) {
    const i = today.length - 1;
    const tr = strategy.updateDrishtiTrail(state, today[i], true);
    if (tr.action !== 'HOLD') {
      dayPts += tr.pts;
      trades.push({
        action: tr.action,
        dir: state.dir,
        entryIdx: state.entryIdx,
        exitIdx: i,
        entry: state.entry,
        exit: tr.exitPrice,
        points: Number(tr.pts.toFixed(4)),
        reason: tr.reason || null,
      });
    }
  }

  const entryTrades = trades.filter(t => t.action === 'ENTRY');
  return {
    points: Number(dayPts.toFixed(4)),
    trades: trades.length,
    reEntries: Math.max(0, entryTrades.length - 1),
    details: trades,
  };
}

(async () => {
  const token = 15955458;
  const start = '2026-05-25 09:15:00';
  const end = '2026-06-12 15:30:00';
  const rows = await kite.getHistoricalData(token, '15minute', start, end);
  const all = rows.map(c => ({
    time: c.date,
    date: toIstDate(c.date),
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));

  const forBB = simulateBB(all, '2026-06-12');
  const prev = all
    .filter(c => c.date === '2026-06-11')
    .map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
  const today = all
    .filter(c => c.date === '2026-06-12')
    .map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));

  const forLive = simulateLive(today, prev);

  console.log('DATE=2026-06-12');
  console.log(`BB_PTS=${forBB.points}`);
  console.log(`BB_Rs=${forBB.points == null ? 'NA' : Math.round(forBB.points * QTY)}`);
  console.log(`BB_TRADES=${(forBB.trades || []).length}`);
  console.log(`BB_REASON=${forBB.reason}`);

  console.log(`LIVE_PTS=${forLive.points}`);
  console.log(`LIVE_Rs=${Math.round(forLive.points * QTY)}`);
  console.log(`LIVE_TRADES=${forLive.trades}`);
  console.log(`LIVE_RE=${forLive.reEntries}`);
  console.log('BB_TRADE=' + JSON.stringify(forBB.trades || []));
  console.log('LIVE_DETAIL=' + JSON.stringify(forLive.details));
})();

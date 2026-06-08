'use strict';

const fs = require('fs');
const path = require('path');
const {
  findDrishtiEntry,
  findDrishtiReEntry,
  updateDrishtiTrail,
  createDrishtiState,
} = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const QTY = 30;
const MAX_TRADES = 5;
const DAILY_LOSS_CAP_PTS = 200;
const REAL_DAILY_LOSS_CAP_RS = 6000;
const REAL_ENTRY_BLOCK_RS = 4500;
const REAL_FUTURES_SL_PTS = 150;
const REAL_OPTIONS_SL_PTS = 150;
const SPREAD_OPT = 3;      // points per side
const SPREAD_FUT = 3;      // futures points round-trip approximation
const BROKERAGE_OPT = 80;  // rough round-trip charges per option trade
const BROKERAGE_FUT = 272; // rough round-trip futures charges excl. slippage

const indexRaw = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf8'));
const futuresRaw = fs.existsSync('./cache/banknifty_futures_recent.json')
  ? JSON.parse(fs.readFileSync('./cache/banknifty_futures_recent.json', 'utf8'))
  : {};
const optionsRaw = fs.existsSync('./cache/banknifty_options_recent.json')
  ? JSON.parse(fs.readFileSync('./cache/banknifty_options_recent.json', 'utf8') || '{}')
  : {};

function getDTE(dateStr) {
  const d = new Date(dateStr + 'T00:00:00+05:30');
  const y = d.getFullYear(), m = d.getMonth();
  let last = new Date(y, m + 1, 0);
  last.setDate(last.getDate() - ((last.getDay() >= 4) ? last.getDay() - 4 : last.getDay() + 3));
  if (d >= last) {
    last = new Date(y, m + 2, 0);
    last.setDate(last.getDate() - ((last.getDay() >= 4) ? last.getDay() - 4 : last.getDay() + 3));
  }
  return Math.max(1, Math.ceil((last - d) / 86400000));
}

function normCandles(arr) {
  return arr.slice(1).map((c, i) => {
    const total = 9 * 60 + 30 + i * 15;
    return {
      open: c.open, high: c.high, low: c.low, close: c.close,
      h: c.h !== undefined ? c.h : Math.floor(total / 60),
      m: c.m !== undefined ? c.m : total % 60,
    };
  });
}

function prevCandles(arr) {
  return arr.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
}

function strikeFor(idx) {
  return Math.round(idx / 100) * 100;
}

function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

function optionPrice(spot, strike, side, dte, iv = 0.20) {
  const T = Math.max(1 / 365, dte / 365);
  const r = 0.06;
  const volT = iv * Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + iv * iv / 2) * T) / volT;
  const d2 = d1 - volT;
  const call = spot * normalCdf(d1) - strike * Math.exp(-r * T) * normalCdf(d2);
  const put = strike * Math.exp(-r * T) * normalCdf(-d2) - spot * normalCdf(-d1);
  return Math.max(1, side === 'CE' ? call : put);
}

function futuresCandles(date) {
  const raw = futuresRaw[date];
  if (!raw) return null;
  const arr = raw.candles || raw;
  return Array.isArray(arr) && arr.length ? arr : null;
}

function futPrice(date, i, fallback) {
  const fc = futuresCandles(date);
  if (!fc) return fallback;
  const c = fc[Math.min(i, fc.length - 1)];
  return c && c.close ? c.close : fallback;
}

function calcStats(rows, key) {
  const vals = rows.map(r => r[key]);
  const total = vals.reduce((s, v) => s + v, 0);
  const wins = vals.filter(v => v > 0).length;
  const losses = vals.filter(v => v < 0).length;
  let peak = 0, eq = 0, dd = 0;
  for (const v of vals) {
    eq += v;
    if (eq > peak) peak = eq;
    dd = Math.max(dd, peak - eq);
  }
  return { total, wins, losses, winRate: rows.length ? wins / rows.length * 100 : 0, maxDD: dd };
}

function simulateDay(date, todayC, prevC) {
  const pdrH = Math.max(...prevC.map(c => c.high));
  const pdrL = Math.min(...prevC.map(c => c.low));
  if (!(pdrH > 0 && pdrL > 0 && pdrH - pdrL >= 150)) return null;

  const dte = getDTE(date);
  const state = createDrishtiState();
  let trades = 0, idxPts = 0, futPts = 0, optPts = 0;
  let futRs = 0, optRs = 0, dayCostsFut = 0, dayCostsOpt = 0;
  const log = [];

  for (let i = 0; i < todayC.length; i++) {
    const c = todayC[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 15);
    const partial = todayC.slice(0, i + 1);

    if (state.inTrade) {
      const side = state.dir;
      const strike = state._strike;
      const optEntry = state._optEntry;
      const futEntry = state._futEntry;

      const adverseSpot = side === 'CE' ? c.low : c.high;
      const adverseOpt = optionPrice(adverseSpot, strike, side, dte);
      const adverseFut = futPrice(date, i, adverseSpot);
      const realFutAdversePts = side === 'CE' ? adverseFut - futEntry : futEntry - adverseFut;
      const realOptAdversePts = adverseOpt - optEntry;

      let exitReason = null;
      let exitIdxPts = null;
      let exitFutPts = null;
      let exitOptPts = null;

      if (realFutAdversePts <= -REAL_FUTURES_SL_PTS) {
        exitReason = 'REAL_FUT_SL';
        exitIdxPts = Math.max(-REAL_FUTURES_SL_PTS, side === 'CE' ? adverseSpot - state.entry : state.entry - adverseSpot);
        exitFutPts = -REAL_FUTURES_SL_PTS;
        exitOptPts = Math.max(-REAL_OPTIONS_SL_PTS, realOptAdversePts);
      } else if (realOptAdversePts <= -REAL_OPTIONS_SL_PTS) {
        exitReason = 'REAL_OPT_SL';
        exitIdxPts = side === 'CE' ? adverseSpot - state.entry : state.entry - adverseSpot;
        exitFutPts = realFutAdversePts;
        exitOptPts = -REAL_OPTIONS_SL_PTS;
      } else {
        const trail = updateDrishtiTrail(state, c, isEOD);
        state.peakPts = trail.peakPts;
        state.trailStop = trail.trailStop;
        if (trail.action !== 'HOLD') {
          exitReason = trail.action;
          exitIdxPts = trail.pts;
          const futExit = futPrice(date, i, trail.exitPrice || c.close);
          const optExit = optionPrice(trail.exitPrice || c.close, strike, side, dte);
          exitFutPts = side === 'CE' ? futExit - futEntry : futEntry - futExit;
          exitOptPts = optExit - optEntry - SPREAD_OPT * 2;
        }
      }

      if (exitReason) {
        idxPts += exitIdxPts;
        futPts += exitFutPts;
        optPts += exitOptPts;
        const oneFutRs = Math.round(exitFutPts * QTY);
        const oneOptRs = Math.round(exitOptPts * QTY);
        futRs += oneFutRs;
        optRs += oneOptRs;
        dayCostsFut += BROKERAGE_FUT + Math.abs(SPREAD_FUT * QTY);
        dayCostsOpt += BROKERAGE_OPT + Math.abs(SPREAD_OPT * 2 * QTY);
        log.push({ side, entryIdx: state.entryIdx, exitIdx: i, reason: exitReason, idxPts: exitIdxPts, futPts: exitFutPts, optPts: exitOptPts, futRs: oneFutRs, optRs: oneOptRs });

        if (!String(exitReason).includes('EOD')) {
          state.lastExitPts = exitIdxPts;
          state.lastExitIdx = i;
          state.lastExitDir = side;
        }
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -100;

        if (idxPts <= -DAILY_LOSS_CAP_PTS || futRs + optRs <= -REAL_DAILY_LOSS_CAP_RS || trades >= MAX_TRADES) break;
      }
      continue;
    }

    if (trades >= MAX_TRADES || isEOD || idxPts <= -DAILY_LOSS_CAP_PTS || futRs + optRs <= -REAL_ENTRY_BLOCK_RS) continue;

    let sig = null;
    if (!state.firstDone) sig = findDrishtiEntry(partial, prevC);
    else if (state.lastExitIdx >= 0 && state.lastExitDir) sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);

    if (sig && sig.idx === i) {
      state.inTrade = true;
      state.dir = sig.side;
      state.entry = c.close;
      state.entryIdx = i;
      state.peakPts = 0;
      state.trailStop = -100;
      state.firstDone = true;
      state._strike = strikeFor(c.close);
      state._optEntry = optionPrice(c.close, state._strike, sig.side, dte) + SPREAD_OPT;
      state._futEntry = futPrice(date, i, c.close);
      trades++;
    }
  }

  if (state.inTrade) {
    const i = todayC.length - 1;
    const c = todayC[i];
    const trail = updateDrishtiTrail(state, c, true);
    const side = state.dir;
    const futExit = futPrice(date, i, trail.exitPrice || c.close);
    const optExit = optionPrice(trail.exitPrice || c.close, state._strike, side, dte);
    const oneIdx = trail.pts;
    const oneFut = side === 'CE' ? futExit - state._futEntry : state._futEntry - futExit;
    const oneOpt = optExit - state._optEntry - SPREAD_OPT;
    idxPts += oneIdx; futPts += oneFut; optPts += oneOpt;
    futRs += Math.round(oneFut * QTY); optRs += Math.round(oneOpt * QTY);
    dayCostsFut += BROKERAGE_FUT + Math.abs(SPREAD_FUT * QTY);
    dayCostsOpt += BROKERAGE_OPT + Math.abs(SPREAD_OPT * 2 * QTY);
    log.push({ side, entryIdx: state.entryIdx, exitIdx: i, reason: 'EOD_FORCED', idxPts: oneIdx, futPts: oneFut, optPts: oneOpt });
  }

  if (!trades) return null;
  return {
    date, trades, idxPts,
    futPts, optPts,
    futRsGross: futRs, optRsGross: optRs,
    futRsNet: futRs - dayCostsFut,
    optRsNet: optRs - dayCostsOpt,
    costsFut: dayCostsFut,
    costsOpt: dayCostsOpt,
    log,
  };
}

const dates = Object.keys(indexRaw).sort();
const rows = [];
for (let di = 1; di < dates.length; di++) {
  const date = dates[di];
  const today = indexRaw[date], prev = indexRaw[dates[di - 1]];
  if (!today || !prev || today.length < 5 || prev.length < 5) continue;
  const res = simulateDay(date, normCandles(today), prevCandles(prev));
  if (res) rows.push(res);
}

const months = {};
const dailyByMonth = {};
for (const r of rows) {
  const m = r.date.slice(0, 7);
  if (!months[m]) months[m] = { days: 0, trades: 0, idxPts: 0, futRsNet: 0, optRsNet: 0, futRsGross: 0, optRsGross: 0 };
  months[m].days++;
  months[m].trades += r.trades;
  months[m].idxPts += r.idxPts;
  months[m].futRsNet += r.futRsNet;
  months[m].optRsNet += r.optRsNet;
  months[m].futRsGross += r.futRsGross;
  months[m].optRsGross += r.optRsGross;
  if (!dailyByMonth[m]) dailyByMonth[m] = {};
  dailyByMonth[m][r.date] = {
    trades: r.trades,
    idxPts: parseFloat(r.idxPts.toFixed(1)),
    futRsNet: Math.round(r.futRsNet),
    optRsNet: Math.round(r.optRsNet),
    futRsGross: Math.round(r.futRsGross),
    optRsGross: Math.round(r.optRsGross),
    costsFut: Math.round(r.costsFut),
    costsOpt: Math.round(r.costsOpt),
    reasons: r.log.map(x => x.reason),
  };
}

const idxStats = calcStats(rows, 'idxPts');
const futStats = calcStats(rows, 'futRsNet');
const optStats = calcStats(rows, 'optRsNet');
const totalTrades = rows.reduce((s, r) => s + r.trades, 0);
const futDates = Object.keys(futuresRaw || {});
const optDataKeys = Object.keys(optionsRaw || {});

function money(n) { return (n >= 0 ? '+Rs ' : '-Rs ') + Math.abs(Math.round(n)).toLocaleString('en-IN'); }
function pts(n) { return (n >= 0 ? '+' : '') + n.toFixed(1); }

console.log('\n' + '='.repeat(92));
console.log('DRISHTI_V1 REAL-PREMIUM BACKTEST');
console.log('Signals: same DRISHTI entries/re-entries | Risk: real futures/options caps enabled');
console.log(`Data: ${dates[0]} to ${dates[dates.length - 1]} | days traded ${rows.length} | trades ${totalTrades}`);
console.log(`Futures cache days: ${futDates.length || 0} | Option premium cache rows: ${optDataKeys.length || 0}`);
console.log('NOTE: Historical option premium cache is empty, so OPTIONS below are premium-model results, not actual option LTP history.');
console.log('='.repeat(92));
console.log('Bucket'.padEnd(18) + 'Total'.padStart(16) + 'WinDays'.padStart(12) + 'WR'.padStart(10) + 'MaxDD'.padStart(16) + 'Avg/Day'.padStart(16));
console.log('-'.repeat(92));
console.log('Strategy/index'.padEnd(18) + pts(idxStats.total).padStart(16) + String(idxStats.wins + 'W/' + idxStats.losses + 'L').padStart(12) + (idxStats.winRate.toFixed(1)+'%').padStart(10) + pts(idxStats.maxDD).padStart(16) + pts(idxStats.total / rows.length).padStart(16));
console.log('Futures real'.padEnd(18) + money(futStats.total).padStart(16) + String(futStats.wins + 'W/' + futStats.losses + 'L').padStart(12) + (futStats.winRate.toFixed(1)+'%').padStart(10) + money(futStats.maxDD).padStart(16) + money(futStats.total / rows.length).padStart(16));
console.log('Options premium'.padEnd(18) + money(optStats.total).padStart(16) + String(optStats.wins + 'W/' + optStats.losses + 'L').padStart(12) + (optStats.winRate.toFixed(1)+'%').padStart(10) + money(optStats.maxDD).padStart(16) + money(optStats.total / rows.length).padStart(16));
console.log('='.repeat(92));

console.log('\nRecent months');
console.log('Month'.padEnd(10) + 'Days'.padStart(6) + 'Trades'.padStart(8) + 'IdxPts'.padStart(12) + 'FutNet'.padStart(16) + 'OptNet'.padStart(16));
for (const m of Object.keys(months).sort().slice(-8)) {
  const x = months[m];
  console.log(m.padEnd(10) + String(x.days).padStart(6) + String(x.trades).padStart(8) + pts(x.idxPts).padStart(12) + money(x.futRsNet).padStart(16) + money(x.optRsNet).padStart(16));
}

const worstOpt = [...rows].sort((a, b) => a.optRsNet - b.optRsNet).slice(0, 5);
console.log('\nWorst option-premium days');
for (const r of worstOpt) {
  console.log(`${r.date} trades=${r.trades} idx=${pts(r.idxPts)} fut=${money(r.futRsNet)} opt=${money(r.optRsNet)} reasons=${r.log.map(x => x.reason).join(',')}`);
}

const out = {
  generatedAt: new Date().toISOString(),
  assumptions: {
    optionPremium: 'Black-Scholes ATM premium model because historical option premium cache is empty',
    futures: futDates.length ? 'Uses cached real futures candles where date/index aligns; index fallback otherwise' : 'index fallback only',
    qty: QTY,
    realDailyLossCapRs: REAL_DAILY_LOSS_CAP_RS,
    realEntryBlockRs: REAL_ENTRY_BLOCK_RS,
    realFuturesSlPts: REAL_FUTURES_SL_PTS,
    realOptionsSlPts: REAL_OPTIONS_SL_PTS,
  },
  summary: { idxStats, futStats, optStats, days: rows.length, trades: totalTrades },
  months,
  dailyByMonth,
  worstOpt,
};
fs.writeFileSync('real-premium-backtest-result.json', JSON.stringify(out, null, 2));
console.log('\nSaved: real-premium-backtest-result.json');

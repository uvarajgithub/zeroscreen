'use strict';

const fs = require('fs');
const path = require('path');

const BOT_DIR = process.env.TRADING_BOT_DIR || process.cwd();
const INPUT = process.env.BANKNIFTY_5YR_FILE || path.join(BOT_DIR, 'cache', 'banknifty_5yr.json');
const OVERLAY_INPUT = process.env.BANKNIFTY_OVERLAY_FILE || '';
const DRISHTI_RESULT = path.join(BOT_DIR, 'real-premium-backtest-result.json');
const OUTPUT = path.join(BOT_DIR, 'shadow-strategy-5yr-results.json');
const QTY = 30;
const FUTURES_COST = 362;
const OPTION_COST = 80;
const OPTION_SPREAD_PER_SIDE = 3;
const FUTURES_MARGIN_RATE = 0.12;
const DRISHTI_FUTURES_CAPITAL_PER_TRADE = 200000;
const DRISHTI_OPTIONS_CAPITAL_PER_TRADE = 15000;

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

function getDTE(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  const y = d.getFullYear();
  const m = d.getMonth();
  let expiry = new Date(y, m + 1, 0);
  expiry.setDate(expiry.getDate() - (expiry.getDay() >= 4 ? expiry.getDay() - 4 : expiry.getDay() + 3));
  if (d >= expiry) {
    expiry = new Date(y, m + 2, 0);
    expiry.setDate(expiry.getDate() - (expiry.getDay() >= 4 ? expiry.getDay() - 4 : expiry.getDay() + 3));
  }
  return Math.max(1, Math.ceil((expiry - d) / 86400000));
}

function candleTime(candle) {
  return `${String(candle.h).padStart(2, '0')}:${String(candle.m).padStart(2, '0')}`;
}

function trade(date, candles, side, entry, exit, entryIdx, exitIdx, reason, optionEntrySpot) {
  const points = side === 'CE' ? exit - entry : entry - exit;
  const dte = getDTE(date);
  const entrySpot = optionEntrySpot || candles[entryIdx].close;
  const strike = Math.round(entrySpot / 100) * 100;
  const premiumIn = optionPrice(entrySpot, strike, side, dte) + OPTION_SPREAD_PER_SIDE;
  const premiumOut = Math.max(1, optionPrice(exit, strike, side, dte) - OPTION_SPREAD_PER_SIDE);
  const optionPoints = premiumOut - premiumIn;
  return {
    side,
    entry: Number(entry.toFixed(2)),
    exit: Number(exit.toFixed(2)),
    entryTime: candleTime(candles[entryIdx]),
    exitTime: candleTime(candles[exitIdx]),
    points: Number(points.toFixed(2)),
    futuresGross: Math.round(points * QTY),
    futuresNet: Math.round(points * QTY - FUTURES_COST),
    futuresCapital: Math.round(Math.abs(entry) * QTY * FUTURES_MARGIN_RATE),
    optionPoints: Number(optionPoints.toFixed(2)),
    optionsGross: Math.round(optionPoints * QTY),
    optionsNet: Math.round(optionPoints * QTY - OPTION_COST),
    optionsCapital: Math.round(premiumIn * QTY),
    reason,
  };
}

function finishDay(date, trades) {
  if (!trades.length) return null;
  const futuresNet = trades.reduce((sum, row) => sum + row.futuresNet, 0);
  const optionsNet = trades.reduce((sum, row) => sum + row.optionsNet, 0);
  return {
    date,
    futuresNet,
    optionsNet,
    futuresGross: trades.reduce((sum, row) => sum + row.futuresGross, 0),
    optionsGross: trades.reduce((sum, row) => sum + row.optionsGross, 0),
    futuresCapital: trades.reduce((sum, row) => sum + row.futuresCapital, 0),
    optionsCapital: trades.reduce((sum, row) => sum + row.optionsCapital, 0),
    points: Number(trades.reduce((sum, row) => sum + row.points, 0).toFixed(2)),
    optionPoints: Number(trades.reduce((sum, row) => sum + row.optionPoints, 0).toFixed(2)),
    trades: trades.length,
    futuresWins: trades.filter(row => row.futuresNet > 0).length,
    futuresLosses: trades.filter(row => row.futuresNet <= 0).length,
    optionsWins: trades.filter(row => row.optionsNet > 0).length,
    optionsLosses: trades.filter(row => row.optionsNet <= 0).length,
    reasons: trades.map(row => row.reason),
  };
}

function simulateRange(date, candles, referenceIndex, confirmationCloseEntry = false) {
  if (candles.length <= referenceIndex) return null;
  const ref = candles[referenceIndex];
  const state = {
    side: null,
    entry: 0,
    entryIdx: -1,
    optionEntrySpot: 0,
    sl: 0,
    refHigh: 0,
    refLow: 0,
  };
  const trades = [];
  for (let i = referenceIndex + 1; i < candles.length; i += 1) {
    const c = candles[i];
    const eod = candleTime(c) >= '15:15';
    if (state.side) {
      const slHit = state.side === 'CE' ? c.close <= state.sl : c.close >= state.sl;
      if (slHit || eod) {
        const exit = slHit ? state.sl : c.close;
        trades.push(trade(date, candles, state.side, state.entry, exit, state.entryIdx, i, slHit ? 'sl_hit' : 'exit_eod', state.optionEntrySpot));
        state.side = null;
        if (eod) break;
        continue;
      }
      if (state.side === 'CE' && c.close > state.refHigh) {
        state.sl = Math.max(state.sl, c.low);
        state.refHigh = c.high;
        state.refLow = c.low;
      } else if (state.side === 'PE' && c.close < state.refLow) {
        state.sl = Math.min(state.sl, c.high);
        state.refHigh = c.high;
        state.refLow = c.low;
      }
      continue;
    }
    if (trades.length >= 2 || eod) continue;
    const side = c.close > ref.high ? 'CE' : c.close < ref.low ? 'PE' : null;
    if (!side) continue;
    state.side = side;
    state.entry = confirmationCloseEntry ? c.close : (side === 'CE' ? ref.high : ref.low);
    state.entryIdx = i;
    state.optionEntrySpot = c.close;
    state.sl = side === 'CE' ? c.low : c.high;
    state.refHigh = c.high;
    state.refLow = c.low;
  }
  if (state.side) {
    const i = candles.length - 1;
    trades.push(trade(date, candles, state.side, state.entry, candles[i].close, state.entryIdx, i, 'forced_eod', state.optionEntrySpot));
  }
  return finishDay(date, trades);
}

function simulateNormal(date, candles) {
  const refIndex = candles.findIndex(c => candleTime(c) === '09:45');
  if (refIndex < 0) return null;
  const ref = candles[refIndex];
  const bodyHigh = Math.max(ref.open, ref.close);
  const bodyLow = Math.min(ref.open, ref.close);
  const state = { side: null, entry: 0, entryIdx: -1, sl: 0 };
  const trades = [];
  for (let i = refIndex + 1; i < candles.length; i += 1) {
    const c = candles[i];
    const eod = candleTime(c) >= '15:15';
    if (state.side) {
      state.sl = state.side === 'CE' ? Math.max(state.sl, c.low) : Math.min(state.sl, c.high);
      const slHit = state.side === 'CE' ? c.close <= state.sl : c.close >= state.sl;
      if (slHit || eod) {
        const exit = slHit ? state.sl : c.close;
        trades.push(trade(date, candles, state.side, state.entry, exit, state.entryIdx, i, slHit ? 'sl_candle_trail' : 'exit_eod', candles[state.entryIdx].close));
        state.side = null;
      }
      continue;
    }
    if (trades.length >= 2 || eod) continue;
    const side = c.close > bodyHigh ? 'CE' : c.close < bodyLow ? 'PE' : null;
    if (!side) continue;
    state.side = side;
    state.entry = c.close;
    state.entryIdx = i;
    state.sl = side === 'CE' ? c.close - 100 : c.close + 100;
  }
  if (state.side) {
    const i = candles.length - 1;
    trades.push(trade(date, candles, state.side, state.entry, candles[i].close, state.entryIdx, i, 'forced_eod', candles[state.entryIdx].close));
  }
  return finishDay(date, trades);
}

function simulateHybrid(date, candles) {
  if (candles.length < 2) return null;
  const c1 = candles[0];
  const c2 = candles[1];
  const bodyHigh = Math.max(c1.open, c1.close);
  const bodyLow = Math.min(c1.open, c1.close);
  const c2Body = Math.abs(c2.close - c2.open);
  const upBreak = c2.close - bodyHigh;
  const downBreak = bodyLow - c2.close;
  let side = null;
  if (c2.close > bodyHigh) side = 'CE';
  if (c2.close < bodyLow) side = 'PE';
  if (!side) return null;

  const trades = [];
  let phase = 'T1';
  let entry = c2.close;
  let entryIdx = 1;
  let sl = side === 'CE' ? c1.low : c1.high;
  let peak = 0;
  for (let i = 2; i < candles.length; i += 1) {
    const c = candles[i];
    const eod = candleTime(c) >= '15:15';
    const points = side === 'CE' ? c.close - entry : entry - c.close;
    peak = Math.max(peak, points);
    if (phase === 'T1') {
      const prev = candles[i - 1];
      const prevBodyHigh = Math.max(prev.open, prev.close);
      const prevBodyLow = Math.min(prev.open, prev.close);
      const body = Math.abs(c.close - c.open);
      const reverse = (
        side === 'PE' && points <= -50 && body >= 100 && c.close > prevBodyHigh && c.close > c.open
      ) || (
        side === 'CE' && points <= -50 && body >= 100 && c.close < prevBodyLow && c.close < c.open
      );
      if (eod || (i + 1 >= 8 && peak < 50)) {
        trades.push(trade(date, candles, side, entry, c.close, entryIdx, i, eod ? 'exit_eod' : 'no_follow_c8_peak_lt_50', candles[entryIdx].close));
        side = null;
        break;
      }
      if (reverse) {
        trades.push(trade(date, candles, side, entry, c.close, entryIdx, i, 'reverse_body_break', candles[entryIdx].close));
        side = side === 'CE' ? 'PE' : 'CE';
        entry = c.close;
        entryIdx = i;
        sl = side === 'CE' ? c.low : c.high;
        peak = 0;
        phase = 'RE';
      }
    } else {
      const slHit = side === 'CE' ? c.close <= sl : c.close >= sl;
      if (slHit || eod) {
        trades.push(trade(date, candles, side, entry, c.close, entryIdx, i, eod ? 'exit_eod' : 'exit_sl_close', candles[entryIdx].close));
        side = null;
        break;
      }
    }
  }
  if (side) {
    const i = candles.length - 1;
    trades.push(trade(date, candles, side, entry, candles[i].close, entryIdx, i, 'forced_eod', candles[entryIdx].close));
  }
  return finishDay(date, trades);
}

function summarize(days, instrument) {
  const pnlKey = instrument === 'FUTURES' ? 'futuresNet' : 'optionsNet';
  const pointKey = instrument === 'FUTURES' ? 'points' : 'optionPoints';
  const winsKey = instrument === 'FUTURES' ? 'futuresWins' : 'optionsWins';
  const lossesKey = instrument === 'FUTURES' ? 'futuresLosses' : 'optionsLosses';
  const capitalKey = instrument === 'FUTURES' ? 'futuresCapital' : 'optionsCapital';
  const compactDays = days.map(day => ({
    date: day.date,
    pnl: day[pnlKey],
    grossPnl: instrument === 'FUTURES' ? day.futuresGross : day.optionsGross,
    points: day[pointKey],
    trades: day.trades,
    wins: day[winsKey],
    losses: day[lossesKey],
    capitalUsed: Math.round(day[capitalKey] || 0),
    returnPct: day[capitalKey] ? day[pnlKey] / day[capitalKey] * 100 : null,
    reasons: day.reasons,
  }));
  const monthMap = new Map();
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const day of compactDays) {
    equity += day.pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    const month = day.date.slice(0, 7);
    const row = monthMap.get(month) || { period: month, pnl: 0, grossPnl: 0, points: 0, capitalUsed: 0, tradingDays: 0, trades: 0, wins: 0, losses: 0 };
    row.pnl += day.pnl;
    row.grossPnl += day.grossPnl;
    row.points += day.points;
    row.capitalUsed += day.capitalUsed;
    row.tradingDays += 1;
    row.trades += day.trades;
    row.wins += day.wins;
    row.losses += day.losses;
    monthMap.set(month, row);
  }
  const months = Array.from(monthMap.values()).map(row => ({
    ...row,
    pnl: Math.round(row.pnl),
    grossPnl: Math.round(row.grossPnl),
    points: Number(row.points.toFixed(2)),
    capitalUsed: Math.round(row.capitalUsed),
    returnPct: row.capitalUsed ? row.pnl / row.capitalUsed * 100 : null,
    winRate: row.wins + row.losses ? row.wins / (row.wins + row.losses) * 100 : 0,
  }));
  const totalTrades = compactDays.reduce((sum, row) => sum + row.trades, 0);
  const wins = compactDays.reduce((sum, row) => sum + row.wins, 0);
  const losses = compactDays.reduce((sum, row) => sum + row.losses, 0);
  const total = compactDays.reduce((sum, row) => sum + row.pnl, 0);
  const capitalUsed = compactDays.reduce((sum, row) => sum + row.capitalUsed, 0);
  return {
    summary: {
      total: Math.round(total),
      totalTrades,
      wins,
      losses,
      winRate: wins + losses ? wins / (wins + losses) * 100 : 0,
      maxDrawdown: Math.round(maxDrawdown),
      avgMonthlyPnl: months.length ? Math.round(total / months.length) : 0,
      capitalUsed: Math.round(capitalUsed),
      returnPct: capitalUsed ? total / capitalUsed * 100 : null,
      avgMonthlyReturnPct: months.length
        ? months.reduce((sum, row) => sum + Number(row.returnPct || 0), 0) / months.length
        : null,
      tradingDays: compactDays.length,
      monthlyRecords: months.length,
    },
    months,
    days: compactDays,
  };
}

function drishtiResults() {
  if (!fs.existsSync(DRISHTI_RESULT)) return null;
  const source = JSON.parse(fs.readFileSync(DRISHTI_RESULT, 'utf8'));
  const all = [];
  for (const month of Object.keys(source.dailyByMonth || {}).sort()) {
    for (const [date, row] of Object.entries(source.dailyByMonth[month] || {})) {
      all.push({
        date,
        futuresNet: Number(row.futRsNet || 0),
        optionsNet: Number(row.optRsNet || 0),
        futuresGross: Number(row.futRsGross || 0),
        optionsGross: Number(row.optRsGross || 0),
        futuresCapital: Number(row.trades || 0) * DRISHTI_FUTURES_CAPITAL_PER_TRADE,
        optionsCapital: Number(row.trades || 0) * DRISHTI_OPTIONS_CAPITAL_PER_TRADE,
        points: Number(row.idxPts || 0),
        optionPoints: Number(row.optRsGross || 0) / QTY,
        trades: Number(row.trades || 0),
        futuresWins: Number(row.futRsNet || 0) > 0 ? Number(row.trades || 1) : 0,
        futuresLosses: Number(row.futRsNet || 0) <= 0 ? Number(row.trades || 1) : 0,
        optionsWins: Number(row.optRsNet || 0) > 0 ? Number(row.trades || 1) : 0,
        optionsLosses: Number(row.optRsNet || 0) <= 0 ? Number(row.trades || 1) : 0,
        reasons: row.reasons || [],
      });
    }
  }
  const futures = summarize(all, 'FUTURES');
  const options = summarize(all, 'OPTIONS');
  const futStats = source.summary?.futStats || {};
  const optStats = source.summary?.optStats || {};
  futures.summary = {
    ...futures.summary,
    total: Math.round(Number(futStats.total || futures.summary.total)),
    wins: Number(futStats.wins || futures.summary.wins),
    losses: Number(futStats.losses || futures.summary.losses),
    winRate: Number(futStats.winRate || futures.summary.winRate),
    maxDrawdown: Math.round(Number(futStats.maxDD || futures.summary.maxDrawdown)),
  };
  options.summary = {
    ...options.summary,
    total: Math.round(Number(optStats.total || options.summary.total)),
    wins: Number(optStats.wins || options.summary.wins),
    losses: Number(optStats.losses || options.summary.losses),
    winRate: Number(optStats.winRate || options.summary.winRate),
    maxDrawdown: Math.round(Number(optStats.maxDD || options.summary.maxDrawdown)),
  };
  return {
    FUTURES: {
      ...futures,
      methodology: 'DRISHTI deployed entry/trail engine; historical BANKNIFTY candles with futures/index fallback; estimated costs included.',
      modelled: false,
    },
    OPTIONS: {
      ...options,
      methodology: 'DRISHTI deployed signals with Black-Scholes ATM option-premium model; historical expired option LTP is unavailable.',
      modelled: true,
    },
  };
}

function main() {
  if (!fs.existsSync(INPUT)) throw new Error(`Missing input: ${INPUT}`);
  const raw = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  if (OVERLAY_INPUT && fs.existsSync(OVERLAY_INPUT)) {
    Object.assign(raw, JSON.parse(fs.readFileSync(OVERLAY_INPUT, 'utf8')));
  }
  const dates = Object.keys(raw).sort().filter(date => {
    const candles = Array.isArray(raw[date]) ? raw[date] : [];
    return candles.some(candle => candleTime(candle) === '15:15');
  });
  const simulations = {
    tt1030: [],
    tt1000: [],
    tt0945: [],
    'normal-breakout': [],
    'hybrid-body': [],
  };
  for (const date of dates) {
    const candles = Array.isArray(raw[date]) ? raw[date] : [];
    const rows = [
      ['tt1030', simulateRange(date, candles, 5)],
      ['tt1000', simulateRange(date, candles, 3)],
      ['tt0945', simulateRange(date, candles, 2, true)],
      ['normal-breakout', simulateNormal(date, candles)],
      ['hybrid-body', simulateHybrid(date, candles)],
    ];
    for (const [strategy, result] of rows) if (result) simulations[strategy].push(result);
  }

  const strategies = { drishti: drishtiResults() };
  for (const [strategy, days] of Object.entries(simulations)) {
    strategies[strategy] = {
      FUTURES: {
        ...summarize(days, 'FUTURES'),
        methodology: 'Exact deployed 15-minute index-shadow rules on historical BANKNIFTY candles; quantity 30 and estimated futures costs included.',
        modelled: false,
      },
      OPTIONS: {
        ...summarize(days, 'OPTIONS'),
        methodology: 'Same deployed signals/exits with a Black-Scholes ATM option-premium model; historical expired option LTP is unavailable.',
        modelled: true,
      },
    };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    coverage: { from: dates[0], to: dates[dates.length - 1], tradingDays: dates.length },
    quantity: QTY,
    assumptions: {
      futuresCostPerTradeRs: FUTURES_COST,
      futuresMarginRate: FUTURES_MARGIN_RATE,
      drishtiFuturesCapitalPerTradeRs: DRISHTI_FUTURES_CAPITAL_PER_TRADE,
      optionsCostPerTradeRs: OPTION_COST,
      drishtiOptionsCapitalPerTradeRs: DRISHTI_OPTIONS_CAPITAL_PER_TRADE,
      optionSpreadPerSidePoints: OPTION_SPREAD_PER_SIDE,
      optionModel: 'Black-Scholes ATM, IV 20%, monthly expiry DTE',
    },
    strategies,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output));
  console.log(JSON.stringify({
    output: OUTPUT,
    coverage: output.coverage,
    strategies: Object.fromEntries(Object.entries(strategies).map(([key, value]) => [
      key,
      value ? {
        futures: value.FUTURES.summary,
        options: value.OPTIONS.summary,
      } : null,
    ])),
  }, null, 2));
}

main();

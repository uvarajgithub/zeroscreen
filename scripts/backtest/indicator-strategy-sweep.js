'use strict';

const fs = require('fs');
const path = require('path');

const INPUT = process.env.BANKNIFTY_5YR_FILE || path.resolve('.tmp-banknifty-5yr.json');
const OVERLAY = process.env.BANKNIFTY_OVERLAY_FILE || path.resolve('.tmp-banknifty-june-july-15m.json');
const OUTPUT = process.env.INDICATOR_SWEEP_OUTPUT || path.resolve('indicator-strategy-sweep-result.json');
const QTY = 30;
const FUTURES_COST = 362;
const OPTIONS_COST = 80;
const FUTURES_MARGIN_RATE = 0.12;
const OPTION_SPREAD = 3;

function time(row) {
  return `${String(row.h).padStart(2, '0')}:${String(row.m).padStart(2, '0')}`;
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

function dte(date) {
  const current = new Date(`${date}T00:00:00+05:30`);
  let expiry = new Date(current.getFullYear(), current.getMonth() + 1, 0);
  expiry.setDate(expiry.getDate() - (expiry.getDay() >= 4 ? expiry.getDay() - 4 : expiry.getDay() + 3));
  if (current >= expiry) {
    expiry = new Date(current.getFullYear(), current.getMonth() + 2, 0);
    expiry.setDate(expiry.getDate() - (expiry.getDay() >= 4 ? expiry.getDay() - 4 : expiry.getDay() + 3));
  }
  return Math.max(1, Math.ceil((expiry - current) / 86400000));
}

function ema(values, period) {
  const out = [];
  const alpha = 2 / (period + 1);
  for (let i = 0; i < values.length; i += 1) out.push(i ? values[i] * alpha + out[i - 1] * (1 - alpha) : values[i]);
  return out;
}

function smma(values, period) {
  const out = [];
  for (let i = 0; i < values.length; i += 1) {
    if (!i) out.push(values[i]);
    else out.push((out[i - 1] * (period - 1) + values[i]) / period);
  }
  return out;
}

function rsi(values, period = 14) {
  const out = new Array(values.length).fill(50);
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i < values.length; i += 1) {
    const change = values[i] - values[i - 1];
    const gain = Math.max(0, change);
    const loss = Math.max(0, -change);
    if (i <= period) {
      avgGain += gain / period;
      avgLoss += loss / period;
    } else {
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }
    if (i >= period) out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

function atr(rows, period = 14) {
  const tr = rows.map((row, i) => i
    ? Math.max(row.high - row.low, Math.abs(row.high - rows[i - 1].close), Math.abs(row.low - rows[i - 1].close))
    : row.high - row.low);
  return smma(tr, period);
}

function rolling(values, period, reducer) {
  return values.map((_, index) => {
    if (index + 1 < period) return null;
    return reducer(values.slice(index + 1 - period, index + 1));
  });
}

function loadDays() {
  const data = JSON.parse(fs.readFileSync(INPUT, 'utf8'));
  if (fs.existsSync(OVERLAY)) Object.assign(data, JSON.parse(fs.readFileSync(OVERLAY, 'utf8')));
  return Object.keys(data).sort()
    .filter(date => date >= '2021-01-01')
    .map(date => ({ date, rows: (data[date] || []).filter(row => time(row) >= '09:15' && time(row) <= '15:15') }))
    .filter(day => day.rows.length >= 20 && day.rows.some(row => time(row) === '15:15'));
}

function resample(days, minutes) {
  const bars = [];
  for (const day of days) {
    for (let start = 0; start < day.rows.length; start += minutes / 15) {
      const rows = day.rows.slice(start, start + minutes / 15);
      if (rows.length !== minutes / 15) continue;
      const last = rows[rows.length - 1];
      bars.push({
        date: day.date,
        time: time(last),
        open: rows[0].open,
        high: Math.max(...rows.map(row => row.high)),
        low: Math.min(...rows.map(row => row.low)),
        close: last.close,
        volume: rows.reduce((sum, row) => sum + Number(row.volume || 0), 0),
        baseEnd: start + rows.length - 1,
      });
    }
  }
  return bars;
}

function enrich(bars, config, dayMap) {
  const closes = bars.map(row => row.close);
  const highs = bars.map(row => row.high);
  const lows = bars.map(row => row.low);
  const fast = config.average === 'SMMA' ? smma(closes, config.fast) : ema(closes, config.fast);
  const slow = config.average === 'SMMA' ? smma(closes, config.slow) : ema(closes, config.slow);
  const rsis = rsi(closes, config.rsiPeriod || 14);
  const atrs = atr(bars, 14);
  const means = rolling(closes, config.bbPeriod || 20, rows => rows.reduce((a, b) => a + b, 0) / rows.length);
  const deviations = rolling(closes, config.bbPeriod || 20, rows => {
    const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
    return Math.sqrt(rows.reduce((sum, value) => sum + (value - mean) ** 2, 0) / rows.length);
  });
  let currentDate = '';
  let cumulativePrice = 0;
  let cumulativeWeight = 0;
  return bars.map((bar, index) => {
    if (bar.date !== currentDate) {
      currentDate = bar.date;
      cumulativePrice = 0;
      cumulativeWeight = 0;
    }
    const weight = bar.volume || 1;
    cumulativePrice += ((bar.high + bar.low + bar.close) / 3) * weight;
    cumulativeWeight += weight;
    const previousDay = dayMap.get(bar.date)?.previous;
    const pivot = previousDay ? (previousDay.high + previousDay.low + previousDay.close) / 3 : null;
    return {
      ...bar,
      fast: fast[index],
      slow: slow[index],
      rsi: rsis[index],
      atr: atrs[index],
      vwap: cumulativePrice / cumulativeWeight,
      upper: means[index] == null ? null : means[index] + 2 * deviations[index],
      lower: means[index] == null ? null : means[index] - 2 * deviations[index],
      pivot,
      r1: pivot == null ? null : 2 * pivot - previousDay.low,
      s1: pivot == null ? null : 2 * pivot - previousDay.high,
      priorHigh: highs[index - 1],
      priorLow: lows[index - 1],
    };
  });
}

function desired(row, config) {
  if (row.time < '09:30' || row.time > '14:45') return null;
  const bullishAverage = row.fast > row.slow;
  const bearishAverage = row.fast < row.slow;
  switch (config.family) {
    case 'EMA':
    case 'SMMA':
      if (bullishAverage && row.rsi >= config.rsiLong) return 'CE';
      if (bearishAverage && row.rsi <= config.rsiShort) return 'PE';
      return null;
    case 'PIVOT':
      if (row.r1 != null && row.close > row.r1 && bullishAverage) return 'CE';
      if (row.s1 != null && row.close < row.s1 && bearishAverage) return 'PE';
      return null;
    case 'VWAP':
      if (row.close > row.vwap && bullishAverage && row.rsi >= config.rsiLong) return 'CE';
      if (row.close < row.vwap && bearishAverage && row.rsi <= config.rsiShort) return 'PE';
      return null;
    case 'RSI_REVERSAL':
      if (row.lower != null && row.close < row.lower && row.rsi <= config.rsiLong) return 'CE';
      if (row.upper != null && row.close > row.upper && row.rsi >= config.rsiShort) return 'PE';
      return null;
    case 'PIVOT_VWAP':
      if (row.pivot != null && row.close > row.pivot && row.close > row.vwap && bullishAverage && row.rsi >= config.rsiLong) return 'CE';
      if (row.pivot != null && row.close < row.pivot && row.close < row.vwap && bearishAverage && row.rsi <= config.rsiShort) return 'PE';
      return null;
    default:
      return null;
  }
}

function makeTrade(date, side, entry, exit, entryTime, exitTime, reason) {
  const points = side === 'CE' ? exit - entry : entry - exit;
  const strike = Math.round(entry / 100) * 100;
  const daysToExpiry = dte(date);
  const premiumIn = optionPrice(entry, strike, side, daysToExpiry) + OPTION_SPREAD;
  const premiumOut = Math.max(1, optionPrice(exit, strike, side, daysToExpiry) - OPTION_SPREAD);
  return {
    date,
    side,
    entry,
    exit,
    entryTime,
    exitTime,
    reason,
    futures: Math.round(points * QTY - FUTURES_COST),
    options: Math.round((premiumOut - premiumIn) * QTY - OPTIONS_COST),
    futuresCapital: Math.round(entry * QTY * FUTURES_MARGIN_RATE),
    optionsCapital: Math.round(premiumIn * QTY),
  };
}

function simulate(days, bars, config) {
  const byDay = new Map();
  for (const bar of bars) {
    if (!byDay.has(bar.date)) byDay.set(bar.date, []);
    byDay.get(bar.date).push(bar);
  }
  const trades = [];
  for (const day of days) {
    const rows = byDay.get(day.date) || [];
    let position = null;
    let dayTrades = 0;
    for (const row of rows) {
      const direction = desired(row, config);
      if (position) {
        const stopHit = position.side === 'CE' ? row.low <= position.stop : row.high >= position.stop;
        const opposite = direction && direction !== position.side;
        const eod = row.time >= '15:15';
        if (stopHit || opposite || eod) {
          const exit = stopHit ? position.stop : row.close;
          trades.push(makeTrade(day.date, position.side, position.entry, exit, position.time, row.time, stopHit ? 'ATR_STOP' : opposite ? 'OPPOSITE_SIGNAL' : 'EOD'));
          position = null;
          if (eod) break;
        } else if (config.trailAtr && row.atr) {
          position.stop = position.side === 'CE'
            ? Math.max(position.stop, row.close - row.atr * config.trailAtr)
            : Math.min(position.stop, row.close + row.atr * config.trailAtr);
        }
      }
      if (!position && direction && dayTrades < config.maxTrades && row.time < '15:00') {
        position = {
          side: direction,
          entry: row.close,
          time: row.time,
          stop: direction === 'CE' ? row.close - row.atr * config.stopAtr : row.close + row.atr * config.stopAtr,
        };
        dayTrades += 1;
      }
    }
    if (position && rows.length) {
      const row = rows[rows.length - 1];
      trades.push(makeTrade(day.date, position.side, position.entry, row.close, position.time, row.time, 'FORCED_EOD'));
    }
  }
  return trades;
}

function stats(trades, instrument, from, to) {
  const selected = trades.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
  const pnlKey = instrument === 'FUTURES' ? 'futures' : 'options';
  const capitalKey = instrument === 'FUTURES' ? 'futuresCapital' : 'optionsCapital';
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  const months = new Map();
  for (const trade of selected) {
    const pnl = trade[pnlKey];
    equity += pnl;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (pnl > 0) grossProfit += pnl;
    else grossLoss += -pnl;
    const month = trade.date.slice(0, 7);
    months.set(month, (months.get(month) || 0) + pnl);
  }
  const capital = selected.reduce((sum, row) => sum + row[capitalKey], 0);
  const wins = selected.filter(row => row[pnlKey] > 0).length;
  const monthly = Array.from(months.values());
  return {
    pnl: Math.round(equity),
    trades: selected.length,
    winRate: selected.length ? wins / selected.length * 100 : 0,
    profitFactor: grossLoss ? grossProfit / grossLoss : grossProfit ? 99 : 0,
    maxDrawdown: Math.round(maxDrawdown),
    returnPct: capital ? equity / capital * 100 : 0,
    profitableMonthPct: monthly.length ? monthly.filter(value => value > 0).length / monthly.length * 100 : 0,
    months: monthly.length,
  };
}

function backtestRecord(trades, instrument) {
  const pnlKey = instrument === 'FUTURES' ? 'futures' : 'options';
  const capitalKey = instrument === 'FUTURES' ? 'futuresCapital' : 'optionsCapital';
  const grouped = new Map();
  for (const trade of trades) {
    const row = grouped.get(trade.date) || {
      date: trade.date, pnl: 0, capitalUsed: 0, trades: 0, wins: 0, losses: 0, reasons: [],
    };
    row.pnl += trade[pnlKey];
    row.capitalUsed += trade[capitalKey];
    row.trades += 1;
    if (trade[pnlKey] > 0) row.wins += 1;
    else row.losses += 1;
    row.reasons.push(trade.reason);
    grouped.set(trade.date, row);
  }
  const days = Array.from(grouped.values()).map(row => ({
    ...row,
    pnl: Math.round(row.pnl),
    capitalUsed: Math.round(row.capitalUsed),
    returnPct: row.capitalUsed ? row.pnl / row.capitalUsed * 100 : 0,
  }));
  const monthMap = new Map();
  for (const day of days) {
    const period = day.date.slice(0, 7);
    const row = monthMap.get(period) || {
      period, pnl: 0, capitalUsed: 0, tradingDays: 0, trades: 0, wins: 0, losses: 0,
    };
    row.pnl += day.pnl;
    row.capitalUsed += day.capitalUsed;
    row.tradingDays += 1;
    row.trades += day.trades;
    row.wins += day.wins;
    row.losses += day.losses;
    monthMap.set(period, row);
  }
  const months = Array.from(monthMap.values()).map(row => ({
    ...row,
    returnPct: row.capitalUsed ? row.pnl / row.capitalUsed * 100 : 0,
    winRate: row.trades ? row.wins / row.trades * 100 : 0,
  }));
  const all = stats(trades, instrument);
  const capitalUsed = days.reduce((sum, row) => sum + row.capitalUsed, 0);
  return {
    summary: {
      total: all.pnl,
      totalTrades: all.trades,
      wins: trades.filter(row => row[pnlKey] > 0).length,
      losses: trades.filter(row => row[pnlKey] <= 0).length,
      winRate: all.winRate,
      maxDrawdown: all.maxDrawdown,
      avgMonthlyPnl: months.length ? Math.round(all.pnl / months.length) : 0,
      capitalUsed,
      returnPct: all.returnPct,
      avgMonthlyReturnPct: months.length
        ? months.reduce((sum, row) => sum + row.returnPct, 0) / months.length
        : 0,
    },
    days,
    months,
    modelled: instrument === 'OPTIONS',
    methodology: instrument === 'OPTIONS'
      ? 'Selected 15-minute indicator signals on BANKNIFTY with modelled ATM option premiums (Black-Scholes, 20% IV), spread and estimated costs.'
      : 'Selected 15-minute indicator signals on BANKNIFTY historical candles with quantity 30 and estimated futures costs.',
  };
}

function candidates() {
  const result = [];
  const frames = [15, 30, 45, 60];
  const stops = [1.5, 2];
  const trails = [0, 2];
  const averages = [
    { fast: 5, slow: 13 },
    { fast: 9, slow: 21 },
    { fast: 10, slow: 30 },
    { fast: 20, slow: 50 },
  ];
  for (const frame of frames) {
    for (const average of averages) {
      for (const stopAtr of stops) {
        for (const trailAtr of trails) {
          for (const family of ['EMA', 'SMMA']) {
            result.push({ family, average: family, frame, ...average, rsiLong: 52, rsiShort: 48, stopAtr, trailAtr, maxTrades: 3 });
          }
          result.push({ family: 'VWAP', average: 'EMA', frame, ...average, rsiLong: 55, rsiShort: 45, stopAtr, trailAtr, maxTrades: 3 });
          result.push({ family: 'PIVOT', average: 'EMA', frame, ...average, rsiLong: 50, rsiShort: 50, stopAtr, trailAtr, maxTrades: 2 });
          result.push({ family: 'PIVOT_VWAP', average: 'EMA', frame, ...average, rsiLong: 52, rsiShort: 48, stopAtr, trailAtr, maxTrades: 2 });
        }
      }
    }
    for (const stopAtr of stops) {
      result.push({ family: 'RSI_REVERSAL', average: 'EMA', frame, fast: 9, slow: 21, rsiLong: 30, rsiShort: 70, stopAtr, trailAtr: 0, maxTrades: 2, bbPeriod: 20 });
      result.push({ family: 'RSI_REVERSAL', average: 'EMA', frame, fast: 9, slow: 21, rsiLong: 25, rsiShort: 75, stopAtr, trailAtr: 0, maxTrades: 2, bbPeriod: 20 });
    }
  }
  return result;
}

function label(config) {
  return `${config.family}-${config.frame}m-${config.fast}-${config.slow}-sl${config.stopAtr}-tr${config.trailAtr}`;
}

function main() {
  const days = loadDays();
  const dayMap = new Map();
  let previous = null;
  for (const day of days) {
    dayMap.set(day.date, {
      previous,
      high: Math.max(...day.rows.map(row => row.high)),
      low: Math.min(...day.rows.map(row => row.low)),
      close: day.rows[day.rows.length - 1].close,
    });
    previous = dayMap.get(day.date);
  }
  const frameCache = new Map();
  const results = [];
  for (const config of candidates()) {
    if (!frameCache.has(config.frame)) frameCache.set(config.frame, resample(days, config.frame));
    const bars = enrich(frameCache.get(config.frame), config, dayMap);
    const trades = simulate(days, bars, config);
    const instruments = {};
    for (const instrument of ['FUTURES', 'OPTIONS']) {
      const all = stats(trades, instrument);
      const train = stats(trades, instrument, '2021-01-01', '2024-12-31');
      const validation = stats(trades, instrument, '2025-01-01');
      const recent = stats(trades, instrument, '2026-01-01');
      const accepted = train.pnl > 0
        && validation.pnl > 0
        && recent.pnl > 0
        && validation.profitFactor >= 1.08
        && all.profitableMonthPct >= 55
        && all.trades >= 120
        && all.pnl > all.maxDrawdown;
      instruments[instrument] = { accepted, all, train, validation, recent };
    }
    results.push({ id: label(config), config, instruments });
  }
  const accepted = [];
  for (const row of results) {
    for (const instrument of ['FUTURES', 'OPTIONS']) {
      if (row.instruments[instrument].accepted) {
        accepted.push({
          id: row.id,
          instrument,
          config: row.config,
          ...row.instruments[instrument],
          score: row.instruments[instrument].validation.pnl / Math.max(1, row.instruments[instrument].validation.maxDrawdown),
        });
      }
    }
  }
  accepted.sort((a, b) => b.score - a.score);
  const selected = [];
  for (const instrument of ['FUTURES', 'OPTIONS']) {
    const families = new Set();
    for (const row of accepted.filter(item => item.instrument === instrument)) {
      if (families.has(row.config.family)) continue;
      selected.push(row);
      families.add(row.config.family);
      if (families.size >= 4) break;
    }
  }
  const strategyIds = {
    VWAP: 'vwap-trend',
    PIVOT: 'pivot-trend',
    EMA: 'ema-trend',
    SMMA: 'smma-trend',
  };
  const strategies = {};
  for (const row of selected) {
    const id = strategyIds[row.config.family];
    if (!id) continue;
    const bars = enrich(frameCache.get(row.config.frame), row.config, dayMap);
    const trades = simulate(days, bars, row.config);
    strategies[id] ||= {};
    strategies[id][row.instrument] = backtestRecord(trades, row.instrument);
  }
  const output = {
    generatedAt: new Date().toISOString(),
    coverage: { from: days[0].date, to: days[days.length - 1].date, tradingDays: days.length },
    assumptions: {
      signalExecution: 'Indicator evaluated and filled at completed timeframe candle close',
      futures: `BANKNIFTY index point P&L x ${QTY}, Rs ${FUTURES_COST} estimated round-trip cost`,
      options: `Black-Scholes ATM proxy, IV 20%, spread ${OPTION_SPREAD} points/side, Rs ${OPTIONS_COST} cost; modelled, not historical premium`,
      validation: 'Positive 2021-2024 train, 2025-2026 validation and 2026 recent; validation PF >= 1.08; >=55% profitable months; net profit > max drawdown',
    },
    candidatesTested: results.length,
    acceptedCount: accepted.length,
    selected,
    topAccepted: accepted.slice(0, 30),
    strategies,
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    output: OUTPUT,
    coverage: output.coverage,
    candidatesTested: output.candidatesTested,
    acceptedCount: output.acceptedCount,
    selected: selected.map(row => ({
      instrument: row.instrument,
      id: row.id,
      family: row.config.family,
      all: row.all,
      validation: row.validation,
      recent: row.recent,
    })),
  }, null, 2));
}

main();

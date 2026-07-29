'use strict';

const fs = require('fs');
const base = JSON.parse(fs.readFileSync('.tmp-banknifty-5yr.json', 'utf8'));
if (fs.existsSync('.tmp-banknifty-june-july-15m.json')) {
  Object.assign(base, JSON.parse(fs.readFileSync('.tmp-banknifty-june-july-15m.json', 'utf8')));
}
const QTY = 30;
const FUTURES_COST = 362;
const OPTIONS_COST = 80;

function time(row) { return `${String(row.h).padStart(2, '0')}:${String(row.m).padStart(2, '0')}`; }
function ema(values, period) {
  const alpha = 2 / (period + 1), out = [];
  values.forEach((value, index) => out.push(index ? value * alpha + out[index - 1] * (1 - alpha) : value));
  return out;
}
function smaAt(values, end, period) {
  if (end + 1 < period) return null;
  return values.slice(end + 1 - period, end + 1).reduce((sum, value) => sum + value, 0) / period;
}
function stdAt(values, end, period) {
  const mean = smaAt(values, end, period);
  if (mean == null) return null;
  return Math.sqrt(values.slice(end + 1 - period, end + 1).reduce((sum, value) => sum + (value - mean) ** 2, 0) / period);
}
function atr(rows, period = 10) {
  const tr = rows.map((row, index) => index
    ? Math.max(row.high - row.low, Math.abs(row.high - rows[index - 1].close), Math.abs(row.low - rows[index - 1].close))
    : row.high - row.low);
  return ema(tr, period);
}
function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}
function optionPrice(spot, strike, side, days, iv = 0.20) {
  const T = Math.max(1 / 365, days / 365), r = 0.06, volT = iv * Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + iv * iv / 2) * T) / volT, d2 = d1 - volT;
  return Math.max(1, side === 'CE'
    ? spot * normalCdf(d1) - strike * Math.exp(-r * T) * normalCdf(d2)
    : strike * Math.exp(-r * T) * normalCdf(-d2) - spot * normalCdf(-d1));
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

const bars = [];
for (const date of Object.keys(base).sort()) {
  for (const row of base[date] || []) {
    const at = time(row);
    if (at >= '09:15' && at <= '15:15') bars.push({ ...row, date, time: at });
  }
}
const closes = bars.map(row => row.close);
const atrs = atr(bars);
const fast = ema(closes, 12), slow = ema(closes, 26);
const macd = closes.map((_, index) => fast[index] - slow[index]);
const macdSignal = ema(macd, 9);

function supertrendDirections(rows, period = 10, multiplier = 3) {
  const values = atr(rows, period), directions = [];
  let upper = 0, lower = 0, direction = 'CE';
  rows.forEach((row, index) => {
    const midpoint = (row.high + row.low) / 2;
    const basicUpper = midpoint + multiplier * values[index];
    const basicLower = midpoint - multiplier * values[index];
    if (!index) {
      upper = basicUpper; lower = basicLower;
    } else {
      const previousClose = rows[index - 1].close;
      upper = basicUpper < upper || previousClose > upper ? basicUpper : upper;
      lower = basicLower > lower || previousClose < lower ? basicLower : lower;
      if (direction === 'PE' && row.close > upper) direction = 'CE';
      else if (direction === 'CE' && row.close < lower) direction = 'PE';
    }
    directions.push(direction);
  });
  return directions;
}
const supertrend = supertrendDirections(bars);

function signal(id, index) {
  if (!index) return {};
  const current = bars[index], previous = bars[index - 1];
  if (id === 'bb-percent' || id === 'bb-breakout') {
    const mean = smaAt(closes, index, 20), deviation = stdAt(closes, index, 20);
    const priorMean = smaAt(closes, index - 1, 20), priorDeviation = stdAt(closes, index - 1, 20);
    if (mean == null || priorMean == null) return {};
    const upper = mean + 2 * deviation, lower = mean - 2 * deviation;
    const priorUpper = priorMean + 2 * priorDeviation, priorLower = priorMean - 2 * priorDeviation;
    if (id === 'bb-percent') {
      const percent = (current.close - lower) / (upper - lower);
      const previousPercent = (previous.close - priorLower) / (priorUpper - priorLower);
      if (previousPercent < 0 && percent >= 0) return { entry: 'CE' };
      if (previousPercent > 1 && percent <= 1) return { entry: 'PE' };
      return { exit: (previous.close - priorMean) * (current.close - mean) <= 0 };
    }
    if (previous.close <= priorUpper && current.close > upper) return { entry: 'CE' };
    if (previous.close >= priorLower && current.close < lower) return { entry: 'PE' };
    return { exit: (previous.close - priorMean) * (current.close - mean) <= 0 };
  }
  if (id === 'supertrend') {
    return supertrend[index] !== supertrend[index - 1] ? { entry: supertrend[index], exit: true } : {};
  }
  const previousHistogram = macd[index - 1] - macdSignal[index - 1];
  const histogram = macd[index] - macdSignal[index];
  if (previousHistogram <= 0 && histogram > 0) return { entry: 'CE', exit: true };
  if (previousHistogram >= 0 && histogram < 0) return { entry: 'PE', exit: true };
  return {};
}

function trade(date, side, entry, exit) {
  const points = side === 'CE' ? exit - entry : entry - exit;
  const strike = Math.round(entry / 100) * 100, days = dte(date);
  const premiumIn = optionPrice(entry, strike, side, days) + 3;
  const premiumOut = Math.max(1, optionPrice(exit, strike, side, days) - 3);
  return {
    date,
    futures: Math.round(points * QTY - FUTURES_COST),
    options: Math.round((premiumOut - premiumIn) * QTY - OPTIONS_COST),
  };
}

function run(id) {
  const trades = [];
  let date = '', position = null, dayTrades = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const row = bars[index];
    if (row.date !== date) {
      date = row.date; position = null; dayTrades = 0;
    }
    const next = signal(id, index);
    if (position) {
      const stop = position.side === 'CE' ? row.close <= position.stop : row.close >= position.stop;
      const opposite = next.entry && next.entry !== position.side;
      const eod = row.time >= '15:15';
      if (stop || opposite || next.exit || eod) {
        trades.push(trade(row.date, position.side, position.entry, row.close));
        const old = position.side;
        position = null;
        if (!eod && row.time < '15:00' && next.entry && next.entry !== old) {
          position = { side: next.entry, entry: row.close, stop: next.entry === 'CE' ? row.close - atrs[index] * 1.5 : row.close + atrs[index] * 1.5 };
          dayTrades += 1;
        }
      }
    } else if (row.time >= '09:30' && row.time < '15:00' && next.entry) {
      position = { side: next.entry, entry: row.close, stop: next.entry === 'CE' ? row.close - atrs[index] * 1.5 : row.close + atrs[index] * 1.5 };
      dayTrades += 1;
    }
  }
  return trades;
}

function summarize(trades, key, from, to) {
  const selected = trades.filter(row => (!from || row.date >= from) && (!to || row.date <= to));
  let equity = 0, peak = 0, maxDrawdown = 0, profit = 0, loss = 0;
  const months = new Map();
  selected.forEach(row => {
    const pnl = row[key];
    equity += pnl; peak = Math.max(peak, equity); maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (pnl > 0) profit += pnl; else loss += -pnl;
    const month = row.date.slice(0, 7); months.set(month, (months.get(month) || 0) + pnl);
  });
  return {
    pnl: Math.round(equity),
    trades: selected.length,
    winRate: selected.length ? selected.filter(row => row[key] > 0).length / selected.length * 100 : 0,
    profitFactor: loss ? profit / loss : 0,
    maxDrawdown: Math.round(maxDrawdown),
    profitableMonthPct: months.size ? Array.from(months.values()).filter(value => value > 0).length / months.size * 100 : 0,
  };
}

const output = {};
for (const id of ['bb-percent', 'bb-breakout', 'supertrend', 'macd']) {
  const trades = run(id);
  output[id] = {};
  for (const instrument of ['futures', 'options']) {
    output[id][instrument] = {
      all: summarize(trades, instrument),
      train: summarize(trades, instrument, '2021-01-01', '2024-12-31'),
      validation: summarize(trades, instrument, '2025-01-01'),
      recent: summarize(trades, instrument, '2026-01-01'),
    };
  }
}
fs.writeFileSync('deployed-indicator-audit-result.json', JSON.stringify(output, null, 2));
console.log(JSON.stringify(output, null, 2));

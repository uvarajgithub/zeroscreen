'use strict';

const fs = require('fs');
const path = require('path');
const { KiteConnect } = require('kiteconnect');
const { findDrishtiEntry } = require('../backtest/drishti_core');

require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const BOT_DIR = process.env.TRADING_BOT_DIR || process.cwd();
const INDEX_TOKEN = 260105;
const QUANTITY = Number(process.env.DRISHTI_V2_QTY || 30);
const TARGET_POINTS = Number(process.env.DRISHTI_V2_TARGET_POINTS || 350);
const STOP_POINTS = Number(process.env.DRISHTI_V2_STOP_POINTS || 100);
const ROUND_TRIP_COST = Number(process.env.DRISHTI_V2_ROUND_TRIP_COST || 150);
const MARKET_POLL_MS = Number(process.env.DRISHTI_V2_MARKET_POLL_MS || 5000);
const CANDLE_REFRESH_MS = Number(process.env.DRISHTI_V2_CANDLE_REFRESH_MS || 30000);
const STATE_FILE = path.join(BOT_DIR, 'drishti-v2-state.json');
const HEARTBEAT_FILE = path.join(BOT_DIR, 'drishti-v2-heartbeat.json');
const CANDLE_FILE = path.join(BOT_DIR, 'drishti-v2-candle-log.json');
const TRADES_FILE = path.join(BOT_DIR, 'drishti-v2-trades.json');

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

let kite = null;
let tokenFingerprint = '';
let futuresContract = null;
let lastCandleRefreshAt = 0;
let previousCandles = [];
let signalCandles = [];
let rawFiveMinuteCandles = [];
let running = false;

function nowIST() {
  const now = new Date();
  return {
    iso: now.toISOString(),
    date: dateFormatter.format(now),
    time: timeFormatter.format(now),
  };
}

function minuteOfDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const part = (name) => parts.find((item) => item.type === name)?.value || '';
  const weekdays = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
  return {
    weekday: weekdays[part('weekday')] ?? date.getDay(),
    minute: Number(part('hour') || 0) * 60 + Number(part('minute') || 0),
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}

function defaultState(date) {
  return {
    strategyId: 'drishti-v2',
    strategyVersion: 'V2 Shadow',
    executionMode: 'SHADOW',
    instrumentType: 'FUTURES',
    date,
    phase: 'STARTING',
    inTrade: false,
    side: null,
    futuresSymbol: null,
    entryIndex: null,
    entryPrice: null,
    entryTime: null,
    entrySignalIndex: null,
    stopLoss: null,
    target: null,
    lastExitSignalIndex: -1,
    lastProcessedSignalIndex: -1,
    realizedPnl: 0,
    grossRealizedPnl: 0,
    unrealizedPnl: 0,
    tradeCount: 0,
    wins: 0,
    losses: 0,
    lastPrice: null,
    lastSignal: null,
    events: [],
    candlePnlByIndex: {},
    lastError: null,
    updatedAt: null,
  };
}

function loadState() {
  const current = nowIST();
  const stored = readJson(STATE_FILE, null);
  if (!stored || stored.date !== current.date) return defaultState(current.date);
  return { ...defaultState(current.date), ...stored };
}

let state = loadState();

function loadAccessToken() {
  const tokenFile = path.join(BOT_DIR, 'access_token.txt');
  const token = fs.existsSync(tokenFile)
    ? fs.readFileSync(tokenFile, 'utf8').trim()
    : String(process.env.ACCESS_TOKEN || '').trim();
  if (!token) throw new Error('Zerodha access token is unavailable');
  return token;
}

function ensureKite() {
  const apiKey = String(process.env.API_KEY || '').trim();
  if (!apiKey) throw new Error('Zerodha API key is unavailable');
  const token = loadAccessToken();
  const fingerprint = `${apiKey}:${token}`;
  if (!kite || fingerprint !== tokenFingerprint) {
    kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(token);
    tokenFingerprint = fingerprint;
    futuresContract = null;
  }
  return kite;
}

function normalizeCandle(row) {
  const timestamp = new Date(row.date);
  const [hour, minute] = timeFormatter.format(timestamp).split(':').map(Number);
  return {
    date: dateFormatter.format(timestamp),
    time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    h: hour,
    m: minute,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0),
  };
}

function aggregate15(candles) {
  const eligible = candles.filter((candle) => {
    const minute = candle.h * 60 + candle.m;
    return minute >= 570 && minute <= 915;
  });
  const output = [];
  for (let index = 0; index + 2 < eligible.length; index += 3) {
    const group = eligible.slice(index, index + 3);
    output.push({
      index: output.length,
      time: group[0].time,
      h: group[0].h,
      m: group[0].m,
      open: group[0].open,
      high: Math.max(...group.map((row) => row.high)),
      low: Math.min(...group.map((row) => row.low)),
      close: group[2].close,
      volume: group.reduce((sum, row) => sum + row.volume, 0),
    });
  }
  return output;
}

function bodyPercent(candle) {
  const range = candle.high - candle.low;
  return range > 0 ? ((candle.close - candle.open) / range) * 100 : 0;
}

function freshBreakoutSignal(candles, index, previous) {
  if (index < 1 || !previous.length) return null;
  const current = candles[index];
  const prior = candles[index - 1];
  const body = bodyPercent(current);
  const previousHigh = Math.max(...previous.map((row) => row.high));
  const previousLow = Math.min(...previous.map((row) => row.low));
  if (current.close > prior.high && body >= 35) {
    return { side: 'CE', reason: 'fresh_15m_breakout_ce' };
  }
  if (current.close < prior.low && body <= -35) {
    return { side: 'PE', reason: 'fresh_15m_breakout_pe' };
  }
  if (current.close > previousHigh && prior.close <= previousHigh && body > 20) {
    return { side: 'CE', reason: 'fresh_15m_pdh_breakout_ce' };
  }
  if (current.close < previousLow && prior.close >= previousLow && body < -20) {
    return { side: 'PE', reason: 'fresh_15m_pdl_breakout_pe' };
  }
  return null;
}

function previousDayRangeOkay(candles) {
  if (!candles.length) return false;
  return Math.max(...candles.map((row) => row.high))
    - Math.min(...candles.map((row) => row.low)) >= 150;
}

async function resolveFuturesContract() {
  if (futuresContract) return futuresContract;
  const instruments = await ensureKite().getInstruments('NFO');
  const now = new Date();
  const contracts = instruments
    .filter((row) => row.name === 'BANKNIFTY' && row.instrument_type === 'FUT')
    .map((row) => ({ ...row, expiryDate: new Date(row.expiry) }))
    .filter((row) => Number.isFinite(row.expiryDate.getTime()) && row.expiryDate >= now)
    .sort((a, b) => a.expiryDate - b.expiryDate);
  if (!contracts.length) throw new Error('No active BANKNIFTY futures contract found');
  futuresContract = contracts[0];
  return futuresContract;
}

async function latestFuturesPrice() {
  const contract = await resolveFuturesContract();
  const key = `NFO:${contract.tradingsymbol}`;
  const response = await ensureKite().getLTP([key]);
  const price = Number(response?.[key]?.last_price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`No live futures price for ${contract.tradingsymbol}`);
  }
  return { price, symbol: contract.tradingsymbol };
}

async function refreshCandles() {
  const clock = nowIST();
  const fromDate = new Date(`${clock.date}T00:00:00+05:30`);
  fromDate.setDate(fromDate.getDate() - 10);
  const from = dateFormatter.format(fromDate);
  const rows = await ensureKite().getHistoricalData(
    INDEX_TOKEN,
    '5minute',
    from,
    clock.date,
    false,
  );
  const grouped = new Map();
  for (const row of rows) {
    const candle = normalizeCandle(row);
    if (!grouped.has(candle.date)) grouped.set(candle.date, []);
    grouped.get(candle.date).push(candle);
  }
  for (const candles of grouped.values()) {
    candles.sort((a, b) => (a.h * 60 + a.m) - (b.h * 60 + b.m));
  }
  const dates = [...grouped.keys()].sort();
  const todayIndex = dates.indexOf(clock.date);
  const previousDate = todayIndex > 0 ? dates[todayIndex - 1] : dates.filter((date) => date < clock.date).at(-1);
  rawFiveMinuteCandles = grouped.get(clock.date) || [];
  previousCandles = previousDate ? grouped.get(previousDate) || [] : [];
  signalCandles = aggregate15(rawFiveMinuteCandles);
  lastCandleRefreshAt = Date.now();
}

function tradePoints(price) {
  if (!state.inTrade || !Number.isFinite(state.entryPrice)) return 0;
  return state.side === 'CE' ? price - state.entryPrice : state.entryPrice - price;
}

function appendTrade(row) {
  const rows = readJson(TRADES_FILE, []);
  const list = Array.isArray(rows) ? rows : [];
  const index = list.findIndex((item) => item.tradeId === row.tradeId);
  if (index >= 0) list[index] = { ...list[index], ...row };
  else list.push(row);
  writeJson(TRADES_FILE, list);
}

function candleLogRows() {
  return signalCandles.map((candle, index) => {
    const event = [...(state.events || [])].reverse().find((row) => row.signalIndex === index) || null;
    const closePoints = state.inTrade && state.entrySignalIndex <= index
      ? (state.side === 'CE' ? candle.close - state.entryIndex : state.entryIndex - candle.close)
      : null;
    const storedPnl = state.candlePnlByIndex?.[index];
    return {
      idx: index + 1,
      time: candle.time,
      timeframe: '15m',
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      state: event?.event || (state.inTrade && state.entrySignalIndex <= index ? 'hold' : 'watching'),
      side: event?.side || (state.inTrade && state.entrySignalIndex <= index ? state.side : null),
      entry: event?.event === 'entry' || event?.event === 're-entry' ? event.entryIndex : null,
      sl: state.inTrade && state.entrySignalIndex <= index ? state.entryIndex - (state.side === 'CE' ? STOP_POINTS : -STOP_POINTS) : null,
      target: state.inTrade && state.entrySignalIndex <= index ? state.entryIndex + (state.side === 'CE' ? TARGET_POINTS : -TARGET_POINTS) : null,
      exit: event?.exitPrice ?? null,
      pnlRs: event?.netPnlRs ?? storedPnl ?? (closePoints === null ? null : Math.round(closePoints * QUANTITY)),
      note: event?.reason || (state.inTrade && state.entrySignalIndex <= index
        ? 'Shadow position monitored on live futures LTP'
        : 'Waiting for a completed 15m breakout'),
    };
  });
}

function enterShadow(signal, signalIndex, futures) {
  const current = nowIST();
  const tradeId = `drishti-v2-${current.date}-${signalIndex}-${Date.now()}`;
  state.inTrade = true;
  state.side = signal.side;
  state.futuresSymbol = futures.symbol;
  state.entryIndex = signalCandles[signalIndex].close;
  state.entryPrice = futures.price;
  state.entryTime = current.iso;
  state.entrySignalIndex = signalIndex;
  state.stopLoss = futures.price + (signal.side === 'CE' ? -STOP_POINTS : STOP_POINTS);
  state.target = futures.price + (signal.side === 'CE' ? TARGET_POINTS : -TARGET_POINTS);
  state.tradeCount += 1;
  state.unrealizedPnl = 0;
  state.activeTradeId = tradeId;
  state.lastSignal = {
    event: state.tradeCount === 1 ? 'entry' : 're-entry',
    side: signal.side,
    reason: signal.reason,
    signalIndex,
    entryIndex: state.entryIndex,
    at: current.iso,
  };
  state.events.push(state.lastSignal);
  appendTrade({
    tradeId,
    strategyId: 'drishti-v2',
    strategyVersion: 'V2 Shadow',
    executionMode: 'SHADOW',
    instrumentType: 'FUTURES',
    date: current.date,
    entryTime: current.iso,
    symbol: futures.symbol,
    direction: signal.side,
    action: signal.side === 'CE' ? 'BUY' : 'SELL',
    qty: QUANTITY,
    entry: futures.price,
    entryIndex: state.entryIndex,
    stopLoss: state.stopLoss,
    target: state.target,
    status: 'OPEN',
    reason: signal.reason,
  });
  console.log(`[DRISHTI_V2] SHADOW ENTRY ${signal.side} ${futures.symbol} @ ${futures.price.toFixed(2)} target ${state.target.toFixed(2)} SL ${state.stopLoss.toFixed(2)}`);
}

function exitShadow(futures, reason) {
  const current = nowIST();
  const points = tradePoints(futures.price);
  const grossPnlRs = Math.round(points * QUANTITY);
  const netPnlRs = grossPnlRs - ROUND_TRIP_COST;
  state.grossRealizedPnl += grossPnlRs;
  state.realizedPnl += netPnlRs;
  state.unrealizedPnl = 0;
  state.lastExitSignalIndex = state.entrySignalIndex;
  if (netPnlRs > 0) state.wins += 1;
  else if (netPnlRs < 0) state.losses += 1;
  appendTrade({
    tradeId: state.activeTradeId,
    exitTime: current.iso,
    exit: futures.price,
    exitIndex: rawFiveMinuteCandles.at(-1)?.close ?? null,
    points: Number(points.toFixed(2)),
    grossPnlRs,
    costsRs: ROUND_TRIP_COST,
    netPnlRs,
    pnlRs: netPnlRs,
    status: 'CLOSED',
    exitReason: reason,
  });
  state.lastSignal = {
    event: reason === 'profit_target' ? 'exit' : reason === 'stop_loss' ? 'sl_hit' : 'eod_exit',
    side: state.side,
    reason,
    signalIndex: Math.max(0, signalCandles.length - 1),
    exitPrice: futures.price,
    netPnlRs,
    at: current.iso,
  };
  state.events.push(state.lastSignal);
  console.log(`[DRISHTI_V2] SHADOW EXIT ${state.side} ${futures.symbol} @ ${futures.price.toFixed(2)} ${reason} net Rs${netPnlRs}`);
  state.inTrade = false;
  state.side = null;
  state.entryIndex = null;
  state.entryPrice = null;
  state.entryTime = null;
  state.entrySignalIndex = null;
  state.stopLoss = null;
  state.target = null;
  state.activeTradeId = null;
}

async function evaluateEntry(futures) {
  if (state.inTrade || !signalCandles.length) return;
  const signalIndex = signalCandles.length - 1;
  if (signalIndex <= state.lastProcessedSignalIndex) return;
  state.lastProcessedSignalIndex = signalIndex;
  let signal = null;
  if (state.tradeCount === 0) {
    if (!previousDayRangeOkay(previousCandles)) return;
    const initial = findDrishtiEntry(signalCandles, previousCandles);
    if (initial?.idx === signalIndex) signal = initial;
  } else if (signalIndex > state.lastExitSignalIndex) {
    signal = freshBreakoutSignal(signalCandles, signalIndex, previousCandles);
  }
  if (signal) enterShadow(signal, signalIndex, futures);
}

function persist(phase, error = null) {
  const current = nowIST();
  state.phase = phase;
  state.lastError = error;
  state.updatedAt = current.iso;
  writeJson(STATE_FILE, state);
  writeJson(CANDLE_FILE, { date: current.date, candles: candleLogRows() });
  writeJson(HEARTBEAT_FILE, {
    at: current.iso,
    strategyId: 'drishti-v2',
    strategyVersion: 'V2 Shadow',
    executionMode: 'SHADOW',
    instrumentType: 'FUTURES',
    process: 'drishti-v2-shadow',
    status: phase,
    schedulerActive: true,
    inTrade: state.inTrade,
    side: state.side,
    symbol: state.futuresSymbol,
    futuresEntry: state.entryPrice,
    futuresLive: state.lastPrice,
    stopLoss: state.stopLoss,
    target: state.target,
    realizedPnl: state.realizedPnl,
    grossRealizedPnl: state.grossRealizedPnl,
    unrealizedPnl: state.unrealizedPnl,
    totalPnl: state.realizedPnl + state.unrealizedPnl,
    trades: state.tradeCount,
    wins: state.wins,
    losses: state.losses,
    quantity: QUANTITY,
    latestCandleTime: signalCandles.at(-1)?.time || null,
    candleCount: signalCandles.length,
    lastError: error,
  });
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const current = nowIST();
    if (state.date !== current.date) state = defaultState(current.date);
    const clock = minuteOfDay();
    const tradingDay = clock.weekday >= 1 && clock.weekday <= 5;
    const marketSession = tradingDay && clock.minute >= 555 && clock.minute <= 930;
    if (!marketSession) {
      persist('SLEEPING');
      return;
    }
    if (Date.now() - lastCandleRefreshAt >= CANDLE_REFRESH_MS) await refreshCandles();
    const futures = await latestFuturesPrice();
    state.futuresSymbol = futures.symbol;
    state.lastPrice = futures.price;
    state.unrealizedPnl = state.inTrade ? Math.round(tradePoints(futures.price) * QUANTITY) : 0;
    if (state.inTrade) {
      for (let index = state.entrySignalIndex; index < signalCandles.length; index++) {
        const candle = signalCandles[index];
        const points = state.side === 'CE'
          ? candle.close - state.entryIndex
          : state.entryIndex - candle.close;
        state.candlePnlByIndex[index] = Math.round(points * QUANTITY);
      }
    }
    if (state.inTrade) {
      const points = tradePoints(futures.price);
      if (points >= TARGET_POINTS) exitShadow(futures, 'profit_target');
      else if (points <= -STOP_POINTS) exitShadow(futures, 'stop_loss');
      else if (clock.minute >= 925) exitShadow(futures, 'eod_exit');
    }
    if (!state.inTrade && clock.minute < 925) await evaluateEntry(futures);
    persist(state.inTrade ? 'RUNNING' : 'WATCHING');
  } catch (error) {
    const message = String(error?.message || error).slice(0, 300);
    console.error(`[DRISHTI_V2] ${message}`);
    persist('DEGRADED', message);
  } finally {
    running = false;
  }
}

console.log(`[DRISHTI_V2] shadow-only runtime started; target ${TARGET_POINTS} points, SL ${STOP_POINTS} points, qty ${QUANTITY}`);
tick();
setInterval(tick, MARKET_POLL_MS);

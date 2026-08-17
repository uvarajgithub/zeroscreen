"use strict";

const fs = require("fs");

const input = process.argv[2] || "research-banknifty-15m-1y.json";
const output = process.argv[3] || "research-banknifty-breakout-sweep.json";
const data = JSON.parse(fs.readFileSync(input, "utf8"));

const EXPECTED_TIMES = Array.from({ length: 25 }, (_, index) => {
  const minutes = (9 * 60) + 15 + (index * 15);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const REFERENCE_TIMES = EXPECTED_TIMES.slice(0, 8); // 09:15 through 11:00.
const BUFFERS = [0, 10, 25, 40, 50];
const FILL_MODES = ["signal_close", "next_open"];
const MAX_TRADES_VALUES = [1, 2];
const QTY = 30;
const FRICTION_POINTS_PER_TRADE = 5;
const LAST_ENTRY_TIME = "15:00";

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function fullSession(candles) {
  return candles.length === EXPECTED_TIMES.length
    && candles.every((candle, index) => candle.time === EXPECTED_TIMES[index]);
}

function pointPnl(side, entry, exit) {
  return side === "CE" ? exit - entry : entry - exit;
}

function simulateDay(day, candles, config) {
  const referenceIndex = EXPECTED_TIMES.indexOf(config.referenceTime);
  const reference = candles[referenceIndex];
  const trades = [];
  let active = null;
  let pending = null;

  const closeTrade = (candle, reason) => {
    const grossPoints = pointPnl(active.side, active.entryPrice, candle.close);
    trades.push({
      side: active.side,
      signalTime: active.signalTime,
      entryTime: active.entryTime,
      entryPrice: round(active.entryPrice),
      exitTime: candle.time,
      exitPrice: round(candle.close),
      grossPoints: round(grossPoints),
      netPoints: round(grossPoints - FRICTION_POINTS_PER_TRADE),
      reason,
    });
    active = null;
  };

  for (let index = referenceIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const isFinalCandle = index === candles.length - 1;

    if (pending && pending.fillIndex === index && trades.length < config.maxTrades) {
      active = {
        side: pending.side,
        signalTime: pending.signalTime,
        entryTime: candle.time,
        entryPrice: candle.open,
        mainHigh: pending.mainHigh,
        mainLow: pending.mainLow,
      };
      pending = null;
    }

    let exitedThisCandle = false;
    if (active) {
      const exitBreak = active.side === "CE"
        ? candle.close < active.mainLow - config.buffer
        : candle.close > active.mainHigh + config.buffer;

      if (exitBreak || isFinalCandle) {
        closeTrade(candle, isFinalCandle ? "eod_close" : "structure_close");
        exitedThisCandle = true;
      } else if (active.side === "CE" && candle.close > active.mainHigh) {
        active.mainHigh = candle.high;
        active.mainLow = candle.low;
      } else if (active.side === "PE" && candle.close < active.mainLow) {
        active.mainHigh = candle.high;
        active.mainLow = candle.low;
      }
    }

    if (active || pending || exitedThisCandle || trades.length >= config.maxTrades || isFinalCandle) continue;

    const previousClose = candles[index - 1].close;
    const brokeUp = previousClose <= reference.high && candle.close > reference.high;
    const brokeDown = previousClose >= reference.low && candle.close < reference.low;
    const side = brokeUp ? "CE" : brokeDown ? "PE" : null;
    if (!side) continue;

    if (config.fillMode === "signal_close") {
      if (candle.time > LAST_ENTRY_TIME) continue;
      active = {
        side,
        signalTime: candle.time,
        entryTime: candle.time,
        entryPrice: candle.close,
        mainHigh: candle.high,
        mainLow: candle.low,
      };
    } else {
      const fillIndex = index + 1;
      if (fillIndex >= candles.length || candles[fillIndex].time > LAST_ENTRY_TIME) continue;
      pending = {
        side,
        signalTime: candle.time,
        fillIndex,
        mainHigh: candle.high,
        mainLow: candle.low,
      };
    }
  }

  const grossPoints = round(sum(trades.map((trade) => trade.grossPoints)));
  const netPoints = round(sum(trades.map((trade) => trade.netPoints)));
  return {
    day,
    grossPoints,
    netPoints,
    netRs: Math.round(netPoints * QTY),
    trades,
  };
}

function summarizeRows(rows) {
  const tradeRows = rows.flatMap((row) => row.trades.map((trade) => ({ day: row.day, ...trade })));
  const grossPoints = round(sum(rows.map((row) => row.grossPoints)));
  const netPoints = round(sum(rows.map((row) => row.netPoints)));
  const positiveTrades = tradeRows.filter((trade) => trade.netPoints > 0);
  const negativeTrades = tradeRows.filter((trade) => trade.netPoints < 0);
  const grossWins = sum(positiveTrades.map((trade) => trade.netPoints));
  const grossLosses = Math.abs(sum(negativeTrades.map((trade) => trade.netPoints)));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const row of rows) {
    equity += row.netPoints;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  const tradedDays = rows.filter((row) => row.trades.length > 0);
  const monthly = {};
  for (const row of rows) {
    const month = row.day.slice(0, 7);
    monthly[month] = round((monthly[month] || 0) + row.netPoints);
  }

  return {
    sessions: rows.length,
    tradedDays: tradedDays.length,
    noTradeDays: rows.length - tradedDays.length,
    greenDays: rows.filter((row) => row.netPoints > 0).length,
    redDays: rows.filter((row) => row.netPoints < 0).length,
    flatDays: rows.filter((row) => row.netPoints === 0).length,
    trades: tradeRows.length,
    winningTrades: positiveTrades.length,
    losingTrades: negativeTrades.length,
    tradeWinRatePct: tradeRows.length ? round((positiveTrades.length / tradeRows.length) * 100) : 0,
    grossPoints,
    frictionPoints: round(tradeRows.length * FRICTION_POINTS_PER_TRADE),
    netPoints,
    netRs: Math.round(netPoints * QTY),
    avgNetPointsPerSession: rows.length ? round(netPoints / rows.length) : 0,
    avgNetPointsPerTradedDay: tradedDays.length ? round(netPoints / tradedDays.length) : 0,
    medianNetPointsPerSession: round(quantile(rows.map((row) => row.netPoints), 0.5)),
    profitFactor: grossLosses ? round(grossWins / grossLosses) : null,
    maxDrawdownPoints: round(maxDrawdown),
    bestDay: rows.reduce((best, row) => !best || row.netPoints > best.netPoints ? row : best, null),
    worstDay: rows.reduce((worst, row) => !worst || row.netPoints < worst.netPoints ? row : worst, null),
    positiveMonths: Object.values(monthly).filter((points) => points > 0).length,
    negativeMonths: Object.values(monthly).filter((points) => points < 0).length,
    monthly,
  };
}

function analyze(config, sessions) {
  const rows = sessions.map(({ day, candles }) => simulateDay(day, candles, config));
  const splitIndex = Math.floor(rows.length / 2);
  return {
    ...config,
    full: summarizeRows(rows),
    firstHalf: summarizeRows(rows.slice(0, splitIndex)),
    secondHalf: summarizeRows(rows.slice(splitIndex)),
    rows,
  };
}

const exclusions = [];
const sessions = [];
for (const day of data.sessions || Object.keys(data.days || {}).sort()) {
  const candles = data.days[day] || [];
  if (!fullSession(candles)) {
    exclusions.push({ day, candles: candles.length, start: candles[0]?.time || null, end: candles.at(-1)?.time || null });
    continue;
  }
  sessions.push({ day, candles });
}

const results = [];
for (const referenceTime of REFERENCE_TIMES) {
  for (const buffer of BUFFERS) {
    for (const fillMode of FILL_MODES) {
      for (const maxTrades of MAX_TRADES_VALUES) {
        results.push(analyze({ referenceTime, buffer, fillMode, maxTrades }, sessions));
      }
    }
  }
}

const primary = results
  .filter((result) => result.buffer === 25 && result.fillMode === "next_open" && result.maxTrades === 2)
  .sort((a, b) => b.full.netPoints - a.full.netPoints);
const signalCloseComparison = results
  .filter((result) => result.buffer === 25 && result.fillMode === "signal_close" && result.maxTrades === 2)
  .sort((a, b) => b.full.netPoints - a.full.netPoints);
const robust = results
  .filter((result) => result.fillMode === "next_open")
  .map((result) => ({
    referenceTime: result.referenceTime,
    buffer: result.buffer,
    maxTrades: result.maxTrades,
    netPoints: result.full.netPoints,
    netRs: result.full.netRs,
    firstHalfPoints: result.firstHalf.netPoints,
    secondHalfPoints: result.secondHalf.netPoints,
    maxDrawdownPoints: result.full.maxDrawdownPoints,
    profitFactor: result.full.profitFactor,
    score: round(Math.min(result.firstHalf.netPoints, result.secondHalf.netPoints)),
  }))
  .filter((result) => result.firstHalfPoints > 0 && result.secondHalfPoints > 0)
  .sort((a, b) => b.score - a.score || b.netPoints - a.netPoints);

const payload = {
  generatedAt: new Date().toISOString(),
  input,
  source: data.source,
  sourcePeriod: { from: data.from, to: data.to },
  methodology: {
    sessionRule: "Only complete 09:15-15:15 sessions with all 25 ordered candles",
    signalRule: "A fresh later candle close crosses outside the selected reference candle high/low",
    structureRule: "The signal candle is the main candle; inside candles do not trail; a directional close beyond the main candle replaces it",
    exitRule: "Exit at the confirming candle close when price closes through the opposite main-candle edge plus buffer; otherwise exit on the 15:15 candle close",
    fillModes: {
      signal_close: "Research approximation: fill at the confirming candle close",
      next_open: "Conservative executable model: fill at the next 15-minute candle open",
    },
    reentryRule: "No same-candle re-entry; any additional trade requires a fresh close crossing of the original range",
    lastEntryTime: LAST_ENTRY_TIME,
    frictionPointsPerCompletedTrade: FRICTION_POINTS_PER_TRADE,
    quantity: QTY,
  },
  validation: {
    sourceSessions: data.sessionCount,
    includedSessions: sessions.length,
    excludedSessions: exclusions,
  },
  primary,
  signalCloseComparison,
  robust,
  results,
};

fs.writeFileSync(output, JSON.stringify(payload, null, 2));
console.log(JSON.stringify({
  output,
  includedSessions: sessions.length,
  exclusions,
  primary: primary.map((result) => ({
    time: result.referenceTime,
    netPoints: result.full.netPoints,
    netRs: result.full.netRs,
    grossPoints: result.full.grossPoints,
    trades: result.full.trades,
    winRatePct: result.full.tradeWinRatePct,
    profitFactor: result.full.profitFactor,
    maxDrawdownPoints: result.full.maxDrawdownPoints,
    firstHalfPoints: result.firstHalf.netPoints,
    secondHalfPoints: result.secondHalf.netPoints,
    positiveMonths: result.full.positiveMonths,
    negativeMonths: result.full.negativeMonths,
  })),
  topRobust: robust.slice(0, 10),
}, null, 2));

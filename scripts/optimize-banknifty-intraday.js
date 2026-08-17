"use strict";

const fs = require("fs");

const OLD_DATA_FILE = process.argv[2] || "C:/tmp/banknifty_5yr.json";
const FRESH_DATA_FILE = process.argv[3] || "C:/tmp/research-banknifty-15m-1y.json";
const OUTPUT_FILE = process.argv[4] || "research-banknifty-intraday-optimizer.json";

const TIMES = Array.from({ length: 25 }, (_, index) => {
  const minutes = (9 * 60) + 15 + (index * 15);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const EMA_PERIODS = [2, 3, 4, 5, 6, 8, 13];
const FRICTION_POINTS = 5;
const TARGET_POINTS = 2000;
const PERIODS = {
  train: { from: "2021-02-01", to: "2024-12-31" },
  development: { from: "2025-01-01", to: "2025-08-11" },
  untouched: { from: "2025-08-12", to: "2026-08-12" },
};

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function candleTime(candle) {
  if (candle.time) return candle.time;
  if (Number.isFinite(candle.h) && Number.isFinite(candle.m)) {
    return `${String(candle.h).padStart(2, "0")}:${String(candle.m).padStart(2, "0")}`;
  }
  return null;
}

function normalizeCandles(candles) {
  return (candles || []).map((candle) => ({
    time: candleTime(candle),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  }));
}

function isFullSession(candles) {
  return candles.length === TIMES.length
    && candles.every((candle, index) => candle.time === TIMES[index]
      && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
      && candle.high >= Math.max(candle.open, candle.close)
      && candle.low <= Math.min(candle.open, candle.close));
}

function loadSessions() {
  const oldData = JSON.parse(fs.readFileSync(OLD_DATA_FILE, "utf8"));
  const freshPayload = JSON.parse(fs.readFileSync(FRESH_DATA_FILE, "utf8"));
  const freshData = freshPayload.days || freshPayload;
  const merged = new Map();
  const excluded = [];

  for (const [day, rawCandles] of Object.entries(oldData.days || oldData)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) merged.set(day, normalizeCandles(rawCandles));
  }
  for (const [day, rawCandles] of Object.entries(freshData)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) merged.set(day, normalizeCandles(rawCandles));
  }

  const rawSessions = [];
  for (const day of [...merged.keys()].sort()) {
    const candles = merged.get(day);
    if (!isFullSession(candles)) {
      excluded.push({ day, candleCount: candles.length, start: candles[0]?.time || null, end: candles.at(-1)?.time || null });
      continue;
    }
    rawSessions.push({ day, candles });
  }

  const dailyTrueRanges = [];
  const sessions = rawSessions.map((session, dayIndex) => {
    const previous = rawSessions[dayIndex - 1];
    const previousClose = previous?.candles.at(-1).close ?? session.candles[0].open;
    const dayHigh = Math.max(...session.candles.map((candle) => candle.high));
    const dayLow = Math.min(...session.candles.map((candle) => candle.low));
    const trueRange = Math.max(dayHigh - dayLow, Math.abs(dayHigh - previousClose), Math.abs(dayLow - previousClose));
    const warmup = dailyTrueRanges.slice(Math.max(0, dailyTrueRanges.length - 14));
    const dailyAtr = warmup.length >= 5 ? sum(warmup) / warmup.length : null;
    dailyTrueRanges.push(trueRange);

    const emaValues = Object.fromEntries(EMA_PERIODS.map((period) => [period, null]));
    let sessionHigh = -Infinity;
    let sessionLow = Infinity;
    let typicalSum = 0;
    let path = 0;
    const open = session.candles[0].open;
    const bars = session.candles.map((candle, index) => {
      sessionHigh = Math.max(sessionHigh, candle.high);
      sessionLow = Math.min(sessionLow, candle.low);
      typicalSum += (candle.high + candle.low + candle.close) / 3;
      path += Math.abs(candle.close - (index ? session.candles[index - 1].close : open));
      const emas = {};
      for (const period of EMA_PERIODS) {
        const alpha = 2 / (period + 1);
        emaValues[period] = emaValues[period] == null
          ? candle.close
          : (candle.close * alpha) + (emaValues[period] * (1 - alpha));
        emas[period] = emaValues[period];
      }
      const candleRange = Math.max(0.05, candle.high - candle.low);
      const sessionRange = Math.max(0.05, sessionHigh - sessionLow);
      const move = candle.close - open;
      return {
        ...candle,
        index,
        bodyFraction: Math.abs(candle.close - candle.open) / candleRange,
        closeLocation: (candle.close - candle.low) / candleRange,
        sessionHigh,
        sessionLow,
        previousSessionHigh: index ? Math.max(...session.candles.slice(0, index).map((row) => row.high)) : candle.high,
        previousSessionLow: index ? Math.min(...session.candles.slice(0, index).map((row) => row.low)) : candle.low,
        sessionRange,
        sessionCloseLocation: (candle.close - sessionLow) / sessionRange,
        sessionMean: typicalSum / (index + 1),
        sessionMove: move,
        efficiency: Math.abs(move) / Math.max(0.05, path),
        emas,
      };
    });
    return {
      day: session.day,
      month: session.day.slice(0, 7),
      previousClose,
      dailyAtr,
      trueRange,
      dayHigh,
      dayLow,
      bars,
    };
  }).filter((session) => session.dailyAtr != null);

  return { sessions, excluded };
}

const FILTERS = [
  { id: "loose", body: 0, location: 0.5, efficiency: 0, mean: false, ema: false, moveAtr: 0, sessionLocation: 0.5 },
  { id: "body", body: 0.35, location: 0.62, efficiency: 0, mean: false, ema: false, moveAtr: 0, sessionLocation: 0.5 },
  { id: "momentum", body: 0.45, location: 0.68, efficiency: 0.15, mean: true, ema: false, moveAtr: 0.05, sessionLocation: 0.58 },
  { id: "trend", body: 0.2, location: 0.6, efficiency: 0.3, mean: true, ema: true, moveAtr: 0.08, sessionLocation: 0.62 },
  { id: "strong", body: 0.55, location: 0.75, efficiency: 0.25, mean: true, ema: true, moveAtr: 0.1, sessionLocation: 0.68 },
  { id: "efficient", body: 0.1, location: 0.58, efficiency: 0.45, mean: true, ema: true, moveAtr: 0.12, sessionLocation: 0.72 },
];
const FILTER_BY_ID = Object.fromEntries(FILTERS.map((filter) => [filter.id, filter]));

function passesFilter(side, bar, session, filterId) {
  const filter = FILTER_BY_ID[filterId];
  const direction = side === "LONG" ? 1 : -1;
  const directionalBody = direction * (bar.close - bar.open);
  const candleLocation = side === "LONG" ? bar.closeLocation : 1 - bar.closeLocation;
  const sessionLocation = side === "LONG" ? bar.sessionCloseLocation : 1 - bar.sessionCloseLocation;
  const meanAligned = direction * (bar.close - bar.sessionMean) > 0;
  const emaAligned = direction * (bar.emas[3] - bar.emas[8]) > 0;
  const moveRatio = direction * bar.sessionMove / session.dailyAtr;
  return directionalBody >= 0
    && bar.bodyFraction >= filter.body
    && candleLocation >= filter.location
    && bar.efficiency >= filter.efficiency
    && sessionLocation >= filter.sessionLocation
    && moveRatio >= filter.moveAtr
    && (!filter.mean || meanAligned)
    && (!filter.ema || emaAligned);
}

function rangeBefore(session, count) {
  const bars = session.bars.slice(0, count);
  return {
    high: Math.max(...bars.map((bar) => bar.high)),
    low: Math.min(...bars.map((bar) => bar.low)),
  };
}

function buildSignals(session, config) {
  const signals = new Array(session.bars.length).fill(null);
  const state = { armed: null };
  const atr = session.dailyAtr;

  if (config.family === "ORB") {
    const openingRange = rangeBefore(session, config.orBars);
    const widthRatio = (openingRange.high - openingRange.low) / atr;
    if (widthRatio < config.minWidth || widthRatio > config.maxWidth) return signals;
    const upper = openingRange.high + (config.bufferAtr * atr);
    const lower = openingRange.low - (config.bufferAtr * atr);
    for (let index = config.orBars; index <= config.lastSignalIndex; index += 1) {
      const bar = session.bars[index];
      const previous = session.bars[index - 1];
      let side = null;
      if (config.confirmation === "immediate") {
        if (index !== config.orBars) break;
        side = bar.close > upper ? "LONG" : bar.close < lower ? "SHORT" : null;
      } else if (config.confirmation === "direct") {
        side = bar.close > upper && previous.close <= upper
          ? "LONG"
          : bar.close < lower && previous.close >= lower ? "SHORT" : null;
      } else if (config.confirmation === "hold2") {
        const older = session.bars[index - 2];
        side = previous.close > upper && bar.close > upper && (!older || older.close <= upper)
          ? "LONG"
          : previous.close < lower && bar.close < lower && (!older || older.close >= lower) ? "SHORT" : null;
      } else if (config.confirmation === "retest") {
        if (!state.armed) {
          if (bar.close > upper && previous.close <= upper) state.armed = "LONG";
          else if (bar.close < lower && previous.close >= lower) state.armed = "SHORT";
          continue;
        }
        if (state.armed === "LONG") {
          if (bar.close < lower) state.armed = "SHORT";
          else if (bar.low <= upper + (0.03 * atr) && bar.close > upper) {
            side = "LONG";
            state.armed = null;
          }
        } else if (bar.close > upper) {
          state.armed = "LONG";
        } else if (bar.high >= lower - (0.03 * atr) && bar.close < lower) {
          side = "SHORT";
          state.armed = null;
        }
      }
      if (side && passesFilter(side, bar, session, config.filterId)) {
        signals[index] = { side, signalIndex: index, signalHigh: bar.high, signalLow: bar.low, referenceHigh: openingRange.high, referenceLow: openingRange.low };
      }
    }
    return signals;
  }

  if (config.family === "DONCHIAN") {
    for (let index = Math.max(config.startIndex, config.lookback); index <= config.lastSignalIndex; index += 1) {
      const bar = session.bars[index];
      const prior = session.bars.slice(index - config.lookback, index);
      const upper = Math.max(...prior.map((row) => row.high)) + (config.bufferAtr * atr);
      const lower = Math.min(...prior.map((row) => row.low)) - (config.bufferAtr * atr);
      const side = bar.close > upper ? "LONG" : bar.close < lower ? "SHORT" : null;
      if (side && passesFilter(side, bar, session, config.filterId)) {
        signals[index] = { side, signalIndex: index, signalHigh: bar.high, signalLow: bar.low, referenceHigh: upper, referenceLow: lower };
      }
    }
    return signals;
  }

  if (config.family === "EXPANSION") {
    for (let index = config.startIndex; index <= config.lastSignalIndex; index += 1) {
      const bar = session.bars[index];
      const rangeRatio = bar.sessionRange / atr;
      const moveRatio = Math.abs(bar.sessionMove) / atr;
      const madeHigh = index > 0 && bar.close > bar.previousSessionHigh;
      const madeLow = index > 0 && bar.close < bar.previousSessionLow;
      const side = bar.sessionMove > 0 && madeHigh ? "LONG" : bar.sessionMove < 0 && madeLow ? "SHORT" : null;
      if (side && rangeRatio >= config.rangeAtr && moveRatio >= config.moveAtr
        && passesFilter(side, bar, session, config.filterId)) {
        signals[index] = { side, signalIndex: index, signalHigh: bar.high, signalLow: bar.low, referenceHigh: bar.previousSessionHigh, referenceLow: bar.previousSessionLow };
      }
    }
    return signals;
  }

  if (config.family === "EMA") {
    for (let index = config.startIndex; index <= config.lastSignalIndex; index += 1) {
      const bar = session.bars[index];
      const previous = session.bars[index - 1];
      const now = bar.emas[config.fast] - bar.emas[config.slow];
      const before = previous.emas[config.fast] - previous.emas[config.slow];
      const side = now > 0 && before <= 0 ? "LONG" : now < 0 && before >= 0 ? "SHORT" : null;
      if (side && passesFilter(side, bar, session, config.filterId)) {
        signals[index] = { side, signalIndex: index, signalHigh: bar.high, signalLow: bar.low, referenceHigh: bar.high, referenceLow: bar.low };
      }
    }
  }
  return signals;
}

function generateEntryConfigs() {
  const configs = [];
  const lastSignalIndexes = [8, 12, 16, 20];
  const widthProfiles = [
    { id: "any", min: 0, max: 99 },
    { id: "compact", min: 0, max: 0.5 },
    { id: "balanced", min: 0.15, max: 0.8 },
  ];
  for (const orBars of [1, 2, 3, 4, 6, 8]) {
    for (const confirmation of ["immediate", "direct", "hold2", "retest"]) {
      for (const bufferAtr of [0, 0.015, 0.03]) {
        for (const filter of FILTERS) {
          for (const width of widthProfiles) {
            for (const lastSignalIndex of lastSignalIndexes) {
              if (lastSignalIndex <= orBars) continue;
              configs.push({
                id: `ORB-${orBars}-${confirmation}-b${bufferAtr}-${filter.id}-${width.id}-e${TIMES[lastSignalIndex]}`,
                family: "ORB",
                orBars,
                confirmation,
                bufferAtr,
                filterId: filter.id,
                minWidth: width.min,
                maxWidth: width.max,
                lastSignalIndex,
              });
            }
          }
        }
      }
    }
  }
  for (const lookback of [2, 3, 4, 6, 8]) {
    for (const startIndex of [2, 4, 6]) {
      for (const bufferAtr of [0, 0.015, 0.03]) {
        for (const filter of FILTERS) {
          for (const lastSignalIndex of lastSignalIndexes) {
            if (lastSignalIndex <= Math.max(startIndex, lookback)) continue;
            configs.push({
              id: `DON-${lookback}-s${TIMES[startIndex]}-b${bufferAtr}-${filter.id}-e${TIMES[lastSignalIndex]}`,
              family: "DONCHIAN",
              lookback,
              startIndex,
              bufferAtr,
              filterId: filter.id,
              lastSignalIndex,
            });
          }
        }
      }
    }
  }
  for (const startIndex of [2, 4, 6]) {
    for (const rangeAtr of [0.3, 0.45, 0.6, 0.8]) {
      for (const moveAtr of [0.12, 0.25, 0.4]) {
        for (const filter of FILTERS.slice(1)) {
          for (const lastSignalIndex of lastSignalIndexes) {
            if (lastSignalIndex <= startIndex) continue;
            configs.push({
              id: `EXP-s${TIMES[startIndex]}-r${rangeAtr}-m${moveAtr}-${filter.id}-e${TIMES[lastSignalIndex]}`,
              family: "EXPANSION",
              startIndex,
              rangeAtr,
              moveAtr,
              filterId: filter.id,
              lastSignalIndex,
            });
          }
        }
      }
    }
  }
  for (const [fast, slow] of [[2, 5], [3, 6], [3, 8], [5, 13]]) {
    for (const startIndex of [2, 4, 6]) {
      for (const filter of FILTERS.slice(1)) {
        for (const lastSignalIndex of lastSignalIndexes) {
          if (lastSignalIndex <= startIndex) continue;
          configs.push({
            id: `EMA-${fast}-${slow}-s${TIMES[startIndex]}-${filter.id}-e${TIMES[lastSignalIndex]}`,
            family: "EMA",
            fast,
            slow,
            startIndex,
            filterId: filter.id,
            lastSignalIndex,
          });
        }
      }
    }
  }
  return configs;
}

function generateExitConfigs() {
  const configs = [];
  for (const stopAtr of [0.18, 0.28, 0.4]) {
    for (const breakEvenAtr of [null, 0.45]) {
      configs.push({ id: `sl${stopAtr}-eod-be${breakEvenAtr}`, stopAtr, kind: "EOD", breakEvenAtr });
    }
    for (const distanceAtr of [0.18, 0.3, 0.45]) {
      for (const activateAtr of [0, 0.4]) {
        configs.push({ id: `sl${stopAtr}-chan${distanceAtr}-a${activateAtr}`, stopAtr, kind: "CHANDELIER", distanceAtr, activateAtr, breakEvenAtr: null });
      }
    }
    for (const lookback of [1, 2, 3]) {
      for (const activateAtr of [0, 0.4]) {
        configs.push({ id: `sl${stopAtr}-swing${lookback}-a${activateAtr}`, stopAtr, kind: "SWING", lookback, activateAtr, breakEvenAtr: null });
      }
    }
    for (const distanceAtr of [0.18, 0.3, 0.45]) {
      for (const activateAtr of [0.25, 0.5]) {
        configs.push({ id: `sl${stopAtr}-close${distanceAtr}-a${activateAtr}`, stopAtr, kind: "CLOSE_TRAIL", distanceAtr, activateAtr, breakEvenAtr: null });
      }
    }
    for (const emaPeriod of [3, 5, 8]) {
      configs.push({ id: `sl${stopAtr}-ema${emaPeriod}`, stopAtr, kind: "EMA", emaPeriod, breakEvenAtr: null });
    }
    for (const bufferAtr of [0, 0.04]) {
      configs.push({ id: `sl${stopAtr}-structure${bufferAtr}`, stopAtr, kind: "STRUCTURE", bufferAtr, breakEvenAtr: null });
    }
  }
  return configs;
}

function pointPnl(side, entryPrice, exitPrice) {
  return side === "LONG" ? exitPrice - entryPrice : entryPrice - exitPrice;
}

function simulateSession(session, signals, config, keepTrades = false) {
  const trades = [];
  let position = null;
  let pendingEntry = null;
  let pendingExit = null;
  let entries = 0;
  let netPoints = 0;
  let grossWinning = 0;
  let grossLosing = 0;

  function closePosition(index, exitPrice, reason) {
    const grossPoints = pointPnl(position.side, position.entryPrice, exitPrice);
    const points = grossPoints - FRICTION_POINTS;
    netPoints += points;
    if (points > 0) grossWinning += points;
    else grossLosing += -points;
    if (keepTrades) {
      trades.push({
        side: position.side,
        signalTime: TIMES[position.signalIndex],
        entryTime: TIMES[position.entryIndex],
        entryPrice: round(position.entryPrice),
        exitTime: index === session.bars.length ? "15:30" : TIMES[index],
        exitPrice: round(exitPrice),
        netPoints: round(points),
        reason,
      });
    }
    position = null;
    pendingExit = null;
  }

  function updateTrailing(index) {
    const bar = session.bars[index];
    const atr = session.dailyAtr;
    const favourableClose = pointPnl(position.side, position.entryPrice, bar.close);
    position.highestHigh = Math.max(position.highestHigh, bar.high);
    position.lowestLow = Math.min(position.lowestLow, bar.low);
    position.bestClose = position.side === "LONG"
      ? Math.max(position.bestClose, bar.close)
      : Math.min(position.bestClose, bar.close);

    if (config.exit.breakEvenAtr != null && favourableClose >= config.exit.breakEvenAtr * atr) {
      position.stop = position.side === "LONG"
        ? Math.max(position.stop, position.entryPrice)
        : Math.min(position.stop, position.entryPrice);
    }
    if (config.exit.kind === "CHANDELIER" && favourableClose >= config.exit.activateAtr * atr) {
      const candidate = position.side === "LONG"
        ? position.highestHigh - (config.exit.distanceAtr * atr)
        : position.lowestLow + (config.exit.distanceAtr * atr);
      position.stop = position.side === "LONG" ? Math.max(position.stop, candidate) : Math.min(position.stop, candidate);
    } else if (config.exit.kind === "CLOSE_TRAIL" && favourableClose >= config.exit.activateAtr * atr) {
      const candidate = position.side === "LONG"
        ? position.bestClose - (config.exit.distanceAtr * atr)
        : position.bestClose + (config.exit.distanceAtr * atr);
      position.stop = position.side === "LONG" ? Math.max(position.stop, candidate) : Math.min(position.stop, candidate);
    } else if (config.exit.kind === "SWING" && favourableClose >= config.exit.activateAtr * atr) {
      const bars = session.bars.slice(Math.max(position.entryIndex, index - config.exit.lookback + 1), index + 1);
      const candidate = position.side === "LONG"
        ? Math.min(...bars.map((row) => row.low))
        : Math.max(...bars.map((row) => row.high));
      position.stop = position.side === "LONG" ? Math.max(position.stop, candidate) : Math.min(position.stop, candidate);
    } else if (config.exit.kind === "STRUCTURE") {
      const continuation = position.side === "LONG"
        ? bar.close > position.mainHigh
        : bar.close < position.mainLow;
      const reversal = position.side === "LONG"
        ? bar.close < position.mainLow - (config.exit.bufferAtr * atr)
        : bar.close > position.mainHigh + (config.exit.bufferAtr * atr);
      if (reversal) pendingExit = { fillIndex: index + 1, reason: "STRUCTURE_CLOSE" };
      else if (continuation) {
        position.mainHigh = bar.high;
        position.mainLow = bar.low;
      }
    } else if (config.exit.kind === "EMA") {
      const crossed = position.side === "LONG"
        ? bar.close < bar.emas[config.exit.emaPeriod]
        : bar.close > bar.emas[config.exit.emaPeriod];
      if (crossed) pendingExit = { fillIndex: index + 1, reason: "EMA_CLOSE" };
    }
  }

  for (let index = 0; index < session.bars.length; index += 1) {
    const bar = session.bars[index];

    if (pendingExit && pendingExit.fillIndex === index && position) {
      closePosition(index, bar.open, pendingExit.reason);
    }

    if (pendingEntry && pendingEntry.fillIndex === index && !position && entries < config.maxTrades) {
      const stopDistance = clamp(config.exit.stopAtr * session.dailyAtr, 60, 400);
      const stop = pendingEntry.side === "LONG" ? bar.open - stopDistance : bar.open + stopDistance;
      position = {
        ...pendingEntry,
        entryIndex: index,
        entryPrice: bar.open,
        stop,
        highestHigh: bar.open,
        lowestLow: bar.open,
        bestClose: bar.open,
        mainHigh: pendingEntry.signalHigh,
        mainLow: pendingEntry.signalLow,
      };
      pendingEntry = null;
      entries += 1;
    }

    if (position) {
      const gapThrough = position.side === "LONG" ? bar.open <= position.stop : bar.open >= position.stop;
      const stopTouched = position.side === "LONG" ? bar.low <= position.stop : bar.high >= position.stop;
      if (gapThrough || stopTouched) {
        closePosition(index, gapThrough ? bar.open : position.stop, gapThrough ? "STOP_GAP" : "STOP");
      }
    }

    if (position && index === session.bars.length - 1) {
      closePosition(session.bars.length, bar.close, "EOD");
      continue;
    }

    if (position) updateTrailing(index);

    if (!position && !pendingEntry && !pendingExit && entries < config.maxTrades && signals[index]) {
      const fillIndex = index + 1;
      if (fillIndex < session.bars.length) pendingEntry = { ...signals[index], fillIndex };
    }
  }

  return {
    day: session.day,
    month: session.month,
    netPoints: round(netPoints),
    grossWinning: round(grossWinning),
    grossLosing: round(grossLosing),
    trades: keepTrades ? trades : entries,
  };
}

function summarize(rows, monthUniverse) {
  const monthly = Object.fromEntries(monthUniverse.map((month) => [month, 0]));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let grossWinning = 0;
  let grossLosing = 0;
  let tradeCount = 0;
  let winningDays = 0;
  let losingDays = 0;
  for (const row of rows) {
    monthly[row.month] = (monthly[row.month] || 0) + row.netPoints;
    equity += row.netPoints;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    grossWinning += row.grossWinning;
    grossLosing += row.grossLosing;
    tradeCount += Array.isArray(row.trades) ? row.trades.length : row.trades;
    if (row.netPoints > 0) winningDays += 1;
    if (row.netPoints < 0) losingDays += 1;
  }
  const monthlyValues = Object.values(monthly);
  const netPoints = sum(monthlyValues);
  const sortedDays = [...rows].sort((a, b) => b.netPoints - a.netPoints);
  const topFivePoints = sum(sortedDays.slice(0, 5).map((row) => row.netPoints));
  const averageMonthly = monthlyValues.length ? netPoints / monthlyValues.length : 0;
  const medianMonthly = quantile(monthlyValues, 0.5);
  const p20Monthly = quantile(monthlyValues, 0.2);
  const score = averageMonthly + (0.7 * medianMonthly) + (0.45 * p20Monthly) - (maxDrawdown / Math.max(12, monthlyValues.length));
  return {
    sessions: rows.length,
    trades: tradeCount,
    winningDays,
    losingDays,
    netPoints: round(netPoints),
    averageMonthlyPoints: round(averageMonthly),
    medianMonthlyPoints: round(medianMonthly),
    p20MonthlyPoints: round(p20Monthly),
    minimumMonthlyPoints: round(Math.min(...monthlyValues)),
    maximumMonthlyPoints: round(Math.max(...monthlyValues)),
    positiveMonths: monthlyValues.filter((value) => value > 0).length,
    targetMonths: monthlyValues.filter((value) => value >= TARGET_POINTS).length,
    months: monthlyValues.length,
    profitFactor: grossLosing ? round(grossWinning / grossLosing) : null,
    maxDrawdownPoints: round(maxDrawdown),
    topFiveDaySharePct: netPoints ? round((topFivePoints / netPoints) * 100) : null,
    score: round(score),
    monthly: Object.fromEntries(Object.entries(monthly).map(([month, points]) => [month, round(points)])),
  };
}

function sessionsForPeriod(sessions, period) {
  return sessions.filter((session) => session.day >= period.from && session.day <= period.to);
}

function evaluate(entry, exit, maxTrades, sessions, keepTrades = false) {
  const signalCache = sessions.map((session) => buildSignals(session, entry));
  const rows = sessions.map((session, index) => simulateSession(session, signalCache[index], { exit, maxTrades }, keepTrades));
  const months = [...new Set(sessions.map((session) => session.month))];
  return { summary: summarize(rows, months), rows };
}

function stageOne(entryConfigs, trainSessions) {
  const baselineExit = { id: "baseline", stopAtr: 0.28, kind: "CHANDELIER", distanceAtr: 0.3, activateAtr: 0.4, breakEvenAtr: null };
  const ranked = [];
  for (let index = 0; index < entryConfigs.length; index += 1) {
    const entry = entryConfigs[index];
    const result = evaluate(entry, baselineExit, 2, trainSessions);
    if (result.summary.trades >= 80 && result.summary.netPoints > 0) ranked.push({ entry, summary: result.summary });
    if ((index + 1) % 1000 === 0) console.log(`stage1 ${index + 1}/${entryConfigs.length}`);
  }
  ranked.sort((a, b) => b.summary.score - a.summary.score);

  const selected = [];
  const familyCounts = new Map();
  for (const row of ranked) {
    const familyKey = `${row.entry.family}:${row.entry.confirmation || row.entry.filterId}`;
    const count = familyCounts.get(familyKey) || 0;
    if (count >= 12) continue;
    selected.push(row.entry);
    familyCounts.set(familyKey, count + 1);
    if (selected.length >= 80) break;
  }
  return { ranked, selected };
}

function stageTwo(entries, exits, trainSessions) {
  const ranked = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex];
    const signalCache = trainSessions.map((session) => buildSignals(session, entry));
    for (const exit of exits) {
      for (const maxTrades of [1, 2, 3]) {
        const rows = trainSessions.map((session, index) => simulateSession(session, signalCache[index], { exit, maxTrades }));
        const months = [...new Set(trainSessions.map((session) => session.month))];
        const summary = summarize(rows, months);
        if (summary.trades >= 80 && summary.netPoints > 0 && summary.profitFactor >= 1.02) {
          ranked.push({ entry, exit, maxTrades, train: summary });
        }
      }
    }
    if ((entryIndex + 1) % 10 === 0) console.log(`stage2 ${entryIndex + 1}/${entries.length}`);
  }
  ranked.sort((a, b) => b.train.score - a.train.score);
  return ranked;
}

function selectWithDevelopment(trainRanked, developmentSessions) {
  const candidates = trainRanked.slice(0, 300);
  const evaluated = candidates.map((candidate) => {
    const development = evaluate(candidate.entry, candidate.exit, candidate.maxTrades, developmentSessions).summary;
    const train = candidate.train;
    const lowerAverage = Math.min(train.averageMonthlyPoints, development.averageMonthlyPoints);
    const lowerMedian = Math.min(train.medianMonthlyPoints, development.medianMonthlyPoints);
    const lowerP20 = Math.min(train.p20MonthlyPoints, development.p20MonthlyPoints);
    const score = lowerAverage + (0.7 * lowerMedian) + (0.35 * lowerP20)
      - ((train.maxDrawdownPoints + development.maxDrawdownPoints) / 30);
    return { ...candidate, development, selectionScore: round(score) };
  });
  evaluated.sort((a, b) => b.selectionScore - a.selectionScore);
  return evaluated;
}

function candidateView(candidate) {
  return {
    entry: candidate.entry,
    exit: candidate.exit,
    maxTrades: candidate.maxTrades,
    selectionScore: candidate.selectionScore,
    train: candidate.train,
    development: candidate.development,
    untouched: candidate.untouched,
  };
}

function main() {
  const { sessions, excluded } = loadSessions();
  const trainSessions = sessionsForPeriod(sessions, PERIODS.train);
  const developmentSessions = sessionsForPeriod(sessions, PERIODS.development);
  const untouchedSessions = sessionsForPeriod(sessions, PERIODS.untouched);
  const entryConfigs = generateEntryConfigs();
  const exitConfigs = generateExitConfigs();

  console.log(JSON.stringify({
    coverage: { from: sessions[0].day, to: sessions.at(-1).day, sessions: sessions.length },
    splits: { train: trainSessions.length, development: developmentSessions.length, untouched: untouchedSessions.length },
    entryConfigs: entryConfigs.length,
    exitConfigs: exitConfigs.length,
  }));

  const firstStage = stageOne(entryConfigs, trainSessions);
  const secondStage = stageTwo(firstStage.selected, exitConfigs, trainSessions);
  const developed = selectWithDevelopment(secondStage, developmentSessions);
  const finalists = developed.slice(0, 30).map((candidate) => ({
    ...candidate,
    untouched: evaluate(candidate.entry, candidate.exit, candidate.maxTrades, untouchedSessions).summary,
  }));

  const winner = finalists[0];
  const detailedTrain = evaluate(winner.entry, winner.exit, winner.maxTrades, trainSessions, true);
  const detailedDevelopment = evaluate(winner.entry, winner.exit, winner.maxTrades, developmentSessions, true);
  const detailedUntouched = evaluate(winner.entry, winner.exit, winner.maxTrades, untouchedSessions, true);
  const completeUntouchedMonths = Object.entries(detailedUntouched.summary.monthly)
    .filter(([month]) => month > PERIODS.untouched.from.slice(0, 7) && month < PERIODS.untouched.to.slice(0, 7));

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      oldDataFile: OLD_DATA_FILE,
      freshDataFile: FRESH_DATA_FILE,
      coverage: { from: sessions[0].day, to: sessions.at(-1).day, sessions: sessions.length },
      excluded,
    },
    methodology: {
      positionLimit: "One BANKNIFTY index-equivalent position at a time",
      signals: "All signals use completed 15-minute candles only",
      execution: "Signal at candle close; fill at following candle open",
      stops: "Protective stop is fixed before each candle; gaps fill at candle open",
      trailing: "Trailing levels update only after candle close and apply from the following candle",
      eod: "Any open position exits at the 15:15-labelled candle close (15:30)",
      friction: `${FRICTION_POINTS} index points per completed trade`,
      split: PERIODS,
      optimization: "Entry and exit rules ranked on train; finalists selected using train plus development; untouched period opened once for final validation",
      limitation: "Index-point simulation, not historical futures-contract fills or rupee P&L",
    },
    search: {
      entryConfigs: entryConfigs.length,
      exitConfigs: exitConfigs.length,
      stageOneEligible: firstStage.ranked.length,
      stageOneSelected: firstStage.selected.length,
      stageTwoEligible: secondStage.length,
      developmentCandidates: developed.length,
    },
    winner: {
      ...candidateView(winner),
      completeUntouchedMonths: Object.fromEntries(completeUntouchedMonths),
      completeUntouchedTargetMonths: completeUntouchedMonths.filter(([, points]) => points >= TARGET_POINTS).length,
      completeUntouchedMonthCount: completeUntouchedMonths.length,
      rows: {
        train: detailedTrain.rows,
        development: detailedDevelopment.rows,
        untouched: detailedUntouched.rows,
      },
    },
    finalists: finalists.map(candidateView),
    topTraining: secondStage.slice(0, 30).map((candidate) => ({ entry: candidate.entry, exit: candidate.exit, maxTrades: candidate.maxTrades, train: candidate.train })),
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payload, null, 2));

  console.log(JSON.stringify({
    output: OUTPUT_FILE,
    search: payload.search,
    winner: candidateView(winner),
    completeUntouchedMonths: Object.fromEntries(completeUntouchedMonths),
    completeUntouchedTargetMonths: payload.winner.completeUntouchedTargetMonths,
  }, null, 2));
}

main();

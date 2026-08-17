"use strict";

const fs = require("fs");

const input = process.argv[2] || "research-banknifty-15m-1y.json";
const output = process.argv[3] || "research-banknifty-breakout-rerun.json";
const data = JSON.parse(fs.readFileSync(input, "utf8"));

const TIMES = Array.from({ length: 25 }, (_, index) => {
  const minutes = (9 * 60) + 15 + (index * 15);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
});
const REFERENCE_TIMES = TIMES.slice(0, 8);
const BUFFERS = [0, 10, 25, 40, 50];
const FILL_MODES = ["signal_close", "next_open"];
const SIGNAL_SCOPES = ["any_fresh_cross", "immediate_next_only"];
const RISK_POLICIES = [
  { name: "uncapped", hardStopPoints: null, maxInitialRiskPoints: null },
  { name: "risk150", hardStopPoints: 150, maxInitialRiskPoints: 150 },
];
const QTY = 30;
const FRICTION_POINTS = 5;
const LAST_ENTRY_TIME = "15:00";

const round = (number) => Math.round((Number(number) + Number.EPSILON) * 100) / 100;
const sum = (numbers) => numbers.reduce((total, number) => total + number, 0);

function addMinutes(time, amount) {
  const [hour, minute] = time.split(":").map(Number);
  const total = (hour * 60) + minute + amount;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function isFullSession(candles) {
  return candles.length === TIMES.length
    && candles.every((candle, index) => candle.time === TIMES[index]);
}

function tradePoints(side, entry, exit) {
  return side === "CE" ? exit - entry : entry - exit;
}

function simulateDay(day, candles, config) {
  const referenceIndex = TIMES.indexOf(config.referenceTime);
  const reference = candles[referenceIndex];
  const trades = [];
  let active = null;
  let pendingEntry = null;
  let pendingExit = null;
  let startedTrades = 0;

  function closeTrade(exitTime, exitPrice, exitCandle, reason) {
    const grossPoints = tradePoints(active.side, active.entryPrice, exitPrice);
    trades.push({
      side: active.side,
      signalCandle: active.signalCandle,
      signalConfirmedAt: active.signalConfirmedAt,
      entryTime: active.entryTime,
      entryPrice: round(active.entryPrice),
      initialRiskPoints: round(active.initialRiskPoints),
      exitTime,
      exitCandle,
      exitPrice: round(exitPrice),
      grossPoints: round(grossPoints),
      netPoints: round(grossPoints - FRICTION_POINTS),
      reason,
    });
    active = null;
  }

  function openTrade(signal, entryTime, entryPrice) {
    const structureStop = signal.side === "CE"
      ? signal.mainLow - config.buffer
      : signal.mainHigh + config.buffer;
    const initialRiskPoints = signal.side === "CE"
      ? entryPrice - structureStop
      : structureStop - entryPrice;

    if (!(initialRiskPoints > 0)) return false;
    if (config.maxInitialRiskPoints != null && initialRiskPoints > config.maxInitialRiskPoints) return false;

    active = {
      ...signal,
      entryTime,
      entryPrice,
      initialRiskPoints,
      hardStop: config.hardStopPoints == null
        ? null
        : signal.side === "CE" ? entryPrice - config.hardStopPoints : entryPrice + config.hardStopPoints,
    };
    startedTrades += 1;
    return true;
  }

  for (let index = referenceIndex + 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const closeTime = addMinutes(candle.time, 15);
    const finalCandle = index === candles.length - 1;
    let exitedThisCandle = false;

    if (pendingExit && pendingExit.fillIndex === index && active) {
      closeTrade(candle.time, candle.open, candle.time, pendingExit.reason);
      pendingExit = null;
      exitedThisCandle = true;
    }

    if (pendingEntry && pendingEntry.fillIndex === index && !active && startedTrades < config.maxTrades) {
      openTrade(pendingEntry, candle.time, candle.open);
      pendingEntry = null;
    }

    if (active) {
      const hardStopHit = active.hardStop != null && (active.side === "CE"
        ? candle.low <= active.hardStop
        : candle.high >= active.hardStop);

      if (hardStopHit) {
        const gapThroughStop = active.side === "CE" ? candle.open <= active.hardStop : candle.open >= active.hardStop;
        closeTrade(
          gapThroughStop ? candle.time : `${candle.time}-${closeTime}`,
          gapThroughStop ? candle.open : active.hardStop,
          candle.time,
          gapThroughStop ? "hard_stop_gap" : "hard_stop_intrabar",
        );
        exitedThisCandle = true;
      } else if (finalCandle) {
        closeTrade(closeTime, candle.close, candle.time, "eod_close");
        exitedThisCandle = true;
      } else {
        const structureBreak = active.side === "CE"
          ? candle.close < active.mainLow - config.buffer
          : candle.close > active.mainHigh + config.buffer;

        if (structureBreak) {
          if (config.fillMode === "signal_close") {
            closeTrade(closeTime, candle.close, candle.time, "structure_close");
            exitedThisCandle = true;
          } else {
            pendingExit = { fillIndex: index + 1, reason: "structure_next_open" };
          }
        } else if (active.side === "CE" && candle.close > active.mainHigh) {
          active.mainHigh = candle.high;
          active.mainLow = candle.low;
        } else if (active.side === "PE" && candle.close < active.mainLow) {
          active.mainHigh = candle.high;
          active.mainLow = candle.low;
        }
      }
    }

    if (active || pendingEntry || pendingExit || exitedThisCandle || startedTrades >= config.maxTrades || finalCandle) continue;
    if (config.signalScope === "immediate_next_only" && index !== referenceIndex + 1) continue;

    const previousClose = candles[index - 1].close;
    const brokeUp = previousClose <= reference.high && candle.close > reference.high;
    const brokeDown = previousClose >= reference.low && candle.close < reference.low;
    const side = brokeUp ? "CE" : brokeDown ? "PE" : null;
    if (!side) continue;

    const signal = {
      side,
      signalCandle: candle.time,
      signalConfirmedAt: closeTime,
      mainHigh: candle.high,
      mainLow: candle.low,
    };

    if (config.fillMode === "signal_close") {
      if (closeTime <= LAST_ENTRY_TIME) openTrade(signal, closeTime, candle.close);
    } else {
      const fillIndex = index + 1;
      if (fillIndex < candles.length && candles[fillIndex].time <= LAST_ENTRY_TIME) {
        pendingEntry = { ...signal, fillIndex };
      }
    }
  }

  const grossPoints = round(sum(trades.map((trade) => trade.grossPoints)));
  const netPoints = round(sum(trades.map((trade) => trade.netPoints)));
  return { day, grossPoints, netPoints, netRs: Math.round(netPoints * QTY), trades };
}

function summarize(rows) {
  const trades = rows.flatMap((row) => row.trades.map((trade) => ({ day: row.day, ...trade })));
  const positiveTrades = trades.filter((trade) => trade.netPoints > 0);
  const negativeTrades = trades.filter((trade) => trade.netPoints < 0);
  const winningPoints = sum(positiveTrades.map((trade) => trade.netPoints));
  const losingPoints = Math.abs(sum(negativeTrades.map((trade) => trade.netPoints)));
  const netPoints = round(sum(rows.map((row) => row.netPoints)));
  const tradedDays = rows.filter((row) => row.trades.length > 0);
  const monthly = {};
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const row of rows) {
    const month = row.day.slice(0, 7);
    monthly[month] = round((monthly[month] || 0) + row.netPoints);
    equity += row.netPoints;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }

  const sortedDays = [...rows].sort((a, b) => b.netPoints - a.netPoints);
  const topFivePoints = sum(sortedDays.slice(0, 5).map((row) => row.netPoints));

  return {
    sessions: rows.length,
    tradedDays: tradedDays.length,
    noTradeDays: rows.length - tradedDays.length,
    greenDays: rows.filter((row) => row.netPoints > 0).length,
    redDays: rows.filter((row) => row.netPoints < 0).length,
    trades: trades.length,
    tradeWinRatePct: trades.length ? round((positiveTrades.length / trades.length) * 100) : 0,
    grossPoints: round(sum(rows.map((row) => row.grossPoints))),
    frictionPoints: trades.length * FRICTION_POINTS,
    netPoints,
    netRs: Math.round(netPoints * QTY),
    averagePointsPerSession: rows.length ? round(netPoints / rows.length) : 0,
    medianPointsPerSession: round(quantile(rows.map((row) => row.netPoints), 0.5)),
    profitFactor: losingPoints ? round(winningPoints / losingPoints) : null,
    maxDrawdownPoints: round(maxDrawdown),
    positiveMonths: Object.values(monthly).filter((points) => points > 0).length,
    negativeMonths: Object.values(monthly).filter((points) => points < 0).length,
    topFiveDaySharePct: netPoints ? round((topFivePoints / netPoints) * 100) : null,
    bestDay: sortedDays[0] || null,
    worstDay: sortedDays.at(-1) || null,
    monthly,
  };
}

function analyze(config, sessions) {
  const rows = sessions.map(({ day, candles }) => simulateDay(day, candles, config));
  const split = Math.floor(rows.length / 2);
  return {
    config,
    full: summarize(rows),
    firstHalf: summarize(rows.slice(0, split)),
    secondHalf: summarize(rows.slice(split)),
    rows,
  };
}

const sessions = [];
const excluded = [];
for (const day of data.sessions || Object.keys(data.days || {}).sort()) {
  const candles = data.days[day] || [];
  if (!isFullSession(candles)) {
    excluded.push({ day, candles: candles.length, start: candles[0]?.time || null, end: candles.at(-1)?.time || null });
  } else {
    sessions.push({ day, candles });
  }
}

const results = [];
for (const referenceTime of REFERENCE_TIMES) {
  for (const buffer of BUFFERS) {
    for (const fillMode of FILL_MODES) {
      for (const signalScope of SIGNAL_SCOPES) {
        for (const maxTrades of signalScope === "immediate_next_only" ? [1] : [1, 2]) {
          for (const risk of RISK_POLICIES) {
            results.push(analyze({
              referenceTime,
              buffer,
              fillMode,
              signalScope,
              maxTrades,
              riskPolicy: risk.name,
              hardStopPoints: risk.hardStopPoints,
              maxInitialRiskPoints: risk.maxInitialRiskPoints,
            }, sessions));
          }
        }
      }
    }
  }
}

const matches = (result, filters) => Object.entries(filters).every(([key, value]) => result.config[key] === value);
const select = (filters) => results.filter((result) => matches(result, filters)).sort((a, b) => b.full.netPoints - a.full.netPoints);
const primary = select({ buffer: 25, fillMode: "next_open", signalScope: "any_fresh_cross", maxTrades: 2, riskPolicy: "risk150" });
const immediate = select({ buffer: 25, fillMode: "next_open", signalScope: "immediate_next_only", maxTrades: 1, riskPolicy: "risk150" });
const uncapped = select({ buffer: 25, fillMode: "next_open", signalScope: "any_fresh_cross", maxTrades: 2, riskPolicy: "uncapped" });
const robust = results
  .filter((result) => matches(result, { fillMode: "next_open", signalScope: "any_fresh_cross", riskPolicy: "risk150" }))
  .map((result) => ({
    ...result.config,
    netPoints: result.full.netPoints,
    netRs: result.full.netRs,
    firstHalfPoints: result.firstHalf.netPoints,
    secondHalfPoints: result.secondHalf.netPoints,
    maxDrawdownPoints: result.full.maxDrawdownPoints,
    profitFactor: result.full.profitFactor,
    stabilityScore: round(Math.min(result.firstHalf.netPoints, result.secondHalf.netPoints)),
  }))
  .filter((result) => result.firstHalfPoints > 0 && result.secondHalfPoints > 0)
  .sort((a, b) => b.stabilityScore - a.stabilityScore || b.netPoints - a.netPoints);

const withoutRows = (result) => ({ config: result.config, full: result.full, firstHalf: result.firstHalf, secondHalf: result.secondHalf });
const payload = {
  generatedAt: new Date().toISOString(),
  source: data.source,
  period: { from: data.from, to: data.to },
  includedSessions: sessions.length,
  excluded,
  methodology: {
    candleLabels: "Kite labels each 15-minute candle by opening time",
    anyFreshCross: "Any later close must freshly cross the selected candle high/low",
    immediateNextOnly: "Only the immediately following candle may break the selected candle",
    entry: "signal_close fills at confirmation close; next_open fills at the following candle open",
    exit: "inside candles are ignored; the main candle advances only on a directional close; an opposite close exits at next open",
    risk150: "Entry rejected above 150 points initial structural risk; accepted trades retain a 150-point intrabar emergency stop",
    eod: "Final 15:15-labelled candle closes at 15:30",
    friction: `${FRICTION_POINTS} points per completed trade`,
    rupeeProxy: `net index points x ${QTY}; not contract-level futures P&L`,
  },
  primary: primary.map(withoutRows),
  immediateNextOnly: immediate.map(withoutRows),
  uncappedComparison: uncapped.map(withoutRows),
  robust,
  configurations: results.map(withoutRows),
  detailRows: {
    primary: Object.fromEntries(primary.map((result) => [result.config.referenceTime, result.rows])),
    immediateNextOnly: Object.fromEntries(immediate.map((result) => [result.config.referenceTime, result.rows])),
  },
};

fs.writeFileSync(output, JSON.stringify(payload, null, 2));

const compact = (result) => ({
  time: result.config.referenceTime,
  netPoints: result.full.netPoints,
  netRs: result.full.netRs,
  tradedDays: result.full.tradedDays,
  trades: result.full.trades,
  winRatePct: result.full.tradeWinRatePct,
  profitFactor: result.full.profitFactor,
  maxDrawdownPoints: result.full.maxDrawdownPoints,
  firstHalfPoints: result.firstHalf.netPoints,
  secondHalfPoints: result.secondHalf.netPoints,
  positiveMonths: result.full.positiveMonths,
  negativeMonths: result.full.negativeMonths,
  topFiveDaySharePct: result.full.topFiveDaySharePct,
});

console.log(JSON.stringify({
  output,
  configurations: results.length,
  includedSessions: sessions.length,
  excluded,
  primary: primary.map(compact),
  immediateNextOnly: immediate.map(compact),
  uncappedComparison: uncapped.map(compact),
  topRobust: robust.slice(0, 10),
}, null, 2));

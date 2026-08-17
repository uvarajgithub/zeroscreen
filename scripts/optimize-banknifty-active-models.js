"use strict";

const fs = require("fs");
const zlib = require("zlib");

const INPUT = process.argv[2] || "C:/tmp/banknifty-index-minute-2021-2026.json.gz";
const OUTPUT = process.argv[3] || "research-banknifty-active-models.json";
const COST_POINTS = 5;
const TARGET_POINTS = 2000;
const FRAMES = [3, 5, 10, 15, 30];
const EMA_PERIODS = [2, 3, 5, 8, 13, 21, 34];
const SPLITS = {
  train: { from: "2021-02-01", to: "2024-12-31" },
  development: { from: "2025-01-01", to: "2025-08-11" },
  latest: { from: "2025-08-12", to: "2026-08-12" },
};

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function loadSessions() {
  const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(INPUT)));
  const rawSessions = [];
  const excluded = [];
  for (const day of payload.sessions) {
    const raw = payload.days[day] || [];
    if (raw.length !== 375 || raw[0]?.t !== "09:15" || raw.at(-1)?.t !== "15:29") {
      excluded.push({ day, candles: raw.length, start: raw[0]?.t || null, end: raw.at(-1)?.t || null });
      continue;
    }
    rawSessions.push({
      day,
      month: day.slice(0, 7),
      minutes: raw.map((row, index) => ({
        index,
        time: row.t,
        open: Number(row.o),
        high: Number(row.h),
        low: Number(row.l),
        close: Number(row.c),
      })),
      frames: {},
    });
  }

  const dailyRanges = [];
  const sessions = [];
  for (let index = 0; index < rawSessions.length; index += 1) {
    const session = rawSessions[index];
    const previousClose = index ? rawSessions[index - 1].minutes.at(-1).close : session.minutes[0].open;
    const high = Math.max(...session.minutes.map((row) => row.high));
    const low = Math.min(...session.minutes.map((row) => row.low));
    const trueRange = Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
    const warmup = dailyRanges.slice(Math.max(0, dailyRanges.length - 14));
    const dailyAtr = warmup.length >= 10 ? sum(warmup) / warmup.length : null;
    dailyRanges.push(trueRange);
    if (dailyAtr == null) continue;
    session.previousClose = previousClose;
    session.dayOpen = session.minutes[0].open;
    session.gapAtr = (session.dayOpen - previousClose) / dailyAtr;
    session.dailyAtr = dailyAtr;
    session.trueRange = trueRange;
    sessions.push(session);
  }

  for (const frame of FRAMES) enrichFrame(sessions, frame);
  return { payload, sessions, excluded };
}

function enrichFrame(sessions, frame) {
  const flattened = [];
  for (let sessionIndex = 0; sessionIndex < sessions.length; sessionIndex += 1) {
    const session = sessions[sessionIndex];
    const bars = [];
    let sessionHigh = -Infinity;
    let sessionLow = Infinity;
    let typicalSum = 0;
    let path = 0;
    for (let startMinute = 0; startMinute + frame <= session.minutes.length; startMinute += frame) {
      const rows = session.minutes.slice(startMinute, startMinute + frame);
      const bar = {
        sessionIndex,
        index: bars.length,
        startMinute,
        endMinute: startMinute + frame - 1,
        time: rows[0].time,
        open: rows[0].open,
        high: Math.max(...rows.map((row) => row.high)),
        low: Math.min(...rows.map((row) => row.low)),
        close: rows.at(-1).close,
      };
      sessionHigh = Math.max(sessionHigh, bar.high);
      sessionLow = Math.min(sessionLow, bar.low);
      typicalSum += (bar.high + bar.low + bar.close) / 3;
      path += Math.abs(bar.close - (bars.length ? bars.at(-1).close : session.dayOpen));
      const candleRange = Math.max(0.05, bar.high - bar.low);
      const sessionRange = Math.max(0.05, sessionHigh - sessionLow);
      bar.bodyFraction = Math.abs(bar.close - bar.open) / candleRange;
      bar.closeLocation = (bar.close - bar.low) / candleRange;
      bar.sessionHigh = sessionHigh;
      bar.sessionLow = sessionLow;
      bar.sessionLocation = (bar.close - sessionLow) / sessionRange;
      bar.sessionMean = typicalSum / (bars.length + 1);
      bar.sessionMove = bar.close - session.dayOpen;
      bar.efficiency = Math.abs(bar.sessionMove) / Math.max(0.05, path);
      bar.emas = {};
      bars.push(bar);
      flattened.push(bar);
    }
    session.frames[frame] = bars;
  }

  const emaState = Object.fromEntries(EMA_PERIODS.map((period) => [period, null]));
  const rsiPeriods = [7, 14];
  const rsiState = Object.fromEntries(rsiPeriods.map((period) => [period, { gains: [], losses: [], avgGain: null, avgLoss: null }]));
  const atrPeriods = [7, 14];
  const atrState = Object.fromEntries(atrPeriods.map((period) => [period, { values: [], average: null }]));
  let previousClose = null;

  for (const bar of flattened) {
    for (const period of EMA_PERIODS) {
      const alpha = 2 / (period + 1);
      emaState[period] = emaState[period] == null
        ? bar.close
        : (bar.close * alpha) + (emaState[period] * (1 - alpha));
      bar.emas[period] = emaState[period];
    }
    const change = previousClose == null ? 0 : bar.close - previousClose;
    for (const period of rsiPeriods) {
      const state = rsiState[period];
      const gain = Math.max(0, change);
      const loss = Math.max(0, -change);
      if (state.avgGain == null) {
        state.gains.push(gain);
        state.losses.push(loss);
        if (state.gains.length >= period) {
          state.avgGain = sum(state.gains) / period;
          state.avgLoss = sum(state.losses) / period;
        }
      } else {
        state.avgGain = ((state.avgGain * (period - 1)) + gain) / period;
        state.avgLoss = ((state.avgLoss * (period - 1)) + loss) / period;
      }
      bar[`rsi${period}`] = state.avgGain == null
        ? 50
        : state.avgLoss === 0 ? 100 : 100 - (100 / (1 + (state.avgGain / state.avgLoss)));
    }
    const trueRange = previousClose == null
      ? bar.high - bar.low
      : Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
    for (const period of atrPeriods) {
      const state = atrState[period];
      if (state.average == null) {
        state.values.push(trueRange);
        if (state.values.length >= period) state.average = sum(state.values) / period;
      } else {
        state.average = ((state.average * (period - 1)) + trueRange) / period;
      }
      bar[`atr${period}`] = state.average == null ? trueRange : state.average;
    }
    previousClose = bar.close;
  }
}

function previousRange(bars, index, lookback) {
  if (index < lookback) return null;
  const rows = bars.slice(index - lookback, index);
  return {
    high: Math.max(...rows.map((row) => row.high)),
    low: Math.min(...rows.map((row) => row.low)),
  };
}

function signalStates(session, config) {
  const bars = session.frames[config.frame];
  const states = new Array(bars.length).fill(null);
  let persistent = null;
  let fadeState = null;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (index < config.startBars || bar.endMinute > config.lastSignalMinute) {
      states[index] = bar.endMinute > config.lastSignalMinute ? null : persistent;
      continue;
    }
    const range = previousRange(bars, index, config.lookback || 2);
    const emaSign = Math.sign(bar.emas[config.fast || 3] - bar.emas[config.slow || 8]);
    const meanSign = Math.sign(bar.close - bar.sessionMean);
    const moveSign = Math.sign(bar.sessionMove);
    const rsiSign = bar.rsi7 >= (config.rsiHigh || 55) ? 1 : bar.rsi7 <= (config.rsiLow || 45) ? -1 : 0;
    const bodySign = bar.bodyFraction >= (config.minimumBody || 0.2) ? Math.sign(bar.close - bar.open) : 0;
    const breakoutSign = range == null ? 0 : bar.close > range.high ? 1 : bar.close < range.low ? -1 : 0;
    const locationSign = bar.sessionLocation >= 0.65 ? 1 : bar.sessionLocation <= 0.35 ? -1 : 0;
    let state = null;

    if (config.family === "SCORE") {
      const score = emaSign + meanSign + moveSign + rsiSign + breakoutSign + bodySign + locationSign;
      if (bar.efficiency >= config.minimumEfficiency) {
        if (score >= config.threshold) state = "LONG";
        else if (score <= -config.threshold) state = "SHORT";
        else if (!config.exitOnWeak && Math.abs(score) >= config.holdThreshold) state = persistent;
      }
      persistent = state;
    } else if (config.family === "EMA") {
      const rsiOkay = emaSign > 0 ? bar.rsi7 >= config.rsiLong : bar.rsi7 <= config.rsiShort;
      const meanOkay = !config.requireMean || emaSign === meanSign;
      const efficiencyOkay = bar.efficiency >= config.minimumEfficiency;
      state = emaSign && rsiOkay && meanOkay && efficiencyOkay ? (emaSign > 0 ? "LONG" : "SHORT") : null;
      persistent = state;
    } else if (config.family === "DONCHIAN") {
      if (breakoutSign > 0) persistent = "LONG";
      else if (breakoutSign < 0) persistent = "SHORT";
      const direction = persistent === "LONG" ? 1 : persistent === "SHORT" ? -1 : 0;
      const filterOkay = config.filter === "NONE"
        || (config.filter === "EMA" && direction === emaSign)
        || (config.filter === "TREND" && direction === emaSign && direction === meanSign && bar.efficiency >= config.minimumEfficiency);
      state = filterOkay ? persistent : null;
    } else if (config.family === "MOMENTUM") {
      if (index >= config.lookback) {
        const change = bar.close - bars[index - config.lookback].close;
        const ratio = change / session.dailyAtr;
        if (ratio >= config.moveAtr && bar.efficiency >= config.minimumEfficiency && (!config.requireEma || emaSign > 0)) state = "LONG";
        else if (ratio <= -config.moveAtr && bar.efficiency >= config.minimumEfficiency && (!config.requireEma || emaSign < 0)) state = "SHORT";
      }
      persistent = state;
    } else if (config.family === "FADE") {
      const deviation = (bar.close - bar.sessionMean) / Math.max(20, bar.atr14);
      if (fadeState === "LONG" && bar.close >= bar.sessionMean) fadeState = null;
      else if (fadeState === "SHORT" && bar.close <= bar.sessionMean) fadeState = null;
      if (!fadeState && bar.efficiency <= config.maximumEfficiency) {
        if (deviation <= -config.deviationAtr && bar.rsi7 <= config.rsiLow) fadeState = "LONG";
        else if (deviation >= config.deviationAtr && bar.rsi7 >= config.rsiHigh) fadeState = "SHORT";
      }
      state = fadeState;
      persistent = state;
    }
    states[index] = state;
  }
  return states;
}

function entryConfigs() {
  const configs = [];
  const lastMinutes = [225, 285, 345];
  for (const frame of FRAMES) {
    for (const [fast, slow] of [[2, 5], [3, 8], [5, 13], [8, 21]]) {
      for (const lookback of [2, 4, 8]) {
        for (const threshold of [3, 4, 5]) {
          for (const minimumEfficiency of [0, 0.2, 0.4]) {
            for (const lastSignalMinute of lastMinutes) {
              configs.push({
                id: `SCORE-${frame}-${fast}-${slow}-l${lookback}-t${threshold}-e${minimumEfficiency}-x${lastSignalMinute}`,
                family: "SCORE", frame, fast, slow, lookback, threshold, holdThreshold: Math.max(1, threshold - 2),
                minimumEfficiency, minimumBody: 0.2, rsiHigh: 55, rsiLow: 45,
                startBars: Math.max(2, lookback), lastSignalMinute, exitOnWeak: true,
              });
            }
          }
        }
      }
    }
    for (const [fast, slow] of [[2, 5], [3, 8], [5, 13], [8, 21]]) {
      for (const rsiBand of [0, 5, 10]) {
        for (const requireMean of [false, true]) {
          for (const minimumEfficiency of [0, 0.2, 0.4]) {
            for (const lastSignalMinute of lastMinutes) {
              configs.push({
                id: `EMA-${frame}-${fast}-${slow}-r${rsiBand}-m${Number(requireMean)}-e${minimumEfficiency}-x${lastSignalMinute}`,
                family: "EMA", frame, fast, slow, rsiLong: 50 + rsiBand, rsiShort: 50 - rsiBand,
                requireMean, minimumEfficiency, startBars: 2, lastSignalMinute,
              });
            }
          }
        }
      }
    }
    for (const lookback of [2, 3, 5, 8, 13]) {
      for (const filter of ["NONE", "EMA", "TREND"]) {
        for (const minimumEfficiency of [0, 0.2, 0.4]) {
          for (const lastSignalMinute of lastMinutes) {
            configs.push({
              id: `DON-${frame}-l${lookback}-${filter}-e${minimumEfficiency}-x${lastSignalMinute}`,
              family: "DONCHIAN", frame, lookback, filter, fast: 3, slow: 8,
              minimumEfficiency, startBars: lookback, lastSignalMinute,
            });
          }
        }
      }
    }
    for (const lookback of [1, 2, 3, 5, 8]) {
      for (const moveAtr of [0.04, 0.08, 0.12, 0.2]) {
        for (const minimumEfficiency of [0.1, 0.3, 0.5]) {
          for (const requireEma of [false, true]) {
            for (const lastSignalMinute of lastMinutes) {
              configs.push({
                id: `MOM-${frame}-l${lookback}-m${moveAtr}-e${minimumEfficiency}-a${Number(requireEma)}-x${lastSignalMinute}`,
                family: "MOMENTUM", frame, lookback, moveAtr, minimumEfficiency, requireEma,
                fast: 3, slow: 8, startBars: Math.max(2, lookback), lastSignalMinute,
              });
            }
          }
        }
      }
    }
    for (const deviationAtr of [0.75, 1, 1.25, 1.5, 2]) {
      for (const maximumEfficiency of [0.2, 0.4, 0.6]) {
        for (const rsiBand of [10, 15, 20]) {
          for (const lastSignalMinute of lastMinutes) {
            configs.push({
              id: `FADE-${frame}-z${deviationAtr}-e${maximumEfficiency}-r${rsiBand}-x${lastSignalMinute}`,
              family: "FADE", frame, deviationAtr, maximumEfficiency,
              rsiHigh: 50 + rsiBand, rsiLow: 50 - rsiBand, startBars: 3, lastSignalMinute,
            });
          }
        }
      }
    }
  }
  return configs;
}

function exitConfigs() {
  const configs = [];
  for (const stopAtr of [0.1, 0.15, 0.22, 0.3]) {
    for (const reverseOnOpposite of [false, true]) {
      for (const exitOnNeutral of [false, true]) {
        configs.push({ id: `s${stopAtr}-eod-r${Number(reverseOnOpposite)}-n${Number(exitOnNeutral)}`, stopAtr, trail: false, targetAtr: null, reverseOnOpposite, exitOnNeutral });
        for (const [activateAtr, trailAtr] of [[0.15, 0.08], [0.25, 0.12], [0.35, 0.18], [0.5, 0.25]]) {
          configs.push({
            id: `s${stopAtr}-t${activateAtr}-${trailAtr}-r${Number(reverseOnOpposite)}-n${Number(exitOnNeutral)}`,
            stopAtr, trail: true, activateAtr, trailAtr, targetAtr: null, reverseOnOpposite, exitOnNeutral,
          });
        }
      }
    }
  }
  return configs;
}

function pointPnl(side, entry, exit) {
  return side === "LONG" ? exit - entry : entry - exit;
}

function simulate(session, entryConfig, exitConfig, policy, keepTrades = false, cachedStates = null) {
  const bars = session.frames[entryConfig.frame];
  const states = cachedStates || signalStates(session, entryConfig);
  const trades = [];
  let position = null;
  let pendingAction = null;
  let tradeCount = 0;
  let netPoints = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let previousState = null;
  let cooldownUntilBar = -1;

  function closePosition(price, time, reason) {
    const gross = pointPnl(position.side, position.entryPrice, price);
    const points = gross - COST_POINTS;
    netPoints += points;
    if (points > 0) grossWins += points;
    else grossLosses += -points;
    tradeCount += 1;
    if (keepTrades) {
      trades.push({
        side: position.side,
        entryTime: position.entryTime,
        entryPrice: round(position.entryPrice),
        exitTime: time,
        exitPrice: round(price),
        points: round(points),
        reason,
      });
    }
    position = null;
  }

  function openPosition(side, price, time, barIndex) {
    if (!side || tradeCount >= policy.maxTrades || netPoints <= -policy.dailyLossCap || barIndex < cooldownUntilBar) return;
    const stopDistance = clamp(exitConfig.stopAtr * session.dailyAtr, 40, 400);
    position = {
      side,
      entryPrice: price,
      entryTime: time,
      stop: side === "LONG" ? price - stopDistance : price + stopDistance,
      bestHigh: price,
      bestLow: price,
    };
  }

  for (let barIndex = 0; barIndex < bars.length; barIndex += 1) {
    const bar = bars[barIndex];
    const openMinute = session.minutes[bar.startMinute];

    if (pendingAction) {
      const desired = pendingAction.side;
      if (position && desired !== position.side) {
        const oldSide = position.side;
        closePosition(openMinute.open, openMinute.time, desired ? "OPPOSITE_SIGNAL" : "NEUTRAL_SIGNAL");
        cooldownUntilBar = barIndex + policy.cooldownBars;
        if (desired && exitConfig.reverseOnOpposite && desired !== oldSide) openPosition(desired, openMinute.open, openMinute.time, barIndex);
      } else if (!position && desired && (entryConfig.reenterState || pendingAction.changed)) {
        openPosition(desired, openMinute.open, openMinute.time, barIndex);
      }
      pendingAction = null;
    }

    for (let minuteIndex = bar.startMinute; minuteIndex <= bar.endMinute; minuteIndex += 1) {
      if (!position) break;
      const minute = session.minutes[minuteIndex];
      const gapThrough = position.side === "LONG" ? minute.open <= position.stop : minute.open >= position.stop;
      const stopTouched = position.side === "LONG" ? minute.low <= position.stop : minute.high >= position.stop;
      if (gapThrough || stopTouched) {
        closePosition(gapThrough ? minute.open : position.stop, minute.time, gapThrough ? "STOP_GAP" : "STOP");
        cooldownUntilBar = barIndex + policy.cooldownBars;
        break;
      }
      position.bestHigh = Math.max(position.bestHigh, minute.high);
      position.bestLow = Math.min(position.bestLow, minute.low);
    }

    if (position && exitConfig.trail) {
      const favourable = position.side === "LONG"
        ? position.bestHigh - position.entryPrice
        : position.entryPrice - position.bestLow;
      if (favourable >= exitConfig.activateAtr * session.dailyAtr) {
        const candidate = position.side === "LONG"
          ? position.bestHigh - (exitConfig.trailAtr * session.dailyAtr)
          : position.bestLow + (exitConfig.trailAtr * session.dailyAtr);
        const crossedAtClose = position.side === "LONG" ? bar.close <= candidate : bar.close >= candidate;
        if (crossedAtClose) pendingAction = { side: null, changed: true, reason: "TRAIL_CROSSED_AT_CLOSE" };
        else position.stop = position.side === "LONG"
          ? Math.max(position.stop, candidate)
          : Math.min(position.stop, candidate);
      }
    }

    const state = states[barIndex];
    const changed = state !== previousState;
    if (bar.endMinute < session.minutes.length - 1) {
      if (position) {
        if (state && state !== position.side) pendingAction = { side: state, changed: true };
        else if (!state && exitConfig.exitOnNeutral) pendingAction = { side: null, changed };
      } else if (state && (entryConfig.reenterState || changed)) {
        pendingAction = { side: state, changed };
      }
    }
    previousState = state;
  }

  if (position) {
    const finalMinute = session.minutes.at(-1);
    closePosition(finalMinute.close, "15:30", "EOD");
  }
  return {
    day: session.day,
    month: session.month,
    netPoints: round(netPoints),
    grossWins: round(grossWins),
    grossLosses: round(grossLosses),
    trades: keepTrades ? trades : tradeCount,
  };
}

function summarize(rows, months) {
  const monthly = Object.fromEntries(months.map((month) => [month, 0]));
  let netPoints = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let trades = 0;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  let greenDays = 0;
  let redDays = 0;
  for (const row of rows) {
    monthly[row.month] += row.netPoints;
    netPoints += row.netPoints;
    grossWins += row.grossWins;
    grossLosses += row.grossLosses;
    trades += Array.isArray(row.trades) ? row.trades.length : row.trades;
    equity += row.netPoints;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
    if (row.netPoints > 0) greenDays += 1;
    if (row.netPoints < 0) redDays += 1;
  }
  const values = Object.values(monthly);
  const average = netPoints / values.length;
  const median = quantile(values, 0.5);
  const p20 = quantile(values, 0.2);
  const minimum = Math.min(...values);
  const score = average + (0.85 * median) + (0.55 * p20) + (0.2 * minimum) - (maxDrawdown / values.length);
  return {
    sessions: rows.length,
    trades,
    greenDays,
    redDays,
    netPoints: round(netPoints),
    averageMonthlyPoints: round(average),
    medianMonthlyPoints: round(median),
    p20MonthlyPoints: round(p20),
    minimumMonthlyPoints: round(minimum),
    maximumMonthlyPoints: round(Math.max(...values)),
    positiveMonths: values.filter((value) => value > 0).length,
    targetMonths: values.filter((value) => value >= TARGET_POINTS).length,
    months: values.length,
    profitFactor: grossLosses ? round(grossWins / grossLosses) : null,
    maxDrawdownPoints: round(maxDrawdown),
    score: round(score),
    monthly: Object.fromEntries(Object.entries(monthly).map(([month, value]) => [month, round(value)])),
  };
}

function periodSessions(sessions, period) {
  return sessions.filter((session) => session.day >= period.from && session.day <= period.to);
}

function evaluate(sessions, entry, exit, policy, keepTrades = false, stateCache = null) {
  const rows = sessions.map((session, index) => simulate(session, entry, exit, policy, keepTrades, stateCache?.[index] || null));
  const months = [...new Set(sessions.map((session) => session.month))];
  return { summary: summarize(rows, months), rows };
}

function discover(entries, sessions) {
  const baselineExit = {
    id: "baseline", stopAtr: 0.15, trail: true, activateAtr: 0.25, trailAtr: 0.12,
    targetAtr: null, reverseOnOpposite: true, exitOnNeutral: false,
  };
  const baselinePolicy = { id: "baseline", maxTrades: 5, dailyLossCap: 600, cooldownBars: 1 };
  const ranked = [];
  for (let index = 0; index < entries.length; index += 1) {
    const stateCache = sessions.map((session) => signalStates(session, entries[index]));
    const variants = [
      { ...entries[index], reenterState: false },
      { ...entries[index], reenterState: true },
    ];
    for (const entry of variants) {
      const summary = evaluate(sessions, entry, baselineExit, baselinePolicy, false, stateCache).summary;
      if (summary.trades >= 150 && summary.netPoints > 0 && summary.profitFactor >= 1.01) ranked.push({ entry, summary });
    }
    if ((index + 1) % 1000 === 0) console.log(`discovery ${index + 1}/${entries.length}`);
  }
  ranked.sort((left, right) => right.summary.score - left.summary.score);
  const selected = [];
  const counts = new Map();
  for (const row of ranked) {
    const key = `${row.entry.family}-${row.entry.frame}`;
    const count = counts.get(key) || 0;
    if (count >= 8) continue;
    selected.push(row.entry);
    counts.set(key, count + 1);
    if (selected.length >= 120) break;
  }
  return { ranked, selected };
}

function optimize(entries, exits, sessions) {
  const policies = [
    { id: "m2-c300", maxTrades: 2, dailyLossCap: 300, cooldownBars: 1 },
    { id: "m4-c400", maxTrades: 4, dailyLossCap: 400, cooldownBars: 1 },
    { id: "m6-c600", maxTrades: 6, dailyLossCap: 600, cooldownBars: 1 },
    { id: "m8-c800", maxTrades: 8, dailyLossCap: 800, cooldownBars: 1 },
  ];
  const ranked = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const stateCache = sessions.map((session) => signalStates(session, entries[entryIndex]));
    for (const exit of exits) {
      for (const policy of policies) {
        const summary = evaluate(sessions, entries[entryIndex], exit, policy, false, stateCache).summary;
        if (summary.trades >= 150 && summary.netPoints > 0 && summary.profitFactor >= 1.02) {
          ranked.push({ entry: entries[entryIndex], exit, policy, train: summary });
        }
      }
    }
    if ((entryIndex + 1) % 10 === 0) console.log(`optimization ${entryIndex + 1}/${entries.length}`);
  }
  ranked.sort((left, right) => right.train.score - left.train.score);
  return ranked;
}

function develop(candidates, sessions) {
  const stateCaches = new Map();
  const rows = candidates.slice(0, 800).map((candidate) => {
    const cacheKey = candidate.entry.id;
    if (!stateCaches.has(cacheKey)) stateCaches.set(cacheKey, sessions.map((session) => signalStates(session, candidate.entry)));
    const development = evaluate(sessions, candidate.entry, candidate.exit, candidate.policy, false, stateCaches.get(cacheKey)).summary;
    const train = candidate.train;
    const score = Math.min(train.averageMonthlyPoints, development.averageMonthlyPoints)
      + (0.85 * Math.min(train.medianMonthlyPoints, development.medianMonthlyPoints))
      + (0.5 * Math.min(train.p20MonthlyPoints, development.p20MonthlyPoints))
      + (0.15 * Math.min(train.minimumMonthlyPoints, development.minimumMonthlyPoints))
      - ((train.maxDrawdownPoints + development.maxDrawdownPoints) / 40);
    return { ...candidate, development, selectionScore: round(score) };
  });
  rows.sort((left, right) => right.selectionScore - left.selectionScore);
  return rows;
}

function compact(candidate) {
  return {
    entry: candidate.entry,
    exit: candidate.exit,
    policy: candidate.policy,
    selectionScore: candidate.selectionScore,
    train: candidate.train,
    development: candidate.development,
    latest: candidate.latest,
  };
}

function main() {
  const { payload, sessions, excluded } = loadSessions();
  const train = periodSessions(sessions, SPLITS.train);
  const development = periodSessions(sessions, SPLITS.development);
  const latest = periodSessions(sessions, SPLITS.latest);
  const entries = entryConfigs();
  const exits = exitConfigs();
  console.log(JSON.stringify({
    sourceSessions: payload.sessionCount,
    usableSessions: sessions.length,
    splits: { train: train.length, development: development.length, latest: latest.length },
    entries: entries.length,
    exits: exits.length,
  }));

  const discovery = discover(entries, train);
  const optimized = optimize(discovery.selected, exits, train);
  const developed = develop(optimized, development);
  const finalists = developed.slice(0, 40).map((candidate) => ({
    ...candidate,
    latest: evaluate(latest, candidate.entry, candidate.exit, candidate.policy).summary,
  }));
  const winner = finalists[0];
  const details = {
    train: evaluate(train, winner.entry, winner.exit, winner.policy, true),
    development: evaluate(development, winner.entry, winner.exit, winner.policy, true),
    latest: evaluate(latest, winner.entry, winner.exit, winner.policy, true),
  };
  const completeLatestMonths = Object.fromEntries(Object.entries(details.latest.summary.monthly)
    .filter(([month]) => month > SPLITS.latest.from.slice(0, 7) && month < SPLITS.latest.to.slice(0, 7)));

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      input: INPUT,
      source: payload.source,
      sourceSessions: payload.sessionCount,
      sourceCandles: payload.candleCount,
      usableFullSessions: sessions.length,
      excluded,
    },
    methodology: {
      split: SPLITS,
      signals: "Indicators use completed timeframe bars only",
      entriesAndSignalExits: "Any bar-close decision fills at the following timeframe bar's first minute open",
      stops: "Existing stop is replayed minute by minute; adverse gaps fill at minute open",
      trailing: "Favourable movement from a completed bar can update the stop only for following minutes",
      ambiguity: "No same-minute favourable ordering is assumed",
      positionLimit: "One index-equivalent position at a time",
      friction: `${COST_POINTS} index points per completed trade`,
      limitation: "BANKNIFTY index points, not historical futures contract fills; latest period is chronological but no longer pristine after earlier research iterations",
    },
    search: {
      entryConfigs: entries.length,
      exitConfigs: exits.length,
      discoveryEligible: discovery.ranked.length,
      selectedEntries: discovery.selected.length,
      optimizedCandidates: optimized.length,
      developedCandidates: developed.length,
    },
    winner: {
      ...compact(winner),
      completeLatestMonths,
      completeLatestTargetMonths: Object.values(completeLatestMonths).filter((value) => value >= TARGET_POINTS).length,
      completeLatestMonthCount: Object.keys(completeLatestMonths).length,
      rows: {
        train: details.train.rows,
        development: details.development.rows,
        latest: details.latest.rows,
      },
    },
    finalists: finalists.map(compact),
    topTraining: optimized.slice(0, 40).map((candidate) => ({ entry: candidate.entry, exit: candidate.exit, policy: candidate.policy, train: candidate.train })),
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    output: OUTPUT,
    search: output.search,
    winner: compact(winner),
    completeLatestMonths,
    completeLatestTargetMonths: output.winner.completeLatestTargetMonths,
  }, null, 2));
}

main();

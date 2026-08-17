"use strict";

const fs = require("fs");
const zlib = require("zlib");

const INPUT = process.argv[2] || "C:/tmp/banknifty-index-minute-2021-2026.json.gz";
const OUTPUT = process.argv[3] || "research-banknifty-minute-price-action.json";
const COST_POINTS = 5;
const TARGET_POINTS = 2000;
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
    const rows = payload.days[day] || [];
    if (rows.length !== 375 || rows[0]?.t !== "09:15" || rows.at(-1)?.t !== "15:29") {
      excluded.push({ day, candles: rows.length, start: rows[0]?.t || null, end: rows.at(-1)?.t || null });
      continue;
    }
    rawSessions.push({
      day,
      month: day.slice(0, 7),
      minutes: rows.map((row, index) => ({
        index,
        time: row.t,
        open: Number(row.o),
        high: Number(row.h),
        low: Number(row.l),
        close: Number(row.c),
      })),
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

    let ema5 = null;
    let ema20 = null;
    let sessionHigh = -Infinity;
    let sessionLow = Infinity;
    let path = 0;
    const dayOpen = session.minutes[0].open;
    for (let minuteIndex = 0; minuteIndex < session.minutes.length; minuteIndex += 1) {
      const minute = session.minutes[minuteIndex];
      ema5 = ema5 == null ? minute.close : (minute.close * (2 / 6)) + (ema5 * (4 / 6));
      ema20 = ema20 == null ? minute.close : (minute.close * (2 / 21)) + (ema20 * (19 / 21));
      sessionHigh = Math.max(sessionHigh, minute.high);
      sessionLow = Math.min(sessionLow, minute.low);
      path += Math.abs(minute.close - (minuteIndex ? session.minutes[minuteIndex - 1].close : dayOpen));
      const range = Math.max(0.05, sessionHigh - sessionLow);
      minute.ema5 = ema5;
      minute.ema20 = ema20;
      minute.sessionMove = minute.close - dayOpen;
      minute.sessionLocation = (minute.close - sessionLow) / range;
      minute.efficiency = Math.abs(minute.sessionMove) / Math.max(0.05, path);
    }
    sessions.push({
      ...session,
      previousClose,
      dayOpen,
      dailyAtr,
      gapAtr: (dayOpen - previousClose) / dailyAtr,
      trueRange,
    });
  }
  return { payload, sessions, excluded };
}

function entryConfigs() {
  const configs = [];
  for (const startMinute of [0, 15, 30, 60]) {
    for (const lastEntryMinute of [225, 285, 345]) {
      for (const thresholdAtr of [0.04, 0.06, 0.08, 0.1, 0.13, 0.17]) {
        for (const filter of ["NONE", "EMA", "TREND", "GAP"] ) {
          configs.push({
            id: `DC-s${startMinute}-x${lastEntryMinute}-q${thresholdAtr}-${filter}`,
            family: "DIRECTIONAL_CHANGE",
            startMinute,
            lastEntryMinute,
            thresholdAtr,
            filter,
          });
        }
      }
    }
  }
  for (const lookback of [3, 5, 10, 15, 30, 45, 60]) {
    for (const startMinute of [15, 30, 60]) {
      for (const lastEntryMinute of [225, 285, 345]) {
        for (const bufferAtr of [0, 0.005, 0.01, 0.02]) {
          for (const filter of ["NONE", "EMA", "TREND", "STRONG"]) {
            configs.push({
              id: `ROLL-l${lookback}-s${startMinute}-x${lastEntryMinute}-b${bufferAtr}-${filter}`,
              family: "ROLLING_BREAKOUT",
              lookback,
              startMinute,
              lastEntryMinute,
              bufferAtr,
              filter,
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
  for (const stopAtr of [0.04, 0.06, 0.08, 0.11, 0.15]) {
    for (const trailAtr of [0.04, 0.06, 0.08, 0.11, 0.15, 0.2]) {
      for (const activateAtr of [0, 0.08, 0.16]) {
        configs.push({
          id: `s${stopAtr}-t${trailAtr}-a${activateAtr}`,
          stopAtr,
          trailAtr,
          activateAtr,
        });
      }
    }
  }
  return configs;
}

function policies() {
  return [
    { id: "m2-c300", maxTrades: 2, dailyLossCap: 300, cooldown: 2 },
    { id: "m4-c400", maxTrades: 4, dailyLossCap: 400, cooldown: 2 },
    { id: "m6-c600", maxTrades: 6, dailyLossCap: 600, cooldown: 2 },
    { id: "m8-c800", maxTrades: 8, dailyLossCap: 800, cooldown: 2 },
  ];
}

function directionAllowed(side, minute, session, filter) {
  if (filter === "NONE") return true;
  const direction = side === "LONG" ? 1 : -1;
  const emaAligned = direction * (minute.ema5 - minute.ema20) > 0;
  const moveAligned = direction * minute.sessionMove > 0;
  const location = side === "LONG" ? minute.sessionLocation : 1 - minute.sessionLocation;
  if (filter === "EMA") return emaAligned;
  if (filter === "TREND") return emaAligned && moveAligned && location >= 0.62 && minute.efficiency >= 0.2;
  if (filter === "STRONG") return emaAligned && moveAligned && location >= 0.72 && minute.efficiency >= 0.4;
  if (filter === "GAP") return direction * session.gapAtr > 0;
  return true;
}

function buildStaticTriggers(session, entry) {
  if (entry.family !== "ROLLING_BREAKOUT") return null;
  const triggers = new Array(session.minutes.length).fill(null);
  const highs = [];
  const lows = [];
  for (let index = 0; index < session.minutes.length; index += 1) {
    const minute = session.minutes[index];
    while (highs.length && highs[0] < index - entry.lookback) highs.shift();
    while (lows.length && lows[0] < index - entry.lookback) lows.shift();
    if (index >= entry.startMinute && index >= entry.lookback && index <= entry.lastEntryMinute) {
      const upper = session.minutes[highs[0]].high + (entry.bufferAtr * session.dailyAtr);
      const lower = session.minutes[lows[0]].low - (entry.bufferAtr * session.dailyAtr);
      const hitLong = minute.high >= upper;
      const hitShort = minute.low <= lower;
      if (hitLong && hitShort) triggers[index] = { ambiguous: true };
      else {
        const side = hitLong ? "LONG" : hitShort ? "SHORT" : null;
        if (side && directionAllowed(side, session.minutes[Math.max(0, index - 1)], session, entry.filter)) {
          triggers[index] = { side, level: side === "LONG" ? upper : lower };
        }
      }
    }
    while (highs.length && session.minutes[highs.at(-1)].high <= minute.high) highs.pop();
    highs.push(index);
    while (lows.length && session.minutes[lows.at(-1)].low >= minute.low) lows.pop();
    lows.push(index);
  }
  return triggers;
}

function pointPnl(side, entry, exit) {
  return side === "LONG" ? exit - entry : entry - exit;
}

function simulate(session, entry, exit, policy, keepTrades = false, staticTriggers = null) {
  const trades = [];
  let position = null;
  let tradeCount = 0;
  let netPoints = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let cooldownUntil = -1;
  let swingHigh = null;
  let swingLow = null;
  let ambiguous = 0;

  function closePosition(index, price, reason) {
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
        exitTime: index >= session.minutes.length ? "15:30" : session.minutes[index].time,
        exitPrice: round(price),
        points: round(points),
        reason,
      });
    }
    position = null;
    cooldownUntil = index + policy.cooldown;
    swingHigh = null;
    swingLow = null;
  }

  function openPosition(side, minute, triggerPrice, index) {
    const gapThrough = side === "LONG" ? minute.open >= triggerPrice : minute.open <= triggerPrice;
    const entryPrice = gapThrough ? minute.open : triggerPrice;
    const stopDistance = clamp(exit.stopAtr * session.dailyAtr, 25, 350);
    position = {
      side,
      entryPrice,
      entryTime: minute.time,
      stop: side === "LONG" ? entryPrice - stopDistance : entryPrice + stopDistance,
      bestHigh: entryPrice,
      bestLow: entryPrice,
    };
    const sameMinuteStop = side === "LONG" ? minute.low <= position.stop : minute.high >= position.stop;
    if (sameMinuteStop) closePosition(index, position.stop, "ENTRY_MINUTE_STOP_CONSERVATIVE");
  }

  for (let index = entry.startMinute; index < session.minutes.length; index += 1) {
    const minute = session.minutes[index];

    if (position) {
      const gapThrough = position.side === "LONG" ? minute.open <= position.stop : minute.open >= position.stop;
      const stopTouched = position.side === "LONG" ? minute.low <= position.stop : minute.high >= position.stop;
      if (gapThrough || stopTouched) {
        closePosition(index, gapThrough ? minute.open : position.stop, gapThrough ? "STOP_GAP" : "STOP");
      }
    }

    if (position && index === session.minutes.length - 1) {
      closePosition(session.minutes.length, minute.close, "EOD");
      continue;
    }

    if (position) {
      position.bestHigh = Math.max(position.bestHigh, minute.high);
      position.bestLow = Math.min(position.bestLow, minute.low);
      const favourable = position.side === "LONG"
        ? position.bestHigh - position.entryPrice
        : position.entryPrice - position.bestLow;
      if (favourable >= exit.activateAtr * session.dailyAtr) {
        const candidate = position.side === "LONG"
          ? position.bestHigh - (exit.trailAtr * session.dailyAtr)
          : position.bestLow + (exit.trailAtr * session.dailyAtr);
        const crossedAtClose = position.side === "LONG" ? minute.close <= candidate : minute.close >= candidate;
        if (crossedAtClose) {
          closePosition(index, minute.close, "TRAIL_CROSSED_AT_CLOSE");
        } else if (position) {
          position.stop = position.side === "LONG"
            ? Math.max(position.stop, candidate)
            : Math.min(position.stop, candidate);
        }
      }
      continue;
    }

    if (index < cooldownUntil || index > entry.lastEntryMinute || tradeCount >= policy.maxTrades || netPoints <= -policy.dailyLossCap) continue;

    if (entry.family === "DIRECTIONAL_CHANGE") {
      swingHigh = swingHigh == null ? minute.high : Math.max(swingHigh, minute.high);
      swingLow = swingLow == null ? minute.low : Math.min(swingLow, minute.low);
      const threshold = clamp(entry.thresholdAtr * session.dailyAtr, 25, 350);
      const longLevel = swingLow + threshold;
      const shortLevel = swingHigh - threshold;
      const hitLong = minute.high >= longLevel;
      const hitShort = minute.low <= shortLevel;
      if (hitLong && hitShort) {
        ambiguous += 1;
        swingHigh = minute.close;
        swingLow = minute.close;
        continue;
      }
      const side = hitLong ? "LONG" : hitShort ? "SHORT" : null;
      if (!side) continue;
      if (!directionAllowed(side, session.minutes[Math.max(0, index - 1)], session, entry.filter)) {
        swingHigh = minute.close;
        swingLow = minute.close;
        continue;
      }
      openPosition(side, minute, side === "LONG" ? longLevel : shortLevel, index);
      continue;
    }

    const trigger = staticTriggers?.[index];
    if (!trigger) continue;
    if (trigger.ambiguous) {
      ambiguous += 1;
      cooldownUntil = index + policy.cooldown;
      continue;
    }
    openPosition(trigger.side, minute, trigger.level, index);
  }

  if (position) closePosition(session.minutes.length, session.minutes.at(-1).close, "FORCED_EOD");
  return {
    day: session.day,
    month: session.month,
    netPoints: round(netPoints),
    grossWins: round(grossWins),
    grossLosses: round(grossLosses),
    trades: keepTrades ? trades : tradeCount,
    ambiguous,
  };
}

function summarize(rows, months) {
  const monthly = Object.fromEntries(months.map((month) => [month, 0]));
  let netPoints = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let trades = 0;
  let ambiguous = 0;
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const row of rows) {
    monthly[row.month] += row.netPoints;
    netPoints += row.netPoints;
    grossWins += row.grossWins;
    grossLosses += row.grossLosses;
    trades += Array.isArray(row.trades) ? row.trades.length : row.trades;
    ambiguous += row.ambiguous;
    equity += row.netPoints;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
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
    ambiguousMinutes: ambiguous,
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

function evaluate(sessions, entry, exit, policy, keepTrades = false, triggerCache = null) {
  const effectiveTriggerCache = triggerCache || sessions.map((session) => buildStaticTriggers(session, entry));
  const rows = sessions.map((session, index) => simulate(session, entry, exit, policy, keepTrades, effectiveTriggerCache[index] || null));
  const months = [...new Set(sessions.map((session) => session.month))];
  return { summary: summarize(rows, months), rows };
}

function discover(entries, sessions) {
  const baselines = [
    { exit: { id: "base1", stopAtr: 0.08, trailAtr: 0.08, activateAtr: 0.08 }, policy: { id: "base4", maxTrades: 4, dailyLossCap: 400, cooldown: 2 } },
    { exit: { id: "base2", stopAtr: 0.11, trailAtr: 0.11, activateAtr: 0.16 }, policy: { id: "base6", maxTrades: 6, dailyLossCap: 600, cooldown: 2 } },
    { exit: { id: "base3", stopAtr: 0.15, trailAtr: 0.2, activateAtr: 0.16 }, policy: { id: "base4", maxTrades: 4, dailyLossCap: 400, cooldown: 2 } },
  ];
  const ranked = [];
  for (let index = 0; index < entries.length; index += 1) {
    const triggerCache = sessions.map((session) => buildStaticTriggers(session, entries[index]));
    let best = null;
    for (const baseline of baselines) {
      const summary = evaluate(sessions, entries[index], baseline.exit, baseline.policy, false, triggerCache).summary;
      if (!best || summary.score > best.summary.score) best = { baseline, summary };
    }
    if (best.summary.trades >= 150 && best.summary.netPoints > 0 && best.summary.profitFactor >= 1.01) {
      ranked.push({ entry: entries[index], ...best });
    }
    if ((index + 1) % 250 === 0) console.log(`discovery ${index + 1}/${entries.length}`);
  }
  ranked.sort((left, right) => right.summary.score - left.summary.score);
  const selected = [];
  const counts = new Map();
  for (const row of ranked) {
    const key = `${row.entry.family}-${row.entry.lookback || row.entry.thresholdAtr}-${row.entry.filter}`;
    const count = counts.get(key) || 0;
    if (count >= 3) continue;
    selected.push(row.entry);
    counts.set(key, count + 1);
    if (selected.length >= 60) break;
  }
  return { ranked, selected };
}

function optimize(entries, exits, policyConfigs, sessions) {
  const ranked = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    const triggerCache = sessions.map((session) => buildStaticTriggers(session, entries[entryIndex]));
    for (const exit of exits) {
      for (const policy of policyConfigs) {
        const summary = evaluate(sessions, entries[entryIndex], exit, policy, false, triggerCache).summary;
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
  const triggerCaches = new Map();
  const rows = candidates.slice(0, 600).map((candidate) => {
    if (!triggerCaches.has(candidate.entry.id)) {
      triggerCaches.set(candidate.entry.id, sessions.map((session) => buildStaticTriggers(session, candidate.entry)));
    }
    const development = evaluate(sessions, candidate.entry, candidate.exit, candidate.policy, false, triggerCaches.get(candidate.entry.id)).summary;
    const score = Math.min(candidate.train.averageMonthlyPoints, development.averageMonthlyPoints)
      + (0.85 * Math.min(candidate.train.medianMonthlyPoints, development.medianMonthlyPoints))
      + (0.5 * Math.min(candidate.train.p20MonthlyPoints, development.p20MonthlyPoints))
      + (0.15 * Math.min(candidate.train.minimumMonthlyPoints, development.minimumMonthlyPoints))
      - ((candidate.train.maxDrawdownPoints + development.maxDrawdownPoints) / 40);
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
  const policyConfigs = policies();
  console.log(JSON.stringify({
    sourceSessions: payload.sessionCount,
    usableSessions: sessions.length,
    splits: { train: train.length, development: development.length, latest: latest.length },
    entries: entries.length,
    exits: exits.length,
    policies: policyConfigs.length,
  }));

  const discovery = discover(entries, train);
  const optimized = optimize(discovery.selected, exits, policyConfigs, train);
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
      entries: "All rolling levels and directional-change thresholds are known before the triggering minute",
      fills: "Stop entry fills at known trigger or adverse gap-open price",
      stops: "Existing stops are checked before new trailing levels; entry-minute stop is assumed hit when ordering is uncertain",
      trails: "A trail calculated from a minute applies after that minute; a crossed calculated trail exits at minute close",
      ambiguity: "If both entry directions touch in one minute, no favourable ordering is assumed and no profit is credited",
      positionLimit: "One index-equivalent position at a time",
      friction: `${COST_POINTS} index points per completed trade`,
      limitation: "BANKNIFTY index-point proxy, not historical futures-contract fills",
    },
    search: {
      entryConfigs: entries.length,
      exitConfigs: exits.length,
      policies: policyConfigs.length,
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

"use strict";

const fs = require("fs");
const zlib = require("zlib");

const INPUT = process.argv[2] || "C:/tmp/banknifty-index-minute-2021-2026.json.gz";
const OUTPUT = process.argv[3] || "research-banknifty-stop-order-optimizer.json";
const COST_POINTS = 5;
const TARGET_POINTS = 2000;
const SPLITS = {
  train: { from: "2021-02-01", to: "2024-12-31" },
  development: { from: "2025-01-01", to: "2025-08-11" },
  validation: { from: "2025-08-12", to: "2026-08-12" },
};

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);

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

function ema(values, period) {
  const alpha = 2 / (period + 1);
  const output = [];
  for (const value of values) {
    output.push(output.length ? (value * alpha) + (output.at(-1) * (1 - alpha)) : value);
  }
  return output;
}

function aggregate15(minutes) {
  const bars = [];
  for (let index = 0; index < 375; index += 15) {
    const rows = minutes.slice(index, index + 15);
    bars.push({
      index: bars.length,
      time: rows[0].time,
      open: rows[0].open,
      high: Math.max(...rows.map((row) => row.high)),
      low: Math.min(...rows.map((row) => row.low)),
      close: rows.at(-1).close,
    });
  }
  const closes = bars.map((bar) => bar.close);
  const fast = ema(closes, 3);
  const slow = ema(closes, 8);
  let high = -Infinity;
  let low = Infinity;
  let path = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
    path += Math.abs(bar.close - (index ? bars[index - 1].close : bars[0].open));
    const range = Math.max(0.05, high - low);
    bar.emaFast = fast[index];
    bar.emaSlow = slow[index];
    bar.sessionHigh = high;
    bar.sessionLow = low;
    bar.sessionLocation = (bar.close - low) / range;
    bar.move = bar.close - bars[0].open;
    bar.efficiency = Math.abs(bar.move) / Math.max(0.05, path);
  }
  return bars;
}

function loadSessions() {
  const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(INPUT)));
  const rawSessions = [];
  const excluded = [];
  for (const day of payload.sessions) {
    const raw = payload.days[day] || [];
    const full = raw.length === 375 && raw[0]?.t === "09:15" && raw.at(-1)?.t === "15:29";
    if (!full) {
      excluded.push({ day, candles: raw.length, start: raw[0]?.t || null, end: raw.at(-1)?.t || null });
      continue;
    }
    const minutes = raw.map((row, index) => ({
      index,
      time: row.t,
      open: Number(row.o),
      high: Number(row.h),
      low: Number(row.l),
      close: Number(row.c),
    }));
    rawSessions.push({ day, minutes, bars15: aggregate15(minutes) });
  }

  const dailyRanges = [];
  const sessions = [];
  for (let index = 0; index < rawSessions.length; index += 1) {
    const row = rawSessions[index];
    const previousClose = index ? rawSessions[index - 1].minutes.at(-1).close : row.minutes[0].open;
    const dayHigh = Math.max(...row.minutes.map((bar) => bar.high));
    const dayLow = Math.min(...row.minutes.map((bar) => bar.low));
    const trueRange = Math.max(dayHigh - dayLow, Math.abs(dayHigh - previousClose), Math.abs(dayLow - previousClose));
    const warmup = dailyRanges.slice(Math.max(0, dailyRanges.length - 14));
    const dailyAtr = warmup.length >= 10 ? sum(warmup) / warmup.length : null;
    dailyRanges.push(trueRange);
    if (dailyAtr == null) continue;
    sessions.push({
      ...row,
      month: row.day.slice(0, 7),
      previousClose,
      dayOpen: row.minutes[0].open,
      dailyAtr,
      gapAtr: (row.minutes[0].open - previousClose) / dailyAtr,
      trueRange,
    });
  }
  return { payload, sessions, excluded };
}

function rangeFor(session, config) {
  const bars = config.rangeType === "SINGLE"
    ? [session.bars15[config.rangeEnd]]
    : session.bars15.slice(0, config.rangeEnd + 1);
  const high = config.rangeBasis === "BODY"
    ? Math.max(...bars.flatMap((bar) => [bar.open, bar.close]))
    : Math.max(...bars.map((bar) => bar.high));
  const low = config.rangeBasis === "BODY"
    ? Math.min(...bars.flatMap((bar) => [bar.open, bar.close]))
    : Math.min(...bars.map((bar) => bar.low));
  return { high, low, widthAtr: (high - low) / session.dailyAtr };
}

function entryFilter(side, session, minuteIndex, filter) {
  if (filter === "NONE") return true;
  const completed15 = Math.floor(minuteIndex / 15) - 1;
  if (completed15 < 0) return false;
  const bar = session.bars15[completed15];
  const direction = side === "LONG" ? 1 : -1;
  const moveAligned = direction * bar.move > 0;
  const emaAligned = direction * (bar.emaFast - bar.emaSlow) > 0;
  const location = side === "LONG" ? bar.sessionLocation : 1 - bar.sessionLocation;
  if (filter === "MOVE") return moveAligned;
  if (filter === "EMA") return emaAligned;
  if (filter === "TREND") return moveAligned && emaAligned && location >= 0.62 && bar.efficiency >= 0.2;
  if (filter === "STRONG") return moveAligned && emaAligned && location >= 0.72 && bar.efficiency >= 0.4;
  if (filter === "GAP") return direction * session.gapAtr > 0;
  if (filter === "FADE_GAP") return direction * session.gapAtr < 0 && Math.abs(session.gapAtr) >= 0.15;
  return true;
}

function entryConfigs() {
  const ranges = [];
  for (let rangeEnd = 1; rangeEnd <= 8; rangeEnd += 1) {
    ranges.push({ rangeType: "SINGLE", rangeEnd });
  }
  for (const rangeEnd of [1, 2, 3, 5, 7]) ranges.push({ rangeType: "OPENING", rangeEnd });
  const widthProfiles = [
    { id: "ANY", minimum: 0, maximum: 99 },
    { id: "COMPACT", minimum: 0, maximum: 0.4 },
    { id: "NORMAL", minimum: 0.12, maximum: 0.7 },
    { id: "WIDE", minimum: 0.3, maximum: 1.1 },
  ];
  const configs = [];
  for (const range of ranges) {
    for (const rangeBasis of ["FULL", "BODY"]) {
      for (const bufferAtr of [0, 0.01, 0.02, 0.04]) {
        for (const filter of ["NONE", "MOVE", "EMA", "TREND", "STRONG", "GAP", "FADE_GAP"]) {
          for (const width of widthProfiles) {
            for (const lastEntryMinute of [165, 225, 285, 345]) {
              const startMinute = (range.rangeEnd + 1) * 15;
              if (lastEntryMinute <= startMinute) continue;
              configs.push({
                id: `${range.rangeType}-${range.rangeEnd}-${rangeBasis}-b${bufferAtr}-${filter}-${width.id}-e${lastEntryMinute}`,
                ...range,
                rangeBasis,
                bufferAtr,
                filter,
                widthId: width.id,
                minimumWidthAtr: width.minimum,
                maximumWidthAtr: width.maximum,
                startMinute,
                lastEntryMinute,
              });
            }
          }
        }
      }
    }
  }
  return configs;
}

function exitConfigs() {
  const configs = [];
  for (const stopPoints of [75, 100, 125, 150, 200, 250]) {
    configs.push({ id: `stop${stopPoints}-eod`, stopPoints, type: "EOD" });
    for (const breakEvenAt of [100, 175, 250]) {
      configs.push({ id: `stop${stopPoints}-be${breakEvenAt}`, stopPoints, type: "BREAK_EVEN", breakEvenAt });
    }
    for (const activatePoints of [100, 175, 250, 350]) {
      for (const trailGap of [50, 75, 100, 150, 200]) {
        configs.push({ id: `stop${stopPoints}-fixed${activatePoints}-${trailGap}`, stopPoints, type: "FIXED", activatePoints, trailGap });
      }
    }
    for (const structureBuffer of [0, 25, 50]) {
      configs.push({ id: `stop${stopPoints}-structure${structureBuffer}`, stopPoints, type: "STRUCTURE", structureBuffer });
    }
  }
  return configs;
}

function pointPnl(side, entry, exit) {
  return side === "LONG" ? exit - entry : entry - exit;
}

function resolutionBars(session, resolution) {
  return resolution === "minute" ? session.minutes : session.bars15;
}

function minuteIndexForBar(bar, resolution) {
  return resolution === "minute" ? bar.index : bar.index * 15;
}

function simulate(session, entryConfig, exitConfig, policy, resolution, keepTrades = false) {
  const range = rangeFor(session, entryConfig);
  const empty = { day: session.day, month: session.month, netPoints: 0, grossWins: 0, grossLosses: 0, trades: keepTrades ? [] : 0, ambiguous: 0 };
  if (range.widthAtr < entryConfig.minimumWidthAtr || range.widthAtr > entryConfig.maximumWidthAtr) return empty;

  const upper = range.high + (entryConfig.bufferAtr * session.dailyAtr);
  const lower = range.low - (entryConfig.bufferAtr * session.dailyAtr);
  const bars = resolutionBars(session, resolution);
  const startBarIndex = resolution === "minute" ? entryConfig.startMinute : entryConfig.rangeEnd + 1;
  const lastEntryBarIndex = resolution === "minute" ? entryConfig.lastEntryMinute : Math.floor(entryConfig.lastEntryMinute / 15);
  let position = null;
  let tradeCount = 0;
  let netPoints = 0;
  let grossWins = 0;
  let grossLosses = 0;
  let armed = true;
  let rearmAfterIndex = -1;
  let pendingExit = null;
  let ambiguous = 0;
  const trades = [];

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
        exitTime: index >= bars.length ? "15:30" : bars[index].time,
        exitPrice: round(price),
        points: round(points),
        reason,
      });
    }
    position = null;
    pendingExit = null;
    armed = false;
    rearmAfterIndex = index + policy.cooldownBars;
  }

  function updateExit(bar, index) {
    position.bestHigh = Math.max(position.bestHigh, bar.high);
    position.bestLow = Math.min(position.bestLow, bar.low);
    const favourable = position.side === "LONG"
      ? position.bestHigh - position.entryPrice
      : position.entryPrice - position.bestLow;
    if (exitConfig.type === "BREAK_EVEN" && favourable >= exitConfig.breakEvenAt) {
      position.stop = position.side === "LONG"
        ? Math.max(position.stop, position.entryPrice)
        : Math.min(position.stop, position.entryPrice);
    } else if (exitConfig.type === "FIXED" && favourable >= exitConfig.activatePoints) {
      const candidate = position.side === "LONG"
        ? position.bestHigh - exitConfig.trailGap
        : position.bestLow + exitConfig.trailGap;
      const crossedAtClose = position.side === "LONG" ? bar.close <= candidate : bar.close >= candidate;
      if (crossedAtClose) pendingExit = { index: index + 1, reason: "TRAIL_CLOSE_CROSSED" };
      else position.stop = position.side === "LONG"
        ? Math.max(position.stop, candidate)
        : Math.min(position.stop, candidate);
    } else if (exitConfig.type === "STRUCTURE") {
      const isCompleted15 = resolution === "15minute" || bar.index % 15 === 14;
      if (!isCompleted15) return;
      const structureBar = resolution === "15minute"
        ? bar
        : session.bars15[Math.floor(bar.index / 15)];
      const bucket = resolution === "15minute" ? bar.index : Math.floor(bar.index / 15);
      if (position.mainBucket == null) {
        if (bucket >= position.entryBucket) {
          position.mainBucket = bucket;
          position.mainHigh = structureBar.high;
          position.mainLow = structureBar.low;
        }
        return;
      }
      const continued = position.side === "LONG"
        ? structureBar.close > position.mainHigh
        : structureBar.close < position.mainLow;
      const reversed = position.side === "LONG"
        ? structureBar.close < position.mainLow - exitConfig.structureBuffer
        : structureBar.close > position.mainHigh + exitConfig.structureBuffer;
      if (reversed) pendingExit = { index: index + 1, reason: "STRUCTURE_REVERSE_CLOSE" };
      else if (continued) {
        const candidate = position.side === "LONG"
          ? structureBar.low - exitConfig.structureBuffer
          : structureBar.high + exitConfig.structureBuffer;
        const valid = position.side === "LONG" ? candidate < bar.close : candidate > bar.close;
        if (valid) position.stop = position.side === "LONG"
          ? Math.max(position.stop, candidate)
          : Math.min(position.stop, candidate);
        position.mainBucket = bucket;
        position.mainHigh = structureBar.high;
        position.mainLow = structureBar.low;
      }
    }
  }

  for (let index = startBarIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    const minuteIndex = minuteIndexForBar(bar, resolution);

    if (pendingExit && pendingExit.index === index && position) {
      closePosition(index, bar.open, pendingExit.reason);
    }

    if (position) {
      const gapThrough = position.side === "LONG" ? bar.open <= position.stop : bar.open >= position.stop;
      const touched = position.side === "LONG" ? bar.low <= position.stop : bar.high >= position.stop;
      if (gapThrough || touched) closePosition(index, gapThrough ? bar.open : position.stop, gapThrough ? "STOP_GAP" : "STOP");
    }

    if (position && index === bars.length - 1) {
      closePosition(bars.length, bar.close, "EOD");
      continue;
    }

    if (position) {
      updateExit(bar, index);
      continue;
    }

    if (netPoints <= -policy.dailyLossCap || tradeCount >= policy.maxTrades || minuteIndex > entryConfig.lastEntryMinute) continue;

    const inside = bar.close <= upper && bar.close >= lower;
    if (!armed) {
      if (index >= rearmAfterIndex && inside) armed = true;
      continue;
    }

    const gapLong = bar.open >= upper;
    const gapShort = bar.open <= lower;
    const hitLong = gapLong || bar.high >= upper;
    const hitShort = gapShort || bar.low <= lower;
    if (!hitLong && !hitShort) continue;
    if (hitLong && hitShort) {
      ambiguous += 1;
      armed = false;
      rearmAfterIndex = index + 1;
      continue;
    }

    const side = hitLong ? "LONG" : "SHORT";
    if (!entryFilter(side, session, minuteIndex, entryConfig.filter)) {
      armed = false;
      rearmAfterIndex = index + 1;
      continue;
    }
    const entryPrice = side === "LONG" ? (gapLong ? bar.open : upper) : (gapShort ? bar.open : lower);
    const stop = side === "LONG" ? entryPrice - exitConfig.stopPoints : entryPrice + exitConfig.stopPoints;
    position = {
      side,
      entryPrice,
      entryTime: bar.time,
      stop,
      bestHigh: entryPrice,
      bestLow: entryPrice,
      entryBucket: Math.floor(minuteIndex / 15),
      mainBucket: null,
      mainHigh: null,
      mainLow: null,
    };
    armed = false;

    const sameBarStop = side === "LONG" ? bar.low <= stop : bar.high >= stop;
    if (sameBarStop) {
      closePosition(index, stop, "ENTRY_BAR_STOP_CONSERVATIVE");
      continue;
    }
    updateExit(bar, index);
  }

  if (position) closePosition(bars.length, bars.at(-1).close, "FORCED_EOD");
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
  const score = average + (0.8 * median) + (0.5 * p20) + (0.15 * minimum) - (maxDrawdown / values.length);
  return {
    sessions: rows.length,
    trades,
    ambiguousBars: ambiguous,
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

function evaluate(sessions, entry, exit, policy, resolution, keepTrades = false) {
  const rows = sessions.map((session) => simulate(session, entry, exit, policy, resolution, keepTrades));
  const months = [...new Set(sessions.map((session) => session.month))];
  return { summary: summarize(rows, months), rows };
}

function discoverEntries(configs, sessions) {
  const baselines = [
    { exit: { id: "base-eod", stopPoints: 150, type: "EOD" }, policy: { maxTrades: 2, dailyLossCap: 300, cooldownBars: 1 } },
    { exit: { id: "base-fixed", stopPoints: 150, type: "FIXED", activatePoints: 175, trailGap: 100 }, policy: { maxTrades: 2, dailyLossCap: 300, cooldownBars: 1 } },
    { exit: { id: "base-wide", stopPoints: 250, type: "FIXED", activatePoints: 300, trailGap: 150 }, policy: { maxTrades: 2, dailyLossCap: 500, cooldownBars: 1 } },
    { exit: { id: "base-structure", stopPoints: 150, type: "STRUCTURE", structureBuffer: 25 }, policy: { maxTrades: 2, dailyLossCap: 300, cooldownBars: 1 } },
  ];
  const ranked = [];
  for (let index = 0; index < configs.length; index += 1) {
    let best = null;
    for (const baseline of baselines) {
      const summary = evaluate(sessions, configs[index], baseline.exit, baseline.policy, "15minute").summary;
      if (!best || summary.score > best.summary.score) best = { baseline, summary };
    }
    if (best.summary.trades >= 100 && best.summary.netPoints > 0) ranked.push({ entry: configs[index], ...best });
    if ((index + 1) % 1000 === 0) console.log(`entry-discovery ${index + 1}/${configs.length}`);
  }
  ranked.sort((left, right) => right.summary.score - left.summary.score);
  const selected = [];
  const familyCounts = new Map();
  for (const row of ranked) {
    const key = `${row.entry.rangeType}-${row.entry.rangeEnd}-${row.entry.filter}-${row.entry.rangeBasis}`;
    const count = familyCounts.get(key) || 0;
    if (count >= 2) continue;
    selected.push(row.entry);
    familyCounts.set(key, count + 1);
    if (selected.length >= 100) break;
  }
  return { ranked, selected };
}

function optimize(entries, exits, sessions) {
  const policies = [
    { id: "one", maxTrades: 1, dailyLossCap: 99999, cooldownBars: 1 },
    { id: "two300", maxTrades: 2, dailyLossCap: 300, cooldownBars: 1 },
    { id: "two500", maxTrades: 2, dailyLossCap: 500, cooldownBars: 1 },
    { id: "three300", maxTrades: 3, dailyLossCap: 300, cooldownBars: 1 },
    { id: "three500", maxTrades: 3, dailyLossCap: 500, cooldownBars: 1 },
  ];
  const ranked = [];
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
    for (const exit of exits) {
      for (const policy of policies) {
        const summary = evaluate(sessions, entries[entryIndex], exit, policy, "15minute").summary;
        if (summary.trades >= 100 && summary.netPoints > 0 && summary.profitFactor >= 1.02) {
          ranked.push({ entry: entries[entryIndex], exit, policy, train15: summary });
        }
      }
    }
    if ((entryIndex + 1) % 10 === 0) console.log(`exit-optimization ${entryIndex + 1}/${entries.length}`);
  }
  ranked.sort((left, right) => right.train15.score - left.train15.score);
  return ranked;
}

function develop(candidates, sessions) {
  const rows = candidates.slice(0, 600).map((candidate) => {
    const development15 = evaluate(sessions, candidate.entry, candidate.exit, candidate.policy, "15minute").summary;
    const train = candidate.train15;
    const score = Math.min(train.averageMonthlyPoints, development15.averageMonthlyPoints)
      + (0.8 * Math.min(train.medianMonthlyPoints, development15.medianMonthlyPoints))
      + (0.4 * Math.min(train.p20MonthlyPoints, development15.p20MonthlyPoints))
      - ((train.maxDrawdownPoints + development15.maxDrawdownPoints) / 40);
    return { ...candidate, development15, selectionScore: round(score) };
  });
  rows.sort((left, right) => right.selectionScore - left.selectionScore);
  return rows;
}

function minuteValidate(candidates, train, development, validation) {
  const rows = [];
  for (let index = 0; index < Math.min(120, candidates.length); index += 1) {
    const candidate = candidates[index];
    const trainMinute = evaluate(train, candidate.entry, candidate.exit, candidate.policy, "minute").summary;
    const developmentMinute = evaluate(development, candidate.entry, candidate.exit, candidate.policy, "minute").summary;
    const robustScore = Math.min(trainMinute.averageMonthlyPoints, developmentMinute.averageMonthlyPoints)
      + (0.7 * Math.min(trainMinute.medianMonthlyPoints, developmentMinute.medianMonthlyPoints))
      + (0.4 * Math.min(trainMinute.p20MonthlyPoints, developmentMinute.p20MonthlyPoints))
      - ((trainMinute.maxDrawdownPoints + developmentMinute.maxDrawdownPoints) / 40);
    rows.push({ ...candidate, trainMinute, developmentMinute, minuteSelectionScore: round(robustScore) });
  }
  rows.sort((left, right) => right.minuteSelectionScore - left.minuteSelectionScore);
  return rows.slice(0, 30).map((candidate) => ({
    ...candidate,
    validationMinute: evaluate(validation, candidate.entry, candidate.exit, candidate.policy, "minute").summary,
  }));
}

function compact(candidate) {
  return {
    entry: candidate.entry,
    exit: candidate.exit,
    policy: candidate.policy,
    selectionScore: candidate.selectionScore,
    minuteSelectionScore: candidate.minuteSelectionScore,
    train15: candidate.train15,
    development15: candidate.development15,
    trainMinute: candidate.trainMinute,
    developmentMinute: candidate.developmentMinute,
    validationMinute: candidate.validationMinute,
  };
}

function main() {
  const { payload, sessions, excluded } = loadSessions();
  const train = periodSessions(sessions, SPLITS.train);
  const development = periodSessions(sessions, SPLITS.development);
  const validation = periodSessions(sessions, SPLITS.validation);
  const entries = entryConfigs();
  const exits = exitConfigs();
  console.log(JSON.stringify({
    source: { sessions: payload.sessionCount, candles: payload.candleCount },
    usableSessions: sessions.length,
    splits: { train: train.length, development: development.length, validation: validation.length },
    entries: entries.length,
    exits: exits.length,
  }));

  const discovery = discoverEntries(entries, train);
  const optimized = optimize(discovery.selected, exits, train);
  const developed = develop(optimized, development);
  const finalists = minuteValidate(developed, train, development, validation);
  const winner = finalists[0];
  const details = {
    train: evaluate(train, winner.entry, winner.exit, winner.policy, "minute", true),
    development: evaluate(development, winner.entry, winner.exit, winner.policy, "minute", true),
    validation: evaluate(validation, winner.entry, winner.exit, winner.policy, "minute", true),
  };
  const completeValidationMonths = Object.fromEntries(Object.entries(details.validation.summary.monthly)
    .filter(([month]) => month > SPLITS.validation.from.slice(0, 7) && month < SPLITS.validation.to.slice(0, 7)));

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
      entry: "Range is completed before two OCO stop levels become active; fill is the touched level or adverse gap-open price",
      ambiguity: "If both OCO levels occur inside one source bar, no profit is credited and the setup must re-arm",
      initialStop: "Fixed and known at entry",
      stops: "Existing stop is checked before trailing logic on every bar; an entry-bar stop is assumed hit when OHLC ordering is uncertain",
      trailing: "New trails use completed bars and apply only afterward; a trail already crossed at close exits next bar open",
      reentry: "After exit or rejected trigger, price must close back inside the original range before another trigger",
      eod: "Open trades exit at 15:29 minute close",
      friction: `${COST_POINTS} index points per completed trade`,
      validation: "15-minute discovery followed by minute replay on train and development; final chronological validation evaluated afterward",
      limitation: "BANKNIFTY index points; historical futures basis, slippage and contract rolls are not available",
    },
    search: {
      entryConfigs: entries.length,
      exitConfigs: exits.length,
      discoveredEntries: discovery.ranked.length,
      selectedEntries: discovery.selected.length,
      optimizedCandidates: optimized.length,
      developedCandidates: developed.length,
      minuteFinalists: finalists.length,
    },
    winner: {
      ...compact(winner),
      completeValidationMonths,
      completeValidationTargetMonths: Object.values(completeValidationMonths).filter((value) => value >= TARGET_POINTS).length,
      completeValidationMonthCount: Object.keys(completeValidationMonths).length,
      rows: {
        train: details.train.rows,
        development: details.development.rows,
        validation: details.validation.rows,
      },
    },
    finalists: finalists.map(compact),
    top15MinuteCandidates: developed.slice(0, 30).map((candidate) => ({
      entry: candidate.entry,
      exit: candidate.exit,
      policy: candidate.policy,
      train15: candidate.train15,
      development15: candidate.development15,
      selectionScore: candidate.selectionScore,
    })),
  };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    output: OUTPUT,
    search: output.search,
    winner: compact(winner),
    completeValidationMonths,
    completeValidationTargetMonths: output.winner.completeValidationTargetMonths,
  }, null, 2));
}

main();

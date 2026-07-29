'use strict';

const fs = require('fs');
const path = require('path');
const { findDrishtiEntry } = require('./drishti_core');

const QTY = Number(process.env.DRISHTI_TEST_QTY || 30);
const STOP_POINTS = Number(process.env.DRISHTI_TEST_SL_POINTS || 100);
const PDR_MIN_POINTS = Number(process.env.DRISHTI_TEST_PDR_MIN_POINTS || 150);
const TARGET_RUPEES = (process.env.DRISHTI_TEST_TARGETS
  || '1500,2250,3000,4500,6000,9000,10500,12000,15000')
  .split(',')
  .map(Number)
  .filter((value) => Number.isFinite(value) && value > 0);
const COOLDOWNS = (process.env.DRISHTI_TEST_COOLDOWNS || '0,1')
  .split(',')
  .map(Number)
  .filter((value) => Number.isInteger(value) && value >= 0);
const LOSS_GUARDS = (process.env.DRISHTI_TEST_LOSS_GUARDS || '0,2')
  .split(',')
  .map(Number)
  .filter((value) => Number.isInteger(value) && value >= 0);
const ROUND_TRIP_COSTS = (process.env.DRISHTI_TEST_ROUND_TRIP_COSTS || '100,150,200')
  .split(',')
  .map(Number)
  .filter((value) => Number.isFinite(value) && value >= 0);
const MAX_TRADES_VALUES = (process.env.DRISHTI_TEST_MAX_TRADES || '0')
  .split(',')
  .map(Number)
  .filter((value) => Number.isInteger(value) && value >= 0);
const EXPORT_PATH = process.env.DRISHTI_V2_EXPORT_PATH
  ? path.resolve(process.cwd(), process.env.DRISHTI_V2_EXPORT_PATH)
  : null;
const EXPORT_TARGET_RS = Number(process.env.DRISHTI_V2_EXPORT_TARGET_RS || 10500);
const EXPORT_COST_RS = Number(process.env.DRISHTI_V2_EXPORT_COST_RS || 150);
const CAPITAL_PER_TRADE_RS = Number(
  process.env.DRISHTI_V2_CAPITAL_PER_TRADE_RS || 200000,
);
const MIN_COMPLETE_SESSION_CANDLES = Number(
  process.env.DRISHTI_MIN_COMPLETE_SESSION_CANDLES || 60,
);

const inputPath = path.resolve(
  process.cwd(),
  process.argv[2] || '.tmp-drishti-banknifty-5m.json',
);
const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const dates = Object.keys(raw).sort();

function bodyPercent(candle) {
  const range = candle.high - candle.low;
  return range > 0 ? ((candle.close - candle.open) / range) * 100 : 0;
}

function marketCandles(candles) {
  return candles
    .filter((candle) => {
      const minute = (candle.h * 60) + candle.m;
      return minute >= (9 * 60) + 15 && minute <= (15 * 60) + 25;
    })
    .sort((a, b) => ((a.h * 60) + a.m) - ((b.h * 60) + b.m));
}

function signalSourceCandles(candles) {
  return marketCandles(candles).filter((candle) => {
    const minute = (candle.h * 60) + candle.m;
    return minute >= (9 * 60) + 30;
  });
}

function aggregate(source, minutes) {
  const groupSize = minutes / 5;
  const output = [];
  for (let start = 0; start < source.length; start += groupSize) {
    const group = source.slice(start, start + groupSize);
    if (group.length !== groupSize) continue;
    output.push({
      open: group[0].open,
      high: Math.max(...group.map((candle) => candle.high)),
      low: Math.min(...group.map((candle) => candle.low)),
      close: group[group.length - 1].close,
      h: group[0].h,
      m: group[0].m,
      sourceStart: start,
      sourceEnd: start + groupSize - 1,
    });
  }
  return output;
}

function previousDayRangeOkay(prevCandles) {
  if (!prevCandles.length) return false;
  const high = Math.max(...prevCandles.map((candle) => candle.high));
  const low = Math.min(...prevCandles.map((candle) => candle.low));
  return high - low >= PDR_MIN_POINTS;
}

function freshBreakoutSignal(signalCandles, index, prevCandles) {
  if (index < 1) return null;
  const current = signalCandles[index];
  const previous = signalCandles[index - 1];
  const body = bodyPercent(current);
  const prevHigh = Math.max(...prevCandles.map((candle) => candle.high));
  const prevLow = Math.min(...prevCandles.map((candle) => candle.low));

  if (current.close > previous.high && body >= 35) {
    return { side: 'CE', reason: 'fresh_15m_breakout_ce' };
  }
  if (current.close < previous.low && body <= -35) {
    return { side: 'PE', reason: 'fresh_15m_breakout_pe' };
  }
  if (current.close > prevHigh && previous.close <= prevHigh && body > 20) {
    return { side: 'CE', reason: 'fresh_15m_pdh_breakout_ce' };
  }
  if (current.close < prevLow && previous.close >= prevLow && body < -20) {
    return { side: 'PE', reason: 'fresh_15m_pdl_breakout_pe' };
  }
  return null;
}

function targetOrStop(position, candle, targetPoints, conservative) {
  const favorable = position.side === 'CE'
    ? candle.high - position.entry
    : position.entry - candle.low;
  const adverse = position.side === 'CE'
    ? position.entry - candle.low
    : candle.high - position.entry;
  const targetTouched = favorable >= targetPoints;
  const stopTouched = adverse >= STOP_POINTS;

  if (!targetTouched && !stopTouched) return null;
  if (targetTouched && stopTouched && conservative) {
    return { points: -STOP_POINTS, reason: 'ambiguous_stop_first', ambiguous: true };
  }
  if (targetTouched) {
    return { points: targetPoints, reason: 'profit_target', ambiguous: false };
  }
  return { points: -STOP_POINTS, reason: 'stop_loss', ambiguous: false };
}

function runHybridDay(
  fiveMinuteCandles,
  prevCandles,
  targetPoints,
  cooldownCandles,
  maxConsecutiveLosses,
  maxTrades,
  conservative,
) {
  const source = signalSourceCandles(fiveMinuteCandles);
  const signals = aggregate(source, 15);
  if (!signals.length) return null;

  const signalBySourceEnd = new Map(
    signals.map((candle, index) => [candle.sourceEnd, index]),
  );
  let position = null;
  let firstEntryDone = false;
  let lastExitSignalIndex = -1;
  let points = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let ambiguous = 0;
  let consecutiveLosses = 0;
  let blockedByLossGuard = false;

  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex++) {
    const candle = source[sourceIndex];
    const signalIndex = signalBySourceEnd.get(sourceIndex);
    const finalSourceCandle = sourceIndex === source.length - 1;

    if (position) {
      const exit = targetOrStop(position, candle, targetPoints, conservative);
      if (exit) {
        points += exit.points;
        if (exit.points > 0) {
          wins++;
          consecutiveLosses = 0;
        } else {
          losses++;
          consecutiveLosses++;
        }
        if (exit.ambiguous) ambiguous++;
        const completedSignals = Math.floor((sourceIndex + 1) / 3) - 1;
        lastExitSignalIndex = Math.max(lastExitSignalIndex, completedSignals);
        position = null;
        if (
          maxConsecutiveLosses > 0
          && consecutiveLosses >= maxConsecutiveLosses
        ) {
          blockedByLossGuard = true;
        }
      } else if (finalSourceCandle) {
        const eodPoints = position.side === 'CE'
          ? candle.close - position.entry
          : position.entry - candle.close;
        points += eodPoints;
        if (eodPoints > 0) wins++;
        else if (eodPoints < 0) losses++;
        position = null;
      }
    }

    if (
      position
      || blockedByLossGuard
      || (maxTrades > 0 && trades >= maxTrades)
      || signalIndex === undefined
      || finalSourceCandle
    ) {
      continue;
    }

    const partialSignals = signals.slice(0, signalIndex + 1);
    let signal = null;

    if (!firstEntryDone) {
      if (!previousDayRangeOkay(prevCandles)) continue;
      const initial = findDrishtiEntry(partialSignals, prevCandles);
      if (initial?.idx === signalIndex) {
        signal = { side: initial.side, reason: initial.reason };
      }
    } else if (signalIndex > lastExitSignalIndex + cooldownCandles) {
      signal = freshBreakoutSignal(signals, signalIndex, prevCandles);
    }

    if (signal) {
      position = {
        side: signal.side,
        entry: signals[signalIndex].close,
        signalIndex,
        reason: signal.reason,
      };
      firstEntryDone = true;
      trades++;
    }
  }

  return {
    points,
    trades,
    wins,
    losses,
    ambiguous,
    blockedByLossGuard,
  };
}

function runReferenceDay(fiveMinuteCandles, prevCandles) {
  const source = signalSourceCandles(fiveMinuteCandles);
  const signals = aggregate(source, 15);
  if (!signals.length) return null;

  const signalBySourceEnd = new Map(
    signals.map((candle, index) => [candle.sourceEnd, index]),
  );
  let position = null;
  let firstEntryDone = false;
  let lastExitSignalIndex = -1;
  let points = 0;
  let trades = 0;
  let peak = 0;
  let trail = -STOP_POINTS;

  for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex++) {
    const candle = source[sourceIndex];
    const signalIndex = signalBySourceEnd.get(sourceIndex);
    const finalSourceCandle = sourceIndex === source.length - 1;

    if (position) {
      const favorable = position.side === 'CE'
        ? candle.high - position.entry
        : position.entry - candle.low;
      peak = Math.max(peak, favorable);
      if (peak >= 300) trail = Math.max(trail, peak - 10);
      const adverse = position.side === 'CE'
        ? position.entry - candle.low
        : candle.high - position.entry;
      const trailTouched = trail > 0 && (
        position.side === 'CE'
          ? candle.low <= position.entry + trail
          : candle.high >= position.entry - trail
      );

      if (adverse >= STOP_POINTS || trailTouched) {
        const exitPoints = adverse >= STOP_POINTS ? -STOP_POINTS : trail;
        points += exitPoints;
        const completedSignals = Math.floor((sourceIndex + 1) / 3) - 1;
        lastExitSignalIndex = Math.max(lastExitSignalIndex, completedSignals);
        position = null;
      } else if (finalSourceCandle) {
        points += position.side === 'CE'
          ? candle.close - position.entry
          : position.entry - candle.close;
        position = null;
      }
    }

    if (
      position
      || trades >= 2
      || signalIndex === undefined
      || finalSourceCandle
    ) {
      continue;
    }

    const partialSignals = signals.slice(0, signalIndex + 1);
    let signal = null;
    if (!firstEntryDone) {
      if (!previousDayRangeOkay(prevCandles)) continue;
      const initial = findDrishtiEntry(partialSignals, prevCandles);
      if (initial?.idx === signalIndex) signal = initial;
    } else if (signalIndex > lastExitSignalIndex) {
      signal = freshBreakoutSignal(signals, signalIndex, prevCandles);
    }

    if (signal) {
      position = { side: signal.side, entry: signals[signalIndex].close };
      firstEntryDone = true;
      trades++;
      peak = 0;
      trail = -STOP_POINTS;
    }
  }

  return { points, trades };
}

function createSummary(config) {
  return {
    ...config,
    points: 0,
    trades: 0,
    wins: 0,
    losses: 0,
    ambiguous: 0,
    tradedDays: 0,
    winningDays: 0,
    losingDays: 0,
    peak: 0,
    maxDrawdown: 0,
    lossGuardDays: 0,
    yearly: {},
    yearlyTrades: {},
    daily: [],
  };
}

function record(summary, result, date) {
  if (!result) return;
  summary.points += result.points;
  summary.trades += result.trades;
  summary.wins += result.wins || 0;
  summary.losses += result.losses || 0;
  summary.ambiguous += result.ambiguous || 0;
  if (result.trades > 0) summary.tradedDays++;
  if (result.points > 0) summary.winningDays++;
  if (result.points < 0) summary.losingDays++;
  if (result.blockedByLossGuard) summary.lossGuardDays++;
  summary.peak = Math.max(summary.peak, summary.points);
  summary.maxDrawdown = Math.max(summary.maxDrawdown, summary.peak - summary.points);
  const year = date.slice(0, 4);
  summary.yearly[year] = (summary.yearly[year] || 0) + result.points;
  summary.yearlyTrades[year] = (summary.yearlyTrades[year] || 0) + result.trades;
  summary.daily.push({
    date,
    points: Number(result.points.toFixed(2)),
    trades: result.trades,
    wins: result.wins || 0,
    losses: result.losses || 0,
    ambiguousCandles: result.ambiguous || 0,
  });
}

const reference = createSummary({ rule: '2 trades, +300 activation, peak-10 trail' });
const variants = [];
for (const targetRs of TARGET_RUPEES) {
  for (const cooldown of COOLDOWNS) {
    for (const lossGuard of LOSS_GUARDS) {
      for (const maxTrades of MAX_TRADES_VALUES) {
        variants.push(createSummary({
          rule: '15m signal + 5m target exit',
          targetRs,
          targetPoints: targetRs / QTY,
          cooldown,
          maxConsecutiveLosses: lossGuard,
          maxTrades,
        }));
      }
    }
  }
}

for (let dateIndex = 1; dateIndex < dates.length; dateIndex++) {
  const date = dates[dateIndex];
  const today = raw[date];
  const previous = raw[dates[dateIndex - 1]];
  if (
    !today
    || !previous
    || today.length < MIN_COMPLETE_SESSION_CANDLES
    || previous.length < MIN_COMPLETE_SESSION_CANDLES
  ) continue;
  const prevCandles = marketCandles(previous);

  record(reference, runReferenceDay(today, prevCandles), date);
  for (const variant of variants) {
    record(
      variant,
      runHybridDay(
        today,
        prevCandles,
        variant.targetPoints,
        variant.cooldown,
        variant.maxConsecutiveLosses,
        variant.maxTrades,
        true,
      ),
      date,
    );
  }
}

function printable(summary) {
  return {
    rule: summary.rule,
    targetRs: summary.targetRs,
    targetPoints: summary.targetPoints,
    cooldown: summary.cooldown,
    maxConsecutiveLosses: summary.maxConsecutiveLosses,
    maxTrades: summary.maxTrades,
    netRs: Math.round(summary.points * QTY),
    maxDrawdownRs: Math.round(summary.maxDrawdown * QTY),
    trades: summary.trades,
    tradedDays: summary.tradedDays,
    winningDays: summary.winningDays,
    losingDays: summary.losingDays,
    tradeWinRate: summary.wins + summary.losses > 0
      ? Number(((summary.wins / (summary.wins + summary.losses)) * 100).toFixed(2))
      : null,
    ambiguousCandles: summary.ambiguous,
    lossGuardDays: summary.lossGuardDays,
    netAfterCostsRs: Object.fromEntries(
      ROUND_TRIP_COSTS.map((cost) => [
        `cost${cost}`,
        Math.round((summary.points * QTY) - (summary.trades * cost)),
      ]),
    ),
    yearlyRs: Object.fromEntries(
      Object.entries(summary.yearly).map(([year, points]) => [
        year,
        Math.round(points * QTY),
      ]),
    ),
    yearlyAfterCost150Rs: Object.fromEntries(
      Object.entries(summary.yearly).map(([year, points]) => [
        year,
        Math.round(
          (points * QTY) - ((summary.yearlyTrades[year] || 0) * 150),
        ),
      ]),
    ),
  };
}

const ranked = variants
  .map(printable)
  .sort((a, b) => b.netRs - a.netRs);

function isoWeek(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(parsed.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((parsed - yearStart) / 86400000) + 1) / 7);
  return `${parsed.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function aggregatePeriods(days, keyFor) {
  const groups = new Map();
  for (const day of days) {
    const period = keyFor(day.date);
    const row = groups.get(period) || {
      period,
      pnl: 0,
      grossPnl: 0,
      capitalUsed: 0,
      points: 0,
      tradingDays: 0,
      trades: 0,
      wins: 0,
      losses: 0,
    };
    row.pnl += day.pnl;
    row.grossPnl += day.grossPnl;
    row.capitalUsed += day.capitalUsed;
    row.points += day.points;
    row.tradingDays += day.trades > 0 ? 1 : 0;
    row.trades += day.trades;
    row.wins += day.wins;
    row.losses += day.losses;
    groups.set(period, row);
  }
  return [...groups.values()].map((row) => ({
    ...row,
    pnl: Math.round(row.pnl),
    grossPnl: Math.round(row.grossPnl),
    capitalUsed: Math.round(row.capitalUsed),
    points: Number(row.points.toFixed(2)),
    winRate: row.wins + row.losses > 0
      ? Number((row.wins / (row.wins + row.losses) * 100).toFixed(2))
      : 0,
    returnPct: row.capitalUsed > 0
      ? Number((row.pnl / row.capitalUsed * 100).toFixed(4))
      : null,
  })).sort((a, b) => a.period.localeCompare(b.period));
}

function maxDrawdownFromDays(days) {
  let equity = 0;
  let peak = 0;
  let drawdown = 0;
  for (const day of days) {
    equity += day.pnl;
    peak = Math.max(peak, equity);
    drawdown = Math.max(drawdown, peak - equity);
  }
  return Math.round(drawdown);
}

function exportSelectedVariant() {
  if (!EXPORT_PATH) return;
  const selected = variants.find((variant) =>
    variant.targetRs === EXPORT_TARGET_RS
    && variant.cooldown === 0
    && variant.maxConsecutiveLosses === 0
    && variant.maxTrades === 0
  );
  if (!selected) {
    throw new Error(`No export variant found for target Rs${EXPORT_TARGET_RS}`);
  }
  const days = selected.daily.map((day) => {
    const grossPnl = day.points * QTY;
    const pnl = grossPnl - day.trades * EXPORT_COST_RS;
    const capitalUsed = day.trades * CAPITAL_PER_TRADE_RS;
    return {
      ...day,
      pnl: Math.round(pnl),
      grossPnl: Math.round(grossPnl),
      costsRs: day.trades * EXPORT_COST_RS,
      capitalUsed,
      returnPct: capitalUsed > 0
        ? Number((pnl / capitalUsed * 100).toFixed(4))
        : null,
    };
  });
  const weeks = aggregatePeriods(days, isoWeek);
  const months = aggregatePeriods(days, (date) => date.slice(0, 7));
  const years = aggregatePeriods(days, (date) => date.slice(0, 4));
  const total = days.reduce((sum, day) => sum + day.pnl, 0);
  const capitalUsed = days.reduce((sum, day) => sum + day.capitalUsed, 0);
  const avgMonthlyPnl = months.length ? total / months.length : 0;
  const averageMonthlyCapital = months.length
    ? months.reduce((sum, month) => sum + month.capitalUsed, 0) / months.length
    : 0;
  const payload = {
    generatedAt: new Date().toISOString(),
    coverage: {
      from: days[0]?.date || dates[0],
      to: days.at(-1)?.date || dates[dates.length - 1],
    },
    assumptions: {
      strategy: 'DRISHTI V2 Challenger',
      executionMode: 'SHADOW',
      instrumentType: 'FUTURES',
      signalTimeframe: '15m',
      exitResolution: '5m',
      quantity: QTY,
      targetRs: EXPORT_TARGET_RS,
      targetPoints: EXPORT_TARGET_RS / QTY,
      stopPoints: STOP_POINTS,
      roundTripCostRs: EXPORT_COST_RS,
      capitalPerTradeRs: CAPITAL_PER_TRADE_RS,
      reentry: 'fresh completed 15m breakout after exit',
      ambiguityRule: 'stop first when target and stop touch within one 5m candle',
    },
    strategies: {
      'drishti-v2': {
        FUTURES: {
          methodology: 'DRISHTI entry rules on completed 15m BANKNIFTY candles; 5m target/stop resolution; fresh completed 15m breakout re-entry; shadow only.',
          modelled: false,
          summary: {
            total: Math.round(total),
            grossTotal: Math.round(selected.points * QTY),
            totalTrades: selected.trades,
            tradedDays: selected.tradedDays,
            wins: selected.wins,
            losses: selected.losses,
            winRate: selected.wins + selected.losses > 0
              ? Number((selected.wins / (selected.wins + selected.losses) * 100).toFixed(2))
              : 0,
            maxDrawdown: maxDrawdownFromDays(days),
            avgMonthlyPnl: Math.round(avgMonthlyPnl),
            capitalUsed: Math.round(capitalUsed),
            returnPct: capitalUsed > 0
              ? Number((total / capitalUsed * 100).toFixed(4))
              : null,
            avgMonthlyReturnPct: averageMonthlyCapital > 0
              ? Number((avgMonthlyPnl / averageMonthlyCapital * 100).toFixed(4))
              : null,
          },
          days,
          weeks,
          months,
          years,
        },
      },
    },
  };
  fs.writeFileSync(EXPORT_PATH, JSON.stringify(payload, null, 2));
}

exportSelectedVariant();

console.log(JSON.stringify({
  data: {
    from: dates[0],
    to: dates[dates.length - 1],
    sessions: dates.length,
    quantity: QTY,
    stopPoints: STOP_POINTS,
    signalTimeframe: '15m',
    exitResolution: '5m',
    ambiguityRule: 'stop first when target and stop touch within one 5m candle',
  },
  reference: printable(reference),
  bestVariants: ranked.slice(0, 12),
  allVariants: ranked,
}, null, 2));

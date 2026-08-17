const { summarize, round } = require('./tt1030-failure-research');

const FAILURE_DAYS = new Set([
  '2026-06-18',
  '2026-06-30',
  '2026-07-03',
  '2026-07-07',
  '2026-07-10',
  '2026-07-13',
  '2026-07-14',
  '2026-07-22',
  '2026-08-12',
]);

function metrics(settings) {
  const result = summarize(settings);
  const monthly = {};
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const day of result.days) {
    const month = day.date.slice(0, 7);
    monthly[month] = round((monthly[month] || 0) + day.points, 1);
    cumulative += day.points;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }
  return {
    ...result,
    monthly,
    maxDrawdown: round(maxDrawdown, 1),
    failurePoints: round(result.days
      .filter((day) => FAILURE_DAYS.has(day.date))
      .reduce((sum, day) => sum + day.points, 0), 1),
  };
}

const baseline = metrics({});
const baselineMonths = baseline.monthly;

function compact(name, settings, result) {
  return {
    name,
    settings,
    points: result.points,
    delta: round(result.points - baseline.points, 1),
    trades: result.trades,
    green: result.greenDays,
    red: result.redDays,
    maxDrawdown: result.maxDrawdown,
    failurePoints: result.failurePoints,
    months: result.monthly,
    monthDelta: Object.fromEntries(Object.entries(result.monthly).map(([month, points]) => [
      month,
      round(points - baselineMonths[month], 1),
    ])),
  };
}

function rank(candidates, limit = 15) {
  return candidates
    .filter((candidate) => Object.values(candidate.monthDelta).every((delta) => delta >= -150))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);
}

const entryCandidates = [];
for (const minBreakPts of [0, 10, 25, 40, 50]) {
  for (const minBreakRiskRatio of [0, 0.25, 0.5, 0.75, 1]) {
    for (const momentumLookbackBars of [0, 2, 3, 4, 6]) {
      for (const maxSignalRiskPts of [null, 75, 100, 125, 150]) {
        for (const confirmationCloses of [1, 2]) {
          const settings = {
            minBreakPts,
            minBreakRiskRatio,
            momentumLookbackBars,
            maxSignalRiskPts,
            confirmationCloses,
          };
          const result = metrics(settings);
          entryCandidates.push(compact('entry', settings, result));
        }
      }
    }
  }
}

const exitCandidates = [];
const profitLocks = [
  [null, null],
  [75, 25],
  [100, 25],
  [100, 50],
  [125, 50],
  [150, 75],
];
for (const trailLookbackBars of [1, 2, 3, 4]) {
  for (const trailBufferPts of [0, 5, 10, 15, 20, 30]) {
    for (const trailActivationPts of [null, 25, 50, 75, 100]) {
      for (const trailOnlyWhenLocksPts of [null, 0, 10, 25, 50]) {
        for (const [profitLockTriggerPts, profitLockPts] of profitLocks) {
          const settings = {
            trailLookbackBars,
            trailBufferPts,
            trailActivationPts,
            trailOnlyWhenLocksPts,
            profitLockTriggerPts,
            profitLockPts,
          };
          const result = metrics(settings);
          exitCandidates.push(compact('exit', settings, result));
        }
      }
    }
  }
}

const reentryCandidates = [];
for (const maxTrades of [1, 2, 3]) {
  for (const reentryMinBreakPts of [null, 25, 50, 75, 100]) {
    for (const reentryCooldownCandles of [0, 1, 2]) {
      for (const secondTradeDirection of ['any', 'opposite']) {
        for (const entryCutoffTime of ['14:15', '14:45', '15:15']) {
          const settings = {
            maxTrades,
            reentryMinBreakPts,
            reentryCooldownCandles,
            secondTradeDirection,
            entryCutoffTime,
          };
          const result = metrics(settings);
          reentryCandidates.push(compact('reentry', settings, result));
        }
      }
    }
  }
}

const topEntry = rank(entryCandidates, 12);
const topExit = rank(exitCandidates, 12);
const topReentry = rank(reentryCandidates, 12);
const combinedCandidates = [];
for (const entry of [{ settings: {} }, ...topEntry]) {
  for (const exit of [{ settings: {} }, ...topExit]) {
    for (const reentry of [{ settings: {} }, ...topReentry]) {
      const settings = { ...entry.settings, ...exit.settings, ...reentry.settings };
      const result = metrics(settings);
      combinedCandidates.push(compact('combined', settings, result));
    }
  }
}

console.log(JSON.stringify({
  baseline: compact('baseline', {}, baseline),
  topEntry,
  topExit,
  topReentry,
  topCombined: rank(combinedCandidates, 25),
}, null, 2));

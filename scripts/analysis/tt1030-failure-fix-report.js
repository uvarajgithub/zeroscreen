const { summarize, round } = require('./tt1030-failure-research');

const qualitySettings = {
  minBreakPts: 50,
  profitLockTriggerPts: 50,
  profitLockPts: 50,
};

const candidateSettings = {
  maxSignalRiskPts: 100,
  trailBufferPts: 10,
  profitLockTriggerPts: 150,
  profitLockPts: 75,
  rescueTrades: 1,
  rescueAfterTime: '12:30',
  rescueCutoffTime: '14:15',
  rescueMinBreakPts: 50,
  rescueMinBreakRiskRatio: 0.5,
  counterMomentumThresholdPts: 400,
  counterMomentumConfirmationCloses: 2,
  lossReentryMinBreakPts: 30,
  lossReentryMaxFavBelowPts: 100,
};

const reviewedFailureDays = [
  '2026-06-18',
  '2026-06-30',
  '2026-07-03',
  '2026-07-07',
  '2026-07-10',
  '2026-07-13',
  '2026-07-14',
  '2026-07-22',
  '2026-08-03',
  '2026-08-12',
];

function report(settings) {
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
  };
}

function summary(result) {
  return {
    points: result.points,
    grossRupeesAtQty30: Math.round(result.points * 30),
    trades: result.trades,
    greenDays: result.greenDays,
    redDays: result.redDays,
    flatDays: result.flatDays,
    maxDrawdownPoints: result.maxDrawdown,
    monthlyPoints: result.monthly,
  };
}

const baseline = report({});
const quality = report(qualitySettings);
const candidate = report(candidateSettings);

const failureComparison = reviewedFailureDays.map((date) => {
  const baselineDay = baseline.days.find((day) => day.date === date);
  const qualityDay = quality.days.find((day) => day.date === date);
  const candidateDay = candidate.days.find((day) => day.date === date);
  return {
    date,
    baselinePoints: baselineDay.points,
    qualityPoints: qualityDay.points,
    candidatePoints: candidateDay.points,
    candidateDelta: round(candidateDay.points - baselineDay.points, 1),
  };
});

console.log(JSON.stringify({
  accounting: {
    entry: 'confirmation candle close',
    stopEvaluation: 'subsequent completed candle only',
    source: 'fresh VPS Kite BANKNIFTY index 15-minute candles',
    sessions: baseline.days.length,
    note: 'gross index-shadow points; futures basis, fees, taxes and slippage excluded',
  },
  candidateSettings,
  baseline: summary(baseline),
  deployedQualityModel: summary(quality),
  candidate: summary(candidate),
  failureComparison,
}, null, 2));

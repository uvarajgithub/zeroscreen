const fs = require('fs');
const path = require('path');

const DATA_FILE = path.resolve(
  __dirname,
  '../../.tmp-build/fresh-banknifty-15m-2m-2026-08-16.vps.json',
);

const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

function round(value, digits = 1) {
  return Number(value.toFixed(digits));
}

function candleBodyPct(candle) {
  const range = Math.max(0.01, candle.high - candle.low);
  return (Math.abs(candle.close - candle.open) / range) * 100;
}

function simulateDay(candles, settings = {}) {
  const config = {
    minBreakPts: 0,
    reentryMinBreakPts: null,
    lossReentryMinBreakPts: null,
    lossReentryMaxFavBelowPts: null,
    maxTrades: 2,
    rescueTrades: 0,
    rescueAfterTime: '12:30',
    rescueCutoffTime: '14:45',
    rescueMinBreakPts: 50,
    rescueMinBreakRiskRatio: 0,
    rescueOnlyIfDayPointsBelow: 0,
    trailBufferPts: 0,
    trailLookbackBars: 1,
    trailActivationPts: null,
    trailOnlyWhenLocksPts: null,
    profitLockTriggerPts: null,
    profitLockPts: null,
    confirmationCloses: 1,
    counterMomentumThresholdPts: null,
    counterMomentumConfirmationCloses: null,
    reentryCooldownCandles: 0,
    secondTradeDirection: 'any',
    minDirectionalBodyPct: 0,
    requireDirectionalBody: false,
    maxSignalRiskPts: null,
    minBreakRiskRatio: 0,
    narrowRangeThresholdPts: null,
    narrowRangeMinBreakPts: null,
    narrowRangeMinBreakRiskRatio: null,
    momentumLookbackBars: 0,
    alignWithOpeningMomentum: false,
    entryCutoffTime: '15:15',
    ...settings,
  };
  const rangeCandle = candles[5];
  if (!rangeCandle) return { points: 0, trades: [] };

  let trade = null;
  const trades = [];
  let lastExitIndex = -Infinity;
  let pendingDir = null;
  let pendingCount = 0;

  function closeTrade(candle, index, exit, reason) {
    const points = trade.dir === 'CE' ? exit - trade.entry : trade.entry - exit;
    trades.push({
      dir: trade.dir,
      entryTime: trade.entryTime,
      exitTime: candle.time,
      entry: round(trade.entry, 2),
      exit: round(exit, 2),
      points: round(points, 2),
      reason,
      maxFavPts: round(trade.maxFavPts, 2),
      signalBodyPct: round(trade.signalBodyPct, 1),
      signalBreakPts: round(trade.signalBreakPts, 2),
      signalRiskPts: round(trade.signalRiskPts, 2),
      rangeWidthPts: round(trade.rangeWidthPts, 2),
      openingMovePts: round(trade.openingMovePts, 2),
    });
    lastExitIndex = index;
    trade = null;
  }

  for (let index = 6; index < candles.length; index += 1) {
    const candle = candles[index];
    const isEod = index === candles.length - 1;

    if (trade) {
      const closePoints = trade.dir === 'CE'
        ? candle.close - trade.entry
        : trade.entry - candle.close;
      const favorablePoints = trade.dir === 'CE'
        ? candle.high - trade.entry
        : trade.entry - candle.low;
      trade.maxFavPts = Math.max(trade.maxFavPts, favorablePoints);

      const stopHit = trade.dir === 'CE'
        ? candle.close <= trade.sl
        : candle.close >= trade.sl;
      if (stopHit || isEod) {
        closeTrade(
          candle,
          index,
          stopHit ? trade.sl : candle.close,
          stopHit ? 'sl_hit' : 'exit_eod',
        );
        continue;
      }

      if (
        !trade.profitLockActive
        && config.profitLockTriggerPts != null
        && closePoints >= config.profitLockTriggerPts
      ) {
        const lockStop = trade.dir === 'CE'
          ? trade.entry + config.profitLockPts
          : trade.entry - config.profitLockPts;
        trade.sl = trade.dir === 'CE'
          ? Math.max(trade.sl, lockStop)
          : Math.min(trade.sl, lockStop);
        trade.profitLockActive = true;
        continue;
      }

      const trailCanActivate = config.trailActivationPts == null
        || closePoints >= config.trailActivationPts;
      if (trailCanActivate && trade.dir === 'CE' && candle.close > trade.refHigh) {
        const trailWindow = candles.slice(
          Math.max(6, index - config.trailLookbackBars + 1),
          index + 1,
        );
        const candidateStop = Math.min(...trailWindow.map((row) => row.low))
          - config.trailBufferPts;
        const locksEnough = config.trailOnlyWhenLocksPts == null
          || candidateStop - trade.entry >= config.trailOnlyWhenLocksPts;
        if (locksEnough) trade.sl = Math.max(trade.sl, candidateStop);
        trade.refHigh = candle.high;
        trade.refLow = candle.low;
      } else if (trailCanActivate && trade.dir === 'PE' && candle.close < trade.refLow) {
        const trailWindow = candles.slice(
          Math.max(6, index - config.trailLookbackBars + 1),
          index + 1,
        );
        const candidateStop = Math.max(...trailWindow.map((row) => row.high))
          + config.trailBufferPts;
        const locksEnough = config.trailOnlyWhenLocksPts == null
          || trade.entry - candidateStop >= config.trailOnlyWhenLocksPts;
        if (locksEnough) trade.sl = Math.min(trade.sl, candidateStop);
        trade.refHigh = candle.high;
        trade.refLow = candle.low;
      }
      continue;
    }

    const closedDayPoints = trades.reduce((sum, row) => sum + row.points, 0);
    const rescueEntry = trades.length >= config.maxTrades
      && trades.length < config.maxTrades + config.rescueTrades
      && candle.time >= config.rescueAfterTime
      && candle.time <= config.rescueCutoffTime
      && closedDayPoints < config.rescueOnlyIfDayPointsBelow;
    if (
      (trades.length >= config.maxTrades && !rescueEntry)
      || isEod
      || (!rescueEntry && candle.time > config.entryCutoffTime)
      || index <= lastExitIndex + config.reentryCooldownCandles
    ) continue;

    const upBreakPts = candle.close - rangeCandle.high;
    const downBreakPts = rangeCandle.low - candle.close;
    const previousTrade = trades[trades.length - 1] || null;
    const previousTradeWasWeakLoss = previousTrade
      && previousTrade.points < 0
      && (config.lossReentryMaxFavBelowPts == null
        || previousTrade.maxFavPts < config.lossReentryMaxFavBelowPts);
    let requiredBreakPts = rescueEntry
      ? config.rescueMinBreakPts
      : previousTradeWasWeakLoss && config.lossReentryMinBreakPts != null
        ? config.lossReentryMinBreakPts
        : trades.length > 0 && config.reentryMinBreakPts != null
          ? config.reentryMinBreakPts
          : config.minBreakPts;
    const narrowRange = config.narrowRangeThresholdPts != null
      && rangeCandle.high - rangeCandle.low <= config.narrowRangeThresholdPts;
    if (narrowRange && config.narrowRangeMinBreakPts != null) {
      requiredBreakPts = Math.max(requiredBreakPts, config.narrowRangeMinBreakPts);
    }
    const dir = upBreakPts >= requiredBreakPts
      ? 'CE'
      : downBreakPts >= requiredBreakPts
        ? 'PE'
        : null;
    if (!dir) {
      pendingDir = null;
      pendingCount = 0;
      continue;
    }

    const previousDir = trades[trades.length - 1]?.dir || null;
    if (
      previousDir
      && (
        (config.secondTradeDirection === 'opposite' && dir === previousDir)
        || (config.secondTradeDirection === 'same' && dir !== previousDir)
      )
    ) continue;

    if (dir === pendingDir) pendingCount += 1;
    else {
      pendingDir = dir;
      pendingCount = 1;
    }
    const openingMovePts = rangeCandle.close - candles[0].open;
    const counterToStrongOpeningMove = config.counterMomentumThresholdPts != null
      && Math.abs(openingMovePts) >= config.counterMomentumThresholdPts
      && (dir === 'CE' ? openingMovePts < 0 : openingMovePts > 0);
    const requiredConfirmationCloses = counterToStrongOpeningMove
      && config.counterMomentumConfirmationCloses != null
      ? Math.max(config.confirmationCloses, config.counterMomentumConfirmationCloses)
      : config.confirmationCloses;
    if (pendingCount < requiredConfirmationCloses) continue;

    const bodyPct = candleBodyPct(candle);
    const directionalBody = dir === 'CE'
      ? candle.close > candle.open
      : candle.close < candle.open;
    if (
      (config.requireDirectionalBody && !directionalBody)
      || bodyPct < config.minDirectionalBodyPct
    ) continue;

    const entry = candle.close;
    const sl = dir === 'CE' ? candle.low : candle.high;
    const riskPts = dir === 'CE' ? entry - sl : sl - entry;
    const breakPts = dir === 'CE' ? upBreakPts : downBreakPts;
    const momentumAnchor = config.momentumLookbackBars > 0
      ? candles[Math.max(0, index - config.momentumLookbackBars)].close
      : null;
    const momentumAligned = config.momentumLookbackBars <= 0
      || (dir === 'CE' ? candle.close > momentumAnchor : candle.close < momentumAnchor);
    const openingMomentumAligned = !config.alignWithOpeningMomentum
      || (dir === 'CE'
        ? rangeCandle.close > candles[0].open
        : rangeCandle.close < candles[0].open);
    const standardBreakRiskRatio = narrowRange
      && config.narrowRangeMinBreakRiskRatio != null
      ? Math.max(config.minBreakRiskRatio, config.narrowRangeMinBreakRiskRatio)
      : config.minBreakRiskRatio;
    const requiredBreakRiskRatio = rescueEntry
      ? Math.max(standardBreakRiskRatio, config.rescueMinBreakRiskRatio)
      : standardBreakRiskRatio;
    if (
      !(riskPts > 0)
      || (config.maxSignalRiskPts != null && riskPts > config.maxSignalRiskPts)
      || breakPts / riskPts < requiredBreakRiskRatio
      || !momentumAligned
      || !openingMomentumAligned
    ) continue;

    trade = {
      dir,
      entry,
      entryTime: candle.time,
      sl,
      refHigh: candle.high,
      refLow: candle.low,
      maxFavPts: 0,
      profitLockActive: false,
      signalBodyPct: bodyPct,
      signalBreakPts: breakPts,
      signalRiskPts: riskPts,
      rangeWidthPts: rangeCandle.high - rangeCandle.low,
      openingMovePts,
    };
    pendingDir = null;
    pendingCount = 0;
  }

  return {
    points: round(trades.reduce((sum, tradeRow) => sum + tradeRow.points, 0), 1),
    trades,
  };
}

function summarize(settings) {
  const days = Object.entries(data.days).map(([date, candles]) => ({
    date,
    ...simulateDay(candles, settings),
  }));
  return {
    points: round(days.reduce((sum, day) => sum + day.points, 0), 1),
    trades: days.reduce((sum, day) => sum + day.trades.length, 0),
    greenDays: days.filter((day) => day.points > 0).length,
    redDays: days.filter((day) => day.points < 0).length,
    flatDays: days.filter((day) => day.points === 0).length,
    days,
  };
}

if (require.main === module) {
  const baseline = summarize();
  const quality = summarize({
    minBreakPts: 50,
    profitLockTriggerPts: 50,
    profitLockPts: 50,
  });

  console.log(JSON.stringify({
    source: {
      file: DATA_FILE,
      sessions: Object.keys(data.days).length,
      candles: Object.values(data.days).reduce((sum, day) => sum + day.length, 0),
    },
    baseline: {
      points: baseline.points,
      trades: baseline.trades,
      greenDays: baseline.greenDays,
      redDays: baseline.redDays,
      flatDays: baseline.flatDays,
    },
    quality: {
      points: quality.points,
      trades: quality.trades,
      greenDays: quality.greenDays,
      redDays: quality.redDays,
      flatDays: quality.flatDays,
    },
  }, null, 2));
}

module.exports = { data, simulateDay, summarize, round, candleBodyPct };

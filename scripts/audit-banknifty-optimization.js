"use strict";

const fs = require("fs");
const zlib = require("zlib");

const MINUTE_FILE = process.argv[2] || "C:/tmp/banknifty-index-minute-2021-2026.json.gz";
const OUTPUT_FILE = process.argv[3] || "research-banknifty-optimization-audit.json";
const TARGET_POINTS = 2000;
const OLD_FUTURES_COST_POINTS = 362 / 30;

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const sum = (values) => values.reduce((total, value) => total + value, 0);

function aggregate15(minutes) {
  const bars = [];
  for (let index = 0; index + 15 <= minutes.length; index += 15) {
    const rows = minutes.slice(index, index + 15);
    bars.push({
      time: rows[0].t,
      open: Number(rows[0].o),
      high: Math.max(...rows.map((row) => Number(row.h))),
      low: Math.min(...rows.map((row) => Number(row.l))),
      close: Number(rows.at(-1).c),
    });
  }
  return bars;
}

function oldRangeDay(day, bars, referenceIndex) {
  if (bars.length !== 25) return null;
  const reference = bars[referenceIndex];
  const trades = [];
  let active = null;
  for (let index = referenceIndex + 1; index < bars.length; index += 1) {
    const bar = bars[index];
    const eod = index === bars.length - 1;
    if (active) {
      const stopHit = active.side === "LONG" ? bar.close <= active.stop : bar.close >= active.stop;
      if (stopHit || eod) {
        const exitPrice = stopHit ? active.stop : bar.close;
        const grossPoints = active.side === "LONG"
          ? exitPrice - active.entryPrice
          : active.entryPrice - exitPrice;
        const closeEntryPoints = active.side === "LONG"
          ? exitPrice - active.confirmationClose
          : active.confirmationClose - exitPrice;
        trades.push({
          side: active.side,
          signalTime: active.signalTime,
          entryPrice: round(active.entryPrice),
          confirmationClose: round(active.confirmationClose),
          retroactiveCredit: round(active.retroactiveCredit),
          exitTime: bar.time,
          exitPrice: round(exitPrice),
          grossPoints: round(grossPoints),
          closeEntryPoints: round(closeEntryPoints),
          reason: stopHit ? "CLOSE_THROUGH_STOP_FILLED_AT_STOP" : "EOD",
        });
        active = null;
        if (eod) break;
        continue;
      }
      if (active.side === "LONG" && bar.close > active.mainHigh) {
        active.stop = Math.max(active.stop, bar.low);
        active.mainHigh = bar.high;
        active.mainLow = bar.low;
      } else if (active.side === "SHORT" && bar.close < active.mainLow) {
        active.stop = Math.min(active.stop, bar.high);
        active.mainHigh = bar.high;
        active.mainLow = bar.low;
      }
      continue;
    }
    if (trades.length >= 2 || eod) continue;
    const side = bar.close > reference.high ? "LONG" : bar.close < reference.low ? "SHORT" : null;
    if (!side) continue;
    const entryPrice = side === "LONG" ? reference.high : reference.low;
    const retroactiveCredit = side === "LONG" ? bar.close - entryPrice : entryPrice - bar.close;
    active = {
      side,
      signalTime: bar.time,
      entryPrice,
      confirmationClose: bar.close,
      retroactiveCredit,
      stop: side === "LONG" ? bar.low : bar.high,
      mainHigh: bar.high,
      mainLow: bar.low,
    };
  }
  return { day, month: day.slice(0, 7), trades };
}

function summarizeOld(rows) {
  const months = {};
  let grossPoints = 0;
  let closeEntryPoints = 0;
  let retroactiveCredit = 0;
  let trades = 0;
  for (const row of rows) {
    const month = months[row.month] || { grossPoints: 0, closeEntryPoints: 0, retroactiveCredit: 0, estimatedNetPoints: 0, trades: 0 };
    for (const trade of row.trades) {
      grossPoints += trade.grossPoints;
      closeEntryPoints += trade.closeEntryPoints;
      retroactiveCredit += trade.retroactiveCredit;
      trades += 1;
      month.grossPoints += trade.grossPoints;
      month.closeEntryPoints += trade.closeEntryPoints;
      month.retroactiveCredit += trade.retroactiveCredit;
      month.trades += 1;
    }
    months[row.month] = month;
  }
  for (const month of Object.values(months)) {
    month.estimatedNetPoints = month.grossPoints - (month.trades * OLD_FUTURES_COST_POINTS);
    for (const key of Object.keys(month)) if (key !== "trades") month[key] = round(month[key]);
  }
  return {
    grossPoints: round(grossPoints),
    closeEntryPoints: round(closeEntryPoints),
    retroactiveCredit: round(retroactiveCredit),
    retroactiveSharePct: grossPoints ? round((retroactiveCredit / grossPoints) * 100) : null,
    estimatedNetPoints: round(grossPoints - (trades * OLD_FUTURES_COST_POINTS)),
    trades,
    months,
  };
}

function collectModelRows() {
  const sources = [
    {
      id: "fixed_range_stop_order",
      file: "research-banknifty-stop-order-optimizer.json",
      periods: ["train", "development", "validation"],
    },
    {
      id: "active_bar_model",
      file: "research-banknifty-active-models.json",
      periods: ["train", "development", "latest"],
    },
    {
      id: "minute_price_action",
      file: "research-banknifty-minute-price-action.json",
      periods: ["train", "development", "latest"],
    },
  ];
  const models = {};
  for (const source of sources) {
    const report = JSON.parse(fs.readFileSync(source.file, "utf8"));
    const rows = source.periods.flatMap((period) => report.winner.rows[period] || []);
    models[source.id] = Object.fromEntries(rows.map((row) => [row.day, Number(row.netPoints || 0)]));
  }
  return models;
}

function allocationSummary(rows) {
  const monthly = {};
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const row of rows) {
    monthly[row.day.slice(0, 7)] = (monthly[row.day.slice(0, 7)] || 0) + row.points;
    equity += row.points;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak - equity);
  }
  const values = Object.values(monthly);
  return {
    netPoints: round(equity),
    averageMonthlyPoints: round(equity / Math.max(1, values.length)),
    medianMonthlyPoints: round(quantile(values, 0.5)),
    minimumMonthlyPoints: round(Math.min(...values)),
    maximumMonthlyPoints: round(Math.max(...values)),
    targetMonths: values.filter((value) => value >= TARGET_POINTS).length,
    positiveMonths: values.filter((value) => value > 0).length,
    months: values.length,
    maxDrawdownPoints: round(maxDrawdown),
    monthly: Object.fromEntries(Object.entries(monthly).map(([month, value]) => [month, round(value)])),
  };
}

function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper
    ? sorted[lower]
    : sorted[lower] + ((sorted[upper] - sorted[lower]) * (position - lower));
}

function runAllocator(models, dates, config) {
  const ids = Object.keys(models);
  const output = [];
  for (let index = 0; index < dates.length; index += 1) {
    const day = dates[index];
    let selected = ids[0];
    if (config.type === "equal_weight") {
      output.push({ day, selected: "equal_weight", points: sum(ids.map((id) => models[id][day] || 0)) / ids.length });
      continue;
    }
    const start = Math.max(0, index - config.lookback);
    const history = dates.slice(start, index);
    const scores = ids.map((id) => ({ id, score: sum(history.map((date) => models[id][date] || 0)) }));
    scores.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    selected = scores[0].id;
    const points = config.cashWhenNegative && scores[0].score <= 0 ? 0 : models[selected][day] || 0;
    output.push({ day, selected: points === 0 && config.cashWhenNegative && scores[0].score <= 0 ? "cash" : selected, points });
  }
  return output;
}

function allocatorAudit(models) {
  const dates = [...new Set(Object.values(models).flatMap((rows) => Object.keys(rows)))].sort();
  const developmentEnd = "2025-08-11";
  const latestStart = "2025-08-12";
  const designDates = dates.filter((day) => day <= developmentEnd);
  const latestDates = dates.filter((day) => day >= latestStart);
  const configs = [{ type: "equal_weight", id: "equal_weight" }];
  for (const lookback of [10, 20, 40, 60, 120]) {
    configs.push({ type: "trailing", id: `trailing_${lookback}`, lookback, cashWhenNegative: false });
    configs.push({ type: "trailing", id: `trailing_${lookback}_cash`, lookback, cashWhenNegative: true });
  }
  const ranked = configs.map((config) => ({
    config,
    design: allocationSummary(runAllocator(models, designDates, config)),
  })).sort((left, right) => right.design.medianMonthlyPoints - left.design.medianMonthlyPoints
    || right.design.averageMonthlyPoints - left.design.averageMonthlyPoints);
  const selected = ranked[0];
  return {
    selectedConfig: selected.config,
    design: selected.design,
    latest: allocationSummary(runAllocator(models, latestDates, selected.config)),
    allDesignCandidates: ranked,
  };
}

function main() {
  const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(MINUTE_FILE)));
  const oldRows = [];
  for (const day of payload.sessions) {
    const minutes = payload.days[day] || [];
    if (minutes.length !== 375 || minutes[0]?.t !== "09:15" || minutes.at(-1)?.t !== "15:29") continue;
    const row = oldRangeDay(day, aggregate15(minutes), 3);
    if (row) oldRows.push(row);
  }
  const models = collectModelRows();
  const allocator = allocatorAudit(models);
  const completeLatestMonths = Object.fromEntries(Object.entries(allocator.latest.monthly)
    .filter(([month]) => month > "2025-08" && month < "2026-08"));
  const payloadOut = {
    generatedAt: new Date().toISOString(),
    oldTT1000Audit: {
      methodology: "Exact old close-confirmation engine reproduced; retroactive credit is confirmation close minus earlier range-boundary entry",
      full: summarizeOld(oldRows),
      latest: summarizeOld(oldRows.filter((row) => row.day >= "2025-08-12")),
      rows: oldRows,
    },
    causalAllocator: {
      methodology: "One model selected per day from trailing realized performance, or equal thirds with total exposure fixed to one unit; configuration selected before latest period",
      ...allocator,
      completeLatestMonths,
      completeLatestTargetMonths: Object.values(completeLatestMonths).filter((value) => value >= TARGET_POINTS).length,
    },
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(payloadOut, null, 2));
  console.log(JSON.stringify({
    output: OUTPUT_FILE,
    oldTT1000Latest: payloadOut.oldTT1000Audit.latest,
    allocator: {
      selectedConfig: allocator.selectedConfig,
      design: allocator.design,
      latest: allocator.latest,
      completeLatestMonths,
      completeLatestTargetMonths: payloadOut.causalAllocator.completeLatestTargetMonths,
    },
  }, null, 2));
}

main();

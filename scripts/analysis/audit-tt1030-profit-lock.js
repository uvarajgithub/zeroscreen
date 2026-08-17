const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const DATA_FILE = path.resolve(__dirname, "../../research-banknifty-15m-1y.vps.json");
const MINUTE_FILE = "C:/tmp/banknifty-index-minute-2021-2026.json.gz";
const LIVE_LEDGER_FILE = path.resolve(__dirname, "../../strategy-monthly-history.latest.json");
const FROM = "2026-06-15";
const TO = "2026-08-12";

function round1(value) {
  return Number(value.toFixed(1));
}

function loadDays() {
  const payload = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  return Object.entries(payload.days)
    .filter(([date]) => date >= FROM && date <= TO)
    .sort(([a], [b]) => a.localeCompare(b));
}

function loadMinuteDays() {
  const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(MINUTE_FILE)));
  return Object.entries(payload.days)
    .filter(([date]) => date >= FROM && date <= TO)
    .sort(([a], [b]) => a.localeCompare(b));
}

function aggregate15Minutes(rows) {
  const groups = [];
  for (let start = 0; start + 14 < rows.length; start += 15) {
    const slice = rows.slice(start, start + 15);
    groups.push({
      startIndex: start,
      endIndex: start + 14,
      time: slice[0].t,
      open: Number(slice[0].o),
      high: Math.max(...slice.map((row) => Number(row.h))),
      low: Math.min(...slice.map((row) => Number(row.l))),
      close: Number(slice.at(-1).c),
    });
  }
  return groups;
}

function simulateMinuteOrderedDay(date, rows, fillModel) {
  const candles = aggregate15Minutes(rows);
  const range = candles.find((candle) => candle.time === "10:30");
  const candleByEndIndex = new Map(candles.map((candle) => [candle.endIndex, candle]));
  if (!range) return { date, points: 0, rawPoints: 0, trades: [] };

  let position = null;
  let pendingEntry = null;
  const trades = [];

  function closePosition(minute, exit, reason) {
    const rawPoints = position.dir === "CE"
      ? exit - position.entry
      : position.entry - exit;
    trades.push({
      dir: position.dir,
      entry: position.entry,
      entryTime: position.entryTime,
      exit,
      exitTime: minute.t,
      rawPoints,
      points: round1(rawPoints),
      reason,
    });
    position = null;
  }

  function openPosition(signal, entry, entryTime) {
    const rawSl = signal.dir === "CE" ? signal.candle.low : signal.candle.high;
    const standardSl = signal.dir === "CE"
      ? Math.min(rawSl, entry - 1)
      : Math.max(rawSl, entry + 1);
    position = {
      dir: signal.dir,
      entry,
      entryTime,
      standardSl,
      refHigh: signal.candle.high,
      refLow: signal.candle.low,
      lockActive: false,
      lockStop: 0,
    };
  }

  for (let index = 0; index < rows.length; index += 1) {
    const minute = rows[index];
    const candle = candleByEndIndex.get(index) || null;

    if (pendingEntry && pendingEntry.fillIndex === index) {
      openPosition(pendingEntry, Number(minute.o), minute.t);
      pendingEntry = null;
    }

    const positionAtMinuteStart = position;
    let activateLockAfterMinute = false;
    if (position) {
      if (position.lockActive) {
        const gapHit = position.dir === "CE"
          ? Number(minute.o) <= position.lockStop
          : Number(minute.o) >= position.lockStop;
        const touched = position.dir === "CE"
          ? Number(minute.l) <= position.lockStop
          : Number(minute.h) >= position.lockStop;
        if (gapHit || touched) {
          closePosition(minute, gapHit ? Number(minute.o) : position.lockStop, gapHit ? "lock_gap" : "lock");
        }
      }

      if (position && !position.lockActive) {
        const favorable = position.dir === "CE"
          ? Number(minute.h) - position.entry
          : position.entry - Number(minute.l);
        activateLockAfterMinute = favorable >= 50;
      }
    }

    if (candle && position) {
      const standardStopHit = position.dir === "CE"
        ? candle.close <= position.standardSl
        : candle.close >= position.standardSl;
      const isEod = candle.endIndex === rows.length - 1;
      if (standardStopHit || isEod) {
        closePosition(minute, standardStopHit ? position.standardSl : candle.close, standardStopHit ? "standard_sl" : "eod");
      } else if (position.dir === "CE" && candle.close > position.refHigh) {
        position.standardSl = Math.max(position.standardSl, candle.low);
        position.refHigh = candle.high;
        position.refLow = candle.low;
      } else if (position.dir === "PE" && candle.close < position.refLow) {
        position.standardSl = Math.min(position.standardSl, candle.high);
        position.refHigh = candle.high;
        position.refLow = candle.low;
      }
    }

    if (
      position
      && position === positionAtMinuteStart
      && activateLockAfterMinute
    ) {
      position.lockActive = true;
      position.lockStop = position.dir === "CE"
        ? position.entry + 50
        : position.entry - 50;
    }

    if (!candle || position || pendingEntry || trades.length >= 2) continue;
    if (candle.time <= "10:30" || candle.endIndex === rows.length - 1) continue;

    const dir = candle.close > range.high
      ? "CE"
      : candle.close < range.low
        ? "PE"
        : null;
    if (!dir) continue;

    const isFirst = trades.length === 0;
    const firstBreakConfirmed = dir === "CE"
      ? candle.close >= range.high + 50
      : candle.close <= range.low - 50;
    if (isFirst && !firstBreakConfirmed) continue;

    const last = trades.at(-1);
    const oppositeAfterLoss = Boolean(last && last.rawPoints < 0 && last.dir !== dir);
    if (oppositeAfterLoss) {
      const oppositeConfirmed = dir === "CE"
        ? candle.close > range.high + 40
        : candle.close < range.low - 40;
      if (!oppositeConfirmed) continue;
    }

    const signal = {
      dir,
      candle,
      theoreticalEntry: dir === "CE" ? range.high : range.low,
    };
    if (fillModel === "range-boundary") {
      openPosition(signal, signal.theoreticalEntry, candle.time);
    } else if (fillModel === "signal-close") {
      openPosition(signal, candle.close, candle.time);
    } else if (index + 1 < rows.length) {
      pendingEntry = { ...signal, fillIndex: index + 1 };
    }
  }

  if (position) closePosition(rows.at(-1), Number(rows.at(-1).c), "forced_eod");
  const rawPoints = trades.reduce((sum, trade) => sum + trade.rawPoints, 0);
  const points = round1(trades.reduce((sum, trade) => sum + trade.points, 0));
  return { date, points, rawPoints, trades };
}

function runMinuteOrdered(label, fillModel, days) {
  const results = days.map(([date, rows]) => simulateMinuteOrderedDay(date, rows, fillModel));
  const total = round1(results.reduce((sum, day) => sum + day.points, 0));
  const rawTotal = round1(results.reduce((sum, day) => sum + day.rawPoints, 0));
  const tradeCount = results.reduce((sum, day) => sum + day.trades.length, 0);
  const green = results.filter((day) => day.rawPoints > 0).length;
  const red = results.filter((day) => day.rawPoints < 0).length;
  const flat = results.length - green - red;
  return { label, total, rawTotal, tradeCount, green, red, flat, results };
}

function ledgerDays(payload, strategy) {
  const result = new Map();
  for (const month of Object.values(payload.months || {})) {
    for (const [date, value] of Object.entries(month[strategy]?.days || {})) {
      result.set(date, {
        points: Number(value.summary?.futuresPts || 0),
        trades: Number(value.summary?.trades || 0),
      });
    }
  }
  return result;
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

function correlation(pairs) {
  if (pairs.length < 2) return 0;
  const meanA = pairs.reduce((sum, pair) => sum + pair[0], 0) / pairs.length;
  const meanB = pairs.reduce((sum, pair) => sum + pair[1], 0) / pairs.length;
  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  for (const [a, b] of pairs) {
    numerator += (a - meanA) * (b - meanB);
    denominatorA += (a - meanA) ** 2;
    denominatorB += (b - meanB) ** 2;
  }
  return denominatorA && denominatorB
    ? numerator / Math.sqrt(denominatorA * denominatorB)
    : 0;
}

function simulateDay(date, candles, options) {
  const range = candles.find((candle) => candle.time === "10:30");
  if (!range) return { date, points: 0, trades: [] };

  const state = {
    inTrade: false,
    dir: null,
    entry: 0,
    sl: 0,
    refHigh: 0,
    refLow: 0,
    trades: [],
  };

  function lastTrade() {
    return state.trades[state.trades.length - 1] || null;
  }

  function closeTrade(candle, exit, reason) {
    const points = state.dir === "CE" ? exit - state.entry : state.entry - exit;
    state.trades.push({
      dir: state.dir,
      entry: state.entry,
      entryTime: state.entryTime,
      exit,
      exitTime: candle.time,
      points: round1(points),
      rawPoints: points,
      reason,
    });
    state.inTrade = false;
    state.dir = null;
    state.entry = 0;
    state.sl = 0;
    state.refHigh = 0;
    state.refLow = 0;
  }

  const firstIndex = candles.findIndex((candle) => candle.time === "10:45");
  for (let index = firstIndex; index >= 0 && index < candles.length; index += 1) {
    const candle = candles[index];
    const isEod = index === candles.length - 1;

    if (state.inTrade) {
      const favorable = state.dir === "CE"
        ? candle.high - state.entry
        : state.entry - candle.low;
      const closePoints = state.dir === "CE"
        ? candle.close - state.entry
        : state.entry - candle.close;

      // This is the earlier reported interpretation: an intrabar high/low can
      // activate the lock before this same candle's close is evaluated.
      if (options.lockModel === "same-candle-high-low" && favorable >= options.lockTrigger) {
        const lockedSl = state.dir === "CE"
          ? state.entry + options.lockPoints
          : state.entry - options.lockPoints;
        state.sl = state.dir === "CE"
          ? Math.max(state.sl, lockedSl)
          : Math.min(state.sl, lockedSl);
      }

      const slHit = state.dir === "CE"
        ? candle.close <= state.sl
        : candle.close >= state.sl;
      if (slHit || isEod) {
        closeTrade(candle, slHit ? state.sl : candle.close, slHit ? "sl" : "eod");
        continue;
      }

      if (options.lockModel === "next-candle-high-low" && favorable >= options.lockTrigger) {
        const lockedSl = state.dir === "CE"
          ? state.entry + options.lockPoints
          : state.entry - options.lockPoints;
        state.sl = state.dir === "CE"
          ? Math.max(state.sl, lockedSl)
          : Math.min(state.sl, lockedSl);
      } else if (options.lockModel === "next-candle-close" && closePoints >= options.lockTrigger) {
        const lockedSl = state.dir === "CE"
          ? state.entry + options.lockPoints
          : state.entry - options.lockPoints;
        state.sl = state.dir === "CE"
          ? Math.max(state.sl, lockedSl)
          : Math.min(state.sl, lockedSl);
      }

      if (state.dir === "CE" && candle.close > state.refHigh) {
        state.sl = Math.max(state.sl, candle.low);
        state.refHigh = candle.high;
        state.refLow = candle.low;
      } else if (state.dir === "PE" && candle.close < state.refLow) {
        state.sl = Math.min(state.sl, candle.high);
        state.refHigh = candle.high;
        state.refLow = candle.low;
      }
      continue;
    }

    if (state.trades.length >= 2 || isEod) continue;

    let dir = candle.close > range.high
      ? "CE"
      : candle.close < range.low
        ? "PE"
        : null;
    if (!dir) continue;

    const last = lastTrade();
    const isFirst = state.trades.length === 0;
    const firstBreakConfirmed = dir === "CE"
      ? candle.close >= range.high + options.minFirstBreak
      : candle.close <= range.low - options.minFirstBreak;
    if (isFirst && !firstBreakConfirmed) continue;

    const oppositeAfterLoss = Boolean(
      last && last.points < 0 && last.dir !== dir,
    );
    if (oppositeAfterLoss) {
      const oppositeConfirmed = dir === "CE"
        ? candle.close > range.high + options.oppositeConfirm
        : candle.close < range.low - options.oppositeConfirm;
      if (!oppositeConfirmed) continue;
    }

    const entry = dir === "CE" ? range.high : range.low;
    const rawSl = dir === "CE" ? candle.low : candle.high;
    const sl = options.clampSl === false
      ? rawSl
      : dir === "CE"
        ? Math.min(rawSl, entry - 1)
        : Math.max(rawSl, entry + 1);

    state.inTrade = true;
    state.dir = dir;
    state.entry = entry;
    state.entryTime = candle.time;
    state.sl = sl;
    state.refHigh = candle.high;
    state.refLow = candle.low;
  }

  const rawPoints = state.trades.reduce((sum, trade) => sum + trade.rawPoints, 0);
  const points = round1(state.trades.reduce((sum, trade) => sum + trade.points, 0));
  return { date, points, rawPoints, trades: state.trades };
}

function run(label, options, days) {
  const results = days.map(([date, candles]) => simulateDay(date, candles, options));
  const total = round1(results.reduce((sum, day) => sum + day.points, 0));
  const rawTotal = round1(results.reduce((sum, day) => sum + day.rawPoints, 0));
  const tradeCount = results.reduce((sum, day) => sum + day.trades.length, 0);
  const green = results.filter((day) => day.points > 0).length;
  const red = results.filter((day) => day.points < 0).length;
  const flat = results.length - green - red;
  return { label, total, rawTotal, tradeCount, green, red, flat, results };
}

const days = loadDays();
const minuteDays = loadMinuteDays();
const common = {
  oppositeConfirm: 40,
  lockTrigger: 50,
  lockPoints: 50,
  clampSl: true,
};

const runs = [
  run("Old 10:30 Breakout baseline", {
    ...common,
    oppositeConfirm: 0,
    clampSl: false,
    minFirstBreak: 0,
    lockModel: "none",
  }, days),
  run("Current Quality (no first-break filter, no lock)", {
    ...common,
    minFirstBreak: 0,
    lockModel: "none",
  }, days),
  run("Break >=50 only", {
    ...common,
    minFirstBreak: 50,
    lockModel: "none",
  }, days),
  run("Break >=50 + same-candle high/low lock", {
    ...common,
    minFirstBreak: 50,
    lockModel: "same-candle-high-low",
  }, days),
  run("Break >=50 + lock active next candle", {
    ...common,
    minFirstBreak: 50,
    lockModel: "next-candle-high-low",
  }, days),
  run("Break >=50 + close-confirmed lock", {
    ...common,
    minFirstBreak: 50,
    lockModel: "next-candle-close",
  }, days),
];

console.log(`Period ${FROM} to ${TO}: ${days.length} sessions`);
for (const result of runs) {
  console.log(
    `${result.label}: ${result.total.toFixed(1)} pts (${result.rawTotal.toFixed(1)} raw), ${result.tradeCount} trades, `
      + `${result.green} green / ${result.red} red / ${result.flat} flat days`,
  );
}

console.log("\nOne-minute ordered checks (lock activates after the triggering minute):");
const minuteRuns = [
  runMinuteOrdered("Range-boundary shadow fill", "range-boundary", minuteDays),
  runMinuteOrdered("Exact signal-close fill", "signal-close", minuteDays),
  runMinuteOrdered("Next-minute-open executable fill", "next-minute-open", minuteDays),
];
for (const result of minuteRuns) {
  console.log(
    `${result.label}: ${result.total.toFixed(1)} pts (${result.rawTotal.toFixed(1)} raw), `
      + `${result.tradeCount} trades, ${result.green} green / ${result.red} red / ${result.flat} flat days`,
  );
}

const executableByDate = new Map(minuteRuns[2].results.map((day) => [day.date, day]));
const largestFillInflation = runs[3].results
  .map((day) => ({
    date: day.date,
    claimed: day.rawPoints,
    executable: executableByDate.get(day.date)?.rawPoints || 0,
    difference: day.rawPoints - (executableByDate.get(day.date)?.rawPoints || 0),
  }))
  .sort((left, right) => right.difference - left.difference)
  .slice(0, 5);
console.log("\nLargest differences caused by the fill assumption:");
for (const day of largestFillInflation) {
  console.log(
    `${day.date}: claimed ${day.claimed.toFixed(1)}, next-open ${day.executable.toFixed(1)}, `
      + `difference ${day.difference.toFixed(1)} pts`,
  );
}

if (fs.existsSync(LIVE_LEDGER_FILE)) {
  const ledger = JSON.parse(fs.readFileSync(LIVE_LEDGER_FILE, "utf8"));
  const liveOld = ledgerDays(ledger, "TEN_THIRTY");
  const liveQuality = ledgerDays(ledger, "TEN_THIRTY_QUALITY");
  const validDates = new Set(days.map(([date]) => date));
  const oldByDate = new Map(runs[0].results.map((day) => [day.date, day.rawPoints]));
  const claimedByDate = new Map(runs[3].results.map((day) => [day.date, day.rawPoints]));
  const overlapDates = [...liveOld.keys()]
    .filter((date) => validDates.has(date))
    .sort();
  const pairsOld = overlapDates.map((date) => [oldByDate.get(date), liveOld.get(date).points]);
  const claimedOverlapTotal = overlapDates.reduce((sum, date) => sum + claimedByDate.get(date), 0);
  const oldOverlapTotal = pairsOld.reduce((sum, pair) => sum + pair[0], 0);
  const liveOverlapTotal = pairsOld.reduce((sum, pair) => sum + pair[1], 0);
  const directionMatches = pairsOld.filter(([model, live]) => sign(model) === sign(live)).length;
  const qualityDates = [...liveQuality.keys()].sort();
  const qualityDirectOverlap = qualityDates.filter((date) => validDates.has(date));

  console.log("\nVPS shadow-ledger relevance check:");
  console.log(`Claimed rule direct live overlap: ${qualityDirectOverlap.length} days`);
  console.log(`Quality shadow dates: ${qualityDates.join(", ") || "none"}`);
  console.log(
    `Older 10:30 shadow overlap: ${overlapDates.length} days; `
      + `live ${liveOverlapTotal.toFixed(1)} pts, old-rule replay ${oldOverlapTotal.toFixed(1)} pts, `
      + `claimed-rule replay ${claimedOverlapTotal.toFixed(1)} pts`,
  );
  console.log(
    `Old-rule replay vs old shadow: ${directionMatches}/${overlapDates.length} same day direction; `
      + `correlation ${correlation(pairsOld).toFixed(3)}`,
  );
}

const claimed = runs[3];
console.log("\nClaimed-model day results:");
for (const day of claimed.results) {
  console.log(`${day.date} ${day.points >= 0 ? "+" : ""}${day.points.toFixed(1)}`);
}

const fs = require("fs");

const files = [
  ["tt1030", "tt1030-state.json"],
  ["tt1000", "tt1000-state.json"],
  ["tt0945", "tt0945-state.json"],
  ["normal", "normal-breakout-v1-state.json"],
  ["hybrid", "hybrid-state.json"],
  ["vwap", "vwap-trend-state.json"],
  ["pivot", "pivot-trend-state.json"],
  ["ema", "ema-trend-state.json"],
  ["smma", "smma-trend-state.json"],
];

function read(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (_err) { return null; }
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function summarize(id, file) {
  const x = read(file);
  if (!x) return { id, file, exists: false };
  const log = Array.isArray(x.log) ? x.log : Array.isArray(x.trades) ? x.trades : [];
  const candles = Array.isArray(x.candleLog) ? x.candleLog : Array.isArray(x.candles) ? x.candles : [];
  const lastCandle = candles.length ? candles[candles.length - 1] : null;
  const reasonRows = candles
    .filter((c) => c && (c.reason || c.note || c.status))
    .slice(-4)
    .map((c) => ({
      time: c.time || c.at || c.date,
      status: c.status || c.phase,
      reason: c.reason || c.note,
      pnlRs: c.pnlRs,
      pnl: c.pnl,
    }));
  return {
    id,
    file,
    date: x.date || x.day,
    savedAt: x.savedAt || x.updatedAt,
    phase: x.phase || x.status,
    inTrade: x.inTrade,
    dir: x.dir,
    trades: n(x.trades ?? x.tradeCount),
    wins: n(x.wins),
    losses: n(x.losses),
    dayRs: n(x.dayRs ?? x.futuresRs),
    optDayRs: n(x.optDayRs ?? x.optionsRs),
    logLen: log.length,
    candleLen: candles.length,
    lastCandle: lastCandle ? {
      time: lastCandle.time || lastCandle.at || lastCandle.date,
      status: lastCandle.status || lastCandle.phase,
      note: lastCandle.note || lastCandle.reason,
      pnlRs: lastCandle.pnlRs,
      pnl: lastCandle.pnl,
    } : null,
    recentReasons: reasonRows,
  };
}

console.log(JSON.stringify(files.map(([id, file]) => summarize(id, file)), null, 2));

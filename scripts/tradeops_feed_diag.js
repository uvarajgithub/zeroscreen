const fs = require("fs");
const path = require("path");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return fallback;
  }
}

function istParts(d = new Date()) {
  const z = new Date(d.getTime() + 5.5 * 3600000);
  return {
    ymd: z.toISOString().slice(0, 10),
    hhmm: z.toISOString().slice(11, 16),
  };
}

const today = istParts().ymd;
const state = readJson("tt1030-state.json", {});
const candle = readJson("tt1030-candle-log.json", {});
const heartbeat = readJson("bot-heartbeat.json", {});
const trades = readJson("trades.json", []);
const todayStart = new Date(`${today}T00:00:00.000Z`).getTime() - 5.5 * 3600000;
function fmt(epochMs) {
  const z = new Date(epochMs + 5.5 * 3600000);
  return `${z.toISOString().slice(0, 10)} ${z.toISOString().slice(11, 19)}`;
}

console.log(JSON.stringify({
  nowUTC: new Date().toISOString(),
  today,
  expectedFrom: fmt(todayStart + (9 * 60 + 15) * 60000),
  expectedTo: fmt(Date.now() - 60000),
  cwd: process.cwd(),
  files: {
    stateDate: state.date,
    stateTrades: state.trades,
    stateDayRs: state.dayRs,
    stateCandleLen: Array.isArray(state.candleLog) ? state.candleLog.length : null,
    candleDate: candle.date,
    candleLen: Array.isArray(candle.log) ? candle.log.length : null,
    heartbeatAt: heartbeat.at,
    heartbeatMode: heartbeat.tt1030FuturesMode,
    heartbeatCandles: Array.isArray(heartbeat.tt1030CandleLog) ? heartbeat.tt1030CandleLog.length : null,
    heartbeatTrades: heartbeat.tt1030Trades,
  },
  tenThirtyTrades: Array.isArray(trades) ? trades.filter((t) => {
    const key = String(t.date || t.entryTime || t.exitTime || "").slice(0, 10);
    const txt = `${t.type || ""} ${t.reasonEntry || ""} ${t.reason || ""}`.toLowerCase();
    return key === today && txt.includes("ten_thirty");
  }).map((t) => ({
    date: t.date,
    type: t.type,
    direction: t.direction || t.side,
    symbol: t.symbol,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    premiumEntry: t.premiumEntry,
    premiumExit: t.premiumExit,
    pnl: t.pnl,
    pnlRs: t.pnlRs,
    reasonEntry: t.reasonEntry,
    reasonExit: t.reasonExit,
    qty: t.qty,
    hasOrderId: !!(t.brokerOrderId || t.orderId || t.entryOrderId),
  })) : [],
}, null, 2));

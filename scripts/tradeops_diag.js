const fs = require("fs");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_err) {
    return fallback;
  }
}

function auditTail(file, count) {
  try {
    return fs.readFileSync(file, "utf8")
      .trim()
      .split(/\n/)
      .slice(-count)
      .map((line) => {
        try {
          const x = JSON.parse(line);
          return {
            at: x.at || x.ts,
            ok: x.ok,
            level: x.level,
            action: x.action,
            event: x.event,
            code: x.code,
            status: x.status,
            reason: x.reason || x.message || x.error,
            requiredMargin: x.requiredMargin,
            availableMargin: x.availableMargin,
            shortfall: x.shortfall,
          };
        } catch (_err) {
          return { raw: line.slice(0, 220) };
        }
      });
  } catch (_err) {
    return [];
  }
}

const hb = readJson("bot-heartbeat.json", {});
const state = readJson("tt1030-state.json", {});
const candleFile = readJson("tt1030-candle-log.json", {});
const trades = readJson("trades.json", []);
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const result = {
  serverNow: new Date().toISOString(),
  today,
  heartbeat: {
    at: hb.at,
    ageSec: hb.at ? Math.round((Date.now() - new Date(hb.at).getTime()) / 1000) : null,
    strategy: hb.tt1030Strategy,
    mode: hb.tt1030FuturesMode,
    auditStatus: hb.tt1030AuditStatus,
    auditReason: hb.tt1030AuditReason,
    inTrade: hb.tt1030InTrade,
    trades: hb.tt1030Trades,
    pnl: hb.tt1030PnL,
    high: hb.tt1030High,
    low: hb.tt1030Low,
    candleLogLen: Array.isArray(hb.tt1030CandleLog) ? hb.tt1030CandleLog.length : null,
    tradeLogLen: Array.isArray(hb.tt1030TradeLog) ? hb.tt1030TradeLog.length : null,
    pending: !!(hb.tt1030PendingOrder || hb.pendingOrder),
  },
  state: {
    date: state.date,
    trades: state.trades,
    dayRs: state.dayRs,
    inTrade: state.inTrade,
    logLen: Array.isArray(state.log) ? state.log.length : null,
    candleLogLen: Array.isArray(state.candleLog) ? state.candleLog.length : null,
    lastEvents: Array.isArray(state.log)
      ? state.log.slice(-8).map((x) => ({
          time: x.time,
          kind: x.kind || x.event,
          status: x.status,
          dir: x.dir,
          entry: x.entry,
          exit: x.exit,
          pts: x.pts,
          pnlRs: x.pnlRs,
          reason: x.reason || x.note,
        }))
      : [],
  },
  candleFile: {
    date: candleFile.date,
    len: Array.isArray(candleFile.log) ? candleFile.log.length : null,
    last: Array.isArray(candleFile.log)
      ? candleFile.log.slice(-6).map((c) => ({
          time: c.time || c.at,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          status: c.status,
          dir: c.dir,
          note: c.note || c.reason,
        }))
      : [],
  },
  todayTrades: Array.isArray(trades)
    ? trades
        .filter((t) => String(t.date || t.entryTime || t.exitTime || "").slice(0, 10) === today)
        .map((t) => ({
          date: t.date || t.entryTime || t.exitTime,
          symbol: t.symbol || t.tradeSymbol,
          side: t.side || t.direction,
          qty: t.qty || t.quantity,
          status: t.status,
          source: t.source || t.executionMode,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          premiumEntry: t.premiumEntry,
          premiumExit: t.premiumExit,
          hasOrderId: !!(t.orderId || t.brokerOrderId || t.entryOrderId),
          pnl: t.pnl || t.pnlRs || t.points || t.pts,
          reason: t.reason || t.reasonEntry || t.reasonExit,
        }))
    : [],
  auditTail: auditTail("tt1030-live-audit.jsonl", 25),
};

console.log(JSON.stringify(result, null, 2));

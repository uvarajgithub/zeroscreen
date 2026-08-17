process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";

const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");
const externalHealth = { database: { ok: true }, token: { valid: true, source: "report" } };

for (const underlying of ["BANKNIFTY", "NIFTY"]) {
  const payload = monitor.buildShadowMonitorPayload("tt1030", "FUTURES", externalHealth, underlying);
  const tiles = payload.consolidated?.tiles || [];
  const sum = type => tiles.filter(tile => !type || tile.instrumentType === type)
    .reduce((total, tile) => total + Number(tile.pnl || 0), 0);
  const traded = tiles.filter(tile => Number(tile.trades || 0) > 0);
  const bestToday = traded.slice().sort((a, b) => Number(b.pnl || 0) - Number(a.pnl || 0))[0] || null;
  const periods = payload.performance?.periods || {};
  console.log(JSON.stringify({
    underlying,
    tradeDate: payload.identity?.tradeDate,
    refreshedAt: payload.refreshedAt,
    market: payload.market?.status,
    today: { total: sum(), futures: sum("FUTURES"), options: sum("OPTIONS"), tradedTiles: traded.length },
    bestToday: bestToday && { strategy: bestToday.strategyName, instrument: bestToday.instrumentType, pnl: Number(bestToday.pnl || 0), returnPct: bestToday.returnPct, trades: bestToday.trades },
    monthWinner: periods.MONTH?.bestOverall || null,
    monthTotals: periods.MONTH?.totals || periods.MONTH?.summary || null,
    recentDays: (payload.history?.days || []).slice().sort((a, b) => String(b.date || b.period || "").localeCompare(String(a.date || a.period || ""))).slice(0, 5),
    recentTrades: (payload.history?.trades || []).slice().sort((a, b) => String(b.date || b.tradeDate || "").localeCompare(String(a.date || a.tradeDate || ""))).slice(0, 10),
  }));
}

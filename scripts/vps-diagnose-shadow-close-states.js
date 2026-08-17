process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";

const fs = require("fs");
const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");
const botDir = process.env.TRADING_BOT_DIR;
const externalHealth = { database: { ok: true }, token: { valid: true, source: "diagnostic" } };

for (const underlying of ["BANKNIFTY", "NIFTY"]) {
  const payload = monitor.buildShadowMonitorPayload("tt1030", "FUTURES", externalHealth, underlying);
  console.log(`UNDERLYING ${underlying} market=${payload.market.status} runtime=${payload.runtime.status}`);
  for (const tile of payload.consolidated.tiles) {
    console.log(`TILE ${underlying} ${tile.strategyId} ${tile.instrumentType} state=${tile.positionState} trades=${tile.trades} pnl=${tile.pnl}`);
  }
}

const nifty = JSON.parse(fs.readFileSync(`${botDir}/nifty-shadow-state.json`, "utf8"));
for (const [id, state] of Object.entries(nifty.strategies || {})) {
  const candles = Array.isArray(state.candleLog) ? state.candleLog : [];
  const last = candles[candles.length - 1] || {};
  console.log(`NIFTY_STATE ${id} phase=${state.phase} inTrade=${state.inTrade} trades=${state.trades} optionTrades=${state.optionTrades} candles=${candles.length} lastTime=${last.time || "--"} lastStatus=${last.status || "--"} lastNote=${last.note || "--"}`);
  for (const trade of state.tradeLog || []) {
    console.log(`NIFTY_TRADE ${id} status=${trade.status} entry=${trade.entryTime || "--"} exit=${trade.exitTime || "--"} dir=${trade.dir || "--"} reason=${trade.reason || "--"}`);
  }
}

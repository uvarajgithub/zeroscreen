process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";
const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");

for (const underlying of ["BANKNIFTY", "NIFTY"]) {
  const payload = monitor.buildShadowMonitorPayload("tt1030", "FUTURES", {}, underlying);
  if (payload.identity.underlying !== underlying) throw new Error(`${underlying} identity mismatch`);
  if (payload.consolidated.tiles.length !== 27) throw new Error(`${underlying} tile count mismatch`);
  if (!payload.consolidated.tiles.every(tile => tile.underlying === underlying)) throw new Error(`${underlying} tile isolation failed`);
  console.log(JSON.stringify({
    underlying,
    tiles: payload.consolidated.tiles.length,
    strategy: payload.identity.strategyName,
    totalPnl: payload.summary.totalPnl,
    runtime: payload.runtime.status,
    movement: payload.market.movement?.current,
  }));
}

const heartbeat = require("/home/ubuntu/trading-bot/nifty-shadow-heartbeat.json");
const heartbeatAgeSeconds = Math.round((Date.now() - new Date(heartbeat.at).getTime()) / 1000);
if (heartbeatAgeSeconds > 120) throw new Error(`NIFTY heartbeat stale: ${heartbeatAgeSeconds}s`);
if (heartbeat.executionMode !== "SHADOW") throw new Error("NIFTY execution mode is not SHADOW");
if (Object.keys(heartbeat.strategies || {}).length !== 14) throw new Error("NIFTY strategy heartbeat count mismatch");
console.log(`VPS_NIFTY_SHADOW_OK heartbeatAge=${heartbeatAgeSeconds}s strategies=14 execution=SHADOW`);

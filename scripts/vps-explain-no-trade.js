process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";

const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");
const health = { database: { ok: true }, token: { valid: true, source: "no-trade audit" } };

for (const underlying of ["BANKNIFTY", "NIFTY"]) {
  const base = monitor.buildShadowMonitorPayload("tt1030", "FUTURES", health, underlying);
  console.log(`SESSION underlying=${underlying} tradeDate=${base.identity.tradeDate} market=${base.market.status} refreshed=${base.market.checkedAt}`);
  const noTrade = (base.consolidated?.tiles || []).filter(tile => tile.positionState === "NO TRADE");
  const groups = new Map();
  for (const tile of noTrade) {
    const current = groups.get(tile.strategyId) || { instruments: [] };
    current.instruments.push(tile.instrumentType);
    groups.set(tile.strategyId, current);
  }
  for (const [strategyId, group] of groups) {
    const instrument = group.instruments.includes("FUTURES") ? "FUTURES" : group.instruments[0];
    const payload = monitor.buildShadowMonitorPayload(strategyId, instrument, health, underlying);
    const latest = payload.candles?.[0] || null;
    const trigger = payload.health?.checks?.find(check => check.id === "trigger") || null;
    console.log(JSON.stringify({
      underlying,
      strategyId,
      strategy: payload.identity.strategyName,
      instruments: group.instruments,
      phase: payload.runtime.phase,
      trades: payload.summary.trades,
      candleCount: payload.candles?.length || 0,
      latestCandle: latest && { time: latest.time, status: latest.status, note: latest.note, signal: latest.signal, reason: latest.reason },
      trigger: trigger && { level: trigger.level, value: trigger.value, detail: trigger.detail },
      health: payload.health.overall,
    }));
  }
}

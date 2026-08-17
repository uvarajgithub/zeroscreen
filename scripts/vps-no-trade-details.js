process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";
const fs = require("fs");
const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");
const health = { database: { ok: true }, token: { valid: true, source: "detail" } };
for (const id of ["hybrid-body", "low-iv-gamma", "pivot-trend"]) {
  const instrument = id === "low-iv-gamma" ? "OPTIONS" : "FUTURES";
  const payload = monitor.buildShadowMonitorPayload(id, instrument, health, "BANKNIFTY");
  console.log(JSON.stringify({ id, phase: payload.runtime.phase, candles: (payload.candles || []).map(c => ({ time: c.time, status: c.status, note: c.note, reason: c.reason, signal: c.signal })) }));
}
for (const file of ["low-iv-gamma-shadow-state.json", "low-iv-gamma-heartbeat.json"]) {
  try { console.log(JSON.stringify({ file, value: JSON.parse(fs.readFileSync(`/home/ubuntu/trading-bot/${file}`, "utf8")) })); } catch (error) { console.log(JSON.stringify({ file, error: error.message })); }
}

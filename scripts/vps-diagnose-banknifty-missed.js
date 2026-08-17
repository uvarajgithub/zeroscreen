process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";

const fs = require("fs");
const path = require("path");
const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");

const botDir = process.env.TRADING_BOT_DIR;
const externalHealth = { database: { ok: true }, token: { valid: true, source: "diagnostic" } };
const payload = monitor.buildShadowMonitorPayload("tt1030", "FUTURES", externalHealth, "BANKNIFTY");
const heartbeat = JSON.parse(fs.readFileSync(path.join(botDir, "bot-heartbeat.json"), "utf8"));

console.log(`CHECKED_AT=${new Date().toISOString()} MARKET=${payload.market.status} HEARTBEAT_AGE=${payload.health.heartbeatAgeSec}`);
for (const prefix of ["tt0945", "tt1000", "tt1030", "tt1030Shadow", "hybridShadow", "normalBreakoutShadow"]) {
  console.log(`HEARTBEAT ${prefix} candles=${heartbeat[`${prefix}CandleLog`]?.length ?? "missing"} trades=${heartbeat[`${prefix}Trades`] ?? "missing"} phase=${heartbeat[`${prefix}Phase`] ?? "missing"} strategy=${heartbeat[`${prefix}Strategy`] ?? "missing"}`);
}
for (const tile of payload.consolidated.tiles) {
  console.log([
    "TILE",
    tile.strategyId,
    tile.instrumentType,
    `state=${tile.positionState}`,
    `trades=${tile.trades}`,
    `pnl=${tile.pnl}`,
    `updated=${tile.lastUpdatedAt || "missing"}`,
  ].join(" "));
}

const stateFiles = [
  ["drishti", "trade-state.json"],
  ["drishti-v2", "drishti-v2-state.json"],
  ["tt0945", "tt0945-state.json"],
  ["tt1000", "tt1000-state.json"],
  ["tt1030", "tt1030-shadow-state.json"],
  ["normal-breakout", "normal-breakout-v1-state.json"],
  ["hybrid-body", "hybrid-state.json"],
  ["body-hold", "body-hold-shadow-state.json"],
];
for (const [id, name] of stateFiles) {
  const file = path.join(botDir, name);
  if (!fs.existsSync(file)) {
    console.log(`STATE ${id} file=${name} missing=true`);
    continue;
  }
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  const candles = state.candleLog || state.log || [];
  const stat = fs.statSync(file);
  console.log(`STATE ${id} file=${name} mtime=${stat.mtime.toISOString()} day=${state.date || state.day || "missing"} candles=${Array.isArray(candles) ? candles.length : 0} trades=${state.trades ?? state.tradeCount ?? "--"} phase=${state.phase || "--"}`);
}

for (const logFile of ["/root/.pm2/logs/trading-bot-out.log", "/root/.pm2/logs/trading-bot-error.log"]) {
  if (!fs.existsSync(logFile)) continue;
  const stat = fs.statSync(logFile);
  const length = Math.min(stat.size, 2 * 1024 * 1024);
  const fd = fs.openSync(logFile, "r");
  const buffer = Buffer.alloc(length);
  fs.readSync(fd, buffer, 0, length, stat.size - length);
  fs.closeSync(fd);
  const relevant = buffer.toString("utf8").split(/\r?\n/).filter(line =>
    /MISSED_ENTRY|RUN_ERR|CANDLE.*ERR|TOKEN|BOT_START|BACKFILL|ENTRY|MARKED|SHADOW|historical|incorrect.*api|access_token/i.test(line)
  ).slice(-120);
  console.log(`RELEVANT_LOG file=${path.basename(logFile)} lines=${relevant.length}`);
  for (const line of relevant) console.log(`LOG ${line}`);
}

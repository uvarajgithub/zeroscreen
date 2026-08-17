const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "zeroscreen-nifty-shadow-"));
process.env.TRADING_BOT_DIR = temp;

const strategy = {
  date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
  phase: "RUNNING",
  inTrade: true,
  direction: "CE",
  entry: 25000,
  ltp: 25025,
  stopLoss: 24965,
  entryAt: new Date().toISOString(),
  futuresSymbol: "NIFTY26AUGFUT",
  optionSymbol: "NIFTY26AUG25000CE",
  optionEntry: 200,
  optionLtp: 210,
  realizedPnl: 0,
  unrealizedPnl: 1625,
  optionRealizedPnl: 0,
  optionUnrealizedPnl: 650,
  trades: 1,
  optionTrades: 1,
  wins: 0,
  losses: 0,
  optionWins: 0,
  optionLosses: 0,
  quantity: 65,
  tradeLog: [],
  candleLog: [{ time: "10:45", open: 24990, high: 25030, low: 24980, close: 25025, status: "hold" }],
};
const strategies = Object.fromEntries([
  "drishti", "drishti-v2", "tt1030", "tt1000", "tt0945", "normal-breakout", "hybrid-body",
  "body-hold-s1", "body-hold-s2", "low-iv-gamma", "vwap-trend", "pivot-trend", "ema-trend", "smma-trend",
].map(id => [id, { ...strategy }]));
const at = new Date().toISOString();
fs.writeFileSync(path.join(temp, "nifty-shadow-state.json"), JSON.stringify({ underlying: "NIFTY", strategies }));
fs.writeFileSync(path.join(temp, "nifty-shadow-heartbeat.json"), JSON.stringify({ at, status: "RUNNING", executionMode: "SHADOW", quantity: 65, market: { open: 24950, current: 25025, high: 25040, low: 24920 }, strategies }));
fs.writeFileSync(path.join(temp, "nifty-shadow-history.json"), JSON.stringify({ underlying: "NIFTY", strategies: {} }));

require("ts-node/register");
const { buildShadowMonitorPayload } = require("../../src/shadowMonitor");
const payload = buildShadowMonitorPayload("tt1030", "FUTURES", {}, "NIFTY");
assert.equal(payload.identity.underlying, "NIFTY");
assert.equal(payload.identity.executionMode, "SHADOW");
assert.equal(payload.summary.unrealizedPnl, 1625);
assert.equal(payload.summary.capturedPoints, 25);
assert.equal(payload.position.ltp, 25025);
assert.equal(payload.consolidated.tiles.length, 27);
assert(payload.consolidated.tiles.every(tile => tile.underlying === "NIFTY"));
assert(payload.strategies.every(item => item.name.includes("(NIFTY)")));
assert.equal(payload.backtest, null);
assert.match(payload.health.checks.find(check => check.id === "process").source, /nifty-shadow/);

const workerSource = fs.readFileSync(path.join(__dirname, "..", "..", "deployment", "trading-bot", "nifty-shadow.ts"), "utf8");
const monitorSource = fs.readFileSync(path.join(__dirname, "..", "..", "src", "shadowMonitor.ts"), "utf8");
const autoTokenSource = fs.readFileSync(path.join(__dirname, "..", "..", "auto_token.js"), "utf8");
assert.match(workerSource, /candleDay\(c\) === dayIST\(\) && isCompletedCandle\(c\)/);
assert.match(workerSource, /startedAt \+ 15 \* 60_000 <= nowMs/);
assert.match(workerSource, /allowEntry && minute < 915/);
assert.match(workerSource, /wallClockMinute >= 930/);
assert.match(workerSource, /EOD wall-clock recovery/);
assert.match(workerSource, /state\.phase = state\.trades > 0 \? "COMPLETED" : "NO TRADE"/);
assert.match(workerSource, /Date\.now\(\) - 7 \* 86400000/);
assert.doesNotMatch(workerSource, /Date\.now\(\) - 14 \* 86400000/);
assert.match(workerSource, /kiteDateTimeIST\(from\), kiteDateTimeIST\(to\)/);
assert.match(workerSource, /refreshOptionLtp && state\.inTrade && state\.optionSymbol/);
assert.match(workerSource, /i === today\.length - 1/);
assert.match(monitorSource, /heartbeatDegraded = \/\\b\(DEGRADED\|ERROR\|FAILED\)\\b\//);
assert.match(autoTokenSource, /TOKEN_CONSUMER_PM2_NAMES/);
assert.match(autoTokenSource, /nifty-shadow,drishti-v2-shadow,indicator-shadow/);
assert.match(autoTokenSource, /pm2 restart \$\{processName\} --update-env/);

fs.rmSync(temp, { recursive: true, force: true });
console.log("PASS NIFTY shadow API, closed-candle/entry guards, EOD recovery, process identity, and P&L calculation");

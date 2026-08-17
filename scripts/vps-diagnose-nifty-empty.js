const fs = require("fs");
const path = "/home/ubuntu/trading-bot";
const state = JSON.parse(fs.readFileSync(`${path}/nifty-shadow-state.json`, "utf8"));
const heartbeat = JSON.parse(fs.readFileSync(`${path}/nifty-shadow-heartbeat.json`, "utf8"));
console.log(JSON.stringify({ updatedAt: state.updatedAt, underlying: state.underlying, strategies: Object.fromEntries(Object.entries(state.strategies || {}).map(([id, value]) => [id, { date: value.date, phase: value.phase, inTrade: value.inTrade, candles: value.candleLog?.length || 0, lastCandleKey: value.lastCandleKey }])) }));
console.log(JSON.stringify({ at: heartbeat.at, status: heartbeat.status, market: heartbeat.market, error: heartbeat.error || null }));

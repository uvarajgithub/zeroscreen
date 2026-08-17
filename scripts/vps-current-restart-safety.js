const fs = require("fs");
const { KiteConnect } = require("/home/ubuntu/trading-bot/node_modules/kiteconnect");
const { config } = require("/home/ubuntu/trading-bot/dist/src/config.js");
const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);
(async () => {
  const [positions, orders] = await Promise.all([kite.getPositions(), kite.getOrders()]);
  const nonFlat = (positions?.net || []).filter(row => Number(row.quantity || 0) !== 0);
  const openStatuses = new Set(["OPEN", "TRIGGER PENDING", "VALIDATION PENDING", "OPEN PENDING", "PUT ORDER REQ RECEIVED", "MODIFY VALIDATION PENDING", "MODIFY PENDING", "CANCEL PENDING"]);
  const openOrders = (orders || []).filter(row => openStatuses.has(String(row.status || "").toUpperCase()));
  const heartbeat = JSON.parse(fs.readFileSync("/home/ubuntu/trading-bot/bot-heartbeat.json", "utf8"));
  console.log(JSON.stringify({ mode: config.mode, brokerNonFlatPositions: nonFlat.length, brokerOpenOrders: openOrders.length, botInTrade: !!heartbeat.inTrade, direction: heartbeat.direction || null, strategy: heartbeat.strategy, heartbeatAt: heartbeat.at }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

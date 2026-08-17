process.env.TRADING_BOT_DIR = "/home/ubuntu/trading-bot";

const monitor = require("/root/zeroscreen/dist/shadowMonitor.js");
const externalHealth = {
  checkedAt: new Date().toISOString(),
  database: { ok: true },
  token: { valid: true, source: "deployment verification" },
};

for (const underlying of ["BANKNIFTY", "NIFTY"]) {
  const payload = monitor.buildShadowMonitorPayload("tt1030", "FUTURES", externalHealth, underlying);
  const failed = payload.health.checks.filter(check => check.critical && check.level === "FAIL");
  if (failed.length) {
    throw new Error(`${underlying} critical checks failed: ${failed.map(check => check.id).join(",")}`);
  }
  const processCheck = payload.health.checks.find(check => check.id === "process");
  console.log(`${underlying}_HEALTH=${payload.health.overall} process=${processCheck.value} source=${processCheck.source} heartbeatAge=${payload.health.heartbeatAgeSec}`);
}

console.log("SHADOW_TRIGGER_HEALTH_VERIFICATION=OK");

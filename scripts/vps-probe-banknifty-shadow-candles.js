const { KiteConnect } = require("/home/ubuntu/trading-bot/node_modules/kiteconnect");
const { config } = require("/home/ubuntu/trading-bot/dist/src/config.js");

const kite = new KiteConnect({ api_key: config.apiKey });
kite.setAccessToken(config.accessToken);

function istParts(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  return {
    ymd: ist.toISOString().slice(0, 10),
    hhmm: `${String(ist.getUTCHours()).padStart(2, "0")}:${String(ist.getUTCMinutes()).padStart(2, "0")}`,
  };
}

(async () => {
  const nowMs = Date.now();
  const today = istParts().ymd;
  const todayStart = new Date(`${today}T00:00:00.000Z`).getTime() - 5.5 * 3600000;
  const fromMs = todayStart + (9 * 60 + 15) * 60000;
  const fmt = epochMs => {
    const p = istParts(new Date(epochMs));
    return `${p.ymd} ${p.hhmm}:00`;
  };
  const result = await kite.getHistoricalData(260105, "15minute", fmt(fromMs), fmt(nowMs - 60000), false);
  const rows = Array.isArray(result) ? result : Array.isArray(result?.data) ? result.data : [];
  console.log(`RESULT_TYPE=${Array.isArray(result) ? "array" : typeof result} ROWS=${rows.length}`);
  for (const candle of rows.slice(0, 2).concat(rows.slice(-2))) {
    const at = new Date(candle.date);
    console.log(`CANDLE iso=${at.toISOString()} ist=${istParts(at).hhmm} completed=${Date.now() >= at.getTime() + 15 * 60000}`);
  }
})().catch(error => {
  console.error(`PROBE_ERROR=${error?.message || String(error)}`);
  process.exitCode = 1;
});

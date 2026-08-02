const { KiteConnect } = require("kiteconnect");
const { config } = require("./dist/src/config");

function istParts(d = new Date()) {
  const z = new Date(d.getTime() + 5.5 * 3600000);
  return { ymd: z.toISOString().slice(0, 10), hhmm: z.toISOString().slice(11, 16) };
}

function fmtIST(epochMs) {
  const z = new Date(epochMs + 5.5 * 3600000);
  return `${z.toISOString().slice(0, 10)} ${z.toISOString().slice(11, 19)}`;
}

(async () => {
  const today = istParts().ymd;
  const todayStart = new Date(`${today}T00:00:00.000Z`).getTime() - 5.5 * 3600000;
  const from = fmtIST(todayStart + (9 * 60 + 15) * 60000);
  const to = fmtIST(Date.now() - 60000);
  const kite = new KiteConnect({ api_key: config.apiKey });
  kite.setAccessToken(config.accessToken);
  const data = await kite.getHistoricalData(260105, "15minute", from, to, false);
  console.log(JSON.stringify({
    today,
    from,
    to,
    count: Array.isArray(data) ? data.length : null,
    first: data && data[0] ? { date: data[0].date, open: data[0].open, high: data[0].high, low: data[0].low, close: data[0].close } : null,
    last: data && data.length ? { date: data[data.length - 1].date, open: data[data.length - 1].open, high: data[data.length - 1].high, low: data[data.length - 1].low, close: data[data.length - 1].close } : null,
  }, null, 2));
})().catch((err) => {
  console.log(JSON.stringify({ error: err && err.message ? err.message : String(err) }, null, 2));
  process.exitCode = 1;
});

require("dotenv").config();

const fs = require("fs");
const { KiteConnect } = require("kiteconnect");

function loadConfig() {
  try {
    const mod = require("./dist/src/config.js");
    return mod.config || mod;
  } catch (_error) {
    return {};
  }
}

function istString(date) {
  const shifted = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 19).replace("T", " ");
}

function dayTimeFromKiteDate(value) {
  const shifted = new Date(new Date(value).getTime() + 5.5 * 60 * 60 * 1000);
  const iso = shifted.toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16), ist: iso.slice(0, 19).replace("T", " ") };
}

async function main() {
  const config = loadConfig();
  const apiKey = process.env.API_KEY || config.apiKey;
  const accessToken = process.env.ACCESS_TOKEN || config.accessToken;
  const token = Number(process.env.BANKNIFTY_INDEX_TOKEN || config.token || 260105);
  const from = new Date("2026-06-15T00:00:00+05:30");
  const to = new Date("2026-08-16T23:59:00+05:30");

  const kite = new KiteConnect({ api_key: apiKey });
  kite.setAccessToken(accessToken);

  const rows = await kite.getHistoricalData(token, "15minute", istString(from), istString(to), false);
  const days = {};
  const clean = rows.map((row) => {
    const stamp = dayTimeFromKiteDate(row.date);
    const item = {
      date: stamp.day,
      time: stamp.time,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume || 0),
    };
    if (!days[item.date]) days[item.date] = [];
    days[item.date].push(item);
    return { ...item, ist: stamp.ist };
  });

  const file = `/home/ubuntu/trading-bot/fresh-banknifty-15m-2m-${new Date().toISOString().slice(0, 10)}.json`;
  const output = {
    generatedAt: new Date().toISOString(),
    source: "fresh VPS Kite historical BANKNIFTY 15minute",
    token,
    from: istString(from),
    to: istString(to),
    sessionCount: Object.keys(days).length,
    candleCount: clean.length,
    days,
  };
  fs.writeFileSync(file, JSON.stringify(output, null, 2));
  console.log(JSON.stringify({
    ok: true,
    file,
    token,
    sessionCount: output.sessionCount,
    candleCount: output.candleCount,
    first: clean[0] || null,
    last: clean[clean.length - 1] || null,
  }, null, 2));
}

main().catch((error) => {
  console.log(JSON.stringify({
    ok: false,
    error: error && (error.message || String(error)),
    detail: error,
  }, null, 2));
  process.exit(2);
});

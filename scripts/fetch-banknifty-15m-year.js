const fs = require("fs");
const path = require("path");
const { KiteConnect } = require("kiteconnect");
require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const from = process.argv[2] || "2025-08-12";
const to = process.argv[3] || "2026-08-12";
const output = process.argv[4] || "research-banknifty-15m-1y.json";
const token = Number(process.env.BANKNIFTY_INDEX_TOKEN || 260105);

if (!process.env.API_KEY || !process.env.ACCESS_TOKEN) {
  throw new Error("API_KEY and ACCESS_TOKEN are required in .env");
}

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function addDays(key, days) {
  const d = new Date(`${key}T00:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return dateFmt.format(d);
}

function normalize(candle) {
  const d = new Date(candle.date);
  return {
    date: dateFmt.format(d),
    time: timeFmt.format(d),
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: candle.volume == null ? null : Number(candle.volume),
  };
}

async function main() {
  const grouped = {};
  let candleCount = 0;

  for (let start = from; start <= to;) {
    const end = addDays(start, 89);
    const chunkTo = end > to ? to : end;
    const candles = await kite.getHistoricalData(token, "15minute", start, chunkTo, false);

    for (const raw of candles || []) {
      const c = normalize(raw);
      if (c.time < "09:15" || c.time > "15:30") continue;
      if (!grouped[c.date]) grouped[c.date] = [];
      grouped[c.date].push(c);
      candleCount += 1;
    }

    console.error(JSON.stringify({ chunk: `${start}..${chunkTo}`, candles: candles.length }));
    start = addDays(chunkTo, 1);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  for (const rows of Object.values(grouped)) rows.sort((a, b) => a.time.localeCompare(b.time));

  const sessions = Object.keys(grouped).sort();
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Kite historical BANKNIFTY index 15minute candles",
    token,
    from,
    to,
    sessionCount: sessions.length,
    candleCount,
    sessions,
    days: grouped,
  };

  fs.writeFileSync(output, JSON.stringify(payload, null, 2));
  console.log(JSON.stringify({
    output,
    from,
    to,
    token,
    sessions: sessions.length,
    candles: candleCount,
    firstSession: sessions[0] || null,
    lastSession: sessions[sessions.length - 1] || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error && error.stack || error);
  process.exit(1);
});

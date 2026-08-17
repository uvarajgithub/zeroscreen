"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { KiteConnect } = require("kiteconnect");

require("dotenv").config({ path: path.join(process.cwd(), ".env") });

const from = process.argv[2] || "2021-01-01";
const to = process.argv[3] || "2026-08-12";
const output = process.argv[4] || "banknifty-index-minute.json.gz";
const token = Number(process.env.BANKNIFTY_INDEX_TOKEN || 260105);
const chunkDays = 55;

if (!process.env.API_KEY || !process.env.ACCESS_TOKEN) {
  throw new Error("API_KEY and ACCESS_TOKEN are required in .env");
}

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function addDays(key, amount) {
  const date = new Date(`${key}T00:00:00+05:30`);
  date.setDate(date.getDate() + amount);
  return dateFormat.format(date);
}

function normalize(raw) {
  const date = new Date(raw.date);
  return {
    t: timeFormat.format(date),
    o: Number(raw.open),
    h: Number(raw.high),
    l: Number(raw.low),
    c: Number(raw.close),
  };
}

async function fetchChunk(start, end) {
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await kite.getHistoricalData(token, "minute", start, end, false);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function main() {
  const days = {};
  let candleCount = 0;
  let chunks = 0;

  for (let start = from; start <= to;) {
    const proposedEnd = addDays(start, chunkDays - 1);
    const end = proposedEnd > to ? to : proposedEnd;
    const candles = await fetchChunk(start, end);

    for (const raw of candles || []) {
      const date = dateFormat.format(new Date(raw.date));
      const candle = normalize(raw);
      if (candle.t < "09:15" || candle.t > "15:29") continue;
      if (!days[date]) days[date] = [];
      days[date].push(candle);
      candleCount += 1;
    }

    chunks += 1;
    console.error(JSON.stringify({ chunk: chunks, from: start, to: end, candles: candles.length }));
    start = addDays(end, 1);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  for (const candles of Object.values(days)) candles.sort((left, right) => left.t.localeCompare(right.t));
  const sessions = Object.keys(days).sort();
  const payload = {
    generatedAt: new Date().toISOString(),
    source: "Kite historical BANKNIFTY index minute candles",
    token,
    from,
    to,
    sessionCount: sessions.length,
    candleCount,
    sessions,
    days,
  };
  const json = Buffer.from(JSON.stringify(payload));
  fs.writeFileSync(output, zlib.gzipSync(json, { level: 9 }));
  console.log(JSON.stringify({
    output,
    sessions: sessions.length,
    candles: candleCount,
    firstSession: sessions[0] || null,
    lastSession: sessions.at(-1) || null,
    compressedBytes: fs.statSync(output).size,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});

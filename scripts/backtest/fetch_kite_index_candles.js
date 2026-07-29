'use strict';

const fs = require('fs');
const path = require('path');
const { KiteConnect } = require('kiteconnect');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const interval = process.argv[2] || '5minute';
const from = process.argv[3];
const to = process.argv[4];
const output = process.argv[5];
const chunkDays = Number(process.argv[6] || 90);

if (!from || !to || !output) {
  throw new Error(
    'Usage: node fetch_kite_index_candles.js <interval> <from> <to> <output>',
  );
}
if (!process.env.API_KEY || !process.env.ACCESS_TOKEN) {
  throw new Error('API_KEY and ACCESS_TOKEN are required.');
}

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

async function main() {
  const grouped = {};
  let candleCount = 0;
  const requestedFrom = new Date(`${from}T00:00:00+05:30`);
  const requestedTo = new Date(`${to}T23:59:59+05:30`);

  for (
    let chunkStart = new Date(requestedFrom);
    chunkStart <= requestedTo;
    chunkStart.setDate(chunkStart.getDate() + chunkDays)
  ) {
    const chunkEnd = new Date(chunkStart);
    chunkEnd.setDate(chunkEnd.getDate() + chunkDays - 1);
    if (chunkEnd > requestedTo) chunkEnd.setTime(requestedTo.getTime());

    const chunkFrom = dateFormatter.format(chunkStart);
    const chunkTo = dateFormatter.format(chunkEnd);
    const candles = await kite.getHistoricalData(
      260105,
      interval,
      chunkFrom,
      chunkTo,
      false,
    );

    for (const candle of candles) {
      const date = new Date(candle.date);
      const dateKey = dateFormatter.format(date);
      const [hour, minute] = timeFormatter.format(date).split(':').map(Number);
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push({
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        h: hour,
        m: minute,
      });
      candleCount++;
    }

    console.log(JSON.stringify({
      event: 'chunk',
      from: chunkFrom,
      to: chunkTo,
      candles: candles.length,
    }));
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  fs.writeFileSync(output, JSON.stringify(grouped));
  console.log(JSON.stringify({
    interval,
    from,
    to,
    sessions: Object.keys(grouped).length,
    candles: candleCount,
    output,
  }));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});

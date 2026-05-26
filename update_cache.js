'use strict';
const { KiteConnect } = require('kiteconnect');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const CACHE_FILE = path.join(__dirname, 'cache', 'banknifty_5yr.json');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    const ist = new Date(c.date.getTime() + 5.5 * 3600 * 1000);
    const h   = ist.getUTCHours();
    const m   = ist.getUTCMinutes();
    const totalMin = h * 60 + m;
    if (totalMin < 9 * 60 + 15 || totalMin > 15 * 60 + 15) continue;
    const dateKey = ist.toISOString().slice(0, 10);
    if (!days[dateKey]) days[dateKey] = [];
    days[dateKey].push({ open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return days;
}

async function fetchChunk(from, to) {
  const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, '15minute', from, to, false);
  return (data || []).map(d => ({
    date:  d.date instanceof Date ? d.date : new Date(d.date),
    open:  d.open, high: d.high, low: d.low, close: d.close,
  }));
}

(async () => {
  const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const existingDates = Object.keys(cache).sort();
  const lastDate = existingDates[existingDates.length - 1];
  console.log('Cache: ' + existingDates.length + ' days. Last: ' + lastDate);

  const startD = new Date(lastDate);
  startD.setDate(startD.getDate() + 1);
  const startStr = startD.toISOString().slice(0, 10);

  const nowIST = new Date(Date.now() + 5.5 * 3600 * 1000);
  const todayStr = nowIST.toISOString().slice(0, 10);

  if (startStr > todayStr) {
    console.log('Cache is already up to date.');
    process.exit(0);
  }

  console.log('Fetching ' + startStr + ' to ' + todayStr + ' ...');

  let cur = new Date(startD);
  const endD = new Date(todayStr);
  const allCandles = [];

  while (cur <= endD) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + 59);
    if (chunkEnd > endD) chunkEnd.setTime(endD.getTime());

    const from = cur.toISOString().slice(0, 10);
    const to   = chunkEnd.toISOString().slice(0, 10);
    process.stdout.write('  Fetching ' + from + ' to ' + to + ' ...');
    try {
      const chunk = await fetchChunk(from, to);
      allCandles.push(...chunk);
      process.stdout.write(' ' + chunk.length + ' candles\n');
    } catch (e) {
      process.stdout.write(' ERROR: ' + e.message + '\n');
    }
    cur.setDate(cur.getDate() + 60);
    await sleep(300);
  }

  if (allCandles.length === 0) {
    console.log('No new candles returned from API.');
    process.exit(0);
  }

  const byDay = groupByDay(allCandles);
  let added = 0;
  for (const [day, candles] of Object.entries(byDay)) {
    if (candles.length >= 10) {
      cache[day] = candles;
      added++;
      console.log('  Added ' + day + ': ' + candles.length + ' candles');
    }
  }

  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0));
  const newDates = Object.keys(cache).sort();
  console.log('Done. Cache: ' + newDates.length + ' days (was ' + existingDates.length + '). Added ' + added + ' new days.');
  console.log('New last date: ' + newDates[newDates.length - 1]);
})();

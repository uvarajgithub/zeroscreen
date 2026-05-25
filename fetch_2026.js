'use strict';
// fetch_2026.js — Fetch ALL 2026 BANKNIFTY 15-min candles and save to cache
// Run once: node fetch_2026.js
// Output:   /home/ubuntu/trading-bot/cache/banknifty_2026.json

const { KiteConnect } = require('kiteconnect');
const fs   = require('fs');
const path = require('path');

const API_KEY      = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ||
  fs.readFileSync('/home/ubuntu/trading-bot/.env','utf8').match(/ACCESS_TOKEN=(\S+)/)?.[1];
const INST_TOKEN   = 260105;  // BANKNIFTY

const kite = new KiteConnect({ api_key: API_KEY });
kite.setAccessToken(ACCESS_TOKEN);

const CACHE_DIR  = path.resolve(__dirname, 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'banknifty_2026.json');

function getWeekdays(from, to) {
  const days = [];
  const d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)
      days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return days;
}

async function fetchDay(dateStr) {
  try {
    const raw = await kite.getHistoricalData(
      INST_TOKEN, '15minute',
      `${dateStr} 09:15:00`, `${dateStr} 15:30:00`, false
    );
    return (raw || []).map(c => {
      const d   = new Date(c.date);
      const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        open: c.open, high: c.high, low: c.low, close: c.close,
        h: ist.getHours(), m: ist.getMinutes()
      };
    });
  } catch (e) {
    console.error(`  ERROR ${dateStr}: ${e.message}`);
    return [];
  }
}

async function main() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Load existing cache if present (resume on interrupt)
  let cache = {};
  if (fs.existsSync(CACHE_FILE)) {
    cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    console.log(`Loaded existing cache: ${Object.keys(cache).length} days already fetched`);
  }

  const days    = getWeekdays('2026-01-01', '2026-05-22');
  const pending = days.filter(d => !cache[d]);

  console.log(`Total 2026 weekdays: ${days.length}  |  Need to fetch: ${pending.length}\n`);

  let done = 0;
  for (const d of pending) {
    const candles = await fetchDay(d);
    cache[d] = candles;
    done++;
    process.stdout.write(`\r  Fetched ${done}/${pending.length} — ${d}: ${candles.length} candles   `);
    // Save every 10 days (crash-safe)
    if (done % 10 === 0) fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
    await new Promise(r => setTimeout(r, 350));
  }

  // Final save
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));

  const validDays = days.filter(d => cache[d] && cache[d].length >= 4);
  console.log(`\n\nDone. Cache saved to: ${CACHE_FILE}`);
  console.log(`Valid trading days (>=4 candles): ${validDays.length} of ${days.length}`);

  // Summary per month
  console.log('\nMonth summary:');
  const months = {};
  for (const d of validDays) {
    const m = d.slice(0, 7);
    if (!months[m]) months[m] = 0;
    months[m]++;
  }
  for (const [m, cnt] of Object.entries(months)) {
    console.log(`  ${m}: ${cnt} trading days`);
  }
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

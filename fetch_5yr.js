'use strict';
// fetch_5yr.js — Fetch BANKNIFTY 15-min candles for 2021-01-01 to today
// Batches by 60-day chunks (Zerodha 15-min limit)
// Saves to ./cache/banknifty_5yr.json (merges 2026 cache too)

const { KiteConnect } = require('kiteconnect');
const fs   = require('fs');
const path = require('path');

const API_KEY      = '7an6kfp8opzq0zai';
const ENV_FILE     = '/home/ubuntu/trading-bot/.env';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ||
  fs.readFileSync(ENV_FILE,'utf8').match(/ACCESS_TOKEN=(\S+)/)?.[1];
const INST_TOKEN   = 260105;  // BANKNIFTY

const kite = new KiteConnect({ api_key: API_KEY });
kite.setAccessToken(ACCESS_TOKEN);

const CACHE_DIR   = path.resolve(__dirname, 'cache');
const OUT_FILE    = path.join(CACHE_DIR, 'banknifty_5yr.json');
const SRC_2026    = path.join(CACHE_DIR, 'banknifty_2026.json');

// Date helpers
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }
function isWeekend(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}

async function fetchRange(from, to) {
  try {
    const raw = await kite.getHistoricalData(
      INST_TOKEN, '15minute',
      `${from} 09:15:00`, `${to} 15:30:00`, false
    );
    // Group by date
    const byDate = {};
    for (const c of (raw || [])) {
      const d   = new Date(c.date);
      const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      const dateKey = ist.toISOString().slice(0, 10);
      if (!byDate[dateKey]) byDate[dateKey] = [];
      byDate[dateKey].push({
        open: c.open, high: c.high, low: c.low, close: c.close,
        h: ist.getHours(), m: ist.getMinutes()
      });
    }
    return byDate;
  } catch (e) {
    console.error(`  ERROR ${from}→${to}: ${e.message}`);
    return {};
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  // Load existing 5yr cache if present (allow resume)
  let cache = {};
  if (fs.existsSync(OUT_FILE)) {
    cache = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    console.log(`Loaded existing 5yr cache: ${Object.keys(cache).length} days`);
  }

  // Merge 2026 data
  if (fs.existsSync(SRC_2026)) {
    const d2026 = JSON.parse(fs.readFileSync(SRC_2026, 'utf8'));
    let added = 0;
    for (const [date, candles] of Object.entries(d2026)) {
      if (!cache[date]) { cache[date] = candles; added++; }
    }
    console.log(`Merged 2026 cache: ${added} new days`);
  }

  // Determine fetch range: 2021-01-01 to today
  const START = '2021-01-01';
  const END   = today();
  const CHUNK = 60; // days per API call

  let cur = START;
  let calls = 0;
  const fetched = [];

  while (cur <= END) {
    const chunkEnd = addDays(cur, CHUNK - 1) < END ? addDays(cur, CHUNK - 1) : END;

    // Skip if we already have data in this range
    // (check if at least one weekday in the range is already cached)
    let alreadyHave = true;
    let checkDate = cur;
    while (checkDate <= chunkEnd) {
      if (!isWeekend(checkDate) && !cache[checkDate]) { alreadyHave = false; break; }
      checkDate = addDays(checkDate, 1);
    }

    if (!alreadyHave) {
      process.stdout.write(`Fetching ${cur} → ${chunkEnd} ...`);
      const byDate = await fetchRange(cur, chunkEnd);
      const days = Object.keys(byDate);
      days.forEach(d => { if (!cache[d]) cache[d] = byDate[d]; });
      fetched.push(...days);
      calls++;
      console.log(` got ${days.length} days`);

      // Save progress every 5 chunks
      if (calls % 5 === 0) {
        fs.writeFileSync(OUT_FILE, JSON.stringify(cache));
        console.log(`  → Saved progress (${Object.keys(cache).length} total days)`);
      }

      await sleep(500); // rate limit
    } else {
      process.stdout.write(`  SKIP ${cur}→${chunkEnd} (already cached)\n`);
    }

    cur = addDays(chunkEnd, 1);
  }

  // Final save
  fs.writeFileSync(OUT_FILE, JSON.stringify(cache));

  const allDates = Object.keys(cache).sort();
  const validDays = allDates.filter(d => cache[d].length > 0);
  console.log(`\n✓ Done. Total: ${allDates.length} dates, ${validDays.length} trading days with candles`);
  console.log(`  Range: ${allDates[0]} → ${allDates[allDates.length-1]}`);
  console.log(`  API calls made: ${calls}`);
  console.log(`  Output: ${OUT_FILE}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

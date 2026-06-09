'use strict';

const fs = require('fs');
const path = require('path');

const p = path.join(process.cwd(), 'cache', 'banknifty_futures_minute_recent.json');
const fallbackP = path.join(process.cwd(), 'cache', 'banknifty_futures_recent.json');
if (!fs.existsSync(p) && !fs.existsSync(fallbackP)) {
  console.log('missing');
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(fs.existsSync(p) ? p : fallbackP, 'utf8'));
const keys = Object.keys(raw).sort();
if (keys.length === 0) {
  console.log('empty');
  process.exit(0);
}

console.log(`days=${keys.length}`);
console.log(`from=${keys[0]}`);
console.log(`to=${keys[keys.length - 1]}`);

const sampleDay = raw[keys[0]];
const candles = Array.isArray(sampleDay?.candles) ? sampleDay.candles : sampleDay;
if (Array.isArray(candles) && candles.length > 0) {
  console.log(`candles_per_day=${candles.length}`);
  console.log(`sample_fields=${Object.keys(candles[0]).join(',')}`);
}

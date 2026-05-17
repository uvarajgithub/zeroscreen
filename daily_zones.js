/**
 * daily_zones.js — Compute today's key Support/Resistance zones from 5yr candle data
 *
 * Uses research-candles-cache.json (30,882 candles, Apr 2021 → Apr 2026)
 * 
 * Zone types computed:
 *   1. PDH / PDL / PDC      — Previous Day High/Low/Close
 *   2. Weekly H/L           — Last 5 trading days range
 *   3. Monthly H/L          — Last 22 trading days range
 *   4. Volume Profile HVN   — Price levels with highest candle count (most activity)
 *   5. Round Numbers        — Every 500 pts, every 250 pts
 *   6. Swing Highs/Lows     — Last 10 days local peaks/troughs
 *   7. Opening Range        — Yesterday's first 15-min candle H/L
 */

'use strict';
const fs = require('fs');
const CACHE = 'research-candles-cache.json';

// ── Load & enrich ─────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
const all = raw.map(c => ({
  date     : c.date,
  day      : String(c.date).slice(0, 10),
  time     : String(c.date).slice(11, 16),
  open     : c.open,
  high     : c.high,
  low      : c.low,
  close    : c.close,
  volume   : c.volume || 0,
  bull     : c.close >= c.open,
  body_size: Math.abs(c.close - c.open),
}));

// Group by day
const byDay = {};
for (const c of all) {
  if (!byDay[c.day]) byDay[c.day] = [];
  byDay[c.day].push(c);
}
const allDates = Object.keys(byDay).sort();
const lastDate = allDates[allDates.length - 1];
const todayIdx = allDates.length - 1;

// Current price reference (last close in cache)
const lastCandles = byDay[lastDate];
const refPrice    = lastCandles[lastCandles.length - 1].close;

console.log(`\n📊 BNF KEY ZONES — Based on data up to ${lastDate}`);
console.log(`   Reference price: ${refPrice.toFixed(0)}`);
console.log(`   Total candles: ${all.length} | Trading days: ${allDates.length}`);
console.log('═'.repeat(65));

// ── 1. PDH / PDL / PDC ───────────────────────────────────────────────────────
const prevDay  = byDay[allDates[todayIdx - 1]];
const PDH      = Math.max(...prevDay.map(c => c.high));
const PDL      = Math.min(...prevDay.map(c => c.low));
const PDC      = prevDay[prevDay.length - 1].close;
const PDO      = prevDay[0].open;

console.log(`\n📅 PREVIOUS DAY (${allDates[todayIdx - 1]})`);
console.log(`   PDH: ${PDH.toFixed(0)}  ${refPrice > PDH ? '(below — resistance)' : '(above — support)'}`);
console.log(`   PDL: ${PDL.toFixed(0)}  ${refPrice > PDL ? '(above — support)' : '(below — resistance)'}`);
console.log(`   PDC: ${PDC.toFixed(0)}  PDO: ${PDO.toFixed(0)}`);
console.log(`   Day Range: ${(PDH - PDL).toFixed(0)} pts`);

// ── 2. Weekly H/L (last 5 days) ───────────────────────────────────────────────
const week5 = allDates.slice(todayIdx - 5, todayIdx);
let wkH = -Infinity, wkL = Infinity;
for (const d of week5) {
  for (const c of byDay[d]) { if (c.high > wkH) wkH = c.high; if (c.low < wkL) wkL = c.low; }
}
console.log(`\n📆 WEEKLY RANGE (last 5 days)`);
console.log(`   Week High: ${wkH.toFixed(0)}  Week Low: ${wkL.toFixed(0)}`);
console.log(`   Range: ${(wkH - wkL).toFixed(0)} pts | Current at: ${(((refPrice - wkL) / (wkH - wkL)) * 100).toFixed(0)}% of week range`);

// ── 3. Monthly H/L (last 22 days) ─────────────────────────────────────────────
const month22 = allDates.slice(todayIdx - 22, todayIdx);
let mH = -Infinity, mL = Infinity;
for (const d of month22) {
  for (const c of byDay[d]) { if (c.high > mH) mH = c.high; if (c.low < mL) mL = c.low; }
}
console.log(`\n📅 MONTHLY RANGE (last 22 days)`);
console.log(`   Month High: ${mH.toFixed(0)}  Month Low: ${mL.toFixed(0)}`);
console.log(`   Range: ${(mH - mL).toFixed(0)} pts | Current at: ${(((refPrice - mL) / (mH - mL)) * 100).toFixed(0)}% of month range`);

// ── 4. Swing Highs/Lows (last 10 days, local peaks) ──────────────────────────
const swing10 = allDates.slice(todayIdx - 10, todayIdx);
const swingDayHighs = swing10.map(d => ({ day: d, h: Math.max(...byDay[d].map(c => c.high)), l: Math.min(...byDay[d].map(c => c.low)) }));

// Find swing highs: day where H > prev day H and H > next day H
const swingHighs = [], swingLows = [];
for (let i = 1; i < swingDayHighs.length - 1; i++) {
  const prev = swingDayHighs[i - 1], cur = swingDayHighs[i], next = swingDayHighs[i + 1];
  if (cur.h > prev.h && cur.h > next.h) swingHighs.push({ level: cur.h, day: cur.day });
  if (cur.l < prev.l && cur.l < next.l) swingLows.push({ level: cur.l, day: cur.day });
}

console.log(`\n🔺 SWING HIGHS (last 10 days)`);
if (swingHighs.length) {
  swingHighs.sort((a, b) => b.level - a.level).forEach(s =>
    console.log(`   ${s.level.toFixed(0)}  (${s.day})  ${refPrice > s.level ? '✅ above' : '🔴 below — resistance'}`));
} else console.log('   None found');

console.log(`🔻 SWING LOWS (last 10 days)`);
if (swingLows.length) {
  swingLows.sort((a, b) => b.level - a.level).forEach(s =>
    console.log(`   ${s.level.toFixed(0)}  (${s.day})  ${refPrice > s.level ? '🟢 above — support' : '⚠️ below'}`));
} else console.log('   None found');

// ── 5. Volume Profile HVN (last 20 days) ─────────────────────────────────────
const vp20 = allDates.slice(todayIdx - 20, todayIdx);
const buckets = {}; // 100pt buckets
for (const d of vp20) {
  for (const c of byDay[d]) {
    // Distribute volume across candle range in 100pt buckets
    const lo = Math.floor(c.low  / 100) * 100;
    const hi = Math.floor(c.high / 100) * 100;
    for (let b = lo; b <= hi; b += 100) {
      buckets[b] = (buckets[b] || 0) + (c.body_size + 1); // use body_size as proxy for activity
    }
  }
}

const sorted = Object.entries(buckets).map(([k, v]) => ({ price: parseInt(k), activity: v }))
  .sort((a, b) => b.activity - a.activity)
  .slice(0, 8);

console.log(`\n📊 VOLUME PROFILE — Top 8 HIGH ACTIVITY ZONES (last 20 days)`);
console.log(`   (Highest candle activity = strongest S/R)`);
const maxAct = sorted[0].activity;
sorted.forEach((b, i) => {
  const bar   = '█'.repeat(Math.round(b.activity / maxAct * 20));
  const label = refPrice >= b.price && refPrice < b.price + 100 ? ' ← CURRENT' : '';
  const side  = b.price + 50 > refPrice ? '🔴 RESISTANCE' : '🟢 SUPPORT';
  console.log(`   ${b.price}-${b.price + 100}  ${side}  ${bar}${label}`);
});

// ── 6. Round Numbers ──────────────────────────────────────────────────────────
console.log(`\n🔢 ROUND NUMBER ZONES (±1500pts from current)`);
const nearest500 = [];
for (let r = Math.floor(refPrice / 500) * 500 - 1500; r <= refPrice + 1500; r += 500) {
  const dist = Math.abs(r - refPrice);
  if (dist < 1500) nearest500.push({ level: r, dist, side: r > refPrice ? 'RESISTANCE' : 'SUPPORT' });
}
nearest500.sort((a, b) => a.dist - b.dist).slice(0, 6).forEach(r =>
  console.log(`   ${r.level}  (${r.dist.toFixed(0)} pts away)  ${r.side}`));

// ── 7. Summary — Closest zones to current price ───────────────────────────────
console.log('\n' + '═'.repeat(65));
console.log(`🎯 NEAREST KEY ZONES TO CURRENT PRICE (${refPrice.toFixed(0)})`);
console.log('─'.repeat(65));

const allZones = [
  { level: PDH, label: 'PDH', type: 'resistance' },
  { level: PDL, label: 'PDL', type: 'support' },
  { level: PDC, label: 'PDC', type: 'pivot' },
  { level: wkH, label: 'Week High', type: 'resistance' },
  { level: wkL, label: 'Week Low', type: 'support' },
  { level: mH,  label: 'Month High', type: 'resistance' },
  { level: mL,  label: 'Month Low', type: 'support' },
  ...swingHighs.map(s => ({ level: s.level, label: `Swing High ${s.day}`, type: 'resistance' })),
  ...swingLows.map(s => ({ level: s.level, label: `Swing Low ${s.day}`, type: 'support' })),
  ...sorted.slice(0, 4).map(b => ({ level: b.price + 50, label: `HVN ${b.price}-${b.price+100}`, type: 'hvn' })),
];

const resistance = allZones.filter(z => z.level > refPrice).sort((a, b) => a.level - b.level).slice(0, 5);
const support    = allZones.filter(z => z.level < refPrice).sort((a, b) => b.level - a.level).slice(0, 5);

console.log('🔴 RESISTANCE (above current):');
resistance.forEach(z => console.log(`   ${z.level.toFixed(0).padStart(6)}  (+${(z.level - refPrice).toFixed(0)} pts)  ${z.label}`));

console.log('🟢 SUPPORT (below current):');
support.forEach(z => console.log(`   ${z.level.toFixed(0).padStart(6)}  (-${(refPrice - z.level).toFixed(0)} pts)  ${z.label}`));

console.log('\n📋 TRADING BIAS:');
const midRange = (wkH + wkL) / 2;
if (refPrice > midRange && refPrice > PDC) {
  console.log('   BULLISH — Price above midrange and PDC → CE bias on dips to support');
} else if (refPrice < midRange && refPrice < PDC) {
  console.log('   BEARISH — Price below midrange and PDC → PE bias on rallies to resistance');
} else {
  console.log('   NEUTRAL — Price near midrange → wait for zone touch before taking side');
}
console.log('═'.repeat(65));

// backtest_vol_filter.js
// Test volatility pre-filters to skip low-vol choppy days
// 1. PDY range filter: skip if yesterday's range < threshold
// 2. First-candle filter: skip if 9:15 candle range < threshold
// Usage: node backtest_vol_filter.js cache/banknifty_5yr.json

const fs = require('fs');
const cacheFile = process.argv[2] || 'cache/banknifty_5yr.json';
const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

const PTS_PER_RS  = 15;
const SL_PTS      = 150;
const LOCK20      = 20;
const ENTRY_START = { h: 9, m: 15 };
const ENTRY_END   = { h: 11, m: 0 };

function toMins(h, m) { return h * 60 + m; }

function dayRange(candles) {
  return Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low));
}

function firstCandleRange(candles) {
  const c = candles.find(c => c.h === 9 && c.m === 15);
  return c ? (c.high - c.low) : 0;
}

function findEntry(candles) {
  const start = toMins(ENTRY_START.h, ENTRY_START.m);
  const end   = toMins(ENTRY_END.h, ENTRY_END.m);
  for (const c of candles) {
    const t = toMins(c.h, c.m);
    if (t < start || t > end) continue;
    const body  = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) continue;
    if (body / range < 0.5) continue;
    return { dir: c.close > c.open ? 1 : -1, entryPrice: c.close, entryTime: t };
  }
  return null;
}

function calcPL(candles, entry) {
  let trailStop = -SL_PTS;
  let peak = 0;
  for (const c of candles.filter(c => toMins(c.h, c.m) > entry.entryTime)) {
    const hiPts    = entry.dir === 1 ? c.high  - entry.entryPrice : entry.entryPrice - c.low;
    const closePts = entry.dir === 1 ? c.close - entry.entryPrice : entry.entryPrice - c.close;
    if (hiPts > peak) {
      peak = hiPts;
      if (peak >= LOCK20) {
        const t = peak - LOCK20;
        if (t > trailStop) trailStop = t;
      }
    }
    if (closePts <= trailStop) return closePts * PTS_PER_RS;
  }
  const last = candles[candles.length - 1];
  const eod  = entry.dir === 1 ? last.close - entry.entryPrice : entry.entryPrice - last.close;
  return eod * PTS_PER_RS;
}

function run(days, label) {
  let pl = 0, w = 0, l = 0, skip = 0;
  for (const [, candles] of days) {
    const entry = findEntry(candles);
    if (!entry) { skip++; continue; }
    const p = calcPL(candles, entry);
    pl += p;
    p > 0 ? w++ : l++;
  }
  const traded = w + l;
  const wr = traded ? ((w / traded) * 100).toFixed(1) : '0';
  console.log(`  ${label.padEnd(52)} ₹${String(Math.round(pl).toLocaleString('en-IN')).padStart(11)}  WR:${wr}%  T:${traded}`);
  return { pl, w, l, traded, skip };
}

// Build sorted array with PDY info
const allDates = Object.keys(raw).sort();
const allDays  = allDates.map((date, i) => ({
  date,
  candles:      raw[date],
  pdyRange:     i > 0 ? dayRange(raw[allDates[i-1]]) : 9999,
  firstRange:   firstCandleRange(raw[date]),
  todayRange:   dayRange(raw[date]),
}));

console.log('='.repeat(72));
console.log('  VOLATILITY FILTER BACKTEST — BHAV (Realistic Candle-Close)');
console.log('='.repeat(72));
console.log(`  Total days: ${allDays.length}\n`);

// ─── Baseline ───
const all = allDays.map(d => [d.date, d.candles]);
console.log('── BASELINE ──');
const base = run(all, 'A) All days (no filter)');

// ─── PDY Range filter sweep ───
console.log('\n── PDY RANGE FILTER (skip if yesterday range < threshold) ──');
for (const thresh of [200, 250, 300, 350, 400, 450, 500]) {
  const filtered = allDays.filter(d => d.pdyRange >= thresh).map(d => [d.date, d.candles]);
  const skipped  = allDays.length - filtered.length;
  run(filtered, `PDY >= ${thresh}pts (trade ${filtered.length}, skip ${skipped})`);
}

// ─── First candle range filter sweep ───
console.log('\n── FIRST CANDLE (9:15) RANGE FILTER ──');
for (const thresh of [30, 40, 50, 60, 80, 100]) {
  const filtered = allDays.filter(d => d.firstRange >= thresh).map(d => [d.date, d.candles]);
  const skipped  = allDays.length - filtered.length;
  run(filtered, `9:15 candle >= ${thresh}pts (trade ${filtered.length}, skip ${skipped})`);
}

// ─── Combined best ───
console.log('\n── COMBINED: PDY >= 300 AND 9:15 >= 50 ──');
const combo = allDays.filter(d => d.pdyRange >= 300 && d.firstRange >= 50).map(d => [d.date, d.candles]);
run(combo, `Combined filter (trade ${combo.length}, skip ${allDays.length - combo.length})`);

const combo2 = allDays.filter(d => d.pdyRange >= 350 && d.firstRange >= 60).map(d => [d.date, d.candles]);
run(combo2, `Combined 350+60 (trade ${combo2.length}, skip ${allDays.length - combo2.length})`);

// ─── Detailed best result breakdown ───
console.log('\n── MONTHLY BREAKDOWN (PDY >= 300 filter) ──');
const bestFilter = allDays.filter(d => d.pdyRange >= 300);
const byMonth = {};
for (const d of bestFilter) {
  const mon = d.date.slice(0, 7);
  if (!byMonth[mon]) byMonth[mon] = [];
  byMonth[mon].push([d.date, d.candles]);
}
let totalPL = 0;
for (const [mon, days] of Object.entries(byMonth).sort()) {
  let mpl = 0, mw = 0, ml = 0;
  for (const [, candles] of days) {
    const entry = findEntry(candles);
    if (!entry) continue;
    const p = calcPL(candles, entry);
    mpl += p; p > 0 ? mw++ : ml++;
  }
  totalPL += mpl;
  const sign = mpl >= 0 ? '+' : '';
  console.log(`  ${mon}  ${sign}₹${Math.round(mpl).toLocaleString('en-IN').padStart(8)}  W:${mw} L:${ml}`);
}
console.log(`  ${'─'.repeat(40)}`);
console.log(`  TOTAL       ₹${Math.round(totalPL).toLocaleString('en-IN').padStart(8)}`);

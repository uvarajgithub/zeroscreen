const path = require('path');
const d = require(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'));
const days = Object.keys(d).sort();
// For June 3: prev day = last day in cache = June 2
const prevDay = days[days.length - 1];  // June 2 (last trading day = prev day for June 3)
const prevCandles = d[prevDay];
const h = Math.max(...prevCandles.map(x => x.high));
const l = Math.min(...prevCandles.map(x => x.low));
const range = h - l;

console.log('=== JUNE 3 — PRE-MARKET CONTEXT ===');
console.log('Cache last date  :', prevDay, '(this = prev day for June 3)');
console.log('Prev day (Jun 2) :', prevDay, '|', prevCandles.length, 'candles');
console.log('PDH:', h.toFixed(2), '| PDL:', l.toFixed(2), '| Range:', range.toFixed(0), 'pts');
console.log(range >= 150 ? '✅ PDR PASS — bot WILL enter on first signal today' : '❌ PDR FAIL — bot will SKIP first entry today');

// Check if June 3 candles exist
const todayCandles = d['2026-06-03'] || [];
if (todayCandles.length === 0) {
  console.log('\nJune 3 candles: NOT IN CACHE YET (market not open / not backfilled)');
  console.log('Cache will update tonight via update_cache.js cron');
} else {
  console.log('\n=== JUNE 3 CANDLES (' + todayCandles.length + ') ===');
  const o = todayCandles[0].open;
  const lastC = todayCandles[todayCandles.length - 1];
  const dayH = Math.max(...todayCandles.map(c => c.high));
  const dayL = Math.min(...todayCandles.map(c => c.low));
  const dayClose = lastC.close;
  const chg = dayClose - o;
  console.log('Open:', o, '| High:', dayH, '| Low:', dayL, '| Last:', dayClose, '| Chg:', chg >= 0 ? '+' + chg.toFixed(0) : chg.toFixed(0), 'pts');
  console.log('Last candle time:', lastC.hour + ':' + String(lastC.minute).padStart(2,'0'));
}

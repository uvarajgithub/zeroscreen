// backtest_event_filter.js
// Compare BHAV results: ALL days vs SKIP EVENT DAYS (RBI + Budget + high-vol)
// Usage: node backtest_event_filter.js cache/banknifty_5yr.json

const fs = require('fs');
const path = require('path');

const cacheFile = process.argv[2] || 'cache/banknifty_5yr.json';
const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

const PTS_PER_RS = 15;
const ENTRY_START = { h: 9, m: 15 };
const ENTRY_END   = { h: 11, m: 0 };
const SL_PTS      = 150;
const LOCK20_THRESH = 20;

// ─── Known Event Dates (RBI MPC outcome + Union Budget) ───
const EVENT_DATES = new Set([
  // Union Budgets
  '2021-02-01','2022-02-01','2023-02-01','2024-02-01','2024-07-23','2025-02-01','2026-02-01',
  // RBI MPC Results 2021
  '2021-02-05','2021-04-07','2021-06-04','2021-08-06','2021-10-08','2021-12-08',
  // RBI MPC Results 2022
  '2022-02-10','2022-04-08','2022-06-08','2022-08-05','2022-09-30','2022-12-07',
  // RBI MPC Results 2023
  '2023-02-08','2023-04-06','2023-06-08','2023-08-10','2023-10-06','2023-12-08',
  // RBI MPC Results 2024
  '2024-02-08','2024-04-05','2024-06-07','2024-08-08','2024-10-09','2024-12-06',
  // RBI MPC Results 2025
  '2025-02-07','2025-04-09','2025-06-06','2025-08-06','2025-10-01','2025-12-05',
  // RBI MPC Results 2026
  '2026-02-07','2026-04-09',
]);

function toMins(h, m) { return h * 60 + m; }

function findEntry(candles) {
  const start = toMins(ENTRY_START.h, ENTRY_START.m);
  const end   = toMins(ENTRY_END.h, ENTRY_END.m);
  for (const c of candles) {
    const t = toMins(c.h, c.m);
    if (t < start || t > end) continue;
    const body = Math.abs(c.close - c.open);
    const range = c.high - c.low;
    if (range === 0) continue;
    const bp = body / range;
    if (bp < 0.5) continue;
    return { dir: c.close > c.open ? 1 : -1, entryPrice: c.close, entryTime: t };
  }
  return null;
}

function calcPL(candles, entry) {
  let trailStop = -SL_PTS;
  let peak = 0;
  const after = candles.filter(c => toMins(c.h, c.m) > entry.entryTime);

  for (const c of after) {
    const hiPts    = entry.dir === 1 ? c.high  - entry.entryPrice : entry.entryPrice - c.low;
    const closePts = entry.dir === 1 ? c.close - entry.entryPrice : entry.entryPrice - c.close;

    // update peak
    if (hiPts > peak) {
      peak = hiPts;
      // lock trail: once peak >= 20, trail = peak - 20
      if (peak >= LOCK20_THRESH) {
        const newTrail = peak - LOCK20_THRESH;
        if (newTrail > trailStop) trailStop = newTrail;
      }
    }

    // check exit at candle close (realistic — same as live bot)
    if (closePts <= trailStop) {
      return closePts * PTS_PER_RS;
    }
  }
  // EOD exit
  const last = after[after.length - 1];
  if (!last) return 0;
  const eodPts = entry.dir === 1 ? last.close - entry.entryPrice : entry.entryPrice - last.close;
  return eodPts * PTS_PER_RS;
}

function backtest(days, label) {
  let totalPL = 0, wins = 0, losses = 0, noTrade = 0;
  const worstDays = [];

  for (const [date, candles] of days) {
    const entry = findEntry(candles);
    if (!entry) { noTrade++; continue; }
    const pl = calcPL(candles, entry);
    totalPL += pl;
    if (pl > 0) wins++;
    else { losses++; worstDays.push({ date, pl }); }
  }

  const traded = wins + losses;
  const wr = traded > 0 ? ((wins / traded) * 100).toFixed(1) : '0.0';
  worstDays.sort((a, b) => a.pl - b.pl);
  const worst5 = worstDays.slice(0, 5);

  console.log(`\n── ${label} ──`);
  console.log(`  Days: ${days.length} | Traded: ${traded} | No-entry: ${noTrade}`);
  console.log(`  P&L: ₹${totalPL.toLocaleString('en-IN')}  |  WR: ${wr}%  |  W:${wins} L:${losses}`);
  console.log(`  Worst 5 days:`);
  for (const d of worst5) {
    console.log(`    ${d.date}  ${d.pl < 0 ? '-' : '+'}₹${Math.abs(d.pl).toLocaleString('en-IN')}`);
  }
  return { totalPL, wins, losses, traded, noTrade, wr };
}

// ─── High-volatility filter (proxy for event days using data) ───
function calcRange(candles) {
  return Math.max(...candles.map(c => c.high)) - Math.min(...candles.map(c => c.low));
}

// ─── Main ───
const allDays = Object.entries(raw).sort(([a], [b]) => a.localeCompare(b));

const nonEventDays   = allDays.filter(([date]) => !EVENT_DATES.has(date));
const eventDaysOnly  = allDays.filter(([date]) =>  EVENT_DATES.has(date));

// High-vol days (range > threshold)
const HIGHVOL_THRESH = 600;
const highVolDays    = allDays.filter(([, c]) => calcRange(c) > HIGHVOL_THRESH);
const normalDays     = allDays.filter(([, c]) => calcRange(c) <= HIGHVOL_THRESH);

console.log('='.repeat(62));
console.log('  EVENT FILTER BACKTEST — BHAV Strategy (Realistic Candle-Close)');
console.log('='.repeat(62));
console.log(`\nTotal days in cache: ${allDays.length}`);
console.log(`Known event dates:   ${eventDaysOnly.length} matched`);
console.log(`High-vol days (>${HIGHVOL_THRESH}pts range): ${highVolDays.length}`);

const rA = backtest(allDays, `A) ALL DAYS (${allDays.length})`);
const rB = backtest(nonEventDays, `B) SKIP RBI/BUDGET (${nonEventDays.length} days, skipping ${eventDaysOnly.length})`);
const rC = backtest(normalDays, `C) SKIP HIGH-VOL >${HIGHVOL_THRESH}pts (${normalDays.length} days, skipping ${highVolDays.length})`);

// Also try combined
const combinedSkip = allDays.filter(([date, c]) => !EVENT_DATES.has(date) && calcRange(c) <= HIGHVOL_THRESH);
const rD = backtest(combinedSkip, `D) SKIP RBI+BUDGET+HIGH-VOL (${combinedSkip.length} days)`);

console.log('\n' + '='.repeat(62));
console.log('  SUMMARY');
console.log('='.repeat(62));
console.log(`  A) All days:              ₹${rA.totalPL.toLocaleString('en-IN').padStart(12)}  WR: ${rA.wr}%`);
console.log(`  B) Skip RBI/Budget:       ₹${rB.totalPL.toLocaleString('en-IN').padStart(12)}  WR: ${rB.wr}%`);
console.log(`  C) Skip high-vol:         ₹${rC.totalPL.toLocaleString('en-IN').padStart(12)}  WR: ${rC.wr}%`);
console.log(`  D) Skip both:             ₹${rD.totalPL.toLocaleString('en-IN').padStart(12)}  WR: ${rD.wr}%`);
console.log();
console.log(`  B vs A improvement:  ${((rB.totalPL - rA.totalPL) >= 0 ? '+' : '')}₹${(rB.totalPL - rA.totalPL).toLocaleString('en-IN')}`);
console.log(`  C vs A improvement:  ${((rC.totalPL - rA.totalPL) >= 0 ? '+' : '')}₹${(rC.totalPL - rA.totalPL).toLocaleString('en-IN')}`);
console.log(`  D vs A improvement:  ${((rD.totalPL - rA.totalPL) >= 0 ? '+' : '')}₹${(rD.totalPL - rA.totalPL).toLocaleString('en-IN')}`);

// Show event days P&L specifically
if (eventDaysOnly.length > 0) {
  console.log('\n── EVENT DAYS PERFORMANCE (what we want to skip) ──');
  backtest(eventDaysOnly, `RBI/Budget days only (${eventDaysOnly.length})`);
}

// High vol performance
if (highVolDays.length > 0) {
  console.log('\n── HIGH-VOL DAYS PERFORMANCE ──');
  backtest(highVolDays, `High-vol days only (${highVolDays.length})`);
}

// Show what high-vol threshold works best
console.log('\n── HIGH-VOL THRESHOLD SWEEP ──');
console.log('  (finding optimal range threshold to skip)');
for (const thresh of [400, 500, 600, 700, 800]) {
  const skip = allDays.filter(([, c]) => calcRange(c) > thresh);
  const keep = allDays.filter(([, c]) => calcRange(c) <= thresh);
  const result = backtest(keep, `Skip >${thresh}pts (skip ${skip.length}, keep ${keep.length})`);
}

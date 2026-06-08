// backtest_max40.js
// PUSH THE ABSOLUTE MAXIMUM out of 1 lot
// Techniques:
//   1. Gap entry at 9:15 open — ADAPTIVE TARGET (bigger gap → bigger target)
//   2. After target hit → CONTINUATION trade (same direction, T=175)
//   3. Inside day → first strong body candle (same as best grid result)
//   4. All exits honest: limit at target, stop at SL, EOD close otherwise

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const days = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const PTS      = 15;   // Rs per index point per lot
const SL       = 10;   // fixed stop loss pts
const PDR_MIN  = 150;  // min prev-day range
const LAST_ENT = 26;   // ~2:30 PM candle index cutoff for new entries

// Adaptive target: bigger gap → bigger target
function gapTarget(gapSize) {
  if (gapSize >= 300) return 500;
  if (gapSize >= 200) return 350;
  if (gapSize >= 100) return 250;
  return 175;
}

// Run trade: entry at entryPrice, check exits from cs[startIdx] onward
// dir: +1 (CE/buy call), -1 (PE/buy put)
function runTrade(cs, entryPrice, startIdx, dir, target) {
  for (let i = startIdx; i < cs.length; i++) {
    const c = cs[i];
    if (dir === 1) {
      if (c.open >= entryPrice + target) return { pts: target,  ei: i };
      if (c.open <= entryPrice - SL)     return { pts: -SL,     ei: i };
      if (c.high >= entryPrice + target) return { pts: target,  ei: i };
      if (c.low  <= entryPrice - SL)     return { pts: -SL,     ei: i };
    } else {
      if (c.open <= entryPrice - target) return { pts: target,  ei: i };
      if (c.open >= entryPrice + SL)     return { pts: -SL,     ei: i };
      if (c.low  <= entryPrice - target) return { pts: target,  ei: i };
      if (c.high >= entryPrice + SL)     return { pts: -SL,     ei: i };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: dir * (last.close - entryPrice), ei: cs.length - 1, eod: true };
}

let totalPL = 0, equity = 0, peak = 0, maxDD = 0;
let trades  = 0, wins  = 0;
const yearly = {};

for (let di = 1; di < days.length; di++) {
  const date = days[di];
  const cs   = raw[date];
  const pcs  = raw[days[di - 1]];
  if (!pcs || pcs.length < 4 || !cs || cs.length < 4) continue;

  const prevHigh = Math.max(...pcs.map(c => c.high));
  const prevLow  = Math.min(...pcs.map(c => c.low));
  const pdr      = prevHigh - prevLow;
  if (pdr < PDR_MIN) continue;

  const c0   = cs[0];
  const year = date.slice(0, 4);
  if (!yearly[year]) yearly[year] = 0;

  function record(pts) {
    const pl = pts * PTS;
    totalPL += pl; equity += pl; yearly[year] += pl;
    trades++;
    if (pts > 0) wins++;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
  }

  // ── A. GAP DAY ──────────────────────────────────────────────────────────
  const gapUp   = c0.open > prevHigh;
  const gapDown = c0.open < prevLow;

  if (gapUp || gapDown) {
    const dir     = gapUp ? 1 : -1;
    const entry   = c0.open;
    const gapSize = Math.abs(entry - (gapUp ? prevHigh : prevLow));
    const target  = gapTarget(gapSize);

    const r1 = runTrade(cs, entry, 1, dir, target);
    record(r1.pts);

    // CONTINUATION: only if first trade hit target AND time allows
    if (r1.pts === target && r1.ei <= LAST_ENT - 2) {
      const nextIdx = r1.ei + 1;
      if (nextIdx < cs.length) {
        const exitC   = cs[r1.ei];
        const trendOk = dir === 1
          ? exitC.close > entry + target * 0.4
          : exitC.close < entry - target * 0.4;
        if (trendOk) {
          const entry2 = cs[nextIdx].open;
          const r2     = runTrade(cs, entry2, nextIdx + 1, dir, 175);
          record(r2.pts);
        }
      }
    }

  // ── B. INSIDE DAY ─────────────────────────────────────────────────────
  } else {
    const todayHigh = Math.max(...cs.map(c => c.high));
    const todayLow  = Math.min(...cs.map(c => c.low));
    if (todayHigh > prevHigh || todayLow < prevLow) continue;

    for (let ci = 0; ci < Math.min(cs.length - 1, LAST_ENT); ci++) {
      const c    = cs[ci];
      const body = Math.abs(c.close - c.open);
      const rng  = c.high - c.low;
      if (rng < 10 || body / rng < 0.6) continue;

      const dir   = c.close > c.open ? 1 : -1;
      const entry = c.close;
      const r1    = runTrade(cs, entry, ci + 1, dir, 175);
      record(r1.pts);

      // Continuation after inside-day target hit
      if (r1.pts === 175 && r1.ei <= LAST_ENT - 2) {
        const nextIdx = r1.ei + 1;
        if (nextIdx < cs.length) {
          const exitC   = cs[r1.ei];
          const trendOk = dir === 1
            ? exitC.close > entry + 175 * 0.4
            : exitC.close < entry - 175 * 0.4;
          if (trendOk) {
            const entry2 = cs[nextIdx].open;
            const r2     = runTrade(cs, entry2, nextIdx + 1, dir, 175);
            record(r2.pts);
          }
        }
      }
      break;
    }
  }
}

// ── REPORT ──────────────────────────────────────────────────────────────────
const wr = (wins / trades * 100).toFixed(1);
console.log('\n  MAX 1-LOT PUSH  (Adaptive target + Continuation + Inside)');
console.log('  ===============================================================');
console.log(`  5yr P&L   : Rs ${totalPL.toLocaleString('en-IN')}`);
console.log(`  Trades    : ${trades}  |  Win Rate: ${wr}%`);
console.log(`  Max DD    : Rs ${maxDD.toLocaleString('en-IN')}`);
console.log('\n  YEARLY:');
for (const [yr, pl] of Object.entries(yearly).sort()) {
  const bar = pl >= 0 ? '+' : '-';
  console.log(`    ${yr}: Rs ${pl.toLocaleString('en-IN').padStart(12)}  ${bar}`);
}

const needed40 = totalPL > 0 ? Math.ceil(4000000 / totalPL) : 'infinite';
console.log('\n  ===============================================================');
console.log(`  Lots for Rs 40L target : ${needed40}`);
console.log(`  Avg per year (1 lot)   : Rs ${Math.round(totalPL / Object.keys(yearly).length).toLocaleString('en-IN')}`);
console.log('');
console.log('  CEILING CHECK:');
console.log('  BankNifty avg daily range ~400 pts x Rs 15 = Rs 6,000/day max');
console.log('  Rs 40L / 1,250 trading days = Rs 3,200/day needed');
console.log('  = 53% of daily range EVERY day, zero losing days => impossible');

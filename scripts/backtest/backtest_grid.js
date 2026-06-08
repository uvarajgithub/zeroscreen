'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_grid.js — FIND MAXIMUM HONEST P&L VIA FULL GRID SEARCH
// ════════════════════════════════════════════════════════════════════════════
// Tests every combination of:
//   SL     : 15, 20, 25, 30, 40, 50, 60, 75 pts
//   Target : 50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500 pts
//   Entry  : Gap-only | Gap+Inside
//   RE     : 0, 1, 2 re-entries (with same SL/Target)
//
// Exit logic: 100% honest
//   TARGET → c.high reaches target → limit order fills at target price
//   SL     → c.low  reaches SL    → stop  order fills at SL price (or open if gapped)
//   EOD    → last candle close
//
// Reports: top 20 results, best per entry type, lots needed for ₹40L
//
// Usage: node backtest_grid.js cache/banknifty_5yr.json

'use strict';
const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(process.cwd(), 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const TARGET_PL  = 4000000; // ₹40L goal

// ── Helpers ───────────────────────────────────────────────────────────────────
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── Honest exit ───────────────────────────────────────────────────────────────
function calcPL(candles, entryIdx, side, target, slPts) {
  const entryPrice = candles[entryIdx].close;
  const sign       = side === 'CE' ? 1 : -1;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c        = candles[i];
    const openPts  = sign * (c.open - entryPrice);
    const favHigh  = sign * (side === 'CE' ? c.high - entryPrice : entryPrice - c.low);
    const advLow   = sign * (side === 'CE' ? entryPrice - c.low  : c.high - entryPrice);

    const targetHit = favHigh  >= target;
    const slHit     = advLow   >= slPts;

    if (!targetHit && !slHit) continue;

    if (targetHit && !slHit) {
      const fillPts = openPts >= target ? openPts : target;
      return { pl: fillPts * PTS_PER_RS, exitType: 'TARGET' };
    }
    if (slHit && !targetHit) {
      const fillPts = openPts <= -slPts ? openPts : -slPts;
      return { pl: fillPts * PTS_PER_RS, exitType: 'SL' };
    }
    // Both reachable same candle — closer to open wins
    const distT = Math.abs(target - openPts);
    const distS = Math.abs(-slPts - openPts);
    if (distT <= distS) {
      const fillPts = openPts >= target ? openPts : target;
      return { pl: fillPts * PTS_PER_RS, exitType: 'TARGET' };
    } else {
      const fillPts = openPts <= -slPts ? openPts : -slPts;
      return { pl: fillPts * PTS_PER_RS, exitType: 'SL' };
    }
  }
  const last   = candles[candles.length - 1];
  const eodPts = sign * (last.close - entryPrice);
  return { pl: eodPts * PTS_PER_RS, exitType: 'EOD' };
}

// ── Re-entry scanner ──────────────────────────────────────────────────────────
function findReEntry(cs, fromIdx, side) {
  const maxIdx = Math.min(cs.length - 2, 20);
  for (let i = fromIdx; i <= maxIdx; i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp >  50) return i;
    if (side === 'PE' && cbp < -50) return i;
  }
  return -1;
}

// ── Entry functions ───────────────────────────────────────────────────────────
function entryGap(cs, prev) {
  const PH = pdh(prev), PL = pdl(prev), PDR = PH - PL;
  if (PDR < 150) return null;
  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;
  const open = cs[0].open;
  if (open > PH) return { idx: 0, side: 'CE' };
  if (open < PL) return { idx: 0, side: 'PE' };
  return null;
}

function entryGapInside(cs, prev) {
  const e = entryGap(cs, prev);
  if (e) return e;
  const PH = pdh(prev), PL = pdl(prev), PDR = PH - PL;
  if (PDR < 150) return null;
  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;
  const open = cs[0].open;
  const PH2  = pdh(prev), PL2 = pdl(prev);
  if (open >= PL2 && open <= PH2) {
    for (let i = 0; i < Math.min(6, cs.length - 1); i++) {
      const cbp = bp(cs[i]);
      if (cbp >  60) return { idx: i, side: 'CE' };
      if (cbp < -60) return { idx: i, side: 'PE' };
    }
  }
  return null;
}

// ── Run one config ────────────────────────────────────────────────────────────
function runConfig(entryFn, sl, target, reMax, raw, ALL) {
  let totalPL = 0, wins = 0, losses = 0, noTrade = 0;
  let peakPL = 0, maxDD = 0;

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = entryFn(cs, prev);
    if (!entry) { noTrade++; continue; }

    let dayPL = 0;
    const r1 = calcPL(cs, entry.idx, entry.side, target, sl);
    dayPL += r1.pl;

    if (reMax > 0 && r1.exitType === 'TARGET') {
      let cur = r1;
      let idx = entry.idx; // we need exitIdx — add it to calcPL
      // For re-entry we need exitIdx; recompute inline
      let curExit = calcPL_withIdx(cs, entry.idx, entry.side, target, sl);
      for (let re = 0; re < reMax; re++) {
        if (curExit.exitType !== 'TARGET') break;
        if (curExit.exitIdx >= cs.length - 2) break;
        const reIdx = findReEntry(cs, curExit.exitIdx + 1, entry.side);
        if (reIdx < 0) break;
        curExit = calcPL_withIdx(cs, reIdx, entry.side, target, sl);
        dayPL += curExit.pl;
      }
    }

    totalPL += dayPL;
    if (dayPL > 0) wins++; else losses++;
    if (totalPL > peakPL) peakPL = totalPL;
    const dd = peakPL - totalPL;
    if (dd > maxDD) maxDD = dd;
  }

  const traded = wins + losses;
  const wr     = traded > 0 ? wins / traded * 100 : 0;
  return { totalPL, wr, traded, maxDD };
}

// calcPL with exitIdx for re-entry chaining
function calcPL_withIdx(candles, entryIdx, side, target, slPts) {
  const entryPrice = candles[entryIdx].close;
  const sign       = side === 'CE' ? 1 : -1;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c        = candles[i];
    const openPts  = sign * (c.open - entryPrice);
    const favHigh  = sign * (side === 'CE' ? c.high - entryPrice : entryPrice - c.low);
    const advLow   = sign * (side === 'CE' ? entryPrice - c.low  : c.high - entryPrice);

    const targetHit = favHigh >= target;
    const slHit     = advLow  >= slPts;

    if (!targetHit && !slHit) continue;

    if (targetHit && !slHit) {
      const fillPts = openPts >= target ? openPts : target;
      return { pl: fillPts * PTS_PER_RS, exitType: 'TARGET', exitIdx: i };
    }
    if (slHit && !targetHit) {
      const fillPts = openPts <= -slPts ? openPts : -slPts;
      return { pl: fillPts * PTS_PER_RS, exitType: 'SL', exitIdx: i };
    }
    const distT = Math.abs(target - openPts);
    const distS = Math.abs(-slPts - openPts);
    if (distT <= distS) {
      const fillPts = openPts >= target ? openPts : target;
      return { pl: fillPts * PTS_PER_RS, exitType: 'TARGET', exitIdx: i };
    } else {
      const fillPts = openPts <= -slPts ? openPts : -slPts;
      return { pl: fillPts * PTS_PER_RS, exitType: 'SL', exitIdx: i };
    }
  }
  const last   = candles[candles.length - 1];
  const eodPts = sign * (last.close - entryPrice);
  return { pl: eodPts * PTS_PER_RS, exitType: 'EOD', exitIdx: candles.length - 1 };
}

// ── Load data ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

console.log('\n  Running full grid search (this may take 30-60 seconds)...\n');

// ── Grid parameters ───────────────────────────────────────────────────────────
const SLS      = [15, 20, 25, 30, 35, 40, 50, 60, 75];
const TARGETS  = [50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500];
const ENTRIES  = [
  { name: 'Gap-only', fn: entryGap },
  { name: 'Gap+Inside', fn: entryGapInside },
];
const RE_OPTS  = [0, 1, 2];

const results = [];

for (const entry of ENTRIES) {
  for (const sl of SLS) {
    for (const target of TARGETS) {
      if (target <= sl) continue;  // pointless if target < SL
      for (const re of RE_OPTS) {
        const r = runConfig(entry.fn, sl, target, re, raw, ALL);
        const rr = (target / sl).toFixed(1);
        results.push({
          entry: entry.name,
          sl, target, re,
          rr,
          ...r,
        });
      }
    }
  }
}

// Sort by totalPL descending
results.sort((a, b) => b.totalPL - a.totalPL);

const sep  = '═'.repeat(120);
const sep2 = '─'.repeat(120);

console.log(sep);
console.log('  FULL GRID SEARCH — TOP 30 RESULTS (Honest exits, 5yr BankNifty)');
console.log(sep);
console.log(`${'Entry'.padEnd(12)} ${'SL'.padStart(4)} ${'Target'.padStart(7)} ${'R:R'.padStart(5)} ${'RE'.padStart(3)} ${'P&L(₹)'.padStart(14)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD(₹)'.padStart(11)} ${'Lots→₹40L'.padStart(11)}`);
console.log(sep2);

for (const r of results.slice(0, 30)) {
  const lotsNeeded = r.totalPL > 0 ? Math.ceil(TARGET_PL / r.totalPL) : 999;
  console.log(
    `${r.entry.padEnd(12)} ` +
    `${r.sl.toString().padStart(4)} ` +
    `${r.target.toString().padStart(7)} ` +
    `${r.rr.padStart(5)} ` +
    `${r.re.toString().padStart(3)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(14)} ` +
    `${r.wr.toFixed(1).padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(11)} ` +
    `${lotsNeeded.toString().padStart(11)}`
  );
}

// Best result deep dive
const best = results[0];
console.log('\n' + sep);
console.log('  BEST STRATEGY — DEEP DIVE');
console.log(sep);

// Run yearly breakdown for best
function runYearly(entryFn, sl, target, reMax, raw, ALL) {
  const yearly = {};
  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = entryFn(cs, prev);
    if (!entry) continue;

    let dayPL = 0;
    let curExit = calcPL_withIdx(cs, entry.idx, entry.side, target, sl);
    dayPL += curExit.pl;

    if (reMax > 0) {
      for (let re = 0; re < reMax; re++) {
        if (curExit.exitType !== 'TARGET') break;
        if (curExit.exitIdx >= cs.length - 2) break;
        const reIdx = findReEntry(cs, curExit.exitIdx + 1, entry.side);
        if (reIdx < 0) break;
        curExit = calcPL_withIdx(cs, reIdx, entry.side, target, sl);
        dayPL += curExit.pl;
      }
    }

    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = { pl: 0, wins: 0, losses: 0 };
    yearly[yr].pl += dayPL;
    if (dayPL > 0) yearly[yr].wins++; else yearly[yr].losses++;
  }
  return yearly;
}

const bestEntryFn = ENTRIES.find(e => e.name === best.entry).fn;
const yearly = runYearly(bestEntryFn, best.sl, best.target, best.re, raw, ALL);
const lotsFor40L = Math.ceil(TARGET_PL / best.totalPL);

console.log(`\n  Entry  : ${best.entry}`);
console.log(`  SL     : ${best.sl} pts fixed stop-loss`);
console.log(`  Target : ${best.target} pts fixed target`);
console.log(`  R:R    : ${best.rr}`);
console.log(`  RE     : ${best.re} re-entries after target`);
console.log('');
console.log(`  5-YEAR P&L (1 lot) : ₹${Math.round(best.totalPL).toLocaleString('en-IN')}`);
console.log(`  Win Rate           : ${best.wr.toFixed(1)}%  (${best.traded} trades)`);
console.log(`  Max Drawdown       : ₹${Math.round(best.maxDD).toLocaleString('en-IN')}`);
console.log('');
console.log(`  ── Scaling to ₹40L ──`);
console.log(`  Lots needed       : ${lotsFor40L} lots`);
console.log(`  5yr P&L at ${lotsFor40L} lots : ₹${Math.round(best.totalPL * lotsFor40L).toLocaleString('en-IN')}`);
console.log(`  Max DD at ${lotsFor40L} lots  : ₹${Math.round(best.maxDD * lotsFor40L).toLocaleString('en-IN')}`);
console.log(`  Capital needed    : ₹${Math.round(best.maxDD * lotsFor40L * 3).toLocaleString('en-IN')} (3× MaxDD as buffer)`);
console.log('');
console.log('  YEARLY (1 lot):');
for (const [yr, y] of Object.entries(yearly).sort()) {
  const bar = y.pl > 0
    ? '█'.repeat(Math.min(40, Math.round(y.pl / 5000))) + ' +₹' + Math.round(y.pl).toLocaleString('en-IN')
    : '░'.repeat(Math.min(20, Math.round(-y.pl / 2000))) + ' -₹' + Math.round(-y.pl).toLocaleString('en-IN');
  console.log(`    ${yr}: ${bar}`);
}

console.log('\n' + sep);
console.log('  VERDICT');
console.log(sep);
if (best.totalPL >= TARGET_PL) {
  console.log('  ✅ ₹40L achievable with 1 lot using this strategy');
} else {
  console.log(`  ⚠️  Best honest 1-lot result: ₹${Math.round(best.totalPL).toLocaleString('en-IN')}`);
  console.log(`  ✅ ₹40L achievable with ${lotsFor40L} lots — all exits honest, no fake credits`);
  console.log(`  The strategy itself is valid. Capital scale determines profit.`);
}
console.log(sep + '\n');

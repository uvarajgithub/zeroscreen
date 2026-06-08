// backtest_25l.js
// TARGET: push maximum 1-lot P&L as high as possible
// SIGNALS (all honest, no look-ahead):
//   1. GAP day: enter at 9:15 open. Adaptive target based on gap size.
//   2. INSIDE day: first strong body candle (60%+ body/range). T=175.
//   3. ORB (Opening Range Breakout): first 2 candles define range. On C3 open,
//      if C2 broke above ORB_high → CE; below ORB_low → PE. (non-gap days only)
//   4. PDH/PDL intraday break: non-gap, non-inside days.
//      First candle that closes above PDH → CE next open.
//      First candle that closes below PDL → PE next open.
//   5. CONTINUATION: after any target hit with time left, re-enter same direction.
//   MAX 3 trades per day.
//   SL=10 throughout. All exits honest.

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const days = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const PTS      = 15;
const SL       = 10;
const PDR_MIN  = 150;
const LAST_ENT = 26;  // ~2:30 PM cutoff for new entries

function gapTarget(gapSize) {
  if (gapSize >= 300) return 500;
  if (gapSize >= 200) return 350;
  if (gapSize >= 100) return 250;
  return 175;
}

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

function tryContinuation(cs, exitIdx, dir, targetHit) {
  if (exitIdx > LAST_ENT - 2) return null;
  const nextIdx = exitIdx + 1;
  if (nextIdx >= cs.length) return null;
  const exitC = cs[exitIdx];
  // Trend must still be running after target hit
  const trendOk = dir === 1
    ? exitC.close > exitC.open * 0.995
    : exitC.close < exitC.open * 1.005;
  if (!trendOk) return null;
  const entry2 = cs[nextIdx].open;
  return { entry: entry2, startIdx: nextIdx + 1 };
}

let totalPL = 0, equity = 0, peak = 0, maxDD = 0;
let trades  = 0, wins  = 0;
const yearly = {};
let tradesBySignal = { GAP: 0, INSIDE: 0, ORB: 0, PDH: 0, CONT: 0 };
let plBySignal     = { GAP: 0, INSIDE: 0, ORB: 0, PDH: 0, CONT: 0 };

for (let di = 1; di < days.length; di++) {
  const date = days[di];
  const cs   = raw[date];
  const pcs  = raw[days[di - 1]];
  if (!pcs || pcs.length < 4 || !cs || cs.length < 6) continue;

  const prevHigh = Math.max(...pcs.map(c => c.high));
  const prevLow  = Math.min(...pcs.map(c => c.low));
  const pdr      = prevHigh - prevLow;
  if (pdr < PDR_MIN) continue;

  const c0   = cs[0];
  const year = date.slice(0, 4);
  if (!yearly[year]) yearly[year] = 0;

  let dayTradeCount = 0;

  function record(pts, sig) {
    const pl = pts * PTS;
    totalPL += pl; equity += pl; yearly[year] += pl;
    trades++; dayTradeCount++;
    if (pts > 0) wins++;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    tradesBySignal[sig] = (tradesBySignal[sig] || 0) + 1;
    plBySignal[sig]     = (plBySignal[sig] || 0) + pl;
  }

  function doContinuation(exitIdx, dir, lastPts) {
    if (dayTradeCount >= 3) return;
    if (lastPts <= 0) return;  // only continue on wins
    const cont = tryContinuation(cs, exitIdx, dir, lastPts);
    if (!cont) return;
    const r = runTrade(cs, cont.entry, cont.startIdx, dir, 175);
    record(r.pts, 'CONT');
    // One continuation only
  }

  // ── 1. GAP DAY ──────────────────────────────────────────────────────────
  const gapUp   = c0.open > prevHigh;
  const gapDown = c0.open < prevLow;

  if (gapUp || gapDown) {
    const dir     = gapUp ? 1 : -1;
    const entry   = c0.open;
    const gapSize = Math.abs(entry - (gapUp ? prevHigh : prevLow));
    const target  = gapTarget(gapSize);
    const r1      = runTrade(cs, entry, 1, dir, target);
    record(r1.pts, 'GAP');
    doContinuation(r1.ei, dir, r1.pts);
    continue; // gap day done
  }

  // ── NON-GAP DAYS: can have multiple signals ──────────────────────────────
  const todayHigh = Math.max(...cs.map(c => c.high));
  const todayLow  = Math.min(...cs.map(c => c.low));
  const isInside  = todayHigh <= prevHigh && todayLow >= prevLow;

  // ── 2. INSIDE DAY: use ORB instead of strong-body candle ─────────────
  // (fall through to ORB section below)

  // ── 3. ORB (Opening Range Breakout) — C2 (3rd candle) confirms break ──────
  if (cs.length >= 5 && dayTradeCount < 3) {
    const orbHigh = Math.max(cs[0].high, cs[1].high);
    const orbLow  = Math.min(cs[0].low,  cs[1].low);
    const orbRange = orbHigh - orbLow;
    if (orbRange >= 50) {
      const c2 = cs[2];  // third candle breaks the ORB
      if (c2.close > orbHigh && dayTradeCount < 3) {
        const entry  = cs[3].open;  // enter at 4th candle open
        const target = pdr >= 300 ? 250 : pdr >= 200 ? 200 : 175;
        const r1     = runTrade(cs, entry, 4, 1, target);
        record(r1.pts, 'ORB');
        doContinuation(r1.ei, 1, r1.pts);
      } else if (c2.close < orbLow && dayTradeCount < 3) {
        const entry  = cs[3].open;
        const target = pdr >= 300 ? 250 : pdr >= 200 ? 200 : 175;
        const r1     = runTrade(cs, entry, 4, -1, target);
        record(r1.pts, 'ORB');
        doContinuation(r1.ei, -1, r1.pts);
      }
    }
    // If inside day and ORB fired, skip PDH section
    if (isInside && dayTradeCount > 0) continue;
    // If non-inside and ORB fired, still allow PDH below
  }

  // ── 4. PDH/PDL INTRADAY BREAK — allow up to 2 breaks per day ────────────
  if (dayTradeCount < 3) {
    let pdhFired = false, pdlFired = false;
    for (let ci = 0; ci < Math.min(cs.length - 1, LAST_ENT); ci++) {
      if (dayTradeCount >= 3) break;
      const c = cs[ci];
      // PDH break: first close above prevHigh
      if (!pdhFired && c.close > prevHigh && (ci === 0 || cs[ci - 1].close <= prevHigh)) {
        const entry  = cs[ci + 1] ? cs[ci + 1].open : c.close;
        const target = pdr >= 300 ? 250 : pdr >= 200 ? 200 : 175;
        const r1     = runTrade(cs, entry, ci + 2, 1, target);
        record(r1.pts, 'PDH');
        doContinuation(r1.ei, 1, r1.pts);
        pdhFired = true;
      }
      // PDL break: first close below prevLow
      else if (!pdlFired && c.close < prevLow && (ci === 0 || cs[ci - 1].close >= prevLow)) {
        const entry  = cs[ci + 1] ? cs[ci + 1].open : c.close;
        const target = pdr >= 300 ? 250 : pdr >= 200 ? 200 : 175;
        const r1     = runTrade(cs, entry, ci + 2, -1, target);
        record(r1.pts, 'PDH');
        doContinuation(r1.ei, -1, r1.pts);
        pdlFired = true;
      }
    }
  }
}

// ── REPORT ────────────────────────────────────────────────────────────────────
const wr = (wins / trades * 100).toFixed(1);
console.log('\n  MAX 1-LOT  (Gap + Inside + ORB + PDH/PDL break + Continuation)');
console.log('  ================================================================');
console.log(`  5yr P&L  : Rs ${totalPL.toLocaleString('en-IN')}`);
console.log(`  Trades   : ${trades}  |  Win Rate: ${wr}%`);
console.log(`  Max DD   : Rs ${maxDD.toLocaleString('en-IN')}`);

console.log('\n  YEARLY:');
for (const [yr, pl] of Object.entries(yearly).sort()) {
  const bar = pl >= 0 ? '+' : '-';
  console.log(`    ${yr}: Rs ${pl.toLocaleString('en-IN').padStart(12)}  ${bar}`);
}

console.log('\n  BY SIGNAL TYPE:');
for (const [sig, cnt] of Object.entries(tradesBySignal)) {
  if (!cnt) continue;
  const pl = plBySignal[sig] || 0;
  console.log(`    ${sig.padEnd(8)}: ${String(cnt).padStart(5)} trades  Rs ${pl.toLocaleString('en-IN').padStart(12)}`);
}

const needed25 = totalPL > 0 ? Math.ceil(2500000 / totalPL) : 'infinite';
const needed40 = totalPL > 0 ? Math.ceil(4000000 / totalPL) : 'infinite';
console.log('\n  ================================================================');
console.log(`  Lots for Rs 25L : ${needed25}`);
console.log(`  Lots for Rs 40L : ${needed40}`);
console.log(`  Avg/year (1 lot): Rs ${Math.round(totalPL / Object.keys(yearly).length).toLocaleString('en-IN')}`);

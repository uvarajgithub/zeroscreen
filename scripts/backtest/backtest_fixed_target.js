'use strict';
// backtest_fixed_target.js
// V15 entry logic + FIXED TARGET exit (fully honest for candle-close bot)
// Entry: at candle close (V15 logic — PDR≥150, inside, 5 RE)
// Exit:  when close >= entry + TARGET → exit at close
// SL:    when close <= entry - 150 → exit at close
// No trail. No intrabar. 100% honest for candle-close execution.
// Sweeps TARGET from 20 to 500 pts.

const fs   = require('fs');
const path = require('path');
const CACHE_FILE = process.argv[2] || 'cache/banknifty_5yr.json';
const raw  = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL  = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const SL_PTS     = 150;
const PTS_PER_RS = 15;

const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? (c.close - c.open) / rng(c) * 100 : 0;

// ── V15 entry ────────────────────────────────────────────────────────────────
function findEntry(cs, prevCS) {
  const PH  = pdh(prevCS), PL = pdl(prevCS), PDR = PH - PL;
  const C0  = cs[0];
  if (PDR < 150) return null;

  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;

  const vsPDH = C0.open - PH, vsPDL = C0.open - PL;

  if (vsPDH > 0) {
    if (vsPDH < 120) return findInsideEntry(cs, PH, PL);
    if (vsPDH > 1000) return { idx: 0, side: 'CE' };
    const C0bp = bp(C0);
    if (C0bp > 85) return { idx: 0, side: 'CE' };
    return { idx: 0, side: 'PE' };
  }
  if (vsPDL < 0) {
    const C0bp = bp(C0);
    if (C0bp < -80) return { idx: 0, side: 'PE' };
    if (C0bp < -65) return null;
    if (C0bp > 65)  return { idx: 0, side: 'PE' };
    if (C0.high > PL) return findInsideEntry(cs, PH, PL);
    return { idx: 0, side: 'PE' };
  }
  return findInsideEntry(cs, PH, PL);
}

function findInsideEntry(cs, PH, PL) {
  const C0 = cs[0], C0bp = bp(C0);
  const hwick = C0.high - Math.max(C0.open, C0.close);
  if (hwick > 0.55 * rng(C0) && C0bp < -20) return { idx: 0, side: 'PE' };
  if (Math.abs(C0bp) > 55) return { idx: 0, side: C0bp > 0 ? 'CE' : 'PE' };
  for (let i = 1; i <= Math.min(4, cs.length - 1); i++) {
    const cbp = bp(cs[i]);
    if (Math.abs(cbp) > 55) return { idx: i, side: cbp > 0 ? 'CE' : 'PE' };
  }
  for (let i = 5; i <= Math.min(20, cs.length - 2); i++) {
    const cbp = bp(cs[i]);
    if (cbp > 55 && cs[i].close > PH) return { idx: i, side: 'CE' };
    if (cbp < -55 && cs[i].close < PL) return { idx: i, side: 'PE' };
  }
  return null;
}

function findReEntry(cs, fromIdx, side) {
  for (let i = fromIdx; i <= Math.min(cs.length - 2, 22); i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp > 40) return i;
    if (side === 'PE' && cbp < -40) return i;
  }
  return -1;
}

// ── FIXED TARGET calcPL: check at candle close, exit at close ────────────────
function calcPL(candles, entryIdx, side, TARGET) {
  const entryPrice = candles[entryIdx].close;
  const sign       = side === 'CE' ? 1 : -1;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const closePts = sign * (candles[i].close - entryPrice);

    if (closePts >= TARGET) {
      return { pl: closePts * PTS_PER_RS, exitType: 'TARGET', exitIdx: i };
    }
    if (closePts <= -SL_PTS) {
      return { pl: closePts * PTS_PER_RS, exitType: 'SL', exitIdx: i };
    }
  }

  const eodPts = sign * (candles[candles.length - 1].close - entryPrice);
  return { pl: eodPts * PTS_PER_RS, exitType: 'EOD', exitIdx: candles.length - 1 };
}

// ── Run one TARGET config ────────────────────────────────────────────────────
function runConfig(TARGET, MAX_TRADES) {
  let totalPL = 0, wins = 0, losses = 0;
  let peakEq = 0, maxDD = 0, targetHits = 0, slHits = 0, eodExits = 0;
  const yearly = {};

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = findEntry(cs, prev);
    if (!entry) continue;

    let dayPL = 0, tradesThisDay = 0;

    const res1 = calcPL(cs, entry.idx, entry.side, TARGET);
    dayPL += res1.pl;
    tradesThisDay++;
    if (res1.exitType === 'TARGET') targetHits++;
    else if (res1.exitType === 'SL') slHits++;
    else eodExits++;

    let curExit = res1, curSide = entry.side;

    // Same-dir re-entries after TARGET hit
    for (let re = 0; re < 5; re++) {
      if (MAX_TRADES && tradesThisDay >= MAX_TRADES) break;
      if (curExit.exitType !== 'TARGET') break;
      if (curExit.exitIdx >= cs.length - 2) break;
      const reIdx = findReEntry(cs, curExit.exitIdx + 1, curSide);
      if (reIdx < 0) break;
      const resRe = calcPL(cs, reIdx, curSide, TARGET);
      dayPL += resRe.pl;
      tradesThisDay++;
      if (resRe.exitType === 'TARGET') targetHits++;
      else if (resRe.exitType === 'SL') slHits++;
      else eodExits++;
      curExit = resRe;
    }

    totalPL += dayPL;
    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayPL;
    if (dayPL > 0) wins++; else losses++;
    if (totalPL > peakEq) peakEq = totalPL;
    const dd = peakEq - totalPL;
    if (dd > maxDD) maxDD = dd;
  }

  const allPos = Object.values(yearly).every(v => v > 0);
  return { totalPL, wins, losses, wr: (wins/(wins+losses)*100).toFixed(1), maxDD, yearly, allPos, targetHits, slHits, eodExits };
}

// ── SWEEP ────────────────────────────────────────────────────────────────────
const TARGETS = [20, 30, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500];
const MAX_TRADES = 5;

console.log('\n  BHAV V15 — FIXED TARGET (fully honest: close-check, exit-at-close) + 5-trade cap');
console.log('  SL = 150 pts fixed');
console.log('  ══════════════════════════════════════════════════════════════════════════════════');
console.log('  Target  5yr P&L         WR%    W/L         MaxDD         Tgt/SL/EOD    AllPos?');
console.log('  ──────────────────────────────────────────────────────────────────────────────');

let bestAllPos = null, bestAllPosTarget = 0;
let bestOverall = null, bestOverallTarget = 0;

for (const tgt of TARGETS) {
  const r = runConfig(tgt, MAX_TRADES);
  const allPos = r.allPos ? '✅' : '❌';
  const pl = `₹${Math.round(r.totalPL).toLocaleString('en-IN')}`;
  const rr = (tgt / SL_PTS).toFixed(2);
  console.log(`  ${String(tgt).padStart(5)}pt  ${pl.padEnd(16)} ${String(r.wr).padStart(5)}%  ${r.wins}W/${r.losses}L  ₹${Math.round(r.maxDD).toLocaleString('en-IN').padStart(9)}  ${r.targetHits}T/${r.slHits}S/${r.eodExits}E  ${allPos}  RR:${rr}`);

  if (r.allPos && (!bestAllPos || r.totalPL > bestAllPos.totalPL)) {
    bestAllPos = r; bestAllPosTarget = tgt;
  }
  if (!bestOverall || r.totalPL > bestOverall.totalPL) {
    bestOverall = r; bestOverallTarget = tgt;
  }
}

console.log('\n  ── BEST (all years positive) ──────────────────────────────────────────────────');
if (bestAllPos) {
  console.log(`  Target = ${bestAllPosTarget} pts | RR = ${(bestAllPosTarget/SL_PTS).toFixed(2)} | 5yr P&L = ₹${Math.round(bestAllPos.totalPL).toLocaleString('en-IN')}`);
  console.log(`  WR ${bestAllPos.wr}% | MaxDD ₹${Math.round(bestAllPos.maxDD).toLocaleString('en-IN')} | Targets:${bestAllPos.targetHits} SL:${bestAllPos.slHits} EOD:${bestAllPos.eodExits}`);
  console.log('  Yearly:');
  for (const [yr, pl] of Object.entries(bestAllPos.yearly))
    console.log(`    ${yr}: ₹${Math.round(pl).toLocaleString('en-IN').padStart(12)}  ${pl > 0 ? '✅' : '❌'}`);
  console.log(`\n  Avg P&L/year : ₹${Math.round(bestAllPos.totalPL / Object.keys(bestAllPos.yearly).length).toLocaleString('en-IN')}`);
  console.log(`  Avg P&L/month: ₹${Math.round(bestAllPos.totalPL / (Object.keys(bestAllPos.yearly).length * 12)).toLocaleString('en-IN')}`);
} else {
  console.log('  ❌ No target found with ALL years positive.');
  console.log(`  Best overall: Target=${bestOverallTarget} pts → ₹${Math.round(bestOverall.totalPL).toLocaleString('en-IN')} | WR ${bestOverall.wr}%`);
  for (const [yr, pl] of Object.entries(bestOverall.yearly))
    console.log(`    ${yr}: ₹${Math.round(pl).toLocaleString('en-IN').padStart(12)}  ${pl > 0 ? '✅' : '❌'}`);
}

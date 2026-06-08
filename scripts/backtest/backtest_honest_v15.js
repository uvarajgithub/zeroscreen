'use strict';
// backtest_honest_v15.js
// V15 entry logic + FULLY HONEST close-based trail
// Peak: set from candle CLOSE only (no intrabar high)
// Trail check: at candle CLOSE
// Exit: at candle CLOSE (not trail level)
// This is exactly what the live bot does today.
// Sweeps TRAIL_GAP from 10 to 200 to find sweet spot.

const fs   = require('fs');
const path = require('path');
const CACHE_FILE = process.argv[2] || 'cache/banknifty_5yr.json';
const raw  = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL  = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const SL_PTS    = 150;
const PTS_PER_RS = 15;

const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── V15 entry logic (PDR≥150, whipsaw guard, inside candles, late entries) ──
function findEntry(cs, prevCS) {
  const PH  = pdh(prevCS);
  const PL  = pdl(prevCS);
  const PDR = PH - PL;
  const C0  = cs[0];

  if (PDR < 150) return null;

  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;

  if (vsPDH > 0) {
    if (vsPDH < 120) return findInsideEntry(cs, PH, PL, 0);
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
    if (C0.high > PL) return findInsideEntry(cs, PH, PL, 0);
    return { idx: 0, side: 'PE' };
  }
  return findInsideEntry(cs, PH, PL, 0);
}

function findInsideEntry(cs, PH, PL, fromIdx) {
  const C0   = cs[0];
  const C0bp = bp(C0);
  const hwick = C0.high - Math.max(C0.open, C0.close);
  if (hwick > 0.55 * rng(C0) && C0bp < -20) return { idx: 0, side: 'PE' };
  if (Math.abs(C0bp) > 55) return { idx: 0, side: C0bp > 0 ? 'CE' : 'PE' };
  for (let i = 1; i <= Math.min(4, cs.length - 1); i++) {
    const cbp = bp(cs[i]);
    if (Math.abs(cbp) > 55) return { idx: i, side: cbp > 0 ? 'CE' : 'PE' };
  }
  // late inside entries (PDH/PDL break)
  for (let i = 5; i <= Math.min(20, cs.length - 2); i++) {
    const cbp = bp(cs[i]);
    if (cbp > 55 && cs[i].close > PH) return { idx: i, side: 'CE' };
    if (cbp < -55 && cs[i].close < PL) return { idx: i, side: 'PE' };
  }
  return null;
}

function findReEntry(cs, fromIdx, side) {
  const thresh = 40;
  for (let i = fromIdx; i <= Math.min(cs.length - 2, 22); i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp > thresh) return i;
    if (side === 'PE' && cbp < -thresh) return i;
  }
  return -1;
}

// ── HONEST calcPL: peak SET at close, CHECK at close, EXIT at close ──────────
function calcPL(candles, entryIdx, side, TRAIL_GAP) {
  const entryPrice = candles[entryIdx].close;
  const sign       = side === 'CE' ? 1 : -1;
  let peakPts  = 0;
  let trailStop = -SL_PTS;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c        = candles[i];
    const closePts = sign * (c.close - entryPrice);

    // Check exit BEFORE updating peak (so same-candle peak can't trigger same-candle exit)
    if (closePts <= trailStop) {
      if (trailStop > 0) {
        // Trail fired — exit at CLOSE price (honest: bot exits at close, not trail level)
        return { pl: closePts * PTS_PER_RS, exitType: 'TRAIL', exitIdx: i, peakPts };
      } else {
        // SL fired — exit at CLOSE price
        return { pl: closePts * PTS_PER_RS, exitType: 'SL', exitIdx: i, peakPts };
      }
    }

    // Update peak from close only (NO intrabar high)
    if (closePts > peakPts) {
      peakPts   = closePts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
  }

  const last = candles[candles.length - 1];
  const eodPts = sign * (last.close - entryPrice);
  return { pl: eodPts * PTS_PER_RS, exitType: 'EOD', exitIdx: candles.length - 1, peakPts };
}

// ── Run one TRAIL_GAP config ─────────────────────────────────────────────────
function runConfig(TRAIL_GAP, MAX_TRADES) {
  let totalPL = 0, wins = 0, losses = 0;
  let peakEq = 0, maxDD = 0;
  const yearly = {};

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = findEntry(cs, prev);
    if (!entry) continue;

    let dayPL = 0;
    let tradesThisDay = 0;

    const res1 = calcPL(cs, entry.idx, entry.side, TRAIL_GAP);
    dayPL += res1.pl;
    tradesThisDay++;

    let curExit = res1;
    let curSide = entry.side;

    // Same-direction re-entries (up to 5)
    for (let re = 0; re < 5; re++) {
      if (MAX_TRADES && tradesThisDay >= MAX_TRADES) break;
      if (curExit.exitType !== 'TRAIL' || curExit.pl <= 0) break;
      if (curExit.exitIdx >= cs.length - 2) break;
      const reIdx = findReEntry(cs, curExit.exitIdx + 1, curSide);
      if (reIdx < 0) break;
      const resRe = calcPL(cs, reIdx, curSide, TRAIL_GAP);
      dayPL += resRe.pl;
      tradesThisDay++;
      curExit = resRe;
    }

    // Reverse re-entry after big move (peak ≥ 100)
    if (curExit.exitType === 'TRAIL' && curExit.pl > 0 && curExit.peakPts >= 100
        && curExit.exitIdx < cs.length - 2
        && (!MAX_TRADES || tradesThisDay < MAX_TRADES)) {
      const revSide = curSide === 'CE' ? 'PE' : 'CE';
      const revIdx  = findReEntry(cs, curExit.exitIdx + 1, revSide);
      if (revIdx >= 0) {
        const resRev = calcPL(cs, revIdx, revSide, TRAIL_GAP);
        dayPL += resRev.pl;
        tradesThisDay++;
      }
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
  return { totalPL, wins, losses, wr: (wins/(wins+losses)*100).toFixed(1), maxDD, yearly, allPos };
}

// ── SWEEP ────────────────────────────────────────────────────────────────────
const GAPS = [10, 20, 30, 50, 75, 100, 125, 150, 175, 200];
const MAX_TRADES = 5;

console.log('\n  BHAV V15 — FULLY HONEST (close-peak, close-check, exit-at-close) + 5-trade cap');
console.log('  ════════════════════════════════════════════════════════════════════════════');
console.log('  Gap   5yr P&L         WR%    W/L         MaxDD         AllPos?');
console.log('  ────────────────────────────────────────────────────────────────────────');

let bestAllPos = null, bestAllPosGap = 0;
let bestOverall = null, bestOverallGap = 0;

for (const gap of GAPS) {
  const r = runConfig(gap, MAX_TRADES);
  const allPos = r.allPos ? '✅ YES' : '❌ NO ';
  const pl = `₹${Math.round(r.totalPL).toLocaleString('en-IN')}`;
  console.log(`  ${String(gap).padStart(3)}   ${pl.padEnd(16)} ${String(r.wr).padStart(5)}%  ${r.wins}W/${r.losses}L  ₹${Math.round(r.maxDD).toLocaleString('en-IN').padStart(10)}  ${allPos}`);

  if (r.allPos && (!bestAllPos || r.totalPL > bestAllPos.totalPL)) {
    bestAllPos = r; bestAllPosGap = gap;
  }
  if (!bestOverall || r.totalPL > bestOverall.totalPL) {
    bestOverall = r; bestOverallGap = gap;
  }
}

console.log('\n  ── BEST (all years positive) ───────────────────────────────────────────');
if (bestAllPos) {
  console.log(`  Gap = ${bestAllPosGap} → ₹${Math.round(bestAllPos.totalPL).toLocaleString('en-IN')} | WR ${bestAllPos.wr}% | MaxDD ₹${Math.round(bestAllPos.maxDD).toLocaleString('en-IN')}`);
  console.log('  Yearly:');
  for (const [yr, pl] of Object.entries(bestAllPos.yearly))
    console.log(`    ${yr}: ₹${Math.round(pl).toLocaleString('en-IN')} ${pl > 0 ? '+' : '-'}`);
} else {
  console.log('  No gap found with all years positive.');
}

console.log('\n  ── BEST OVERALL ────────────────────────────────────────────────────────');
console.log(`  Gap = ${bestOverallGap} → ₹${Math.round(bestOverall.totalPL).toLocaleString('en-IN')} | WR ${bestOverall.wr}% | MaxDD ₹${Math.round(bestOverall.maxDD).toLocaleString('en-IN')}`);

console.log('\n  ── HOW LIVE BOT BEHAVES with best gap ──────────────────────────────────');
const best = bestAllPos || bestOverall;
const bestGap = bestAllPos ? bestAllPosGap : bestOverallGap;
console.log(`  Trail gap = ${bestGap} pts`);
console.log(`  → After entry, trail activates once close is +${bestGap} pts above entry`);
console.log(`  → Trail locks in: if close then drops ${bestGap} pts below peak close → exit`);
console.log(`  → SL: if close drops 150 pts below entry → exit`);
console.log(`  → All checks happen at 15-min candle close (matches live bot exactly)`);
console.log(`  → Max 5 trades/day (matches live bot limit)`);
console.log(`  → Avg P&L per day: ₹${Math.round(best.totalPL / (best.wins + best.losses)).toLocaleString('en-IN')}`);
console.log(`  → Avg P&L per year: ₹${Math.round(best.totalPL / Object.keys(best.yearly).length).toLocaleString('en-IN')}`);

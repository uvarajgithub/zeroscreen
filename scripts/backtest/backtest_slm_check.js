'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_slm_check.js — CANDLE-BY-CANDLE SLM (STOP-LOSS-MARKET) SIMULATION
// ════════════════════════════════════════════════════════════════════════════
// Runs V15 (live strategy) with REALISTIC stop-order execution:
//
// For every exit candle, categorises HOW the SLM would actually fill:
//
//   AT_TRAIL      — SLM placed at trail level, price passed through intrabar
//                   → fills at trail level ✓ (₹40.5L scenario)
//
//   GAP_THROUGH   — candle OPENED already below trail
//                   → SLM fills at open price (worse than trail)
//
//   SAME_CANDLE   — peak was established FOR THE FIRST TIME this candle
//                   (SLM was still at SL level -150, new trail is positive)
//                   → no profit-level SLM was placed yet → fills at close
//
//   AT_SL         — SLM at SL level -150 fires intrabar → fills at SL level
//
//   GAP_PAST_SL   — candle opened already past SL level → fills at open
//
//   EOD           — end of day exit at close
//
// Compares three P&L numbers side-by-side:
//   1. TRAIL CREDIT  — original backtest (trail level, optimistic)
//   2. SLM REALISTIC — this simulation (realistic stop orders)
//   3. CLOSE ONLY    — actual close price (no stop orders, pessimistic)
//
// Usage: node backtest_slm_check.js cache/banknifty_5yr.json

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(process.cwd(), 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;
const TRAIL_GAP  = 10;   // V15 LOCK10

// ── Helpers ───────────────────────────────────────────────────────────────────
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── Three-way exit calculator ─────────────────────────────────────────────────
// Returns { trailPL, slmPL, closePL, exitIdx, exitType, category }
function calcPL_3way(candles, entryIdx, side, tGap) {
  const TGAP = tGap || TRAIL_GAP;
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peakPts   = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c        = candles[i];
    const oldTrail = trailStop;   // SLM level at START of this candle

    // Update peak and trail (using intrabar high/low — same as backtest)
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TGAP ? peakPts - TGAP : -SL_PTS;
    }

    const closePts = sign * (c.close - entryPrice);
    const openPts  = sign * (c.open  - entryPrice);

    if (closePts <= trailStop) {
      // Exit triggered this candle — determine realistic SLM fill
      let slmPts;
      let category;

      if (oldTrail > 0) {
        // ── Profit-level SLM was placed ───────────────────────────────────
        if (openPts <= oldTrail) {
          // Candle opened BELOW trail → gap-through → fills at open
          slmPts   = openPts;
          category = 'GAP_THROUGH';
        } else {
          // Price passed through trail intrabar → SLM fills at trail level ✓
          slmPts   = oldTrail;
          category = 'AT_TRAIL';
        }
      } else if (trailStop > 0) {
        // ── Peak established FOR FIRST TIME this candle ───────────────────
        // SLM was still at SL level -150.  New trail is positive but
        // no profit-level SLM was placed yet → exit at close price.
        slmPts   = closePts;
        category = 'SAME_CANDLE';
      } else {
        // ── SL territory (trailStop still -150) ──────────────────────────
        if (openPts <= oldTrail) {
          slmPts   = openPts;   // gapped past SL
          category = 'GAP_PAST_SL';
        } else {
          slmPts   = oldTrail;  // price passed through SL level intrabar
          category = 'AT_SL';
        }
      }

      // trailCredit: what original backtest used
      const trailCredit = trailStop > 0 ? trailStop : closePts;

      return {
        trailPL  : trailCredit * PTS_PER_RS,
        slmPL    : slmPts     * PTS_PER_RS,
        closePL  : closePts   * PTS_PER_RS,
        peakPts, exitIdx: i,
        exitType : trailStop > 0 ? 'TRAIL' : 'SL',
        category,
        oldTrail,
        newTrail : trailStop,
        openPts, closePts,
      };
    }
  }

  // EOD exit
  const last = candles[candles.length - 1];
  const eodPts = sign * (last.close - entryPrice);
  return {
    trailPL : eodPts * PTS_PER_RS,
    slmPL   : eodPts * PTS_PER_RS,
    closePL : eodPts * PTS_PER_RS,
    peakPts, exitIdx: candles.length - 1,
    exitType: 'EOD', category: 'EOD',
    oldTrail: trailStop, newTrail: trailStop,
    openPts: eodPts, closePts: eodPts,
  };
}

// ── Re-entry scanner ──────────────────────────────────────────────────────────
function findReEntry(cs, fromIdx, side, thresh) {
  const THRESH = thresh || 40;
  const maxIdx = Math.min(cs.length - 2, 22);
  for (let i = fromIdx; i <= maxIdx; i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp > THRESH) return i;
    if (side === 'PE' && cbp < -THRESH) return i;
  }
  return -1;
}

// ── Entry logic (V15 config) ──────────────────────────────────────────────────
function findEntry(cs, prevCS) {
  const PH  = pdh(prevCS);
  const PL  = pdl(prevCS);
  const PDR = PH - PL;
  const C0  = cs[0];

  if (PDR < 150) return null;

  // Whipsaw guard
  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const isAbove  = vsPDH > 0;
  const isBelow  = vsPDL < 0;

  if (isAbove) {
    const C0bp = bp(C0);
    if (vsPDH < 120) return findInsideEntry(cs, PH, PL, 0);
    if (vsPDH > 1000) return { idx: 0, side: 'CE' };
    if (C0bp > 85) return { idx: 0, side: 'CE' };
    return { idx: 0, side: 'PE' };
  }

  if (isBelow) {
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
  for (let i = 1; i <= Math.min(4, cs.length - 2); i++) {
    const cbp = bp(cs[i]);
    if (Math.abs(cbp) > 55) return { idx: i, side: cbp > 0 ? 'CE' : 'PE' };
  }
  // Late entry
  for (let i = 5; i <= Math.min(20, cs.length - 2); i++) {
    const cbp = bp(cs[i]);
    if (cbp > 55 && cs[i].close > PH) return { idx: i, side: 'CE' };
    if (cbp < -55 && cs[i].close < PL) return { idx: i, side: 'PE' };
  }
  return null;
}

// ── Run V15 with three-way accounting ─────────────────────────────────────────
function runV15(raw, ALL) {
  let totalTrail = 0, totalSLM = 0, totalClose = 0;
  let wins = 0, losses = 0, noTrade = 0;
  const cats = { AT_TRAIL: 0, GAP_THROUGH: 0, SAME_CANDLE: 0, AT_SL: 0, GAP_PAST_SL: 0, EOD: 0 };
  const catPL = { AT_TRAIL: 0, GAP_THROUGH: 0, SAME_CANDLE: 0, AT_SL: 0, GAP_PAST_SL: 0, EOD: 0 };
  let peakTrailPL = 0, maxDD_trail = 0;
  let peakSLM    = 0, maxDD_slm   = 0;
  const yearly = {};

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = findEntry(cs, prev);
    if (!entry) { noTrade++; continue; }

    let dayTrail = 0, daySLM = 0, dayClose = 0;

    function addTrade(idx, side) {
      const r = calcPL_3way(cs, idx, side, TRAIL_GAP);
      dayTrail += r.trailPL;
      daySLM   += r.slmPL;
      dayClose += r.closePL;
      cats[r.category]++;
      catPL[r.category] += r.slmPL;
      return r;
    }

    let curResult = addTrade(entry.idx, entry.side);
    let curSide   = entry.side;

    // Same-dir re-entries (up to 5)
    for (let re = 0; re < 5; re++) {
      if (curResult.exitType !== 'TRAIL' || curResult.slmPL <= 0) break;
      if (curResult.exitIdx >= cs.length - 2) break;
      const reIdx = findReEntry(cs, curResult.exitIdx + 1, curSide, 40);
      if (reIdx < 0) break;
      curResult = addTrade(reIdx, curSide);
    }

    // Reverse re-entry
    if (curResult.exitType === 'TRAIL' && curResult.peakPts >= 100 && curResult.slmPL > 0
        && curResult.exitIdx < cs.length - 2) {
      const revSide = curSide === 'CE' ? 'PE' : 'CE';
      const revIdx  = findReEntry(cs, curResult.exitIdx + 1, revSide, 40);
      if (revIdx >= 0) {
        curResult = addTrade(revIdx, revSide);
        if (curResult.exitType === 'TRAIL' && curResult.slmPL > 0 && curResult.exitIdx < cs.length - 2) {
          const reIdx2 = findReEntry(cs, curResult.exitIdx + 1, revSide, 40);
          if (reIdx2 >= 0) addTrade(reIdx2, revSide);
        }
      }
    }

    totalTrail += dayTrail;
    totalSLM   += daySLM;
    totalClose += dayClose;

    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = { trail: 0, slm: 0, close: 0 };
    yearly[yr].trail += dayTrail;
    yearly[yr].slm   += daySLM;
    yearly[yr].close += dayClose;

    if (daySLM > 0) wins++; else losses++;

    if (totalTrail > peakTrailPL) peakTrailPL = totalTrail;
    if (totalSLM   > peakSLM)     peakSLM     = totalSLM;
    const dd_t = peakTrailPL - totalTrail;
    const dd_s = peakSLM - totalSLM;
    if (dd_t > maxDD_trail) maxDD_trail = dd_t;
    if (dd_s > maxDD_slm)   maxDD_slm   = dd_s;
  }

  return { totalTrail, totalSLM, totalClose, wins, losses, noTrade,
           cats, catPL, maxDD_trail, maxDD_slm, yearly };
}

// ── Load & run ────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

const sep = '═'.repeat(80);
console.log('\n' + sep);
console.log('  BHAV V15 — CANDLE-BY-CANDLE SLM SIMULATION');
console.log('  Proving whether ₹40.5L is achievable with real stop orders');
console.log('  Data: BankNifty 5yr | ' + ALL[0] + ' → ' + ALL[ALL.length - 1]);
console.log(sep);

const r = runV15(raw, ALL);
const totalExits = Object.values(r.cats).reduce((a, b) => a + b, 0);

console.log('\n  ┌─────────────────────────────────────────────────────────┐');
console.log('  │  THREE-WAY P&L COMPARISON                               │');
console.log('  ├─────────────────────────────────────────────────────────┤');
console.log(`  │  1. Trail-credit  (original backtest)  : ₹${String(Math.round(r.totalTrail).toLocaleString('en-IN')).padStart(12)} │`);
console.log(`  │  2. SLM realistic (this simulation)    : ₹${String(Math.round(r.totalSLM).toLocaleString('en-IN')).padStart(12)} │`);
console.log(`  │  3. Close-only    (worst case)         : ₹${String(Math.round(r.totalClose).toLocaleString('en-IN')).padStart(12)} │`);
console.log('  └─────────────────────────────────────────────────────────┘');

const pct = (r.totalSLM / r.totalTrail * 100).toFixed(1);
console.log(`\n  SLM realistic captures ${pct}% of trail-credit P&L`);
console.log(`  Max DD (trail-credit): ₹${Math.round(r.maxDD_trail).toLocaleString('en-IN')}`);
console.log(`  Max DD (SLM realist) : ₹${Math.round(r.maxDD_slm).toLocaleString('en-IN')}`);
console.log(`  Win rate (SLM day)   : ${(r.wins / (r.wins + r.losses) * 100).toFixed(1)}%  (${r.wins}W/${r.losses}L)`);

console.log('\n  ┌────────────────────────────────────────────────────────────────────┐');
console.log('  │  EXIT CATEGORY BREAKDOWN (how each SLM exit filled)               │');
console.log('  ├─────────────────┬────────┬──────────┬──────────────────────────────┤');
console.log('  │ Category        │ Count  │  % exits │ Notes                        │');
console.log('  ├─────────────────┼────────┼──────────┼──────────────────────────────┤');

const catNotes = {
  AT_TRAIL    : 'SLM fills at trail level ✓  ',
  GAP_THROUGH : 'Opened below trail → fills open',
  SAME_CANDLE : 'Peak just formed → fills close',
  AT_SL       : 'SLM fills at SL level -150  ',
  GAP_PAST_SL : 'Opened past SL → fills open  ',
  EOD         : 'Day end → fills close        ',
};
for (const [cat, count] of Object.entries(r.cats)) {
  const pctCat = (count / totalExits * 100).toFixed(1);
  const pl = Math.round(r.catPL[cat]).toLocaleString('en-IN');
  console.log(`  │ ${cat.padEnd(15)} │ ${String(count).padStart(6)} │ ${pctCat.padStart(8)}% │ ${catNotes[cat]} │`);
}
console.log('  └─────────────────┴────────┴──────────┴──────────────────────────────┘');

console.log('\n  YEARLY BREAKDOWN:');
console.log(`  ${'Year'.padEnd(6)} ${'Trail-credit'.padStart(14)} ${'SLM-realistic'.padStart(15)} ${'Close-only'.padStart(12)}`);
console.log('  ' + '─'.repeat(50));
for (const [yr, y] of Object.entries(r.yearly).sort()) {
  console.log(
    `  ${yr.padEnd(6)}` +
    `${Math.round(y.trail).toLocaleString('en-IN').padStart(14)}` +
    `${Math.round(y.slm).toLocaleString('en-IN').padStart(15)}` +
    `${Math.round(y.close).toLocaleString('en-IN').padStart(12)}`
  );
}

console.log('\n' + sep);
console.log('  VERDICT:');
if (r.totalSLM > 3000000) {
  console.log(`  ✅ ₹40.5L IS achievable — SLM realistic = ₹${Math.round(r.totalSLM).toLocaleString('en-IN')}`);
  console.log(`     with real stop orders, you capture ${pct}% of the backtest P&L`);
} else if (r.totalSLM > 1000000) {
  console.log(`  ⚠️  PARTIAL — SLM realistic = ₹${Math.round(r.totalSLM).toLocaleString('en-IN')}`);
  console.log(`     ₹40.5L NOT fully achievable, but stop orders significantly help vs close-only`);
} else {
  console.log(`  ❌ ₹40.5L NOT achievable — SLM realistic = ₹${Math.round(r.totalSLM).toLocaleString('en-IN')}`);
  console.log(`     Stop orders do not rescue this strategy`);
}
console.log(sep + '\n');

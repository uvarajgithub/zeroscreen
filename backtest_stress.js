'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_stress.js — STRESS TEST ALL ASSUMPTIONS
// ════════════════════════════════════════════════════════════════════════════
// Strategy: SL=15pts, Target=175pts, Gap+Inside entry
// Tests EVERY assumption that could make the ₹3.31L number a lie:
//
// TEST 1 — Entry timing
//   Is it fair to enter at C0.close? Or must we use C0.open or C1.open?
//
// TEST 2 — SL slippage
//   SL=15 is tight. If fills slip 3/5/10 pts, does it survive?
//
// TEST 3 — Target slippage
//   If target fills 3/5 pts short (₹172 instead of ₹175), what happens?
//
// TEST 4 — Gap-through analysis
//   How often does the candle OPEN already below SL (order fills at open)?
//   If this is common → SL=15 is brutally punished.
//
// TEST 5 — Inside day isolation
//   Is the inside day contribution real or noise?
//
// TEST 6 — Yearly consistency
//   Is it positive every year? Any year where strategy fails?
//
// TEST 7 — Combined worst case
//   Entry at C1.open + SL slip +5 + Target slip -5 — still profitable?
//
// Usage: node backtest_stress.js cache/banknifty_5yr.json

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(__dirname, 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;

const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── Core exit: honest, with configurable slippage ─────────────────────────────
// entryPrice = actual price we enter at
// target     = pts above entry to take profit
// slPts      = pts below entry to stop out
// slSlip     = extra pts of adverse slip on SL fill (0 = perfect fill)
// tSlip      = pts we miss on target fill (0 = perfect fill)
function calcPL(candles, entryIdx, entryPrice, side, target, slPts, slSlip, tSlip) {
  const sign   = side === 'CE' ? 1 : -1;
  const tLevel = target  - tSlip;   // actual fill = slightly below target
  const sLevel = slPts   + slSlip;  // actual fill = slightly worse than SL

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const openPts  = sign * (c.open - entryPrice);
    const favHigh  = sign * (side === 'CE' ? c.high - entryPrice : entryPrice - c.low);
    const advLow   = sign * (side === 'CE' ? entryPrice - c.low  : c.high - entryPrice);

    const targetHit = favHigh >= target;   // check if candle reaches target level
    const slHit     = advLow  >= slPts;    // check if candle reaches SL level

    if (!targetHit && !slHit) continue;

    if (targetHit && !slHit) {
      // Target hit: fills at tLevel (or open if gapped above target)
      const fillPts = openPts >= target ? openPts : tLevel;
      return { pl: fillPts * PTS_PER_RS, exitType: 'TARGET', exitIdx: i };
    }

    if (slHit && !targetHit) {
      // SL hit: fills at -sLevel (or open if gapped below SL)
      const fillPts = openPts <= -slPts ? openPts - slSlip : -sLevel;
      return { pl: fillPts * PTS_PER_RS, exitType: 'SL', exitIdx: i };
    }

    // Both reachable: closer to open wins
    const distT = Math.abs(target - openPts);
    const distS = Math.abs(-slPts - openPts);
    if (distT <= distS) {
      const fillPts = openPts >= target ? openPts : tLevel;
      return { pl: fillPts * PTS_PER_RS, exitType: 'TARGET', exitIdx: i };
    } else {
      const fillPts = openPts <= -slPts ? openPts - slSlip : -sLevel;
      return { pl: fillPts * PTS_PER_RS, exitType: 'SL', exitIdx: i };
    }
  }

  const last   = candles[candles.length - 1];
  const eodPts = sign * (last.close - entryPrice);
  return { pl: eodPts * PTS_PER_RS, exitType: 'EOD', exitIdx: candles.length - 1 };
}

// ── Entry detection ───────────────────────────────────────────────────────────
function detectSignal(cs, prev) {
  const PH = pdh(prev), PL = pdl(prev), PDR = PH - PL;
  if (PDR < 150) return null;

  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;

  const open = cs[0].open;
  if (open > PH) return { sigIdx: 0, side: 'CE', type: 'GAP_UP' };
  if (open < PL) return { sigIdx: 0, side: 'PE', type: 'GAP_DOWN' };

  // Inside: first strong candle C0-C5
  if (open >= PL && open <= PH) {
    for (let i = 0; i < Math.min(6, cs.length - 1); i++) {
      const cbp = bp(cs[i]);
      if (cbp >  60) return { sigIdx: i, side: 'CE', type: 'INSIDE' };
      if (cbp < -60) return { sigIdx: i, side: 'PE', type: 'INSIDE' };
    }
  }
  return null;
}

// ── Run with specific entry price mode ───────────────────────────────────────
// entryMode: 'CLOSE' = signal candle close (current)
//            'OPEN'  = signal candle open (for C0 gap, you enter at open)
//            'NEXT'  = next candle's open (safest: confirm then enter)
function runAll(raw, ALL, entryMode, slPts, target, slSlip, tSlip) {
  let totalPL = 0, wins = 0, losses = 0, noTrade = 0;
  let peakPL = 0, maxDD = 0;
  let tHits = 0, slHits = 0, eodHits = 0;
  let gapThroughSL = 0;
  const yearly = {};

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const sig = detectSignal(cs, prev);
    if (!sig) { noTrade++; continue; }

    // Determine actual entry candle index and price
    let entryIdx, entryPrice;

    if (entryMode === 'CLOSE') {
      // Enter at signal candle close (current backtest assumption)
      entryIdx   = sig.sigIdx;
      entryPrice = cs[sig.sigIdx].close;
    } else if (entryMode === 'OPEN') {
      // Enter at signal candle open
      // For gap (C0): enter at 9:15 open — you see the gap immediately
      // For inside (Cx): enter at that candle's open
      entryIdx   = sig.sigIdx;
      entryPrice = cs[sig.sigIdx].open;
    } else { // NEXT
      // Enter at NEXT candle's open (most conservative — wait for signal candle to close)
      if (sig.sigIdx + 1 >= cs.length) { noTrade++; continue; }
      entryIdx   = sig.sigIdx;
      entryPrice = cs[sig.sigIdx + 1].open;  // next candle open
      // Process from next candle
    }

    const startIdx = entryMode === 'NEXT' ? sig.sigIdx + 1 : sig.sigIdx;
    const r = calcPL(cs, startIdx, entryPrice, sig.side, target, slPts, slSlip, tSlip);

    // Track gap-through SL
    if (r.exitType === 'SL') {
      const exitCandle = cs[r.exitIdx];
      const openPts    = (sig.side === 'CE' ? 1 : -1) * (exitCandle.open - entryPrice);
      if (openPts <= -slPts) gapThroughSL++;
    }

    totalPL += r.pl;
    if (r.pl > 0) wins++; else losses++;
    if (r.exitType === 'TARGET') tHits++;
    else if (r.exitType === 'SL') slHits++;
    else eodHits++;

    if (totalPL > peakPL) peakPL = totalPL;
    const dd = peakPL - totalPL;
    if (dd > maxDD) maxDD = dd;

    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = 0;
    yearly[yr] += r.pl;
  }

  const traded = wins + losses;
  return {
    totalPL, wins, losses, traded, noTrade,
    wr: traded > 0 ? (wins / traded * 100).toFixed(1) : '0',
    maxDD, tHits, slHits, eodHits, gapThroughSL, yearly
  };
}

// ── Load data ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

const SL = 15, TARGET = 175;
const sep  = '═'.repeat(110);
const sep2 = '─'.repeat(110);

function printRow(label, r) {
  const lots40L = r.totalPL > 0 ? Math.ceil(4000000 / r.totalPL) : 999;
  const verdict = r.totalPL > 0 ? (lots40L <= 20 ? `✅ ${lots40L} lots → ₹40L` : `⚠️  ${lots40L} lots`) : '❌ LOSS';
  console.log(
    `${label.padEnd(48)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(13)} ` +
    `${r.wr.padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(10)} ` +
    `  ${verdict}`
  );
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 1 — ENTRY TIMING
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 1 — ENTRY TIMING (SL=15, T=175, no slippage)');
console.log('  Question: Is entering at signal-candle CLOSE realistic?');
console.log(sep);
console.log(`${'Entry Mode'.padEnd(48)} ${'P&L(₹)'.padStart(13)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)}  Verdict`);
console.log(sep2);

printRow('Signal-candle CLOSE (current assumption)', runAll(raw, ALL, 'CLOSE', SL, TARGET, 0, 0));
printRow('Signal-candle OPEN  (enter at gap open)', runAll(raw, ALL, 'OPEN', SL, TARGET, 0, 0));
printRow('NEXT candle OPEN    (most conservative)', runAll(raw, ALL, 'NEXT', SL, TARGET, 0, 0));

// ════════════════════════════════════════════════════════════════════════════
// TEST 2 — SL SLIPPAGE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 2 — SL SLIPPAGE (Entry=CLOSE, T=175)');
console.log('  Question: SL=15 is tight. If fills slip, does it survive?');
console.log(sep);
console.log(`${'SL Scenario'.padEnd(48)} ${'P&L(₹)'.padStart(13)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)}  Verdict`);
console.log(sep2);

for (const slip of [0, 2, 3, 5, 8, 10, 15]) {
  const r = runAll(raw, ALL, 'CLOSE', SL, TARGET, slip, 0);
  printRow(`SL fills ${SL+slip} pts below entry (${slip > 0 ? '+' : ''}${slip} slip)`, r);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 3 — TARGET SLIPPAGE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 3 — TARGET SLIPPAGE (Entry=CLOSE, SL=15 exact)');
console.log('  Question: If limit order fills slightly short of target?');
console.log(sep);
console.log(`${'Target Scenario'.padEnd(48)} ${'P&L(₹)'.padStart(13)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)}  Verdict`);
console.log(sep2);

for (const slip of [0, 2, 3, 5, 10]) {
  const r = runAll(raw, ALL, 'CLOSE', SL, TARGET, 0, slip);
  printRow(`Target fills ${TARGET-slip} pts (${slip > 0 ? '-' : ''}${slip} slip)`, r);
}

// ════════════════════════════════════════════════════════════════════════════
// TEST 4 — GAP-THROUGH SL ANALYSIS
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 4 — GAP-THROUGH SL ANALYSIS (Entry=CLOSE, SL=15, T=175)');
console.log('  Question: How often does candle OPEN already past the 15-pt SL?');
console.log(sep);

const base = runAll(raw, ALL, 'CLOSE', SL, TARGET, 0, 0);
const gapPct = (base.gapThroughSL / base.slHits * 100).toFixed(1);
console.log(`  Total SL exits       : ${base.slHits}`);
console.log(`  Gap-through SL exits : ${base.gapThroughSL}  (${gapPct}% of SL exits — candle opened past SL)`);
console.log(`  Normal SL exits      : ${base.slHits - base.gapThroughSL}  (${(100 - parseFloat(gapPct)).toFixed(1)}% — stop order fills correctly at SL)`);
console.log('');
console.log('  For gap-through: SL fills at candle open (worse than 15 pts — HONEST in current backtest ✓)');
console.log('  For normal SL : fills at exactly entry-15 pts (stop order ✓)');

// ════════════════════════════════════════════════════════════════════════════
// TEST 5 — INSIDE vs GAP-ONLY ISOLATION
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 5 — INSIDE DAY CONTRIBUTION (SL=15, T=175, Entry=CLOSE)');
console.log('  Question: Is the inside day edge real or random noise?');
console.log(sep);
console.log(`${'Entry Type'.padEnd(48)} ${'P&L(₹)'.padStart(13)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)}  Verdict`);
console.log(sep2);

// Gap-only
function runGapOnly(raw, ALL, slPts, target) {
  let totalPL = 0, wins = 0, losses = 0, noTrade = 0, peakPL = 0, maxDD = 0;
  let tHits = 0, slHits = 0, eodHits = 0;
  const yearly = {};
  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di], cs = raw[date], prev = raw[ALL[di-1]];
    if (!cs || !prev || cs.length < 2) continue;
    const PH = pdh(prev), PL = pdl(prev);
    if (PH - PL < 150) { noTrade++; continue; }
    const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
    let whip = 0;
    for (let i = 1; i < bps.length; i++)
      if (bps[i]*bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
    if (whip >= 2) { noTrade++; continue; }
    const open = cs[0].open;
    let side = null;
    if (open > PH) side = 'CE';
    else if (open < PL) side = 'PE';
    if (!side) { noTrade++; continue; }
    const entryPrice = cs[0].close;
    const r = calcPL(cs, 0, entryPrice, side, target, slPts, 0, 0);
    totalPL += r.pl;
    if (r.pl > 0) wins++; else losses++;
    if (r.exitType === 'TARGET') tHits++; else if (r.exitType === 'SL') slHits++; else eodHits++;
    if (totalPL > peakPL) peakPL = totalPL;
    const dd = peakPL - totalPL; if (dd > maxDD) maxDD = dd;
    const yr = date.slice(0,4); if (!yearly[yr]) yearly[yr] = 0; yearly[yr] += r.pl;
  }
  const traded = wins + losses;
  return { totalPL, wins, losses, traded, wr: traded > 0 ? (wins/traded*100).toFixed(1) : '0', maxDD, tHits, slHits, eodHits, gapThroughSL: 0, yearly };
}

const gapOnly   = runGapOnly(raw, ALL, SL, TARGET);
const gapInside = runAll(raw, ALL, 'CLOSE', SL, TARGET, 0, 0);
printRow('Gap days only (above PDH / below PDL)', gapOnly);
printRow('Gap + Inside days combined', gapInside);
const insideContrib = gapInside.totalPL - gapOnly.totalPL;
console.log(`\n  Inside day contribution: ₹${Math.round(insideContrib).toLocaleString('en-IN')} over 5 years`);
console.log(`  Extra inside trades    : ${gapInside.traded - gapOnly.traded}`);
console.log(`  ${insideContrib > 0 ? '✅ Inside days ADD value' : '❌ Inside days HURT — drop them'}`);

// ════════════════════════════════════════════════════════════════════════════
// TEST 6 — YEARLY CONSISTENCY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 6 — YEARLY CONSISTENCY (Entry=CLOSE, SL=15, T=175)');
console.log('  Question: Profitable every year or does it fail in some years?');
console.log(sep);

const r6 = runAll(raw, ALL, 'CLOSE', SL, TARGET, 0, 0);
let negYears = 0;
for (const [yr, pl] of Object.entries(r6.yearly).sort()) {
  const bar = pl > 0
    ? '█'.repeat(Math.min(50, Math.round(pl/4000))) + `  +₹${Math.round(pl).toLocaleString('en-IN')}`
    : '░'.repeat(Math.min(25, Math.round(-pl/2000))) + `  -₹${Math.round(-pl).toLocaleString('en-IN')}`;
  if (pl < 0) negYears++;
  console.log(`  ${yr}  ${bar}`);
}
console.log(`\n  ${negYears === 0 ? '✅ Profitable EVERY year — strategy is consistent' : `⚠️  ${negYears} losing year(s) — check stability`}`);

// ════════════════════════════════════════════════════════════════════════════
// TEST 7 — COMBINED WORST CASE
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  TEST 7 — COMBINED WORST-CASE STRESS TEST');
console.log('  All bad assumptions applied simultaneously');
console.log(sep);
console.log(`${'Scenario'.padEnd(48)} ${'P&L(₹)'.padStart(13)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)}  Verdict`);
console.log(sep2);

printRow('BEST CASE: CLOSE, SL exact, Target exact',     runAll(raw, ALL, 'CLOSE', SL, TARGET, 0,  0));
printRow('Moderate:  CLOSE, SL+3,     Target-3',         runAll(raw, ALL, 'CLOSE', SL, TARGET, 3,  3));
printRow('Realistic: NEXT,  SL+3,     Target-3',         runAll(raw, ALL, 'NEXT',  SL, TARGET, 3,  3));
printRow('Stressful: NEXT,  SL+5,     Target-5',         runAll(raw, ALL, 'NEXT',  SL, TARGET, 5,  5));
printRow('WORST CASE:NEXT,  SL+10,    Target-10',        runAll(raw, ALL, 'NEXT',  SL, TARGET, 10, 10));

// ════════════════════════════════════════════════════════════════════════════
// FINAL SUMMARY
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  STRESS TEST SUMMARY — CAN WE TRUST ₹3.31L / LOTS→₹40L?');
console.log(sep);
const realistic = runAll(raw, ALL, 'NEXT', SL, TARGET, 3, 3);
const lots40L   = realistic.totalPL > 0 ? Math.ceil(4000000 / realistic.totalPL) : 999;
console.log(`\n  Best case (original backtest)    : ₹${Math.round(runAll(raw, ALL, 'CLOSE', SL, TARGET, 0, 0).totalPL).toLocaleString('en-IN')}`);
console.log(`  Realistic (next-open + 3pt slip) : ₹${Math.round(realistic.totalPL).toLocaleString('en-IN')}`);
console.log(`  Worst case (next-open + 10pt)    : ₹${Math.round(runAll(raw, ALL, 'NEXT', SL, TARGET, 10, 10).totalPL).toLocaleString('en-IN')}`);
console.log('');
if (realistic.totalPL > 0) {
  console.log(`  ✅ Strategy survives realistic conditions`);
  console.log(`  ✅ Lots needed for ₹40L (realistic): ${lots40L} lots`);
  console.log(`  ✅ Capital needed: ₹${Math.round(realistic.maxDD * lots40L * 3).toLocaleString('en-IN')}`);
} else {
  console.log(`  ❌ Strategy FAILS under realistic conditions — not ready`);
}
console.log(sep + '\n');

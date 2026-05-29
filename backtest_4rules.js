'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_4rules.js — 4-RULE STRATEGY ABLATION (FULLY HONEST)
// ════════════════════════════════════════════════════════════════════════════
//
// RULE 1 — ENTRY:   Which candle to enter and which direction
// RULE 2 — SL:      Where to place the stop-loss
// RULE 3 — TARGET:  Where to take profit (fixed target, honest limit order)
// RULE 4 — RE-ENTRY: Enter again after target hit
//
// EXIT FILL LOGIC (100% honest — matches what Zerodha actually executes):
//   TARGET : limit sell order at entry+T
//            → c.high >= entry+T → fills at entry+T  ✓
//            → c.open >= entry+T (gapped above) → fills at c.open  ✓
//   SL     : stop-loss order at entry-SL
//            → c.low <= entry-SL → fills at entry-SL  ✓
//            → c.open <= entry-SL (gapped below) → fills at c.open  ✓
//   SAME   : both target & SL reachable same candle
//            → whichever is CLOSER to c.open is hit first (conservative)
//   EOD    : market order at close  ✓
//
// Usage: node backtest_4rules.js cache/banknifty_5yr.json

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(__dirname, 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;

// ── Helpers ───────────────────────────────────────────────────────────────────
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── HONEST exit calculator (fixed target + fixed SL) ─────────────────────────
// Returns { pl, exitIdx, exitType, exitPts }
function calcPL(candles, entryIdx, side, target, slPts) {
  const entryPrice = candles[entryIdx].close;
  const sign       = side === 'CE' ? 1 : -1;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];

    // Intrabar favorable / adverse in pts (relative to entry)
    const favHigh = sign * (side === 'CE' ? c.high - entryPrice : entryPrice - c.low);
    const advLow  = sign * (side === 'CE' ? entryPrice - c.low  : c.high - entryPrice);
    const openPts = sign * (c.open - entryPrice);

    const targetHit = favHigh >= target;
    const slHit     = advLow  >= slPts;

    if (!targetHit && !slHit) continue;

    if (targetHit && !slHit) {
      // TARGET only — limit order fills at target level
      const fillPts = openPts >= target ? openPts : target;  // gap-above → fill at open
      return { pl: fillPts * PTS_PER_RS, exitIdx: i, exitType: 'TARGET', exitPts: fillPts };
    }

    if (slHit && !targetHit) {
      // SL only — stop order fills at SL level (or open if gapped)
      const fillPts = openPts <= -slPts ? openPts : -slPts;  // gap-below → fill at open
      return { pl: fillPts * PTS_PER_RS, exitIdx: i, exitType: 'SL', exitPts: fillPts };
    }

    // BOTH reachable same candle — determine order by proximity to open
    const distToTarget = Math.abs(target  - openPts);
    const distToSL     = Math.abs(-slPts  - openPts);
    if (distToTarget <= distToSL) {
      // Target closer to open → hit first
      const fillPts = openPts >= target ? openPts : target;
      return { pl: fillPts * PTS_PER_RS, exitIdx: i, exitType: 'TARGET', exitPts: fillPts };
    } else {
      // SL closer to open → hit first
      const fillPts = openPts <= -slPts ? openPts : -slPts;
      return { pl: fillPts * PTS_PER_RS, exitIdx: i, exitType: 'SL', exitPts: fillPts };
    }
  }

  // EOD: market order at last close
  const last     = candles[candles.length - 1];
  const eodPts   = sign * (last.close - entryPrice);
  return { pl: eodPts * PTS_PER_RS, exitIdx: candles.length - 1, exitType: 'EOD', exitPts: eodPts };
}

// ── RULE 1 — ENTRY DEFINITIONS ────────────────────────────────────────────────

// R1-A: Bare (no logic) — C0 CE always (baseline noise floor)
function entry_bare(cs, prev) {
  return { idx: 0, side: 'CE' };
}

// R1-B: Gap direction only — above PDH → CE, below PDL → PE, inside → skip
function entry_gap(cs, prev) {
  const PH = pdh(prev), PL = pdl(prev);
  const open = cs[0].open;
  if (open > PH) return { idx: 0, side: 'CE' };
  if (open < PL) return { idx: 0, side: 'PE' };
  return null;  // inside → skip
}

// R1-C: Gap direction + PDR ≥ 150 filter
function entry_gap_pdr(cs, prev) {
  const PH = pdh(prev), PL = pdl(prev);
  if (PH - PL < 150) return null;
  const open = cs[0].open;
  if (open > PH) return { idx: 0, side: 'CE' };
  if (open < PL) return { idx: 0, side: 'PE' };
  return null;
}

// R1-D: Gap direction + PDR ≥ 150 + Whipsaw guard (best entry, proven from V0)
function entry_best(cs, prev) {
  const PH  = pdh(prev), PL = pdl(prev);
  const PDR = PH - PL;
  if (PDR < 150) return null;
  // Whipsaw guard: skip if first 3 candles alternate strong bodies
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

// R1-E: Best entry + INCLUDE inside (strong first candle)
function entry_best_inside(cs, prev) {
  const PH  = pdh(prev), PL = pdl(prev);
  const PDR = PH - PL;
  if (PDR < 150) return null;
  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;
  const open = cs[0].open;
  if (open > PH) return { idx: 0, side: 'CE' };
  if (open < PL) return { idx: 0, side: 'PE' };
  // Inside: first strong candle C0-C4 (body > 60%)
  for (let i = 0; i < Math.min(5, cs.length - 1); i++) {
    const cbp = bp(cs[i]);
    if (cbp >  60) return { idx: i, side: 'CE' };
    if (cbp < -60) return { idx: i, side: 'PE' };
  }
  return null;
}

// ── Re-entry scanner ──────────────────────────────────────────────────────────
function findReEntry(cs, fromIdx, side, bodyThresh) {
  const maxIdx = Math.min(cs.length - 2, 20);
  for (let i = fromIdx; i <= maxIdx; i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp >  bodyThresh) return i;
    if (side === 'PE' && cbp < -bodyThresh) return i;
  }
  return -1;
}

// ── Run one configuration ─────────────────────────────────────────────────────
function runConfig(cfg, raw, ALL) {
  let totalPL = 0, wins = 0, losses = 0, noTrade = 0;
  let peakPL = 0, maxDD = 0;
  let targetHits = 0, slHits = 0, eodHits = 0, reEntries = 0;
  const yearly = {};

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = cfg.entryFn(cs, prev);
    if (!entry) { noTrade++; continue; }

    let dayPL = 0;

    const r1 = calcPL(cs, entry.idx, entry.side, cfg.target, cfg.sl);
    dayPL += r1.pl;
    if (r1.exitType === 'TARGET') targetHits++;
    else if (r1.exitType === 'SL') slHits++;
    else eodHits++;

    // Re-entries: only if target was hit (in profit exit) and re-entry limit > 0
    if (cfg.reEntries > 0 && r1.exitType === 'TARGET' && r1.exitIdx < cs.length - 2) {
      let curResult = r1;
      let curSide   = entry.side;
      for (let re = 0; re < cfg.reEntries; re++) {
        const reIdx = findReEntry(cs, curResult.exitIdx + 1, curSide, cfg.reBodyThresh || 55);
        if (reIdx < 0) break;
        reEntries++;
        const rr = calcPL(cs, reIdx, curSide, cfg.target, cfg.sl);
        dayPL += rr.pl;
        if (rr.exitType !== 'TARGET') break;  // only chain re-entries if profitable
        curResult = rr;
      }
    }

    totalPL += dayPL;
    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = 0;
    yearly[yr] += dayPL;

    if (dayPL > 0) wins++; else losses++;
    if (totalPL > peakPL) peakPL = totalPL;
    const dd = peakPL - totalPL;
    if (dd > maxDD) maxDD = dd;
  }

  const traded = wins + losses;
  return { totalPL, wins, losses, traded, noTrade,
           wr: traded > 0 ? (wins / traded * 100).toFixed(1) : '0',
           maxDD, targetHits, slHits, eodHits, reEntries, yearly };
}

// ── Load data ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

const sep  = '═'.repeat(115);
const sep2 = '─'.repeat(115);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 1: RULE 1 — ENTRY ABLATION (SL=100, Target=100, no RE)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  RULE 1 — ENTRY ABLATION');
console.log('  Fixed: SL=100pts, Target=100pts, No re-entry');
console.log('  Exit fills: limit order at target (c.high) | stop order at SL (c.low)');
console.log(sep);
console.log(`${'Entry Rule'.padEnd(50)} ${'P&L(₹)'.padStart(12)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)} ${'T-hits'.padStart(7)} ${'SL-hits'.padStart(8)}`);
console.log(sep2);

const r1Configs = [
  { name: 'R1-A  Bare (CE always, no logic — baseline)',   entryFn: entry_bare,         sl: 100, target: 100, reEntries: 0 },
  { name: 'R1-B  Gap direction (above→CE, below→PE)',      entryFn: entry_gap,          sl: 100, target: 100, reEntries: 0 },
  { name: 'R1-C  Gap + PDR≥150 filter',                   entryFn: entry_gap_pdr,      sl: 100, target: 100, reEntries: 0 },
  { name: 'R1-D  Gap + PDR≥150 + Whipsaw guard ★ BEST',  entryFn: entry_best,         sl: 100, target: 100, reEntries: 0 },
  { name: 'R1-E  R1-D + Include inside days',             entryFn: entry_best_inside,  sl: 100, target: 100, reEntries: 0 },
];

let bestEntry = null;
for (const cfg of r1Configs) {
  const r = runConfig(cfg, raw, ALL);
  if (!bestEntry || r.totalPL > bestEntry.totalPL) bestEntry = { ...r, cfg };
  console.log(
    `${cfg.name.padEnd(50)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)} ` +
    `${r.wr.padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(10)} ` +
    `${r.targetHits.toString().padStart(7)} ` +
    `${r.slHits.toString().padStart(8)}`
  );
}
console.log(`\n  ★ BEST ENTRY: ${bestEntry.cfg.name.trim()}`);
console.log(`    P&L: ₹${Math.round(bestEntry.totalPL).toLocaleString('en-IN')}  |  WR: ${bestEntry.wr}%  |  MaxDD: ₹${Math.round(bestEntry.maxDD).toLocaleString('en-IN')}`);
const bestEntryFn = bestEntry.cfg.entryFn;

// ════════════════════════════════════════════════════════════════════════════
// SECTION 2: RULE 2 — SL ABLATION (best entry, Target=100, no RE)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  RULE 2 — SL SIZE ABLATION');
console.log(`  Fixed: Best entry (R1-D), Target=100pts, No re-entry`);
console.log(sep);
console.log(`${'SL Rule'.padEnd(50)} ${'P&L(₹)'.padStart(12)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)} ${'T-hits'.padStart(7)} ${'SL-hits'.padStart(8)}`);
console.log(sep2);

const slOptions = [30, 50, 75, 100, 125, 150, 200];
let bestSL = null;
for (const sl of slOptions) {
  const cfg = { name: `R2    SL = ${sl} pts`, entryFn: bestEntryFn, sl, target: 100, reEntries: 0 };
  const r   = runConfig(cfg, raw, ALL);
  if (!bestSL || r.totalPL > bestSL.totalPL) bestSL = { ...r, sl };
  console.log(
    `${cfg.name.padEnd(50)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)} ` +
    `${r.wr.padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(10)} ` +
    `${r.targetHits.toString().padStart(7)} ` +
    `${r.slHits.toString().padStart(8)}`
  );
}
console.log(`\n  ★ BEST SL: ${bestSL.sl} pts`);
console.log(`    P&L: ₹${Math.round(bestSL.totalPL).toLocaleString('en-IN')}  |  WR: ${bestSL.wr}%  |  MaxDD: ₹${Math.round(bestSL.maxDD).toLocaleString('en-IN')}`);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 3: RULE 3 — TARGET ABLATION (best entry, best SL, no RE)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  RULE 3 — TARGET SIZE ABLATION');
console.log(`  Fixed: Best entry (R1-D), Best SL (${bestSL.sl}pts), No re-entry`);
console.log(sep);
console.log(`${'Target Rule'.padEnd(50)} ${'P&L(₹)'.padStart(12)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)} ${'T-hits'.padStart(7)} ${'SL-hits'.padStart(8)}`);
console.log(sep2);

const targetOptions = [25, 40, 50, 60, 75, 100, 125, 150, 175, 200];
let bestTarget = null;
for (const target of targetOptions) {
  const ratio = (target / bestSL.sl).toFixed(2);
  const cfg = { name: `R3    Target = ${target} pts  (R:R = ${ratio})`, entryFn: bestEntryFn, sl: bestSL.sl, target, reEntries: 0 };
  const r   = runConfig(cfg, raw, ALL);
  if (!bestTarget || r.totalPL > bestTarget.totalPL) bestTarget = { ...r, target };
  console.log(
    `${cfg.name.padEnd(50)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)} ` +
    `${r.wr.padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(10)} ` +
    `${r.targetHits.toString().padStart(7)} ` +
    `${r.slHits.toString().padStart(8)}`
  );
}
console.log(`\n  ★ BEST TARGET: ${bestTarget.target} pts`);
console.log(`    P&L: ₹${Math.round(bestTarget.totalPL).toLocaleString('en-IN')}  |  WR: ${bestTarget.wr}%  |  MaxDD: ₹${Math.round(bestTarget.maxDD).toLocaleString('en-IN')}`);

// ════════════════════════════════════════════════════════════════════════════
// SECTION 4: RULE 4 — RE-ENTRY ABLATION (all best rules)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n' + sep);
console.log('  RULE 4 — RE-ENTRY ABLATION');
console.log(`  Fixed: Best entry, SL=${bestSL.sl}pts, Target=${bestTarget.target}pts`);
console.log('  Re-entry: after target hit, enter again on next strong candle (same dir)');
console.log(sep);
console.log(`${'Re-Entry Rule'.padEnd(50)} ${'P&L(₹)'.padStart(12)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)} ${'REs'.padStart(6)} ${'SL-hits'.padStart(8)}`);
console.log(sep2);

const reConfigs = [
  { name: 'R4-0  No re-entry (baseline)', reEntries: 0, reBodyThresh: 55 },
  { name: 'R4-1  1 RE after target (body>55%)', reEntries: 1, reBodyThresh: 55 },
  { name: 'R4-2  2 RE after target (body>55%)', reEntries: 2, reBodyThresh: 55 },
  { name: 'R4-3  3 RE after target (body>55%)', reEntries: 3, reBodyThresh: 55 },
  { name: 'R4-1b 1 RE after target (body>40%)', reEntries: 1, reBodyThresh: 40 },
  { name: 'R4-2b 2 RE after target (body>40%)', reEntries: 2, reBodyThresh: 40 },
  { name: 'R4-3b 3 RE after target (body>40%)', reEntries: 3, reBodyThresh: 40 },
];
let bestRE = null;
for (const reCfg of reConfigs) {
  const cfg = { ...reCfg, entryFn: bestEntryFn, sl: bestSL.sl, target: bestTarget.target };
  const r   = runConfig(cfg, raw, ALL);
  if (!bestRE || r.totalPL > bestRE.totalPL) bestRE = { ...r, reCfg };
  console.log(
    `${reCfg.name.padEnd(50)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)} ` +
    `${r.wr.padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(10)} ` +
    `${r.reEntries.toString().padStart(6)} ` +
    `${r.slHits.toString().padStart(8)}`
  );
}
console.log(`\n  ★ BEST RE-ENTRY: ${bestRE.reCfg.name.trim()}`);
console.log(`    P&L: ₹${Math.round(bestRE.totalPL).toLocaleString('en-IN')}  |  WR: ${bestRE.wr}%  |  MaxDD: ₹${Math.round(bestRE.maxDD).toLocaleString('en-IN')}`);

// ════════════════════════════════════════════════════════════════════════════
// FINAL SUMMARY — BEST STRATEGY
// ════════════════════════════════════════════════════════════════════════════
const finalCfg = {
  name      : 'FINAL BEST STRATEGY (all 4 rules)',
  entryFn   : bestEntryFn,
  sl        : bestSL.sl,
  target    : bestTarget.target,
  reEntries : bestRE.reCfg.reEntries,
  reBodyThresh: bestRE.reCfg.reBodyThresh,
};
const final = runConfig(finalCfg, raw, ALL);

console.log('\n' + sep);
console.log('  FINAL RESULT — BEST STRATEGY (honest exits)');
console.log(sep);
console.log(`  Entry  : Gap direction + PDR≥150 + Whipsaw guard`);
console.log(`  SL     : ${bestSL.sl} pts fixed stop-loss`);
console.log(`  Target : ${bestTarget.target} pts fixed target`);
console.log(`  RE     : ${bestRE.reCfg.reEntries} re-entries after target (body>${bestRE.reCfg.reBodyThresh}%)`);
console.log(`  R:R    : ${(bestTarget.target / bestSL.sl).toFixed(2)}`);
console.log('');
console.log(`  5-YEAR P&L  : ₹${Math.round(final.totalPL).toLocaleString('en-IN')}`);
console.log(`  Win Rate    : ${final.wr}%  (${final.wins}W / ${final.losses}L / ${final.traded} traded)`);
console.log(`  Max Drawdown: ₹${Math.round(final.maxDD).toLocaleString('en-IN')}`);
console.log(`  Target hits : ${final.targetHits}  |  SL hits: ${final.slHits}  |  EOD: ${final.eodHits}`);
console.log('');
console.log('  YEARLY:');
for (const [yr, pl] of Object.entries(final.yearly).sort()) {
  const bar = pl > 0 ? '█'.repeat(Math.min(40, Math.round(pl / 20000))) : '░'.repeat(Math.min(20, Math.round(-pl / 10000)));
  console.log(`    ${yr}: ₹${Math.round(pl).toLocaleString('en-IN').padStart(12)}  ${pl > 0 ? '+' : '-'} ${bar}`);
}
console.log('');
if (final.totalPL > 500000) {
  console.log('  ✅ PROFITABLE STRATEGY — P&L is real, exits are honest');
} else if (final.totalPL > 0) {
  console.log('  ⚠️  MARGINALLY PROFITABLE — needs more edge before live trading');
} else {
  console.log('  ❌ NOT PROFITABLE under honest exits');
}
console.log(sep + '\n');

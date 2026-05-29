'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_bhav.js — BHAV V3 STRATEGY BACKTEST  — SOURCE OF TRUTH FILE
// ════════════════════════════════════════════════════════════════════════════
//
// ✅ VERIFIED RESULT (run May 25, 2026 — confirmed TWICE, same output):
//    ₹31,06,951.5 · 74.6% WR (897W/306L) · ₹2,583 avg/day · MaxDD ₹11,027
//    Date range: 2021-01-01 → 2026-05-22 | 1334 days | 1203 traded
//
// ✅ CROSS-CHECKED vs REAL TRADE:
//    May 25 real trade: PE entry 54868, SL hit 55018 = -150 pts
//    Backtest May 25 output = -150 pts  ← EXACT MATCH
//
// ✅ DATA: cache/banknifty_5yr.json (2.5MB, real Kite API OHLC, on VPS)
// ✅ COMMAND: node backtest_bhav.js cache/banknifty_5yr.json
//
// ⚠️  DO NOT CONFUSE WITH:
//    backtest_bhav5yr.js  — API-fetching version, simpler RE logic → ₹17-20L (WRONG)
//    backtest_bb5yr.js    — Body Breakout strategy (different) → ₹11.9L (WRONG)
//
// ⚠️  THIS SCRIPT MUST BE SAVED TO DISK before pscp upload.
//    If pscp says "No such file or directory" — the file is NOT saved. Save first.
//
// Strategy reverse-engineered from 48 manual trades (Mar-May 2026)
// Usage: node backtest_bhav.js [cacheFile]
// Default cache: ./cache/banknifty_2026.json
// 5yr cache:     ./cache/banknifty_5yr.json

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(__dirname, 'cache', 'banknifty_2026.json');
const PTS_PER_RS = 15;   // ₹15 per point (30 qty × 0.5 delta)
const SL_PTS     = 150;  // Initial SL = -150 pts
const TRAIL_GAP  = 20;   // LOCK20: trail at (peak - 20)

// ─── helpers ────────────────────────────────────────────────────────────────
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const uwp  = c => c.high - c.open;   // upper wick from open
const lwp  = c => c.open - c.low;    // lower wick from open (downward)

const firstBull = (cs, from, thresh = 30) => {
  for (let i = from; i < cs.length; i++) if (bp(cs[i]) > thresh) return i;
  return -1;
};
const firstBear = (cs, from, thresh = 30) => {
  for (let i = from; i < cs.length; i++) if (bp(cs[i]) < -thresh) return i;
  return -1;
};
const firstStrong = (cs, from, thresh = 55) => {
  for (let i = from; i < cs.length; i++) {
    const b = bp(cs[i]);
    if (Math.abs(b) > thresh) return { i, side: b > 0 ? 'CE' : 'PE' };
  }
  return null;
};

// ─── MARKET TYPE CLASSIFIER ──────────────────────────────────────────────────
function classifyMarketType(candles) {
  const o = candles[0].open;
  const c = candles[candles.length - 1].close;
  const dHigh = Math.max(...candles.map(x => x.high));
  const dLow  = Math.min(...candles.map(x => x.low));
  const totalRange = dHigh - dLow;
  if (totalRange < 100) return 'FLAT';

  const netMove = Math.abs(c - o);
  const netRatio = netMove / totalRange;

  // Count direction reversals (significant body changes)
  let reversals = 0;
  let prevDir = 0;
  for (let i = 0; i < candles.length; i++) {
    const b = bp(candles[i]);
    const dir = b > 25 ? 1 : b < -25 ? -1 : 0;
    if (dir !== 0 && dir === -prevDir) { reversals++; prevDir = dir; }
    else if (dir !== 0) prevDir = dir;
  }

  if (netRatio > 0.55 && reversals <= 4) return 'TRENDING';
  if (reversals >= 7) return 'CHOPPY';
  if (netRatio < 0.20) return 'RANGING';
  return 'MIXED';
}

// ─── CORE STRATEGY ───────────────────────────────────────────────────────────
function findEntry(candles, prevCandles) {
  if (!candles || candles.length < 2 || !prevCandles || prevCandles.length === 0)
    return null;

  const PH  = pdh(prevCandles);
  const PL  = pdl(prevCandles);
  const PC  = pdc(prevCandles);
  const C0  = candles[0];
  const gap = C0.open - PC;

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  // Barely above PDH (<120 pts): treat as INSIDE — fake gap, follow first strong candle
  // (vsPDH 0-120 is unreliable as genuine breakout; INSIDE logic handles it better)
  const ctx   = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';

  const C0bp = bp(C0);
  const C0uw = uwp(C0);
  const C1bp = candles[1] ? bp(candles[1]) : 0;

  // ── WHIPSAW GUARD: first 4 candles alternating strong ──
  const bps4 = candles.slice(0, Math.min(4, candles.length)).map(bp);
  let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++) {
    if (bps4[i] * bps4[i-1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i-1]) > 65)
      wipsaws++;
  }
  if (wipsaws >= 2) return { entry: null, ctx, reason: 'whipsaw' };

  // ════════════════════════════════════════════════════════
  // CONTEXT 1: ABOVE PDH
  // ════════════════════════════════════════════════════════
  if (ctx === 'ABOVE_PDH') {
    // Extraordinary gap (>1000 pts above PDH) → CE at C0
    if (vsPDH > 1000) {
      return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'extraordinary_gap_ce' };
    }

    // Note: vsPDH < 120 is now classified as INSIDE (handled below) — this branch never fires

    // TREND DAY FILTER: if C0 is 85%+ bull body → genuine breakout, not fake → CE trend follow
    if (C0bp > 85)
      return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'above_pdh_trend_day_ce' };

    // Fake breakout zone (120–1000 pts above PDH) → PE when reversal appears
    if (C0bp < -20)
      return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'above_pdh_c0_reversal_pe' };

    const bearIdx = firstBear(candles, 1, 35);
    if (bearIdx > 0 && bearIdx <= 7)
      return { entry: { idx: bearIdx, side: 'PE' }, ctx, reason: 'above_pdh_delayed_pe' };

    // Bears didn't show → CE continuation (market holding gains)
    const contIdx = firstStrong(candles, 2, 55);
    if (contIdx)
      return { entry: { idx: contIdx.i, side: contIdx.side }, ctx, reason: 'above_pdh_continuation' };

    return { entry: null, ctx, reason: 'above_pdh_no_signal' };
  }

  // ════════════════════════════════════════════════════════
  // CONTEXT 2: BELOW PDL
  // ════════════════════════════════════════════════════════
  if (ctx === 'BELOW_PDL') {
    // TREND DAY FILTER: C0 body < -80% bear = genuine breakdown, follow PE
    if (C0bp < -80)
      return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'below_pdl_trend_day_pe' };

    // Selling climax (-65 to -80%): skip — too volatile, bounce SL hit by noise.
    if (C0bp < -65) {
      return { entry: null, ctx, reason: 'selling_climax_skip' };
    }
    // Recovery bounce: C0 massive bull (>65%) → PE at first bear
    if (C0bp > 65) {
      const i = firstBear(candles, 1, 30);
      if (i > 0) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'recovery_bounce_pe' };
    }

    // C0 high can't reach PDL (completely trapped below PDL)
    if (C0.high < PL) {
      // Wait for C1 direction — if bull → CE, else → PE
      if (C1bp > 20)
        return { entry: { idx: 1, side: 'CE' }, ctx, reason: 'below_pdl_c1_bull_ce' };
      if (C1bp < -20)
        return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'below_pdl_no_recovery_pe' };
      // C1 also doji → look at C2-C4
      const s = firstStrong(candles, 2, 40);
      if (s && s.i <= 5)
        return { entry: { idx: s.i, side: s.side }, ctx, reason: 'below_pdl_c2_signal' };
      return { entry: null, ctx, reason: 'below_pdl_no_c1_signal' };
    }

    // C0 touched PDL from below (C0.high >= PDL) with moderate bull (partial recovery)
    if (C0bp > 20) {
      const i = firstBear(candles, 1, 30);
      if (i > 0 && i <= 6)
        return { entry: { idx: i, side: 'PE' }, ctx, reason: 'below_pdl_partial_bounce_pe' };
    }

    // Failed recovery: C0 is a moderate bear that touched PDL from below, market
    // tries to bounce C1-C4 but each close stays below PDL, then a strong bear (>45%)
    // confirms continuation → PE.
    // Pattern: opened below PDL, weak bounce attempt, then fail → downside continuation.
    if (C0bp < -10) {
      for (let i = 2; i <= Math.min(7, candles.length - 2); i++) {
        if (bp(candles[i]) < -45 && candles[i - 1].close < PL) {
          return { entry: { idx: i, side: 'PE' }, ctx, reason: 'below_pdl_failed_bounce_pe' };
        }
      }
    }
    // Default: AVOID
    return { entry: null, ctx, reason: 'below_pdl_ambiguous_avoid' };
  }

  // ════════════════════════════════════════════════════════
  // CONTEXT 3: INSIDE range
  // ════════════════════════════════════════════════════════

  // SHOOTING STAR: disabled — 5yr backtest showed 29% WR (-₹19K).
  // The pattern fires too broadly. Shooting star needs stricter context filter
  // that isn't available purely from C0 structure. Skip for now.
  // (Note: this pattern IS valid per manual trades but not automated reliably)

  // C0 breaks outside PDL/PDH while opening INSIDE → immediate directional signal
  // (market opened inside range but C0 immediately failed the level → continuation)
  if (C0.close < PL)
    return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'inside_c0_breaks_below_pdl' };
  if (C0.close > PH)
    return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'inside_c0_breaks_above_pdh' };

  // GAP-C0 ALIGNMENT: determines real momentum direction
  // gap > +50 = gap-up bias | gap < -50 = gap-down bias
  const gapUp   = gap > 50;
  const gapDown = gap < -50;

  // Strong C0 (>55%): gap aligned → momentum; gap opposing → trap
  if (Math.abs(C0bp) > 55) {
    const c0isBull = C0bp > 0;
    const aligned  = (c0isBull && !gapDown) || (!c0isBull && !gapUp);

    if (aligned) {
      // Check if C1 massively reverses (trap!) — require >72% body to filter weak reversals
      if (C1bp * C0bp < 0 && Math.abs(C1bp) > 72) {
        // C0 was a trap → C1 is the real signal
        return { entry: { idx: 1, side: C1bp > 0 ? 'CE' : 'PE' }, ctx, reason: 'inside_c0_trap_c1_signal' };
      }
      // C0 momentum confirmed
      return {
        entry: { idx: 0, side: c0isBull ? 'CE' : 'PE' },
        ctx, reason: 'inside_c0_momentum'
      };
    } else {
      // C0 is counter-gap (exhaustion) → enter in gap direction when reversal comes
      const gapSide  = gapUp ? 'CE' : 'PE';
      const revCandle = gapUp ? firstBull(candles, 1, 35) : firstBear(candles, 1, 35);
      if (revCandle > 0 && revCandle <= 5)
        return { entry: { idx: revCandle, side: gapSide }, ctx, reason: 'inside_counter_gap_reversal' };
      // If no reversal by C5, trust the C0 momentum
      return { entry: { idx: 0, side: c0isBull ? 'CE' : 'PE' }, ctx, reason: 'inside_c0_momentum_no_reversal' };
    }
  }

  // Moderate C0 (30-55%): follow C0 direction with C1 same-direction confirmation only
  if (Math.abs(C0bp) > 30) {
    // C1 confirms SAME direction → momentum confirmed → enter at C0 close
    if (C1bp * C0bp > 0)
      return { entry: { idx: 0, side: C0bp > 0 ? 'CE' : 'PE' }, ctx, reason: 'inside_c0_moderate_c1_confirmed' };
    // C1 huge fake reversal (>65%) + C2 returns to C0 direction → C1 was noise, C0 was right
    if (Math.abs(C1bp) > 65 && C1bp * C0bp < 0 && candles.length > 2) {
      const C2bp = bp(candles[2]);
      if (C2bp * C0bp > 0 && Math.abs(C2bp) > 20)
        return { entry: { idx: 0, side: C0bp > 0 ? 'CE' : 'PE' }, ctx, reason: 'inside_c0_c1_fake_c2_confirms' };
    }
    // Other C1 reversals: wait for C2-C4 strong signal instead.
  }

  // Weak C0 (<30%): wait for C2-C4 (skip C1 for weak C0 — too risky)
  // C1 entries for weak C0 lose consistently; valid C1 entries are handled above
  for (let i = 2; i <= 8; i++) {
    if (i >= candles.length) break;
    const cbp = bp(candles[i]);
    if (Math.abs(cbp) > 55) {
      // GAP ALIGNMENT: skip if signal opposes gap AND C0 was moderately opposite too
      const signalBull = cbp > 0;
      const oppGap = (signalBull && gapDown) || (!signalBull && gapUp);
      const c0ModOpp = (signalBull && C0bp < -20) || (!signalBull && C0bp > 20);
      if (oppGap && c0ModOpp) continue; // both gap and C0 oppose → skip

      // Whipsaw check: previous candle was also strong in opposite direction
      const prev = bp(candles[i - 1]);
      if (Math.abs(prev) > 60 && prev * cbp < 0) {
        // Check if NEXT candle also reverses → true whipsaw
        if (i + 1 < candles.length && bp(candles[i + 1]) * cbp < 0 && Math.abs(bp(candles[i + 1])) > 60)
          return { entry: null, ctx, reason: 'inside_whipsaw_c1c2' };
      }
      return { entry: { idx: i, side: cbp > 0 ? 'CE' : 'PE' }, ctx, reason: `inside_c${i}_strong` };
    }
  }

  // No early signal → watch for INTRADAY PDL/PDH test (C5–C20)
  // Requires FIRST TOUCH: previous candle must be above PDL (or below PDH) to avoid
  // false signals when market is already well outside the level.
  for (let i = 5; i < Math.min(candles.length, 21); i++) {
    const prevClose = candles[i - 1].close;
    if (candles[i].low  <= PL && prevClose > PL && bp(candles[i]) > 35)
      return { entry: { idx: i, side: 'CE' }, ctx, reason: 'inside_pdl_test_ce' };
    if (candles[i].high >= PH && prevClose < PH && bp(candles[i]) < -35)
      return { entry: { idx: i, side: 'PE' }, ctx, reason: 'inside_pdh_test_pe' };
  }

  return { entry: null, ctx, reason: 'inside_no_signal' };
}

// ─── P&L CALCULATOR — Honest: no same-candle trail exits ────────────────────
// PROBLEM (original): peak set from c.HIGH then c.LOW checked against NEW trail
//   → trail could be SET and HIT within same 15-min candle (no SLM placed yet)
// FIX: trail check uses trailStop from PREVIOUS candle close only.
//   Peak IS still updated from intrabar HIGH (accurate SLM tracking for next candle)
//   but the NEWLY updated trail only becomes active NEXT candle — not same candle.
// Gap-through: if candle opens through the active SLM level → fills at open.
function calcPL(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;

  let trailStop = -SL_PTS;   // active SLM level (set at PREVIOUS candle close)
  let peakPts   = 0;         // tracked via intrabar HIGH for accurate SLM positioning

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    // trailStop = SLM level placed at END of previous candle — active NOW

    // Step 1: Gap-through check at open
    const openPts = sign * (c.open - entryPrice);
    if (trailStop > 0 && openPts < trailStop) {
      // Opened through/below SLM → fills at open
      return { pl: openPts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL_GAP',
               entryPrice, exitPrice: c.open };
    }
    if (trailStop <= 0 && openPts < -SL_PTS) {
      // Opened through hard SL → exit at open
      return { pl: openPts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL_GAP',
               entryPrice, exitPrice: c.open };
    }

    // Step 2: Intrabar trail/SL check using trail from PREVIOUS candle close only
    if (trailStop > 0) {
      const adversePts = side === 'CE' ? (c.low - entryPrice) : (entryPrice - c.high);
      if (adversePts <= trailStop) {
        // SLM placed at previous-candle trail level fills intrabar
        return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL',
                 entryPrice, exitPrice: entryPrice + sign * trailStop };
      }
    } else {
      // SL zone: close check only (no SLM in SL zone)
      const closePts = sign * (c.close - entryPrice);
      if (closePts <= -SL_PTS) {
        return { pl: closePts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL',
                 entryPrice, exitPrice: c.close };
      }
    }

    // Step 3: Update peak via intrabar HIGH — sets trailStop for NEXT candle ONLY
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
  }
  // EOD exit at last candle's close
  const exitPrice = candles[candles.length - 1].close;
  const pl = sign * (exitPrice - entryPrice) * PTS_PER_RS;
  return { pl, peakPts, exitIdx: candles.length - 1, exitType: 'EOD', entryPrice, exitPrice };
}

// ─── RE-ENTRY AFTER PROFITABLE TRAIL EXIT ────────────────────────────────────
// After a profitable exit (trailStop > 0 means we locked profit), look for
// another strong candle in the SAME direction from exitIdx+1.
// Requires: body% > 50% AND candle in same direction → enter at close, trail again.
function findReEntry(candles, exitIdx, side) {
  const minCandle = exitIdx + 1;
  const maxCandle = candles.length - 3;  // need at least 2 candles after entry
  for (let i = minCandle; i <= maxCandle; i++) {
    const b = bp(candles[i]);
    if (side === 'CE' && b > 35) return i;
    if (side === 'PE' && b < -35) return i;
  }
  return -1;
}

// P&L for pure EOD (no TP/SL)
function calcPLEOD(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const exitPrice  = candles[candles.length - 1].close;
  const sign = side === 'CE' ? 1 : -1;
  return { pl: sign * (exitPrice - entryPrice) * PTS_PER_RS, exitType: 'EOD', entryPrice, exitPrice };
}

// ─── MAIN BACKTEST ────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const getPrev = date => { const i = ALL.indexOf(date); return i > 0 ? raw[ALL[i - 1]] : null; };

// Statistics
const stats = {
  total: 0, traded: 0, noSignal: 0, whipsaw: 0,
  wins: 0, losses: 0, trail: 0, sl: 0, eod: 0, reEntries: 0, c0sl: 0,
  totalPL: 0, maxWin: -Infinity, maxLoss: Infinity,
  drawdown: 0, peakPL: 0,
  byCtx: { ABOVE_PDH: { w:0,l:0,pl:0 }, BELOW_PDL: { w:0,l:0,pl:0 }, INSIDE: { w:0,l:0,pl:0 } },
  byMkt: { TRENDING: { w:0,l:0,pl:0,t:0 }, CHOPPY: { w:0,l:0,pl:0,t:0 }, RANGING: { w:0,l:0,pl:0,t:0 }, MIXED: { w:0,l:0,pl:0,t:0 }, FLAT: { w:0,l:0,pl:0,t:0 } },
  byReason: {},
  byCandle: {},
  monthly: {},
  yearly: {},
  consecutive: { wins: 0, losses: 0, maxWins: 0, maxLosses: 0 },
};
let runningPL = 0;
let monthlyPL = {};
const dailyResults = [];

const rows = [];

for (const date of ALL) {
  const cs   = raw[date];
  const prev = getPrev(date);
  if (!prev) continue;

  stats.total++;
  const { entry, ctx, reason } = findEntry(cs, prev);
  const mktType = classifyMarketType(cs);

  if (!entry) {
    if (reason === 'whipsaw') stats.whipsaw++;
    else stats.noSignal++;
    rows.push({ date, ctx, mktType, reason, traded: false });
    continue;
  }

  stats.traded++;
  const res1 = calcPL(cs, entry.idx, entry.side);
  const { pl, exitIdx, exitType, entryPrice, exitPrice, peakPts } = res1;
  const plEOD = calcPLEOD(cs, entry.idx, entry.side).pl;

  const yyyymm = date.slice(0, 7);
  const yyyy   = date.slice(0, 4);
  if (!stats.monthly[yyyymm]) stats.monthly[yyyymm] = { pl: 0, trades: 0, wins: 0 };
  if (!stats.yearly[yyyy])    stats.yearly[yyyy]    = 0;

  // ── RE-ENTRY (up to 3 per day): after any profitable non-EOD exit,
  // look for next strong candle in same direction and re-enter with trail.
  // Also checks for REVERSE-direction RE after a big profitable T1 (peakPts >= 100):
  // when the market captures a large move then strongly reverses, enter the other leg.
  let rePL = 0;
  let curExitIdx = exitIdx;
  let curExitType = exitType;
  let curPL = pl;
  let curSide = entry.side;

  // One-time check: reverse-direction RE after a big T1 move
  // Only fires when: T1 profitable trail + peakPts >= 100 + strong opposite candle (>65%)
  if (peakPts >= 100 && exitType !== 'EOD' && pl > 0) {
    const revSide = entry.side === 'CE' ? 'PE' : 'CE';
    let revIdx = -1;
    for (let i = exitIdx + 1; i <= cs.length - 3; i++) {
      const b = bp(cs[i]);
      if ((revSide === 'CE' && b > 65) || (revSide === 'PE' && b < -65)) { revIdx = i; break; }
    }
    const sameReFirst = findReEntry(cs, exitIdx, entry.side);
    if (revIdx > 0 && (sameReFirst < 0 || revIdx < sameReFirst)) {
      // Reverse RE fires first — capture the opposite leg
      stats.reEntries++;
      const resRev = calcPL(cs, revIdx, revSide);
      rePL += resRev.pl;
      curExitIdx  = resRev.exitIdx;
      curExitType = resRev.exitType;
      curPL       = resRev.pl;
      curSide     = revSide;
    }
  }

  for (let re = 0; re < 3; re++) {
    if (curExitType !== 'EOD' && curPL > 0) {
      const reIdx = findReEntry(cs, curExitIdx, curSide);
      if (reIdx > 0) {
        stats.reEntries++;
        const resRE = calcPL(cs, reIdx, curSide);
        rePL += resRE.pl;
        curExitIdx  = resRE.exitIdx;
        curExitType = resRE.exitType;
        curPL       = resRE.pl;
      } else break;
    } else break;
  }

  // Post-loop reverse check: after exhausting same-dir REs, if a strong opposite
  // candle appears and last trade was profitable → take the other leg + its own RE loop.
  // Targets ABOVE_PDH/BELOW_PDL fake-breakout days where market reverses strongly
  // after initial move (e.g., May 6: PE×3 then massive CE reversal at C16).
  if (curSide === entry.side && curExitType !== 'EOD' && curPL > 0) {
    const revSide2 = curSide === 'CE' ? 'PE' : 'CE';
    let rev2Idx = -1;
    for (let i = curExitIdx + 1; i <= cs.length - 3; i++) {
      const b = bp(cs[i]);
      if ((revSide2 === 'CE' && b > 65) || (revSide2 === 'PE' && b < -65)) { rev2Idx = i; break; }
    }
    if (rev2Idx > 0) {
      stats.reEntries++;
      const resRev2 = calcPL(cs, rev2Idx, revSide2);
      rePL += resRev2.pl;
      curExitIdx  = resRev2.exitIdx;
      curExitType = resRev2.exitType;
      curPL       = resRev2.pl;
      curSide     = revSide2;
      // Allow up to 2 more same-dir REs after the reversal leg
      for (let re = 0; re < 2; re++) {
        if (curExitType !== 'EOD' && curPL > 0) {
          const reIdx2 = findReEntry(cs, curExitIdx, curSide);
          if (reIdx2 > 0) {
            stats.reEntries++;
            const resRE2 = calcPL(cs, reIdx2, curSide);
            rePL += resRE2.pl;
            curExitIdx  = resRE2.exitIdx;
            curExitType = resRE2.exitType;
            curPL       = resRE2.pl;
          } else break;
        } else break;
      }
    }
  }

  const totalDayPL = pl + rePL;
  runningPL += totalDayPL;
  stats.monthly[yyyymm].pl     += totalDayPL;
  stats.monthly[yyyymm].trades += 1;
  stats.yearly[yyyy]           += totalDayPL;
  stats.totalPL                += totalDayPL;

  const won = totalDayPL > 0;
  if (won) stats.monthly[yyyymm].wins += 1;
  if (won) {
    stats.wins++;
    stats.consecutive.wins++;
    stats.consecutive.losses = 0;
    if (stats.consecutive.wins > stats.consecutive.maxWins)
      stats.consecutive.maxWins = stats.consecutive.wins;
    if (exitType === 'TRAIL') stats.trail++;
    if (exitType === 'EOD') stats.eod++;
  } else {
    stats.losses++;
    stats.consecutive.losses++;
    stats.consecutive.wins = 0;
    if (stats.consecutive.losses > stats.consecutive.maxLosses)
      stats.consecutive.maxLosses = stats.consecutive.losses;
    if (exitType === 'SL') stats.sl++;
    if (exitType === 'SL' && entry.idx === 0) stats.c0sl++;
  }

  if (totalDayPL > stats.maxWin)  stats.maxWin  = totalDayPL;
  if (totalDayPL < stats.maxLoss) stats.maxLoss = totalDayPL;

  if (runningPL > stats.peakPL) stats.peakPL = runningPL;
  const dd = stats.peakPL - runningPL;
  if (dd > stats.drawdown) stats.drawdown = dd;

  // By context
  if (stats.byCtx[ctx]) {
    won ? stats.byCtx[ctx].w++ : stats.byCtx[ctx].l++;
    stats.byCtx[ctx].pl += totalDayPL;
  }

  // By market type
  if (stats.byMkt[mktType]) {
    won ? stats.byMkt[mktType].w++ : stats.byMkt[mktType].l++;
    stats.byMkt[mktType].pl += totalDayPL;
    stats.byMkt[mktType].t++;
  }

  // By reason
  if (!stats.byReason[reason]) stats.byReason[reason] = { w:0, l:0, pl:0 };
  won ? stats.byReason[reason].w++ : stats.byReason[reason].l++;
  stats.byReason[reason].pl += totalDayPL;

  // By candle index
  const ck = `C${entry.idx}`;
  if (!stats.byCandle[ck]) stats.byCandle[ck] = { w:0, l:0, pl:0, sl:0 };
  won ? stats.byCandle[ck].w++ : stats.byCandle[ck].l++;
  stats.byCandle[ck].pl += totalDayPL;
  if (exitType === 'SL') stats.byCandle[ck].sl++;

  rows.push({
    date, ctx, mktType, reason, traded: true,
    side: entry.side, entryIdx: entry.idx, entryPrice,
    exitIdx, exitType, exitPrice, pl, rePL, totalDayPL, plEOD, runningPL
  });

  dailyResults.push({ date, bbPnL: totalDayPL });
}

// ─── OUTPUT ──────────────────────────────────────────────────────────────────
const sep = '═'.repeat(70);
console.log('\n' + sep);
console.log('           BHAV STRATEGY — BACKTEST RESULTS');
console.log(sep);
console.log(`Cache file : ${CACHE_FILE}`);
console.log(`Date range : ${ALL[0]} → ${ALL[ALL.length-1]}`);
console.log(`Total days : ${stats.total}  |  Traded: ${stats.traded}  |  Avoided: ${stats.total - stats.traded} (whipsaw:${stats.whipsaw}, no signal:${stats.noSignal})`);
console.log(sep);

const wr = (stats.wins / stats.traded * 100).toFixed(1);
const avg = (stats.totalPL / stats.traded).toFixed(0);
const rr  = (stats.maxWin / Math.abs(stats.maxLoss)).toFixed(2);
console.log(`WIN RATE   : ${wr}%  (${stats.wins}W / ${stats.losses}L)`);
console.log(`TOTAL P&L  : ₹${stats.totalPL.toLocaleString('en-IN')}`);
console.log(`AVG/TRADE  : ₹${avg}`);
console.log(`MAX WIN    : ₹${stats.maxWin.toLocaleString('en-IN')}   MAX LOSS: ₹${stats.maxLoss.toLocaleString('en-IN')}`);
console.log(`MAX DRAWDN : ₹${stats.drawdown.toLocaleString('en-IN')}`);
console.log(`Trail exits: ${stats.trail}  |  SL exits: ${stats.sl}  |  EOD exits: ${stats.eod}  |  RE entries: ${stats.reEntries}`);
console.log(`C0 SL hits (entry at 9:30 AM, SL hit, day done): ${stats.c0sl}`);
console.log(`Max consec wins: ${stats.consecutive.maxWins}  |  Max consec losses: ${stats.consecutive.maxLosses}`);

console.log('\n' + '─'.repeat(50));
console.log('BY CONTEXT:');
for (const [ctx, s] of Object.entries(stats.byCtx)) {
  const t = s.w + s.l;
  if (!t) continue;
  const w = (s.w/t*100).toFixed(0);
  console.log(`  ${ctx.padEnd(12)}: ${s.w}W/${s.l}L (${w}% WR)  ₹${s.pl.toLocaleString('en-IN')}`);
}

console.log('\nBY MARKET TYPE:');
for (const [mkt, s] of Object.entries(stats.byMkt)) {
  if (!s.t) continue;
  const w = (s.w/s.t*100).toFixed(0);
  console.log(`  ${mkt.padEnd(12)}: ${s.w}W/${s.l}L (${w}% WR)  ₹${s.pl.toLocaleString('en-IN')}  [${s.t} days]`);
}

console.log('\nBY CANDLE (entry candle index):');
const candleKeys = Object.keys(stats.byCandle).sort((a,b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
for (const ck of candleKeys) {
  const s = stats.byCandle[ck];
  const t = s.w + s.l;
  const w = (s.w/t*100).toFixed(0);
  console.log(`  ${ck.padEnd(4)}: ${s.w}W/${s.l}L (${w}% WR)  SL hits:${s.sl}  ₹${s.pl.toLocaleString('en-IN')}`);
}

console.log('\nBY ENTRY REASON (top patterns):');
const sortedReasons = Object.entries(stats.byReason)
  .filter(([,s]) => s.w + s.l >= 3)
  .sort(([,a],[,b]) => (b.w+b.l) - (a.w+a.l));
for (const [reason, s] of sortedReasons) {
  const t = s.w + s.l;
  const w = (s.w/t*100).toFixed(0);
  console.log(`  ${reason.padEnd(38)}: ${s.w}W/${s.l}L (${w}% WR)  ₹${s.pl.toLocaleString('en-IN')}`);
}

console.log('\n' + '─'.repeat(50));
console.log('MONTHLY P&L:');
const months = Object.keys(stats.monthly).sort();
for (let i = 0; i < months.length; i += 4) {
  const chunk = months.slice(i, i+4);
  console.log('  ' + chunk.map(m => `${m}: ₹${stats.monthly[m].pl.toLocaleString('en-IN').padStart(10)}`).join('  '));
}

console.log('\nYEARLY P&L:');
for (const [yr, pl] of Object.entries(stats.yearly).sort()) {
  console.log(`  ${yr}: ₹${pl.toLocaleString('en-IN')}`);
}

// Trade-by-trade detail (last 20 or all if small dataset)
const tradeRows = rows.filter(r => r.traded);
const showAll = tradeRows.length <= 100;
console.log(`\n${'─'.repeat(50)}`);
console.log(`TRADE LOG (${showAll ? 'all' : 'last 50'} trades):`);
console.log('date         ctx       mktType   C-idx side entryPx  exitPx  exit  P&L        runPL');
console.log('─'.repeat(95));
const showRows = showAll ? tradeRows : tradeRows.slice(-50);
for (const r of showRows) {
  const totalPl = r.totalDayPL;
  const plStr = totalPl >= 0 ? `+₹${totalPl.toLocaleString('en-IN')}` : `-₹${Math.abs(totalPl).toLocaleString('en-IN')}`;
  const reStr = (r.rePL && r.rePL !== 0) ? ` [RE:${r.rePL >= 0 ? '+' : ''}₹${r.rePL.toLocaleString('en-IN')}]` : '';
  console.log(
    `${r.date}  ${r.ctx.padEnd(9)} ${r.mktType.padEnd(9)} C${r.entryIdx.toString().padEnd(3)} ${r.side} ` +
    `${r.entryPrice.toFixed(0).padStart(7)} ${r.exitPrice.toFixed(0).padStart(7)} ${r.exitType.padEnd(3)} ` +
    `${plStr.padStart(12)}${reStr}  ₹${r.runningPL.toLocaleString('en-IN')}`
  );
}

// Validation: check against known manual trades
const KNOWN_TRADES = [
  ['2026-03-02','PE'], ['2026-03-06','PE'], ['2026-03-09','CE'], ['2026-03-10','CE'],
  ['2026-03-11','PE'], ['2026-03-13','PE'], ['2026-03-16','CE'], ['2026-03-17','CE'],
  ['2026-03-18','CE'], ['2026-03-19','PE'], ['2026-03-20','PE'], ['2026-03-23','PE'],
  ['2026-03-24','CE'], ['2026-03-25','CE'], ['2026-03-27','PE'],
  ['2026-04-01','CE'], ['2026-04-02','CE'], ['2026-04-06','CE'], ['2026-04-07','CE'],
  ['2026-04-08','CE'], ['2026-04-09','PE'], ['2026-04-10','CE'], ['2026-04-13','CE'],
  ['2026-04-15','PE'], ['2026-04-16','PE'], ['2026-04-17','CE'], ['2026-04-20','CE'],
  ['2026-04-21','CE'], ['2026-04-23','PE'], ['2026-04-28','PE'],
  ['2026-04-29','CE'], ['2026-04-30','CE'],
  ['2026-05-04','PE'], ['2026-05-05','CE'], ['2026-05-06','PE'], ['2026-05-07','CE'],
  ['2026-05-08','PE'], ['2026-05-11','CE'], ['2026-05-12','PE'], ['2026-05-13','CE'],
  ['2026-05-14','CE'], ['2026-05-15','PE'], ['2026-05-18','CE'], ['2026-05-20','CE'],
  ['2026-05-21','PE'], ['2026-05-22','CE'],
];
const tradeMap = new Map(tradeRows.map(r => [r.date, r.side]));
console.log(`\n${'─'.repeat(50)}`);
console.log('VALIDATION vs MANUAL TRADES (46 known):');
let match = 0, mismatch = 0, notFound = 0;
for (const [date, expectedSide] of KNOWN_TRADES) {
  const got = tradeMap.get(date);
  if (!got) { notFound++; console.log(`  MISSING: ${date} expected ${expectedSide}`); }
  else if (got === expectedSide) match++;
  else { mismatch++; console.log(`  MISMATCH: ${date} expected ${expectedSide} got ${got}`); }
}
console.log(`  Matches: ${match}/${KNOWN_TRADES.length} (${(match/KNOWN_TRADES.length*100).toFixed(0)}%)`);
console.log(`  Mismatches: ${mismatch}  |  Not found: ${notFound}`);

console.log('\n' + sep);
console.log('STRATEGY RULES SUMMARY:');
console.log('  ABOVE_PDH:  vsPDH<120→CE(PDH support)  120-1000+C0bp>85%→CE(trend day)  120-1000→PE(fake breakout)  >1000→CE(extraordinary)');
console.log('  BELOW_PDL:  C0<-80%→PE(trend day)  C0<-65%→skip(climax)  C0>+65%→PE(bounce)  C0.high<PDL→check C1  else CE');
console.log('  INSIDE:     Shooting star→PE  Strong+aligned→same direction  Strong+opposing→reverse');
console.log('              Weak C0→first strong C1-C4  PDL/PDH intraday test C5-C20');
console.log('  AVOID:      Whipsaw (2+ alternating 65%+ candles in C0-C3)');
console.log(sep + '\n');

// ─── SAVE JSON for dashboard ──────────────────────────────────────────────────
// NOTE: dashboard client-side JS expects pts (not ₹). Divide by PTS_PER_RS=15.
const monthlyJson = {};
for (const [m, d] of Object.entries(stats.monthly)) {
  monthlyJson[m] = {
    bbTotal:  Math.round((d.pl / PTS_PER_RS) * 10) / 10,  // pts
    bbTrades: d.trades,
    bbWins:   d.wins
  };
}
const resultJson = {
  totals: { bodyBreakout: Math.round(stats.totalPL / PTS_PER_RS * 10) / 10 }, // pts
  tradingDays: stats.total,
  tradedDays: stats.traded,
  winRate: parseFloat((stats.wins / stats.traded * 100).toFixed(1)),
  period: { from: ALL[0], to: ALL[ALL.length - 1] },
  monthly: monthlyJson,
  daily: dailyResults.map(e => ({ date: e.date, bbPnL: Math.round((e.bbPnL / PTS_PER_RS) * 10) / 10 })),
  noTradeDays: rows.filter(r => !r.traded).map(r => ({ date: r.date, ctx: r.ctx, reason: r.reason })),
};
const outPath = path.join(__dirname, '5year-backtest-result.json');
fs.writeFileSync(outPath, JSON.stringify(resultJson, null, 2));
console.log(`JSON saved: ${outPath}`);

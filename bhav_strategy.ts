// bhav_strategy.ts — BHAV v3 Live Strategy
// Translated from backtest_bhav.js (74.6% WR, ₹31L / 5yr)
// Strategy entry: PDH/PDL context + 15-candle pattern detection
// Trail: LOCK20 (peak - 20), candle-close SL only

export interface BhavCandle {
  open: number; high: number; low: number; close: number;
}

export type BhavContext = 'ABOVE_PDH' | 'BELOW_PDL' | 'INSIDE';
export type BhavDir     = 'CE' | 'PE';

export interface BhavEntrySignal {
  idx:    number;       // candle index (0-based in todayCandles[]) at which to enter
  side:   BhavDir;
  ctx:    BhavContext;
  reason: string;
}

export interface BhavState {
  inTrade:      boolean;
  dir:          BhavDir | null;
  entry:        number;       // index price at entry
  entryIdx:     number;       // candle index of entry
  trailStop:    number;       // pts from entry (negative = below entry for CE)
  peakPts:      number;       // best favorable move seen intrabar
  firstDone:    boolean;      // first trade today attempted
  reCount:      number;       // re-entries taken today
  lastExitPts:  number;       // pts from last trade exit (for RE logic)
  lastExitIdx:  number;       // candle idx of last exit
  lastExitDir:  BhavDir | null;
}

export function createBhavState(): BhavState {
  return {
    inTrade: false, dir: null, entry: 0, entryIdx: -1,
    trailStop: -150, peakPts: 0,
    firstDone: false, reCount: 0,
    lastExitPts: 0, lastExitIdx: -1, lastExitDir: null,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const _bp  = (c: BhavCandle) => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const _pdh = (cs: BhavCandle[]) => Math.max(...cs.map(c => c.high));
const _pdl = (cs: BhavCandle[]) => Math.min(...cs.map(c => c.low));
const _pdc = (cs: BhavCandle[]) => cs[cs.length - 1].close;

function _firstBull(cs: BhavCandle[], from: number, thresh = 30): number {
  for (let i = from; i < cs.length; i++) if (_bp(cs[i]) > thresh) return i;
  return -1;
}
function _firstBear(cs: BhavCandle[], from: number, thresh = 30): number {
  for (let i = from; i < cs.length; i++) if (_bp(cs[i]) < -thresh) return i;
  return -1;
}
function _firstStrong(cs: BhavCandle[], from: number, thresh = 55): { i: number; side: BhavDir } | null {
  for (let i = from; i < cs.length; i++) {
    const b = _bp(cs[i]);
    if (Math.abs(b) > thresh) return { i, side: b > 0 ? 'CE' : 'PE' };
  }
  return null;
}

// ─── Entry Signal Detection ───────────────────────────────────────────────────
// Call after each candle close with ALL today's candles so far.
// Returns entry signal if the LATEST candle (last in array) is the entry point.
// Returns null if: no signal, signal is in the past, or whipsaw/avoid.
export function findBhavEntry(
  todayCandles: BhavCandle[],
  prevDayCandles: BhavCandle[]
): BhavEntrySignal | null {
  if (!todayCandles || todayCandles.length < 1) return null;
  if (!prevDayCandles || prevDayCandles.length === 0) return null;

  const PH  = _pdh(prevDayCandles);
  const PL  = _pdl(prevDayCandles);
  const PC  = _pdc(prevDayCandles);
  const C0  = todayCandles[0];
  const gap = C0.open - PC;
  const lastIdx = todayCandles.length - 1;  // index of candle that just closed

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const ctx: BhavContext = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';

  const C0bp  = _bp(C0);
  const C1bp  = todayCandles[1] ? _bp(todayCandles[1]) : 0;

  // Whipsaw guard: first 4 candles alternating strong
  const bps4 = todayCandles.slice(0, Math.min(4, todayCandles.length)).map(_bp);
  let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++) {
    if (bps4[i] * bps4[i - 1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i - 1]) > 65)
      wipsaws++;
  }
  if (wipsaws >= 2) return null;  // whipsaw day — skip

  // Helper: only return if signal is AT the latest candle
  const at = (idx: number, side: BhavDir, reason: string): BhavEntrySignal | null =>
    idx === lastIdx ? { idx, side, ctx, reason } : null;

  // ════════════════════════════════════════════════════════
  // CONTEXT 1: ABOVE PDH
  // ════════════════════════════════════════════════════════
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000)
      return at(0, 'CE', 'extraordinary_gap_ce');

    if (C0bp < -20)
      return at(0, 'PE', 'above_pdh_c0_reversal_pe');

    const bearIdx = _firstBear(todayCandles, 1, 35);
    if (bearIdx > 0 && bearIdx <= 7)
      return at(bearIdx, 'PE', 'above_pdh_delayed_pe');

    const contIdx = _firstStrong(todayCandles, 2, 55);
    if (contIdx)
      return at(contIdx.i, contIdx.side, 'above_pdh_continuation');

    return null;
  }

  // ════════════════════════════════════════════════════════
  // CONTEXT 2: BELOW PDL
  // ════════════════════════════════════════════════════════
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -65) return null;  // selling climax — skip

    if (C0bp > 65) {
      const i = _firstBear(todayCandles, 1, 30);
      if (i > 0) return at(i, 'PE', 'recovery_bounce_pe');
    }

    if (C0.high < PL) {
      if (todayCandles.length >= 2 && C1bp > 20)  return at(1, 'CE', 'below_pdl_c1_bull_ce');
      if (todayCandles.length >= 1 && C1bp < -20)  return at(0, 'PE', 'below_pdl_no_recovery_pe');
      const s = _firstStrong(todayCandles, 2, 40);
      if (s && s.i <= 5) return at(s.i, s.side, 'below_pdl_c2_signal');
      return null;
    }

    if (C0bp > 20) {
      const i = _firstBear(todayCandles, 1, 30);
      if (i > 0 && i <= 6) return at(i, 'PE', 'below_pdl_partial_bounce_pe');
    }

    if (C0bp < -10) {
      for (let i = 2; i <= Math.min(7, todayCandles.length - 2); i++) {
        if (_bp(todayCandles[i]) < -45 && todayCandles[i - 1].close < PL)
          return at(i, 'PE', 'below_pdl_failed_bounce_pe');
      }
    }
    return null;
  }

  // ════════════════════════════════════════════════════════
  // CONTEXT 3: INSIDE
  // ════════════════════════════════════════════════════════

  // C0 breaks outside range
  if (C0.close < PL) return at(0, 'PE', 'inside_c0_breaks_below_pdl');
  if (C0.close > PH) return at(0, 'CE', 'inside_c0_breaks_above_pdh');

  const gapUp   = gap > 50;
  const gapDown = gap < -50;

  // Strong C0 (>55%)
  if (Math.abs(C0bp) > 55) {
    const c0isBull = C0bp > 0;
    const aligned  = (c0isBull && !gapDown) || (!c0isBull && !gapUp);

    if (aligned) {
      if (todayCandles.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 65)
        return at(1, C1bp > 0 ? 'CE' : 'PE', 'inside_c0_trap_c1_signal');
      return at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum');
    } else {
      const gapSide  = gapUp ? 'CE' : 'PE';
      const revCandle = gapUp ? _firstBull(todayCandles, 1, 35) : _firstBear(todayCandles, 1, 35);
      if (revCandle > 0 && revCandle <= 5)
        return at(revCandle, gapSide, 'inside_counter_gap_reversal');
      return at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum_no_reversal');
    }
  }

  // Moderate C0 (30-55%)
  if (Math.abs(C0bp) > 30) {
    if (todayCandles.length >= 2 && C1bp * C0bp > 0)
      return at(0, C0bp > 0 ? 'CE' : 'PE', 'inside_c0_moderate_c1_confirmed');
    if (todayCandles.length >= 3 && Math.abs(C1bp) > 65 && C1bp * C0bp < 0) {
      const C2bp = _bp(todayCandles[2]);
      if (C2bp * C0bp > 0 && Math.abs(C2bp) > 20)
        return at(0, C0bp > 0 ? 'CE' : 'PE', 'inside_c0_c1_fake_c2_confirms');
    }
  }

  // Weak C0 (<30%): wait C2-C4
  for (let i = 2; i <= 4; i++) {
    if (i >= todayCandles.length) break;
    const cbp = _bp(todayCandles[i]);
    if (Math.abs(cbp) > 55) {
      const signalBull = cbp > 0;
      const oppGap = (signalBull && gapDown) || (!signalBull && gapUp);
      const c0ModOpp = (signalBull && C0bp < -20) || (!signalBull && C0bp > 20);
      if (oppGap && c0ModOpp) continue;

      const prev = _bp(todayCandles[i - 1]);
      if (Math.abs(prev) > 60 && prev * cbp < 0) {
        if (i + 1 < todayCandles.length && _bp(todayCandles[i + 1]) * cbp < 0 && Math.abs(_bp(todayCandles[i + 1])) > 60)
          return null;  // whipsaw
      }
      return at(i, cbp > 0 ? 'CE' : 'PE', `inside_c${i}_strong`);
    }
  }

  // Late entries: C5-C20 PDL/PDH test
  for (let i = 5; i < Math.min(todayCandles.length, 21); i++) {
    const prevClose = todayCandles[i - 1].close;
    if (todayCandles[i].low  <= PL && prevClose > PL && _bp(todayCandles[i]) > 35)
      return at(i, 'CE', 'inside_pdl_test_ce');
    if (todayCandles[i].high >= PH && prevClose < PH && _bp(todayCandles[i]) < -35)
      return at(i, 'PE', 'inside_pdh_test_pe');
  }

  return null;
}

// ─── Re-entry signal (after profitable trail exit) ────────────────────────────
// Returns candle index for re-entry if a strong candle appears after exitIdx
// For same-direction: body > 35%; for reverse: body > 65%
export function findBhavReEntry(
  todayCandles: BhavCandle[],
  exitIdx: number,
  side: BhavDir,
  allowReverse: boolean
): { idx: number; side: BhavDir; reason: string } | null {
  const lastIdx = todayCandles.length - 1;
  if (lastIdx <= exitIdx) return null;

  // Same direction first
  for (let i = exitIdx + 1; i <= lastIdx; i++) {
    const b = _bp(todayCandles[i]);
    if (side === 'CE' && b > 35) return { idx: i, side, reason: 're_same_dir' };
    if (side === 'PE' && b < -35) return { idx: i, side, reason: 're_same_dir' };
  }

  // Reverse direction (after big T1 peak >= 100)
  if (allowReverse) {
    const revSide: BhavDir = side === 'CE' ? 'PE' : 'CE';
    for (let i = exitIdx + 1; i <= lastIdx; i++) {
      const b = _bp(todayCandles[i]);
      if (revSide === 'CE' && b > 65) return { idx: i, side: revSide, reason: 're_reverse' };
      if (revSide === 'PE' && b < -65) return { idx: i, side: revSide, reason: 're_reverse' };
    }
  }
  return null;
}

// ─── Trail update (called each candle close while inTrade) ───────────────────
// Returns: 'HOLD' | 'EXIT_SL' | 'EXIT_TRAIL' | 'EXIT_EOD'
export interface BhavTrailResult {
  action: 'HOLD' | 'EXIT_SL' | 'EXIT_TRAIL' | 'EXIT_EOD';
  pts:        number;   // P&L in index points (positive = profit)
  exitPrice:  number;
  trailStop:  number;
  peakPts:    number;
}

const SL_PTS    = 150;
const TRAIL_GAP = 20;

export function updateBhavTrail(
  state:   BhavState,
  candle:  BhavCandle,
  isEOD:   boolean
): BhavTrailResult {
  const sign = state.dir === 'CE' ? 1 : -1;

  // Update peak using intrabar extreme
  const favPts = state.dir === 'CE'
    ? candle.high  - state.entry
    : state.entry  - candle.low;

  let peakPts   = state.peakPts;
  let trailStop = state.trailStop;

  if (favPts > peakPts) {
    peakPts   = favPts;
    trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
  }

  // Exit check at candle close
  const closePts = sign * (candle.close - state.entry);

  if (isEOD || closePts <= trailStop) {
    const exitType = isEOD ? 'EXIT_EOD' : trailStop <= 0 ? 'EXIT_SL' : 'EXIT_TRAIL';
    const lockedPts = isEOD ? closePts : trailStop;
    const exitPrice = isEOD ? candle.close : state.entry + sign * trailStop;
    return { action: exitType, pts: lockedPts, exitPrice, trailStop, peakPts };
  }

  return { action: 'HOLD', pts: closePts, exitPrice: candle.close, trailStop, peakPts };
}

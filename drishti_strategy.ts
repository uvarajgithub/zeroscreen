// drishti_strategy.ts — DRISHTI v1 Live Strategy
// Upgraded from V3 (LOCK20 → LOCK10, RE 3→5, reThresh 35/65→40, PDR≥150)
// Strategy entry: PDH/PDL context + 15-candle pattern detection
// Trail: LOCK10 (peak - 10), candle-close SL only

export interface DrishtiCandle {
  open: number; high: number; low: number; close: number;
}

export type DrishtiContext = 'ABOVE_PDH' | 'BELOW_PDL' | 'INSIDE';
export type DrishtiDir     = 'CE' | 'PE';

export interface DrishtiEntrySignal {
  idx:    number;       // candle index (0-based in todayCandles[]) at which to enter
  side:   DrishtiDir;
  ctx:    DrishtiContext;
  reason: string;
}

export interface DrishtiState {
  inTrade:      boolean;
  dir:          DrishtiDir | null;
  entry:        number;       // index price at entry
  entryIdx:     number;       // candle index of entry
  trailStop:    number;       // pts from entry (negative = below entry for CE)
  peakPts:      number;       // best favorable move seen intrabar
  firstDone:    boolean;      // first trade today attempted
  reCount:      number;       // re-entries taken today
  lastExitPts:  number;       // pts from last trade exit (for RE logic)
  lastExitIdx:  number;       // candle idx of last exit
  lastExitDir:  DrishtiDir | null;
}

export function createDrishtiState(): DrishtiState {
  return {
    inTrade: false, dir: null, entry: 0, entryIdx: -1,
    trailStop: -100, peakPts: 0,
    firstDone: false, reCount: 0,
    lastExitPts: 0, lastExitIdx: -1, lastExitDir: null,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const _bp  = (c: DrishtiCandle) => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const _pdh = (cs: DrishtiCandle[]) => Math.max(...cs.map(c => c.high));
const _pdl = (cs: DrishtiCandle[]) => Math.min(...cs.map(c => c.low));
const _pdc = (cs: DrishtiCandle[]) => cs[cs.length - 1].close;

function _firstBull(cs: DrishtiCandle[], from: number, thresh = 30): number {
  for (let i = from; i < cs.length; i++) if (_bp(cs[i]) > thresh) return i;
  return -1;
}
function _firstBear(cs: DrishtiCandle[], from: number, thresh = 30): number {
  for (let i = from; i < cs.length; i++) if (_bp(cs[i]) < -thresh) return i;
  return -1;
}
function _firstStrong(cs: DrishtiCandle[], from: number, thresh = 55): { i: number; side: DrishtiDir } | null {
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
export function findDrishtiEntry(
  todayCandles: DrishtiCandle[],
  prevDayCandles: DrishtiCandle[]
): DrishtiEntrySignal | null {
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
  const ctx: DrishtiContext = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';

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
  const at = (idx: number, side: DrishtiDir, reason: string): DrishtiEntrySignal | null =>
    idx === lastIdx ? { idx, side, ctx, reason } : null;

  // ════════════════════════════════════════════════════════
  // CONTEXT 1: ABOVE PDH
  // ════════════════════════════════════════════════════════
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000)
      return at(0, 'CE', 'extraordinary_gap_ce');

    // TREND DAY FILTER: C0 body >85% bull = genuine breakout, not fake → follow CE
    // Compatibility wrapper; canonical source moved to src.
    export * from './src/drishti_strategy';


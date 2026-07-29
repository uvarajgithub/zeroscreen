"use strict";
// drishti_strategy.ts — DRISHTI v1 Live Strategy
// Upgraded from V3 (LOCK20 → LOCK10, RE 3→5, reThresh 35/65→40, PDR≥150)
// Strategy entry: PDH/PDL context + 15-candle pattern detection
// Trail: LOCK10 (peak - 10), candle-close SL only
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDrishtiState = createDrishtiState;
exports.findDrishtiEntry = findDrishtiEntry;
exports.findDrishtiReEntry = findDrishtiReEntry;
exports.updateDrishtiTrail = updateDrishtiTrail;
function createDrishtiState() {
    return {
        inTrade: false, dir: null, entry: 0, entryIdx: -1,
        trailStop: -100, peakPts: 0,
        firstDone: false, reCount: 0,
        lastExitPts: 0, lastExitIdx: -1, lastExitDir: null,
    };
}
// ─── Helpers ────────────────────────────────────────────────────────────────
const _bp = (c) => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const _pdh = (cs) => Math.max(...cs.map(c => c.high));
const _pdl = (cs) => Math.min(...cs.map(c => c.low));
const _pdc = (cs) => cs[cs.length - 1].close;
function _firstBull(cs, from, thresh = 30) {
    for (let i = from; i < cs.length; i++)
        if (_bp(cs[i]) > thresh)
            return i;
    return -1;
}
function _firstBear(cs, from, thresh = 30) {
    for (let i = from; i < cs.length; i++)
        if (_bp(cs[i]) < -thresh)
            return i;
    return -1;
}
function _firstStrong(cs, from, thresh = 55) {
    for (let i = from; i < cs.length; i++) {
        const b = _bp(cs[i]);
        if (Math.abs(b) > thresh)
            return { i, side: b > 0 ? 'CE' : 'PE' };
    }
    return null;
}
// ─── Entry Signal Detection ───────────────────────────────────────────────────
// Call after each candle close with ALL today's candles so far.
// Returns entry signal if the LATEST candle (last in array) is the entry point.
// Returns null if: no signal, signal is in the past, or whipsaw/avoid.
function findDrishtiEntry(todayCandles, prevDayCandles) {
    if (!todayCandles || todayCandles.length < 1)
        return null;
    if (!prevDayCandles || prevDayCandles.length === 0)
        return null;
    const PH = _pdh(prevDayCandles);
    const PL = _pdl(prevDayCandles);
    const PC = _pdc(prevDayCandles);
    const C0 = todayCandles[0];
    const gap = C0.open - PC;
    const lastIdx = todayCandles.length - 1; // index of candle that just closed
    const vsPDH = C0.open - PH;
    const vsPDL = C0.open - PL;
    const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
    const C0bp = _bp(C0);
    const C1bp = todayCandles[1] ? _bp(todayCandles[1]) : 0;
    // Whipsaw guard: first 4 candles alternating strong
    const bps4 = todayCandles.slice(0, Math.min(4, todayCandles.length)).map(_bp);
    let wipsaws = 0;
    for (let i = 1; i < bps4.length; i++) {
        if (bps4[i] * bps4[i - 1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i - 1]) > 65)
            wipsaws++;
    }
    if (wipsaws >= 2)
        return null; // whipsaw day — skip
    // Helper: only return if signal is AT the latest candle
    const at = (idx, side, reason) => idx === lastIdx ? { idx, side, ctx, reason } : null;
    // ════════════════════════════════════════════════════════
    // CONTEXT 1: ABOVE PDH
    // ════════════════════════════════════════════════════════
    if (ctx === 'ABOVE_PDH') {
        if (vsPDH > 1000)
            return at(0, 'CE', 'extraordinary_gap_ce');
        // TREND DAY FILTER: C0 body >85% bull = genuine breakout, not fake → follow CE
        if (C0bp > 85)
            return at(0, 'CE', 'above_pdh_trend_day_ce');
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
        // TREND DAY FILTER: C0 body < -80% bear = genuine breakdown, follow PE
        if (C0bp < -80)
            return at(0, 'PE', 'below_pdl_trend_day_pe');
        if (C0bp < -65)
            return null; // selling climax (-65 to -80%) — skip
        if (C0bp > 65) {
            const i = _firstBear(todayCandles, 1, 30);
            if (i > 0)
                return at(i, 'PE', 'recovery_bounce_pe');
        }
        if (C0.high < PL) {
            if (todayCandles.length >= 2 && C1bp > 20)
                return at(1, 'CE', 'below_pdl_c1_bull_ce');
            if (todayCandles.length >= 1 && C1bp < -20)
                return at(0, 'PE', 'below_pdl_no_recovery_pe');
            const s = _firstStrong(todayCandles, 2, 40);
            if (s && s.i <= 5)
                return at(s.i, s.side, 'below_pdl_c2_signal');
            return null;
        }
        if (C0bp > 20) {
            const i = _firstBear(todayCandles, 1, 30);
            if (i > 0 && i <= 6)
                return at(i, 'PE', 'below_pdl_partial_bounce_pe');
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
    // If bot was live at C0 close → signal fires immediately
    // If bot came online late (lastIdx > 0) → C0 already closed outside range, fall through to late-entry patterns below
    if (C0.close < PL && lastIdx === 0)
        return at(0, 'PE', 'inside_c0_breaks_below_pdl');
    if (C0.close > PH && lastIdx === 0)
        return at(0, 'CE', 'inside_c0_breaks_above_pdh');
    const gapUp = gap > 50;
    const gapDown = gap < -50;
    // Strong C0 (>55%)
    // at(0,...) and at(1,...) returns are non-blocking: only exit if signal is non-null,
    // otherwise fall through to late-entry loops (supports bot coming online after C0/C1)
    if (Math.abs(C0bp) > 55) {
        const c0isBull = C0bp > 0;
        const aligned = (c0isBull && !gapDown) || (!c0isBull && !gapUp);
        if (aligned) {
            if (todayCandles.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 72) {
                const s = at(1, C1bp > 0 ? 'CE' : 'PE', 'inside_c0_trap_c1_signal');
                if (s)
                    return s;
            }
            {
                const s = at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum');
                if (s)
                    return s;
            }
        }
        else {
            const gapSide = gapUp ? 'CE' : 'PE';
            const revCandle = gapUp ? _firstBull(todayCandles, 1, 35) : _firstBear(todayCandles, 1, 35);
            if (revCandle > 0 && revCandle <= 5) {
                const s = at(revCandle, gapSide, 'inside_counter_gap_reversal');
                if (s)
                    return s;
            }
            {
                const s = at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum_no_reversal');
                if (s)
                    return s;
            }
        }
    }
    // Structural candle break: close outside previous candle's range
    // PE if close < prev.low, CE if close > prev.high
    // Skip if signal opposes both gap direction AND C0 direction (fake counter-gap)
    for (let i = 1; i < todayCandles.length; i++) {
        const prevC = todayCandles[i - 1];
        const curr = todayCandles[i];
        if (curr.close < prevC.low) {
            const oppGap = gapUp;
            const c0ModOpp = C0bp > 20;
            if (oppGap && c0ModOpp)
                continue;
            const s = at(i, 'PE', `struct_c${i + 1}_pe`);
            if (s)
                return s;
        }
        if (curr.close > prevC.high) {
            const oppGap = gapDown;
            const c0ModOpp = C0bp < -20;
            if (oppGap && c0ModOpp)
                continue;
            const s = at(i, 'CE', `struct_c${i + 1}_ce`);
            if (s)
                return s;
        }
    }
    // Late entries: C5-C20 PDL/PDH test
    for (let i = 5; i < Math.min(todayCandles.length, 21); i++) {
        const prevClose = todayCandles[i - 1].close;
        if (todayCandles[i].low <= PL && prevClose > PL && _bp(todayCandles[i]) > 35)
            return at(i, 'CE', 'inside_pdl_test_ce');
        if (todayCandles[i].high >= PH && prevClose < PH && _bp(todayCandles[i]) < -35)
            return at(i, 'PE', 'inside_pdh_test_pe');
    }
    return null;
}
// ─── Re-entry signal (after profitable trail exit) ────────────────────────────
// Returns candle index for re-entry if a strong candle appears after exitIdx
// For same-direction: body > 25%; for reverse: body > 40%
function findDrishtiReEntry(todayCandles, exitIdx, side, allowReverse) {
    const lastIdx = todayCandles.length - 1;
    if (lastIdx <= exitIdx)
        return null;
    // Return the FIRST strong candle after exitIdx — whichever direction appears earliest wins.
    // Previously: same-dir loop ran first, so a same-dir signal at C8 would win over a reverse
    // signal at C6, causing the earlier (more timely) entry to be missed.
    const revSide = side === 'CE' ? 'PE' : 'CE';
    let sameDirMatch = null;
    let revMatch = null;
    // Same-direction re-entry uses a lower bar (25%) than reverse (40%): after a profitable
    // trail exit in a trending market, continuation candles are often steady rather than
    // single explosive bars — waiting for >40% body caused the bot to sit out trend days.
    const SAME_DIR_THRESH = 25;
    for (let i = exitIdx + 1; i <= lastIdx; i++) {
        const b = _bp(todayCandles[i]);
        if (!sameDirMatch) {
            if (side === 'CE' && b > SAME_DIR_THRESH)
                sameDirMatch = { idx: i, side, reason: 're_same_dir' };
            if (side === 'PE' && b < -SAME_DIR_THRESH)
                sameDirMatch = { idx: i, side, reason: 're_same_dir' };
        }
        if (!revMatch && allowReverse) {
            if (revSide === 'CE' && b > 40)
                revMatch = { idx: i, side: revSide, reason: 're_reverse' };
            if (revSide === 'PE' && b < -40)
                revMatch = { idx: i, side: revSide, reason: 're_reverse' };
        }
        if (sameDirMatch && (!allowReverse || revMatch))
            break; // found both — no need to scan further
    }
    // Pick the one that appeared earlier; if tied (same candle strong both ways — impossible), prefer same-dir
    if (sameDirMatch && revMatch)
        return sameDirMatch.idx <= revMatch.idx ? sameDirMatch : revMatch;
    if (sameDirMatch)
        return sameDirMatch;
    if (revMatch)
        return revMatch;
    return null;
}
const SL_PTS = 100; // changed from 150 — backtest: futures ≈same (−0.02%), options +₹62K over 5yr
const TRAIL_GAP = 10;
function updateDrishtiTrail(state, candle, isEOD) {
    const sign = state.dir === 'CE' ? 1 : -1;
    // Update peak using intrabar extreme
    const favPts = state.dir === 'CE'
        ? candle.high - state.entry
        : state.entry - candle.low;
    let peakPts = state.peakPts;
    let trailStop = state.trailStop;
    if (favPts > peakPts) {
        peakPts = favPts;
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

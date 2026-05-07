export function getCandleBody(candle: any) {
  return {
    bodyHigh: Math.max(candle.open, candle.close),
    bodyLow: Math.min(candle.open, candle.close)
  };
}

// Breakout: price must clear the full candle high/low + 2pt buffer
// Uses candle.high (not body high) so it aligns with candle monitor notifications
export function checkBreakout(price: number, candleHigh: number, candleLow: number) {
  if (price > candleHigh + 2) return "CE";
  if (price < candleLow - 2) return "PE";
  return null;
}

// Sideways = full candle range (high-low) < 100 pts AND avg candle size < 30 pts
// Both must be true to avoid stopping on directional candles with big wicks
export function isSideways(candle: { high: number; low: number }, avgCandleSize: number): boolean {
  return (candle.high - candle.low) < 100 && avgCandleSize < 30;
}

// Check if 5-min candle has strong momentum (early entry)
export function isStrongMomentum(candle: any): boolean {
  const body = Math.abs(candle.close - candle.open);
  return body >= 30;
}

// Check if price is NEAR (but not past) breakout zone — for early entry
export function isNearBreakout(
  price: number,
  bodyHigh: number,
  bodyLow: number,
  threshold: number = 15
): "CE" | "PE" | null {
  if (price >= bodyHigh - threshold && price < bodyHigh) return "CE";
  if (price <= bodyLow + threshold && price > bodyLow) return "PE";
  return null;
}

// Helper: Check if 5-min and 15-min candles are aligned
export function isMomentumAligned(fiveMin: any, fifteenMin: any): boolean {
  return (
    (fiveMin.close > fiveMin.open && fifteenMin.close > fifteenMin.open) ||
    (fiveMin.close < fiveMin.open && fifteenMin.close < fifteenMin.open)
  );
}

// Fix 2: VWAP direction validation — CE only above VWAP, PE only below
export function isVwapAligned(price: number, vwap: number, direction: "CE" | "PE"): boolean {
  if (direction === "CE") return price > vwap;
  if (direction === "PE") return price < vwap;
  return false;
}

// Fix 5: AI weak signal — measurable thresholds
// body < 50% of avgCandle + volume < avgVolume + wick > body
export function isWeakMomentum(candle: any, avgCandleSize: number, avgVolume: number): boolean {
  const body  = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  const wick  = range - body;
  const smallBody   = body < avgCandleSize * 0.5;
  const lowVolume   = candle.volume < avgVolume;
  const rejWick     = wick > body;
  return smallBody && (lowVolume || rejWick);
}

// Fix 1: Defined strong trend: price ≥100 pts from VWAP + last 2 candles same direction + volume up
export function isStrongTrend(
  price: number,
  vwap: number,
  candle: any,
  prevVolume: number,
  recentCandles: any[]
): boolean {
  const farFromVwap = Math.abs(price - vwap) >= 100;
  const volumeUp    = candle.volume > prevVolume * 1.1;
  // last 2 candles same direction
  const sameDirCandles =
    recentCandles.length >= 2 &&
    recentCandles[recentCandles.length - 1].close > recentCandles[recentCandles.length - 1].open &&
    recentCandles[recentCandles.length - 2].close > recentCandles[recentCandles.length - 2].open ||
    recentCandles.length >= 2 &&
    recentCandles[recentCandles.length - 1].close < recentCandles[recentCandles.length - 1].open &&
    recentCandles[recentCandles.length - 2].close < recentCandles[recentCandles.length - 2].open;
  return farFromVwap && volumeUp && sameDirCandles;
}

// Fix 4: Breakout accelerating — momentum increasing on breakout candle
export function isBreakoutAccelerating(candle: any, prevBody: number): boolean {
  const body = Math.abs(candle.close - candle.open);
  return body > prevBody * 1.2; // current candle body > 120% of previous
}

// Fix 2: 15-min candle direction must match trade direction
export function is15MinAligned(candle: any, direction: "CE" | "PE"): boolean {
  if (direction === "CE") return candle.close > candle.open;
  if (direction === "PE") return candle.close < candle.open;
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hybrid Reverse Strategy — BANKNIFTY 15-min  [Mod-A: unlimited C1-exit resets]
// Signal     : prev candle body breakout + 25 pt buffer
// Entry      : signal candle close | SL: ±100 pts
// EarlyExit  : C1-3 — if candle-1-after-entry closes 3+ pts against → exit −3
//              MOD-A: after C1 exit, reset day (firstDone=false) → fresh signal
//              allowed in EITHER direction (captures reversal on same day)
// Re-entry   : same-dir if refHigh broken (after wick-only SL hit)
// HybridRev  : SL candle body closes PAST SL level → enter opposite direction
// Backtest   : 5yr (2021-2026), 1 lot = 15 qty → +₹7,04,406 | MaxDD −₹11,451
// ─────────────────────────────────────────────────────────────────────────────

export interface Candle {
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

export interface HybridReverseState {
  inTrade:     boolean;
  dir:         "CE" | "PE" | null;
  entry:       number;
  sl:          number;
  refHigh:     number;   // signal candle high (CE) or low (PE) — for same-dir re-entry
  firstDone:   boolean;  // first signal of the day taken
  reUsed:      boolean;  // second trade slot used (re-entry or reverse)
  waitReEntry: boolean;  // waiting for same-dir re-entry trigger
  isC1:        boolean;  // true on the candle immediately after entry → C1-3 check
  peakProfit:  number;   // max pts in our favour since entry — drives trailing stop
}

export type HybridSignal =
  | { action: "ENTER";         dir: "CE" | "PE"; price: number; sl: number }
  | { action: "REVERSE_ENTER"; dir: "CE" | "PE"; price: number; sl: number }
  | { action: "EXIT_EARLY";    pts: number }   // always −3 pts
  | { action: "EXIT_SL";       pts: number }   // always −100 pts
  | { action: "EXIT_EOD";      pts: number }
  | { action: "NONE" };

const HR_ENTRY_BUF  = 25;   // pts above prevBodyHigh / below prevBodyLow required
const HR_SL_PTS     = 100;  // stop loss distance from entry price
const HR_EARLY_EXIT = 3;    // pts against entry on C1 that triggers early exit

export function createHybridState(): HybridReverseState {
  return {
    inTrade: false, dir: null, entry: 0, sl: 0, refHigh: 0,
    firstDone: false, reUsed: false, waitReEntry: false, isC1: false,
    peakProfit: 0,
  };
}

/**
 * Process one completed 15-min candle through the Hybrid Reverse strategy.
 * Call this once per candle close. State is mutated in-place.
 *
 * @param state   Mutable strategy state
 * @param prev    The candle BEFORE current (provides bodyHigh / bodyLow)
 * @param current The just-completed 15-min candle
 * @param isEOD   True for the 3:15 PM candle (force-close all positions)
 */
export function processHybridCandle(
  state:   HybridReverseState,
  prev:    Candle,
  current: Candle,
  isEOD:   boolean,
): HybridSignal {
  const bodyHigh = Math.max(prev.open, prev.close);
  const bodyLow  = Math.min(prev.open, prev.close);

  // ── In Trade ───────────────────────────────────────────────────────────────
  if (state.inTrade) {

    // C1-3: early exit — only checked on the FIRST candle after entry
    if (state.isC1) {
      state.isC1 = false;
      const pnl = state.dir === "CE"
        ? current.close - state.entry
        : state.entry   - current.close;
      if (pnl < -HR_EARLY_EXIT) {
        // Mod-A: reset day completely → next body breakout in EITHER direction
        state.inTrade     = false;
        state.firstDone   = false;
        state.waitReEntry = false;
        state.reUsed      = false;
        return { action: "EXIT_EARLY", pts: -HR_EARLY_EXIT };
      }
    }

    // SL hit — checked via candle wick (low for CE, high for PE)
    const slHit = state.dir === "CE"
      ? current.low  <= state.sl
      : current.high >= state.sl;

    if (slHit) {
      const pts = state.dir === "CE"
        ? state.sl - state.entry   // −100
        : state.entry - state.sl;  // −100

      // Hybrid reverse: did the candle BODY (close) commit past the SL level?
      const bodyPast = state.dir === "CE"
        ? current.close < state.sl
        : current.close > state.sl;

      if (bodyPast && !state.reUsed) {
        // Exit current side, immediately enter opposite
        const revDir:  "CE" | "PE" = state.dir === "CE" ? "PE" : "CE";
        const revEntry = current.close;
        const revSL    = revDir === "CE" ? revEntry - HR_SL_PTS : revEntry + HR_SL_PTS;
        state.dir        = revDir;
        state.entry      = revEntry;
        state.sl         = revSL;
        state.refHigh    = revDir === "CE" ? current.high : current.low;
        state.reUsed     = true;
        state.isC1       = true;
        state.peakProfit = 0;
        // inTrade stays true — now in the reverse trade
        return { action: "REVERSE_ENTER", dir: revDir, price: revEntry, sl: revSL };
      }

      state.inTrade = false;
      if (!state.reUsed) {
        state.waitReEntry = true;
      } else {
        // Both re-entry slots used — reset firstDone for one recovery trade
        state.firstDone = false;
      }
      state.peakProfit = 0;
      return { action: "EXIT_SL", pts };
    }

    // LOCK50 trailing stop: once peak > 100pts, always lock (peak − 50)pts
    // Never give back more than 50pts from the highest point reached.
    // Example: peak +150 → lock +100 | peak +300 → lock +250 | peak +500 → lock +450
    const hp = state.dir === "CE"
      ? current.high - state.entry
      : state.entry  - current.low;
    if (hp > state.peakProfit) {
      state.peakProfit = hp;
      if (state.peakProfit > 100) {
        const lock = state.peakProfit - 50;
        if (state.dir === "CE") state.sl = Math.max(state.sl, state.entry + lock);
        else                     state.sl = Math.min(state.sl, state.entry - lock);
      }
    }

    // EOD exit
    if (isEOD) {
      const pts = state.dir === "CE"
        ? current.close - state.entry
        : state.entry   - current.close;
      state.inTrade = false;
      return { action: "EXIT_EOD", pts };
    }

    return { action: "NONE" };
  }

  // ── Wait for Same-Direction Re-entry ──────────────────────────────────────
  if (state.waitReEntry) {
    const reTriggered =
      (state.dir === "CE" && current.close > state.refHigh) ||
      (state.dir === "PE" && current.close < state.refHigh);

    if (reTriggered) {
      const e  = current.close;
      const sl = state.dir === "CE" ? e - HR_SL_PTS : e + HR_SL_PTS;
      state.entry       = e;
      state.sl          = sl;
      state.inTrade     = true;
      state.waitReEntry = false;
      state.reUsed      = true;
      state.isC1        = true;
      state.peakProfit  = 0;
      return { action: "ENTER", dir: state.dir!, price: e, sl };
    }

    // If market has moved >150 pts away from re-entry level, the original
    // setup is invalidated — abandon the wait and look for a fresh breakout
    const distAway = state.dir === "CE"
      ? state.refHigh - current.close   // CE: need close > refHigh, so negative = above ref
      : current.close - state.refHigh;  // PE: need close < refHigh, positive = above ref

    if (distAway > 150) {
      state.waitReEntry = false;
      // Fall through to fresh signal detection below (reUsed counts this as second slot)
      if (current.close > bodyHigh + HR_ENTRY_BUF) {
        const e = current.close;
        state.dir = "CE"; state.entry = e; state.sl = e - HR_SL_PTS;
        state.refHigh = current.high; state.inTrade = true;
        state.reUsed = true; state.isC1 = true; state.peakProfit = 0;
        return { action: "ENTER", dir: "CE", price: e, sl: e - HR_SL_PTS };
      }
      if (current.close < bodyLow - HR_ENTRY_BUF) {
        const e = current.close;
        state.dir = "PE"; state.entry = e; state.sl = e + HR_SL_PTS;
        state.refHigh = current.low; state.inTrade = true;
        state.reUsed = true; state.isC1 = true; state.peakProfit = 0;
        return { action: "ENTER", dir: "PE", price: e, sl: e + HR_SL_PTS };
      }
      // No breakout on this candle — reset to watch for fresh signal next candle
      // reUsed=true ensures after this fresh trade, no further re-entries are allowed
      state.firstDone = false;
      state.reUsed    = true;
    }

    return { action: "NONE" };
  }

  // ── First Signal Detection ─────────────────────────────────────────────────
  if (state.firstDone || isEOD) return { action: "NONE" };

  if (current.close > bodyHigh + HR_ENTRY_BUF) {
    const e = current.close;
    state.dir = "CE"; state.entry = e; state.sl = e - HR_SL_PTS;
    state.refHigh = current.high; state.inTrade = true;
    state.firstDone = true; state.isC1 = true; state.peakProfit = 0;
    return { action: "ENTER", dir: "CE", price: e, sl: e - HR_SL_PTS };
  }

  if (current.close < bodyLow - HR_ENTRY_BUF) {
    const e = current.close;
    state.dir = "PE"; state.entry = e; state.sl = e + HR_SL_PTS;
    state.refHigh = current.low; state.inTrade = true;
    state.firstDone = true; state.isC1 = true; state.peakProfit = 0;
    return { action: "ENTER", dir: "PE", price: e, sl: e + HR_SL_PTS };
  }

  return { action: "NONE" };
}

// Fix 6: Big move already happened before entry — skip the day
// 600 pts threshold for BANKNIFTY (regularly moves 300+ pts in morning sessions)
export function isBigMoveAlready(openPrice: number, currentPrice: number): boolean {
  return Math.abs(currentPrice - openPrice) >= 600;
}

// Fix 4: Adaptive trailing SL
export function getTrailingSL(entryPrice: number, currentPrice: number, direction: "CE" | "PE"): number | null {
  const profit = direction === "CE" ? currentPrice - entryPrice : entryPrice - currentPrice;

  if (profit >= 500) return direction === "CE" ? entryPrice + 300 : entryPrice - 300;
  if (profit >= 350) return direction === "CE" ? entryPrice + 150 : entryPrice - 150;
  if (profit >= 200) return direction === "CE" ? entryPrice + 50  : entryPrice - 50;
  return null;
}

// High wick candle filter — skip if wick dominates body (indecision/trap)
export function isHighWickCandle(candle: any): boolean {
  const body  = Math.abs(candle.close - candle.open);
  const range = candle.high - candle.low;
  const wick  = range - body;
  return wick > body * 1.5; // wick more than 1.5x body = trap candle
}

// VWAP chop filter — price hovering too close to VWAP = choppy, skip entry
export function isNearVwapChop(price: number, vwap: number, buffer: number = 30): boolean {
  return Math.abs(price - vwap) < buffer;
}

// Check if time is within a window (IST, 24h format)
export function isWithinTime(startH: number, startM: number, endH: number, endM: number): boolean {
  const now = new Date();
  const ist = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return mins >= startH * 60 + startM && mins <= endH * 60 + endM;
}


'use strict';

/**
 * 100 Entry Logic Combinations for BankNifty
 * Each logic returns: { signal: 'CE'|'PE'|null, reason: string }
 * Input: candles[] (15-min OHLC), index i (current candle), prevDay { pdh, pdl, pdc }
 */

function body(c) { return c.close - c.open; }
function bodyPct(c) { return (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0; }
function isBull(c) { return c.close > c.open; }
function isBear(c) { return c.close < c.open; }
function bodyHigh(c) { return Math.max(c.open, c.close); }
function bodyLow(c)  { return Math.min(c.open, c.close); }
function range(c) { return c.high - c.low; }
function upperWick(c) { return c.high - bodyHigh(c); }
function lowerWick(c) { return bodyLow(c) - c.low; }
function avg(arr) { return arr.reduce((a,b) => a+b, 0) / arr.length; }
function vwap(candles) {
  let tpv = 0, vol = 0;
  for (const c of candles) { const tp = (c.high + c.low + c.close) / 3; const v = c.volume || range(c); tpv += tp * v; vol += v; }
  return vol > 0 ? tpv / vol : candles[candles.length-1].close;
}

const LOGICS = [

  // ── GAP BASED (1–10) ──────────────────────────────────────────────────────

  {
    id: 1, name: 'GAP_UP_ABOVE_PDH_CONT',
    desc: 'Gap up above PDH, C0 bullish body > 60% → CE continuation',
    fn: (cs, i, pd) => {
      const C0 = cs[0]; if (i !== 0) return null;
      if (C0.open <= pd.pdh + 100) return null;
      if (bodyPct(C0) > 60) return { signal: 'CE', reason: 'gap_above_pdh_bull_cont' };
      return null;
    }
  },
  {
    id: 2, name: 'GAP_DOWN_BELOW_PDL_CONT',
    desc: 'Gap down below PDL, C0 bearish body > 60% → PE continuation',
    fn: (cs, i, pd) => {
      const C0 = cs[0]; if (i !== 0) return null;
      if (C0.open >= pd.pdl - 100) return null;
      if (bodyPct(C0) < -60) return { signal: 'PE', reason: 'gap_below_pdl_bear_cont' };
      return null;
    }
  },
  {
    id: 3, name: 'GAP_UP_REVERSAL',
    desc: 'Gap up, C0 bearish body > 50% → PE reversal',
    fn: (cs, i, pd) => {
      const C0 = cs[0]; if (i !== 0) return null;
      if (C0.open <= pd.pdc + 50) return null;
      if (bodyPct(C0) < -50) return { signal: 'PE', reason: 'gap_up_reversal_pe' };
      return null;
    }
  },
  {
    id: 4, name: 'GAP_DOWN_REVERSAL',
    desc: 'Gap down, C0 bullish body > 50% → CE reversal',
    fn: (cs, i, pd) => {
      const C0 = cs[0]; if (i !== 0) return null;
      if (C0.open >= pd.pdc - 50) return null;
      if (bodyPct(C0) > 50) return { signal: 'CE', reason: 'gap_down_reversal_ce' };
      return null;
    }
  },
  {
    id: 5, name: 'GAP_UP_DELAYED_BEAR',
    desc: 'Gap up above PDH, C0 neutral, first bear candle in C1-C5 → PE',
    fn: (cs, i, pd) => {
      if (cs[0].open <= pd.pdh + 100) return null;
      if (i < 1 || i > 5) return null;
      if (bodyPct(cs[i]) < -35) return { signal: 'PE', reason: 'gap_up_delayed_bear' };
      return null;
    }
  },
  {
    id: 6, name: 'GAP_DOWN_DELAYED_BULL',
    desc: 'Gap down below PDL, C0 neutral, first bull candle in C1-C5 → CE',
    fn: (cs, i, pd) => {
      if (cs[0].open >= pd.pdl - 100) return null;
      if (i < 1 || i > 5) return null;
      if (bodyPct(cs[i]) > 35) return { signal: 'CE', reason: 'gap_down_delayed_bull' };
      return null;
    }
  },
  {
    id: 7, name: 'GAP_UP_PDH_HOLD',
    desc: 'Gap up, price pulls back to PDH level and bounces → CE',
    fn: (cs, i, pd) => {
      if (cs[0].open <= pd.pdh) return null;
      if (i < 2) return null;
      const c = cs[i];
      if (c.low <= pd.pdh + 20 && c.close > pd.pdh + 30 && bodyPct(c) > 40)
        return { signal: 'CE', reason: 'gap_up_pdh_hold_ce' };
      return null;
    }
  },
  {
    id: 8, name: 'GAP_DOWN_PDL_HOLD',
    desc: 'Gap down, price bounces back to PDL level and rejects → PE',
    fn: (cs, i, pd) => {
      if (cs[0].open >= pd.pdl) return null;
      if (i < 2) return null;
      const c = cs[i];
      if (c.high >= pd.pdl - 20 && c.close < pd.pdl - 30 && bodyPct(c) < -40)
        return { signal: 'PE', reason: 'gap_down_pdl_hold_pe' };
      return null;
    }
  },
  {
    id: 9, name: 'LARGE_GAP_UP_FADE',
    desc: 'Extraordinary gap up >500pts, C0 any → PE fade',
    fn: (cs, i, pd) => {
      const C0 = cs[0]; if (i !== 0) return null;
      if (C0.open - pd.pdc > 500) return { signal: 'PE', reason: 'large_gap_up_fade' };
      return null;
    }
  },
  {
    id: 10, name: 'LARGE_GAP_DOWN_FADE',
    desc: 'Extraordinary gap down >500pts, C0 any → CE fade',
    fn: (cs, i, pd) => {
      const C0 = cs[0]; if (i !== 0) return null;
      if (pd.pdc - C0.open > 500) return { signal: 'CE', reason: 'large_gap_down_fade' };
      return null;
    }
  },

  // ── OPENING RANGE BREAKOUT (11–20) ────────────────────────────────────────

  {
    id: 11, name: 'ORB_15MIN_BULL',
    desc: 'Price closes above C0 high → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close > cs[0].high && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'orb_15min_bull' };
      return null;
    }
  },
  {
    id: 12, name: 'ORB_15MIN_BEAR',
    desc: 'Price closes below C0 low → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close < cs[0].low && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'orb_15min_bear' };
      return null;
    }
  },
  {
    id: 13, name: 'ORB_30MIN_BULL',
    desc: 'Price closes above max(C0,C1) high → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const orHigh = Math.max(cs[0].high, cs[1].high);
      if (cs[i].close > orHigh && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'orb_30min_bull' };
      return null;
    }
  },
  {
    id: 14, name: 'ORB_30MIN_BEAR',
    desc: 'Price closes below min(C0,C1) low → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const orLow = Math.min(cs[0].low, cs[1].low);
      if (cs[i].close < orLow && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'orb_30min_bear' };
      return null;
    }
  },
  {
    id: 15, name: 'ORB_60MIN_BULL',
    desc: 'Price closes above first 4 candles high → CE',
    fn: (cs, i, pd) => {
      if (i < 4) return null;
      const orHigh = Math.max(...cs.slice(0,4).map(c => c.high));
      if (cs[i].close > orHigh && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'orb_60min_bull' };
      return null;
    }
  },
  {
    id: 16, name: 'ORB_60MIN_BEAR',
    desc: 'Price closes below first 4 candles low → PE',
    fn: (cs, i, pd) => {
      if (i < 4) return null;
      const orLow = Math.min(...cs.slice(0,4).map(c => c.low));
      if (cs[i].close < orLow && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'orb_60min_bear' };
      return null;
    }
  },
  {
    id: 17, name: 'ORB_RETEST_BULL',
    desc: 'Price breaks C0 high, pulls back, holds, bull candle → CE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const orHigh = cs[0].high;
      const prev = cs[i-1];
      if (prev.low <= orHigh && prev.low >= orHigh - 50 && bodyPct(cs[i]) > 40)
        return { signal: 'CE', reason: 'orb_retest_bull' };
      return null;
    }
  },
  {
    id: 18, name: 'ORB_RETEST_BEAR',
    desc: 'Price breaks C0 low, pulls back, rejects, bear candle → PE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const orLow = cs[0].low;
      const prev = cs[i-1];
      if (prev.high >= orLow && prev.high <= orLow + 50 && bodyPct(cs[i]) < -40)
        return { signal: 'PE', reason: 'orb_retest_bear' };
      return null;
    }
  },
  {
    id: 19, name: 'ORB_INSIDE_CANDLE_BULL',
    desc: 'Candle inside C0 range, next breaks C0 high → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const prev = cs[i-1];
      if (prev.high < cs[0].high && prev.low > cs[0].low && cs[i].close > cs[0].high)
        return { signal: 'CE', reason: 'orb_inside_breakout_bull' };
      return null;
    }
  },
  {
    id: 20, name: 'ORB_INSIDE_CANDLE_BEAR',
    desc: 'Candle inside C0 range, next breaks C0 low → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const prev = cs[i-1];
      if (prev.high < cs[0].high && prev.low > cs[0].low && cs[i].close < cs[0].low)
        return { signal: 'PE', reason: 'orb_inside_breakout_bear' };
      return null;
    }
  },

  // ── BODY BREAKOUT (21–30) ─────────────────────────────────────────────────

  {
    id: 21, name: 'BODY_BREAKOUT_BULL',
    desc: 'Close above previous candle body high (not wick) → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close > bodyHigh(cs[i-1]) && bodyPct(cs[i]) > 40)
        return { signal: 'CE', reason: 'body_breakout_bull' };
      return null;
    }
  },
  {
    id: 22, name: 'BODY_BREAKOUT_BEAR',
    desc: 'Close below previous candle body low (not wick) → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close < bodyLow(cs[i-1]) && bodyPct(cs[i]) < -40)
        return { signal: 'PE', reason: 'body_breakout_bear' };
      return null;
    }
  },
  {
    id: 23, name: 'TWO_BODY_BREAKOUT_BULL',
    desc: 'Close above both prev 2 candles body highs → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const level = Math.max(bodyHigh(cs[i-1]), bodyHigh(cs[i-2]));
      if (cs[i].close > level && bodyPct(cs[i]) > 40)
        return { signal: 'CE', reason: 'two_body_breakout_bull' };
      return null;
    }
  },
  {
    id: 24, name: 'TWO_BODY_BREAKOUT_BEAR',
    desc: 'Close below both prev 2 candles body lows → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const level = Math.min(bodyLow(cs[i-1]), bodyLow(cs[i-2]));
      if (cs[i].close < level && bodyPct(cs[i]) < -40)
        return { signal: 'PE', reason: 'two_body_breakout_bear' };
      return null;
    }
  },
  {
    id: 25, name: 'ENGULF_BULL',
    desc: 'Bullish engulfing: curr body engulfs prev body → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (isBear(p) && isBull(c) && c.open < bodyLow(p) && c.close > bodyHigh(p))
        return { signal: 'CE', reason: 'engulf_bull' };
      return null;
    }
  },
  {
    id: 26, name: 'ENGULF_BEAR',
    desc: 'Bearish engulfing: curr body engulfs prev body → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (isBull(p) && isBear(c) && c.open > bodyHigh(p) && c.close < bodyLow(p))
        return { signal: 'PE', reason: 'engulf_bear' };
      return null;
    }
  },
  {
    id: 27, name: 'STRONG_BODY_BULL',
    desc: 'Single candle body% > 75, bull → CE',
    fn: (cs, i, pd) => {
      if (bodyPct(cs[i]) > 75) return { signal: 'CE', reason: 'strong_body_bull' };
      return null;
    }
  },
  {
    id: 28, name: 'STRONG_BODY_BEAR',
    desc: 'Single candle body% < -75, bear → PE',
    fn: (cs, i, pd) => {
      if (bodyPct(cs[i]) < -75) return { signal: 'PE', reason: 'strong_body_bear' };
      return null;
    }
  },
  {
    id: 29, name: 'BODY_BREAKOUT_AFTER_DOJI',
    desc: 'Doji (body <15%) followed by strong body breakout → CE/PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (Math.abs(bodyPct(p)) < 15 && bodyPct(c) > 60)
        return { signal: 'CE', reason: 'doji_body_breakout_bull' };
      if (Math.abs(bodyPct(p)) < 15 && bodyPct(c) < -60)
        return { signal: 'PE', reason: 'doji_body_breakout_bear' };
      return null;
    }
  },
  {
    id: 30, name: 'THREE_CANDLE_BODY_BULL',
    desc: 'Three consecutive bull candles, third closes above first two body highs → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (isBull(a) && isBull(b) && isBull(c) && c.close > Math.max(bodyHigh(a), bodyHigh(b)))
        return { signal: 'CE', reason: 'three_bull_body_cont' };
      return null;
    }
  },

  // ── STRUCTURE BREAK (31–40) ───────────────────────────────────────────────

  {
    id: 31, name: 'STRUCT_BREAK_BULL',
    desc: 'Close above previous candle high (wick included) → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close > cs[i-1].high && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'struct_break_bull' };
      return null;
    }
  },
  {
    id: 32, name: 'STRUCT_BREAK_BEAR',
    desc: 'Close below previous candle low (wick included) → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close < cs[i-1].low && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'struct_break_bear' };
      return null;
    }
  },
  {
    id: 33, name: 'STRUCT_BREAK_2_BULL',
    desc: 'Close above max of prev 2 candle highs → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const level = Math.max(cs[i-1].high, cs[i-2].high);
      if (cs[i].close > level && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'struct_break_2_bull' };
      return null;
    }
  },
  {
    id: 34, name: 'STRUCT_BREAK_2_BEAR',
    desc: 'Close below min of prev 2 candle lows → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const level = Math.min(cs[i-1].low, cs[i-2].low);
      if (cs[i].close < level && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'struct_break_2_bear' };
      return null;
    }
  },
  {
    id: 35, name: 'STRUCT_BREAK_3_BULL',
    desc: 'Close above max of prev 3 candle highs → CE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const level = Math.max(cs[i-1].high, cs[i-2].high, cs[i-3].high);
      if (cs[i].close > level && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'struct_break_3_bull' };
      return null;
    }
  },
  {
    id: 36, name: 'STRUCT_BREAK_3_BEAR',
    desc: 'Close below min of prev 3 candle lows → PE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const level = Math.min(cs[i-1].low, cs[i-2].low, cs[i-3].low);
      if (cs[i].close < level && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'struct_break_3_bear' };
      return null;
    }
  },
  {
    id: 37, name: 'HIGHER_HIGH_HIGHER_LOW',
    desc: 'HH + HL pattern over 3 candles → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (b.high > a.high && c.high > b.high && b.low > a.low)
        return { signal: 'CE', reason: 'hh_hl_bull' };
      return null;
    }
  },
  {
    id: 38, name: 'LOWER_LOW_LOWER_HIGH',
    desc: 'LL + LH pattern over 3 candles → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (b.low < a.low && c.low < b.low && b.high < a.high)
        return { signal: 'PE', reason: 'll_lh_bear' };
      return null;
    }
  },
  {
    id: 39, name: 'CONSOLIDATION_BREAK_BULL',
    desc: '3 inside candles (range <50% of C0), then close above all → CE',
    fn: (cs, i, pd) => {
      if (i < 4) return null;
      const C0range = range(cs[0]);
      const consol = cs.slice(i-3, i);
      const tight = consol.every(c => range(c) < C0range * 0.5);
      const level = Math.max(...consol.map(c => c.high));
      if (tight && cs[i].close > level && bodyPct(cs[i]) > 40)
        return { signal: 'CE', reason: 'consolidation_break_bull' };
      return null;
    }
  },
  {
    id: 40, name: 'CONSOLIDATION_BREAK_BEAR',
    desc: '3 inside candles, then close below all → PE',
    fn: (cs, i, pd) => {
      if (i < 4) return null;
      const C0range = range(cs[0]);
      const consol = cs.slice(i-3, i);
      const tight = consol.every(c => range(c) < C0range * 0.5);
      const level = Math.min(...consol.map(c => c.low));
      if (tight && cs[i].close < level && bodyPct(cs[i]) < -40)
        return { signal: 'PE', reason: 'consolidation_break_bear' };
      return null;
    }
  },

  // ── PDH/PDL BASED (41–50) ─────────────────────────────────────────────────

  {
    id: 41, name: 'PDH_BREAKOUT_BULL',
    desc: 'Close above PDH for first time today → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i-1].close <= pd.pdh && cs[i].close > pd.pdh && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'pdh_breakout_bull' };
      return null;
    }
  },
  {
    id: 42, name: 'PDL_BREAKDOWN_BEAR',
    desc: 'Close below PDL for first time today → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i-1].close >= pd.pdl && cs[i].close < pd.pdl && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'pdl_breakdown_bear' };
      return null;
    }
  },
  {
    id: 43, name: 'PDH_REJECTION',
    desc: 'Price touches PDH, upper wick >40% range, bear close → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const c = cs[i];
      if (c.high >= pd.pdh && upperWick(c) > range(c) * 0.4 && isBear(c))
        return { signal: 'PE', reason: 'pdh_rejection_pe' };
      return null;
    }
  },
  {
    id: 44, name: 'PDL_REJECTION',
    desc: 'Price touches PDL, lower wick >40% range, bull close → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const c = cs[i];
      if (c.low <= pd.pdl && lowerWick(c) > range(c) * 0.4 && isBull(c))
        return { signal: 'CE', reason: 'pdl_rejection_ce' };
      return null;
    }
  },
  {
    id: 45, name: 'PDH_RETEST_BULL',
    desc: 'After PDH breakout, price pulls back to PDH, bull candle → CE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const broke = cs.slice(0, i).some(c => c.close > pd.pdh);
      if (!broke) return null;
      const c = cs[i];
      if (c.low <= pd.pdh + 20 && c.close > pd.pdh && bodyPct(c) > 35)
        return { signal: 'CE', reason: 'pdh_retest_bull' };
      return null;
    }
  },
  {
    id: 46, name: 'PDL_RETEST_BEAR',
    desc: 'After PDL breakdown, price pulls back to PDL, bear candle → PE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const broke = cs.slice(0, i).some(c => c.close < pd.pdl);
      if (!broke) return null;
      const c = cs[i];
      if (c.high >= pd.pdl - 20 && c.close < pd.pdl && bodyPct(c) < -35)
        return { signal: 'PE', reason: 'pdl_retest_bear' };
      return null;
    }
  },
  {
    id: 47, name: 'PDC_CROSS_BULL',
    desc: 'Price crosses above prev day close → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i-1].close <= pd.pdc && cs[i].close > pd.pdc && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'pdc_cross_bull' };
      return null;
    }
  },
  {
    id: 48, name: 'PDC_CROSS_BEAR',
    desc: 'Price crosses below prev day close → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i-1].close >= pd.pdc && cs[i].close < pd.pdc && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'pdc_cross_bear' };
      return null;
    }
  },
  {
    id: 49, name: 'MIDPOINT_CROSS_BULL',
    desc: 'Price crosses above midpoint of PDH-PDL range → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const mid = (pd.pdh + pd.pdl) / 2;
      if (cs[i-1].close <= mid && cs[i].close > mid && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'midpoint_cross_bull' };
      return null;
    }
  },
  {
    id: 50, name: 'MIDPOINT_CROSS_BEAR',
    desc: 'Price crosses below midpoint of PDH-PDL range → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const mid = (pd.pdh + pd.pdl) / 2;
      if (cs[i-1].close >= mid && cs[i].close < mid && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'midpoint_cross_bear' };
      return null;
    }
  },

  // ── MOMENTUM (51–60) ──────────────────────────────────────────────────────

  {
    id: 51, name: 'MOMENTUM_BULL_2',
    desc: 'Two consecutive bull candles both body >40% → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (bodyPct(cs[i-1]) > 40 && bodyPct(cs[i]) > 40)
        return { signal: 'CE', reason: 'momentum_bull_2' };
      return null;
    }
  },
  {
    id: 52, name: 'MOMENTUM_BEAR_2',
    desc: 'Two consecutive bear candles both body <-40% → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (bodyPct(cs[i-1]) < -40 && bodyPct(cs[i]) < -40)
        return { signal: 'PE', reason: 'momentum_bear_2' };
      return null;
    }
  },
  {
    id: 53, name: 'MOMENTUM_BULL_3',
    desc: 'Three consecutive bull candles → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      if (isBull(cs[i-2]) && isBull(cs[i-1]) && isBull(cs[i]))
        return { signal: 'CE', reason: 'momentum_bull_3' };
      return null;
    }
  },
  {
    id: 54, name: 'MOMENTUM_BEAR_3',
    desc: 'Three consecutive bear candles → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      if (isBear(cs[i-2]) && isBear(cs[i-1]) && isBear(cs[i]))
        return { signal: 'PE', reason: 'momentum_bear_3' };
      return null;
    }
  },
  {
    id: 55, name: 'ACCELERATION_BULL',
    desc: 'Each of 3 bull candles has larger body than previous → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const b1 = body(cs[i-2]), b2 = body(cs[i-1]), b3 = body(cs[i]);
      if (b1 > 0 && b2 > b1 && b3 > b2)
        return { signal: 'CE', reason: 'acceleration_bull' };
      return null;
    }
  },
  {
    id: 56, name: 'ACCELERATION_BEAR',
    desc: 'Each of 3 bear candles has larger body than previous → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const b1 = body(cs[i-2]), b2 = body(cs[i-1]), b3 = body(cs[i]);
      if (b1 < 0 && b2 < b1 && b3 < b2)
        return { signal: 'PE', reason: 'acceleration_bear' };
      return null;
    }
  },
  {
    id: 57, name: 'PULLBACK_BULL',
    desc: 'Bull candle, small bear candle, bull candle closes above all → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (isBull(a) && isBear(b) && Math.abs(bodyPct(b)) < 40 && isBull(c) && c.close > a.close)
        return { signal: 'CE', reason: 'pullback_bull' };
      return null;
    }
  },
  {
    id: 58, name: 'PULLBACK_BEAR',
    desc: 'Bear candle, small bull candle, bear candle closes below all → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (isBear(a) && isBull(b) && Math.abs(bodyPct(b)) < 40 && isBear(c) && c.close < a.close)
        return { signal: 'PE', reason: 'pullback_bear' };
      return null;
    }
  },
  {
    id: 59, name: 'RANGE_EXPANSION_BULL',
    desc: 'Current candle range >2x average of prev 3 ranges, bull → CE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const avgR = avg(cs.slice(i-3, i).map(range));
      if (range(cs[i]) > avgR * 2 && isBull(cs[i]))
        return { signal: 'CE', reason: 'range_expansion_bull' };
      return null;
    }
  },
  {
    id: 60, name: 'RANGE_EXPANSION_BEAR',
    desc: 'Current candle range >2x average of prev 3 ranges, bear → PE',
    fn: (cs, i, pd) => {
      if (i < 3) return null;
      const avgR = avg(cs.slice(i-3, i).map(range));
      if (range(cs[i]) > avgR * 2 && isBear(cs[i]))
        return { signal: 'PE', reason: 'range_expansion_bear' };
      return null;
    }
  },

  // ── REVERSAL PATTERNS (61–70) ─────────────────────────────────────────────

  {
    id: 61, name: 'HAMMER_BULL',
    desc: 'Lower wick >2x body, small upper wick, close near high → CE',
    fn: (cs, i, pd) => {
      const c = cs[i];
      if (lowerWick(c) > Math.abs(body(c)) * 2 && upperWick(c) < Math.abs(body(c)) && isBull(c))
        return { signal: 'CE', reason: 'hammer_bull' };
      return null;
    }
  },
  {
    id: 62, name: 'SHOOTING_STAR_BEAR',
    desc: 'Upper wick >2x body, small lower wick, close near low → PE',
    fn: (cs, i, pd) => {
      const c = cs[i];
      if (upperWick(c) > Math.abs(body(c)) * 2 && lowerWick(c) < Math.abs(body(c)) && isBear(c))
        return { signal: 'PE', reason: 'shooting_star_bear' };
      return null;
    }
  },
  {
    id: 63, name: 'TRAP_BULL',
    desc: 'Bear candle makes new low then closes bullish above prev candle mid → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      const prevMid = (p.high + p.low) / 2;
      if (c.low < p.low && isBull(c) && c.close > prevMid)
        return { signal: 'CE', reason: 'trap_bull' };
      return null;
    }
  },
  {
    id: 64, name: 'TRAP_BEAR',
    desc: 'Bull candle makes new high then closes bearish below prev candle mid → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      const prevMid = (p.high + p.low) / 2;
      if (c.high > p.high && isBear(c) && c.close < prevMid)
        return { signal: 'PE', reason: 'trap_bear' };
      return null;
    }
  },
  {
    id: 65, name: 'MORNING_STAR',
    desc: 'Big bear, doji, big bull closing above bear midpoint → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (bodyPct(a) < -50 && Math.abs(bodyPct(b)) < 20 && bodyPct(c) > 50 && c.close > (a.open + a.close)/2)
        return { signal: 'CE', reason: 'morning_star' };
      return null;
    }
  },
  {
    id: 66, name: 'EVENING_STAR',
    desc: 'Big bull, doji, big bear closing below bull midpoint → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const a = cs[i-2], b = cs[i-1], c = cs[i];
      if (bodyPct(a) > 50 && Math.abs(bodyPct(b)) < 20 && bodyPct(c) < -50 && c.close < (a.open + a.close)/2)
        return { signal: 'PE', reason: 'evening_star' };
      return null;
    }
  },
  {
    id: 67, name: 'FAILED_BREAKDOWN_BULL',
    desc: 'Candle breaks below prev low, closes back above it → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (c.low < p.low && c.close > p.low && bodyPct(c) > 30)
        return { signal: 'CE', reason: 'failed_breakdown_bull' };
      return null;
    }
  },
  {
    id: 68, name: 'FAILED_BREAKOUT_BEAR',
    desc: 'Candle breaks above prev high, closes back below it → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (c.high > p.high && c.close < p.high && bodyPct(c) < -30)
        return { signal: 'PE', reason: 'failed_breakout_bear' };
      return null;
    }
  },
  {
    id: 69, name: 'DOUBLE_BOTTOM_BULL',
    desc: 'Two lows within 30pts of each other, bull breakout → CE',
    fn: (cs, i, pd) => {
      if (i < 4) return null;
      const recent = cs.slice(Math.max(0, i-6), i);
      const lows = recent.map(c => c.low);
      const minLow = Math.min(...lows);
      const secondLow = lows.filter(l => l <= minLow + 30 && l >= minLow - 30).length >= 2;
      if (secondLow && bodyPct(cs[i]) > 50)
        return { signal: 'CE', reason: 'double_bottom_bull' };
      return null;
    }
  },
  {
    id: 70, name: 'DOUBLE_TOP_BEAR',
    desc: 'Two highs within 30pts of each other, bear breakdown → PE',
    fn: (cs, i, pd) => {
      if (i < 4) return null;
      const recent = cs.slice(Math.max(0, i-6), i);
      const highs = recent.map(c => c.high);
      const maxHigh = Math.max(...highs);
      const secondHigh = highs.filter(h => h >= maxHigh - 30 && h <= maxHigh + 30).length >= 2;
      if (secondHigh && bodyPct(cs[i]) < -50)
        return { signal: 'PE', reason: 'double_top_bear' };
      return null;
    }
  },

  // ── TIME + VWAP (71–80) ───────────────────────────────────────────────────

  {
    id: 71, name: 'VWAP_CROSS_BULL',
    desc: 'Price crosses above VWAP → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const v = vwap(cs.slice(0, i));
      if (cs[i-1].close <= v && cs[i].close > v && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'vwap_cross_bull' };
      return null;
    }
  },
  {
    id: 72, name: 'VWAP_CROSS_BEAR',
    desc: 'Price crosses below VWAP → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const v = vwap(cs.slice(0, i));
      if (cs[i-1].close >= v && cs[i].close < v && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'vwap_cross_bear' };
      return null;
    }
  },
  {
    id: 73, name: 'VWAP_REJECT_BULL',
    desc: 'Price tests VWAP from below and bounces → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const v = vwap(cs.slice(0, i));
      const c = cs[i];
      if (c.low <= v && c.low >= v - 30 && c.close > v && bodyPct(c) > 40)
        return { signal: 'CE', reason: 'vwap_reject_bull' };
      return null;
    }
  },
  {
    id: 74, name: 'VWAP_REJECT_BEAR',
    desc: 'Price tests VWAP from above and rejects → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const v = vwap(cs.slice(0, i));
      const c = cs[i];
      if (c.high >= v && c.high <= v + 30 && c.close < v && bodyPct(c) < -40)
        return { signal: 'PE', reason: 'vwap_reject_bear' };
      return null;
    }
  },
  {
    id: 75, name: 'TIME_1030_TREND_BULL',
    desc: 'At 10:30 candle (i=4), price above VWAP, bull body → CE',
    fn: (cs, i, pd) => {
      if (i !== 4) return null;
      const v = vwap(cs.slice(0, 4));
      if (cs[i].close > v && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'time_1030_trend_bull' };
      return null;
    }
  },
  {
    id: 76, name: 'TIME_1030_TREND_BEAR',
    desc: 'At 10:30 candle, price below VWAP, bear body → PE',
    fn: (cs, i, pd) => {
      if (i !== 4) return null;
      const v = vwap(cs.slice(0, 4));
      if (cs[i].close < v && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'time_1030_trend_bear' };
      return null;
    }
  },
  {
    id: 77, name: 'TIME_1300_TREND_BULL',
    desc: 'At 13:00 candle, price above opening + 100pts, bull → CE',
    fn: (cs, i, pd) => {
      if (!cs[i] || cs[i].time !== '13:00') return null;
      if (cs[i].close > cs[0].open + 100 && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'time_1300_trend_bull' };
      return null;
    }
  },
  {
    id: 78, name: 'TIME_1300_TREND_BEAR',
    desc: 'At 13:00 candle, price below opening - 100pts, bear → PE',
    fn: (cs, i, pd) => {
      if (!cs[i] || cs[i].time !== '13:00') return null;
      if (cs[i].close < cs[0].open - 100 && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'time_1300_trend_bear' };
      return null;
    }
  },
  {
    id: 79, name: 'MORNING_RANGE_HIGH_BULL',
    desc: 'Morning (9:15-11:00) high broken in afternoon → CE',
    fn: (cs, i, pd) => {
      if (i < 7) return null;
      if (!cs[i].time || cs[i].time < '11:15') return null;
      const morningHigh = Math.max(...cs.slice(0, 7).map(c => c.high));
      if (cs[i-1].close <= morningHigh && cs[i].close > morningHigh && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'morning_range_high_bull' };
      return null;
    }
  },
  {
    id: 80, name: 'MORNING_RANGE_LOW_BEAR',
    desc: 'Morning (9:15-11:00) low broken in afternoon → PE',
    fn: (cs, i, pd) => {
      if (i < 7) return null;
      if (!cs[i].time || cs[i].time < '11:15') return null;
      const morningLow = Math.min(...cs.slice(0, 7).map(c => c.low));
      if (cs[i-1].close >= morningLow && cs[i].close < morningLow && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'morning_range_low_bear' };
      return null;
    }
  },

  // ── COMBINED FILTERS (81–100) ─────────────────────────────────────────────

  {
    id: 81, name: 'GAP_UP_BODY_BREAK_BULL',
    desc: 'Gap up + body breakout above prev candle body → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[0].open <= pd.pdc + 50) return null;
      if (cs[i].close > bodyHigh(cs[i-1]) && bodyPct(cs[i]) > 40)
        return { signal: 'CE', reason: 'gap_up_body_break_bull' };
      return null;
    }
  },
  {
    id: 82, name: 'GAP_DOWN_BODY_BREAK_BEAR',
    desc: 'Gap down + body breakdown below prev candle body → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[0].open >= pd.pdc - 50) return null;
      if (cs[i].close < bodyLow(cs[i-1]) && bodyPct(cs[i]) < -40)
        return { signal: 'PE', reason: 'gap_down_body_break_bear' };
      return null;
    }
  },
  {
    id: 83, name: 'PDH_BREAK_STRONG_BULL',
    desc: 'PDH breakout with body% > 60 → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i-1].close <= pd.pdh && cs[i].close > pd.pdh && bodyPct(cs[i]) > 60)
        return { signal: 'CE', reason: 'pdh_break_strong_bull' };
      return null;
    }
  },
  {
    id: 84, name: 'PDL_BREAK_STRONG_BEAR',
    desc: 'PDL breakdown with body% < -60 → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i-1].close >= pd.pdl && cs[i].close < pd.pdl && bodyPct(cs[i]) < -60)
        return { signal: 'PE', reason: 'pdl_break_strong_bear' };
      return null;
    }
  },
  {
    id: 85, name: 'STRUCT_BREAK_ABOVE_PDH',
    desc: 'Already above PDH, structure break up → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[0].open <= pd.pdh) return null;
      if (cs[i].close > cs[i-1].high && bodyPct(cs[i]) > 35)
        return { signal: 'CE', reason: 'struct_break_above_pdh_bull' };
      return null;
    }
  },
  {
    id: 86, name: 'STRUCT_BREAK_BELOW_PDL',
    desc: 'Already below PDL, structure break down → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[0].open >= pd.pdl) return null;
      if (cs[i].close < cs[i-1].low && bodyPct(cs[i]) < -35)
        return { signal: 'PE', reason: 'struct_break_below_pdl_bear' };
      return null;
    }
  },
  {
    id: 87, name: 'VWAP_PDH_COMBO_BULL',
    desc: 'Close above both VWAP and PDH → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const v = vwap(cs.slice(0, i));
      if (cs[i].close > v && cs[i].close > pd.pdh && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'vwap_pdh_combo_bull' };
      return null;
    }
  },
  {
    id: 88, name: 'VWAP_PDL_COMBO_BEAR',
    desc: 'Close below both VWAP and PDL → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      const v = vwap(cs.slice(0, i));
      if (cs[i].close < v && cs[i].close < pd.pdl && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'vwap_pdl_combo_bear' };
      return null;
    }
  },
  {
    id: 89, name: 'MOMENTUM_ABOVE_PDH',
    desc: 'Above PDH + 3 consecutive bull candles → CE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      if (cs[0].open <= pd.pdh) return null;
      if (isBull(cs[i-2]) && isBull(cs[i-1]) && isBull(cs[i]))
        return { signal: 'CE', reason: 'momentum_above_pdh_bull' };
      return null;
    }
  },
  {
    id: 90, name: 'MOMENTUM_BELOW_PDL',
    desc: 'Below PDL + 3 consecutive bear candles → PE',
    fn: (cs, i, pd) => {
      if (i < 2) return null;
      if (cs[0].open >= pd.pdl) return null;
      if (isBear(cs[i-2]) && isBear(cs[i-1]) && isBear(cs[i]))
        return { signal: 'PE', reason: 'momentum_below_pdl_bear' };
      return null;
    }
  },
  {
    id: 91, name: 'ORB_WITH_PDH_BULL',
    desc: 'ORB 15-min breakout AND above PDH → CE (double confirmation)',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close > cs[0].high && cs[i].close > pd.pdh && bodyPct(cs[i]) > 30)
        return { signal: 'CE', reason: 'orb_pdh_double_bull' };
      return null;
    }
  },
  {
    id: 92, name: 'ORB_WITH_PDL_BEAR',
    desc: 'ORB 15-min breakdown AND below PDL → PE (double confirmation)',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      if (cs[i].close < cs[0].low && cs[i].close < pd.pdl && bodyPct(cs[i]) < -30)
        return { signal: 'PE', reason: 'orb_pdl_double_bear' };
      return null;
    }
  },
  {
    id: 93, name: 'ENGULF_AT_PDH',
    desc: 'Bearish engulf at PDH level → PE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (Math.abs(p.close - pd.pdh) < 50 && isBull(p) && isBear(c) && c.close < bodyLow(p))
        return { signal: 'PE', reason: 'engulf_at_pdh_bear' };
      return null;
    }
  },
  {
    id: 94, name: 'ENGULF_AT_PDL',
    desc: 'Bullish engulf at PDL level → CE',
    fn: (cs, i, pd) => {
      if (i < 1) return null;
      const p = cs[i-1], c = cs[i];
      if (Math.abs(p.close - pd.pdl) < 50 && isBear(p) && isBull(c) && c.close > bodyHigh(p))
        return { signal: 'CE', reason: 'engulf_at_pdl_bull' };
      return null;
    }
  },
  {
    id: 95, name: 'STRONG_OPEN_CONTINUATION_BULL',
    desc: 'C0 body >80% bull, C1 also bull → CE',
    fn: (cs, i, pd) => {
      if (i !== 1) return null;
      if (bodyPct(cs[0]) > 80 && isBull(cs[1]))
        return { signal: 'CE', reason: 'strong_open_cont_bull' };
      return null;
    }
  },
  {
    id: 96, name: 'STRONG_OPEN_CONTINUATION_BEAR',
    desc: 'C0 body <-80% bear, C1 also bear → PE',
    fn: (cs, i, pd) => {
      if (i !== 1) return null;
      if (bodyPct(cs[0]) < -80 && isBear(cs[1]))
        return { signal: 'PE', reason: 'strong_open_cont_bear' };
      return null;
    }
  },
  {
    id: 97, name: 'HAMMER_AT_SUPPORT',
    desc: 'Hammer candle within 30pts of PDL → CE',
    fn: (cs, i, pd) => {
      const c = cs[i];
      if (Math.abs(c.low - pd.pdl) > 30) return null;
      if (lowerWick(c) > Math.abs(body(c)) * 2 && isBull(c))
        return { signal: 'CE', reason: 'hammer_at_pdl_support' };
      return null;
    }
  },
  {
    id: 98, name: 'SHOOTING_STAR_AT_RESISTANCE',
    desc: 'Shooting star within 30pts of PDH → PE',
    fn: (cs, i, pd) => {
      const c = cs[i];
      if (Math.abs(c.high - pd.pdh) > 30) return null;
      if (upperWick(c) > Math.abs(body(c)) * 2 && isBear(c))
        return { signal: 'PE', reason: 'shooting_star_at_pdh_resistance' };
      return null;
    }
  },
  {
    id: 99, name: 'TRAP_ABOVE_PDH_BEAR',
    desc: 'Spike above PDH, closes back below PDH → PE (false breakout)',
    fn: (cs, i, pd) => {
      const c = cs[i];
      if (c.high > pd.pdh + 30 && c.close < pd.pdh && bodyPct(c) < -30)
        return { signal: 'PE', reason: 'trap_above_pdh_bear' };
      return null;
    }
  },
  {
    id: 100, name: 'TRAP_BELOW_PDL_BULL',
    desc: 'Spike below PDL, closes back above PDL → CE (false breakdown)',
    fn: (cs, i, pd) => {
      const c = cs[i];
      if (c.low < pd.pdl - 30 && c.close > pd.pdl && bodyPct(c) > 30)
        return { signal: 'CE', reason: 'trap_below_pdl_bull' };
      return null;
    }
  },

];

module.exports = { LOGICS };

// ── Quick summary print ───────────────────────────────────────────────────────
if (require.main === module) {
  console.log('');
  console.log('100 ENTRY LOGICS — DRISHTI V2 CANDIDATES');
  console.log('═'.repeat(60));
  const groups = {
    'GAP BASED (1-10)':          LOGICS.slice(0,10),
    'OPENING RANGE (11-20)':     LOGICS.slice(10,20),
    'BODY BREAKOUT (21-30)':     LOGICS.slice(20,30),
    'STRUCTURE BREAK (31-40)':   LOGICS.slice(30,40),
    'PDH/PDL BASED (41-50)':     LOGICS.slice(40,50),
    'MOMENTUM (51-60)':          LOGICS.slice(50,60),
    'REVERSAL PATTERNS (61-70)': LOGICS.slice(60,70),
    'TIME + VWAP (71-80)':       LOGICS.slice(70,80),
    'COMBINED FILTERS (81-100)': LOGICS.slice(80,100),
  };
  for (const [grp, logics] of Object.entries(groups)) {
    console.log('\n' + grp);
    console.log('─'.repeat(60));
    for (const l of logics) {
      console.log('  #' + String(l.id).padStart(3) + '  ' + l.name.padEnd(35) + l.desc);
    }
  }
  console.log('\nTotal logics:', LOGICS.length);
}

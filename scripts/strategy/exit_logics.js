'use strict';

/**
 * 100 Exit Logic Combinations for BankNifty
 * Each logic returns: { exit: true|false, reason: string, exitPrice?: number, exitType: 'SL'|'PROFIT'|'TIME'|'PATTERN'|'VWAP'|'REVERSAL' }
 * Input: candles[] (15-min OHLC), index i, entry { price, idx, dir }, prevDay { pdh, pdl, pdc }
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
function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a,b) => a+b, 0) / arr.length; }
function sum(arr) { return arr.reduce((a,b) => a+b, 0); }
function atr(candles, period = 14) {
  if (candles.length < period) return avg(candles.map(c => range(c)));
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(range(candles[i]), Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close));
    trs.push(tr);
  }
  return avg(trs.slice(-period));
}

const EXITS = [

  // ── FIXED STOP LOSS (1–10) ────────────────────────────────────────────────

  {
    id: 1, name: 'SL_FIXED_150',
    desc: 'Fixed SL at 150 pts from entry',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      if (move <= -150) return { exit: true, reason: 'sl_fixed_150', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 2, name: 'SL_FIXED_100',
    desc: 'Fixed SL at 100 pts from entry',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      if (move <= -100) return { exit: true, reason: 'sl_fixed_100', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 3, name: 'SL_FIXED_200',
    desc: 'Fixed SL at 200 pts from entry',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      if (move <= -200) return { exit: true, reason: 'sl_fixed_200', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 4, name: 'SL_FIXED_75',
    desc: 'Fixed SL at 75 pts from entry (tight)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      if (move <= -75) return { exit: true, reason: 'sl_fixed_75', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 5, name: 'SL_FIXED_250',
    desc: 'Fixed SL at 250 pts from entry (wide)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      if (move <= -250) return { exit: true, reason: 'sl_fixed_250', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 6, name: 'SL_ENTRY_CANDLE_EXTREME',
    desc: 'SL at opposite extreme of entry candle',
    fn: (cs, i, entry, pd) => {
      if (i === entry.idx) return { exit: false };
      const entryCandle = cs[entry.idx];
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const slLevel = entry.dir === 'CE' ? entryCandle.low : entryCandle.high;
      const move = sign * (c.low - slLevel);
      if (move <= 0) return { exit: true, reason: 'sl_entry_candle_extreme', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 7, name: 'SL_2_CANDLE_EXTREME',
    desc: 'SL at extreme of last 2 candles',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 1) return { exit: false };
      const slLevel = entry.dir === 'CE'
        ? Math.min(cs[i-1].low, cs[i].low)
        : Math.max(cs[i-1].high, cs[i].high);
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      if (entry.dir === 'CE' && c.low < slLevel - 20) return { exit: true, reason: 'sl_2_candle_extreme', exitType: 'SL' };
      if (entry.dir === 'PE' && c.high > slLevel + 20) return { exit: true, reason: 'sl_2_candle_extreme', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 8, name: 'SL_AT_PDH',
    desc: 'PE SL at PDH level, CE SL at PDL level',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      if (entry.dir === 'PE' && c.high >= pd.pdh) return { exit: true, reason: 'sl_at_pdh', exitType: 'SL' };
      if (entry.dir === 'CE' && c.low <= pd.pdl) return { exit: true, reason: 'sl_at_pdl', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 9, name: 'SL_BEYOND_ENTRY_BODY',
    desc: 'SL beyond opposite end of entry candle body',
    fn: (cs, i, entry, pd) => {
      if (i === entry.idx) return { exit: false };
      const entryBody = entry.dir === 'CE'
        ? Math.min(cs[entry.idx].open, cs[entry.idx].close)
        : Math.max(cs[entry.idx].open, cs[entry.idx].close);
      const c = cs[i];
      if (entry.dir === 'CE' && c.low < entryBody - 50) return { exit: true, reason: 'sl_beyond_entry_body', exitType: 'SL' };
      if (entry.dir === 'PE' && c.high > entryBody + 50) return { exit: true, reason: 'sl_beyond_entry_body', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 10, name: 'SL_PERCENTAGE_2PCT',
    desc: 'SL at 2% loss from entry price',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const slLevel = entry.price * (entry.dir === 'CE' ? 0.98 : 1.02);
      if (entry.dir === 'CE' && c.low < slLevel) return { exit: true, reason: 'sl_pct_2pct', exitType: 'SL' };
      if (entry.dir === 'PE' && c.high > slLevel) return { exit: true, reason: 'sl_pct_2pct', exitType: 'SL' };
      return { exit: false };
    }
  },

  // ── TRAILING STOP LOSS (11–20) ────────────────────────────────────────────

  {
    id: 11, name: 'TRAIL_LOCK10',
    desc: 'Trail: once peak ≥10pts, trail=peak-10pts',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, trail = entry.dir === 'CE' ? -150 : -150;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) { peak = fav; trail = peak >= 10 ? peak - 10 : -150; }
      }
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_lock10', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 12, name: 'TRAIL_LOCK5',
    desc: 'Trail: once peak ≥5pts, trail=peak-5pts',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, trail = -150;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) { peak = fav; trail = peak >= 5 ? peak - 5 : -150; }
      }
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_lock5', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 13, name: 'TRAIL_LOCK15',
    desc: 'Trail: once peak ≥15pts, trail=peak-15pts',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, trail = -150;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) { peak = fav; trail = peak >= 15 ? peak - 15 : -150; }
      }
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_lock15', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 14, name: 'TRAIL_LOCK20',
    desc: 'Trail: once peak ≥20pts, trail=peak-20pts',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, trail = -150;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) { peak = fav; trail = peak >= 20 ? peak - 20 : -150; }
      }
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_lock20', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 15, name: 'TRAIL_PCT_50',
    desc: 'Trail: once peak ≥50pts, trail=peak-50pts',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, trail = -150;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) { peak = fav; trail = peak >= 50 ? peak - 50 : -150; }
      }
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_50pct', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 16, name: 'TRAIL_ATRX1',
    desc: 'Trail: trail = peak - 1xATR',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const slicedCs2 = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs2) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak >= atrVal ? peak - atrVal : -150;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_atr_1x', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 17, name: 'TRAIL_CHANDELIER_SHORT',
    desc: 'Chandelier trail: peak - (2xATR)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const slicedCs2 = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs2) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak >= atrVal * 2 ? peak - atrVal * 2 : -150;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_chandelier', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 18, name: 'TRAIL_BREAKEVEN_PLUS_5',
    desc: 'Trail: once peak ≥20pts, trail to breakeven+5',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak >= 20 ? 5 : -150;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_be_plus5', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 19, name: 'TRAIL_HALF_GAIN',
    desc: 'Trail: lock half the gain as protection',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak / 2;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_half_gain', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 20, name: 'TRAIL_TWO_THIRDS_GAIN',
    desc: 'Trail: lock two-thirds of gain, risk one-third',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak * 2 / 3;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: 'trail_2_3_gain', exitType: 'SL' };
      return { exit: false };
    }
  },

  // ── FIXED PROFIT TARGET (21–30) ───────────────────────────────────────────

  {
    id: 21, name: 'PROFIT_50',
    desc: 'Exit at +50 pts profit',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 50) return { exit: true, reason: 'profit_50', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 22, name: 'PROFIT_100',
    desc: 'Exit at +100 pts profit',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 100) return { exit: true, reason: 'profit_100', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 23, name: 'PROFIT_150',
    desc: 'Exit at +150 pts profit',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 150) return { exit: true, reason: 'profit_150', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 24, name: 'PROFIT_200',
    desc: 'Exit at +200 pts profit',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 200) return { exit: true, reason: 'profit_200', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 25, name: 'PROFIT_25',
    desc: 'Exit at +25 pts profit (scalp)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 25) return { exit: true, reason: 'profit_25', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 26, name: 'PROFIT_75',
    desc: 'Exit at +75 pts profit',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 75) return { exit: true, reason: 'profit_75', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 27, name: 'PROFIT_250',
    desc: 'Exit at +250 pts profit (big target)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 250) return { exit: true, reason: 'profit_250', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 28, name: 'PROFIT_AT_PDH',
    desc: 'CE: exit at PDH, PE: exit at PDL',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      if (entry.dir === 'CE' && c.high >= pd.pdh) return { exit: true, reason: 'profit_at_pdh', exitType: 'PROFIT' };
      if (entry.dir === 'PE' && c.low <= pd.pdl) return { exit: true, reason: 'profit_at_pdl', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 29, name: 'PROFIT_PERCENTAGE_1PCT',
    desc: 'Exit at +1% from entry price',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const target = entry.price * (entry.dir === 'CE' ? 1.01 : 0.99);
      if (entry.dir === 'CE' && c.high >= target) return { exit: true, reason: 'profit_1pct', exitType: 'PROFIT' };
      if (entry.dir === 'PE' && c.low <= target) return { exit: true, reason: 'profit_1pct', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 30, name: 'PROFIT_RISK_REWARD_1TO2',
    desc: 'Exit at 2x risk (SL=150, target=300)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const target = 300;
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= target) return { exit: true, reason: 'profit_rr_1to2', exitType: 'PROFIT' };
      return { exit: false };
    }
  },

  // ── PARTIAL PROFIT (31–40) ────────────────────────────────────────────────

  {
    id: 31, name: 'PARTIAL_50_AT_50',
    desc: 'Exit 50% at +50pts, trail rest',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 50) return { exit: true, reason: 'partial_50pct_at_50pts', exitType: 'PROFIT', partial: 0.5 };
      return { exit: false };
    }
  },
  {
    id: 32, name: 'PARTIAL_33_AT_75',
    desc: 'Exit 33% at +75pts, trail rest',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 75) return { exit: true, reason: 'partial_33pct_at_75pts', exitType: 'PROFIT', partial: 0.33 };
      return { exit: false };
    }
  },
  {
    id: 33, name: 'PARTIAL_50_AT_100',
    desc: 'Exit 50% at +100pts, trail rest',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 100) return { exit: true, reason: 'partial_50pct_at_100pts', exitType: 'PROFIT', partial: 0.5 };
      return { exit: false };
    }
  },
  {
    id: 34, name: 'PARTIAL_25_AT_50',
    desc: 'Exit 25% at +50pts, reduce SL on rest',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 50) return { exit: true, reason: 'partial_25pct_at_50pts', exitType: 'PROFIT', partial: 0.25 };
      return { exit: false };
    }
  },
  {
    id: 35, name: 'PARTIAL_THIRDS',
    desc: 'Exit 1/3 at +50, 1/3 at +150, trail 1/3',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 50) return { exit: true, reason: 'partial_thirds_1', exitType: 'PROFIT', partial: 0.33 };
      return { exit: false };
    }
  },
  {
    id: 36, name: 'PARTIAL_EARLY_BREAKEVEN',
    desc: 'Exit 50% at +30pts (move to BE), trail rest',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 30) return { exit: true, reason: 'partial_be_lock', exitType: 'PROFIT', partial: 0.5 };
      return { exit: false };
    }
  },
  {
    id: 37, name: 'PARTIAL_10_AT_20',
    desc: 'Exit 10% scalp at +20pts',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 20) return { exit: true, reason: 'partial_scalp_10pct', exitType: 'PROFIT', partial: 0.1 };
      return { exit: false };
    }
  },
  {
    id: 38, name: 'PARTIAL_HALF_AT_ENTRY_PLUS_50',
    desc: 'Exit 50% at entry+50, trail other 50% with LOCK10',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 50) return { exit: true, reason: 'partial_half_at_50', exitType: 'PROFIT', partial: 0.5 };
      return { exit: false };
    }
  },
  {
    id: 39, name: 'PARTIAL_BREAKOUT_CANDLE',
    desc: 'Exit 25% if candle breaks structure after +30pts',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 2) return { exit: false };
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      const prev = cs[i-1];
      if (move >= 30 && ((entry.dir === 'CE' && c.close > prev.high) || (entry.dir === 'PE' && c.close < prev.low)))
        return { exit: true, reason: 'partial_breakout', exitType: 'PROFIT', partial: 0.25 };
      return { exit: false };
    }
  },
  {
    id: 40, name: 'PARTIAL_EVERY_50PTS',
    desc: 'Scale out 20% every 50pts gained',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      const scale = Math.floor(move / 50);
      if (scale > 0) return { exit: true, reason: 'partial_scale_50pts', exitType: 'PROFIT', partial: 0.2 * scale };
      return { exit: false };
    }
  },

  // ── TIME-BASED EXITS (41–50) ──────────────────────────────────────────────

  {
    id: 41, name: 'EXIT_EOD_1515',
    desc: 'Mandatory exit at 15:15 close',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time === '15:15') return { exit: true, reason: 'eod_1515', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 42, name: 'EXIT_1430',
    desc: 'Exit at 14:30 close (30 min before EOD)',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time === '14:30') return { exit: true, reason: 'exit_1430', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 43, name: 'EXIT_1300',
    desc: 'Exit at 13:00 close (afternoon cutoff)',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time === '13:00') return { exit: true, reason: 'exit_1300', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 44, name: 'EXIT_AFTER_5_CANDLES',
    desc: 'Exit after 5 candles (75 mins) from entry',
    fn: (cs, i, entry, pd) => {
      if (i >= entry.idx + 5) return { exit: true, reason: 'exit_5_candles', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 45, name: 'EXIT_AFTER_10_CANDLES',
    desc: 'Exit after 10 candles (150 mins) from entry',
    fn: (cs, i, entry, pd) => {
      if (i >= entry.idx + 10) return { exit: true, reason: 'exit_10_candles', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 46, name: 'EXIT_AFTER_3_CANDLES',
    desc: 'Exit after 3 candles (45 mins) from entry',
    fn: (cs, i, entry, pd) => {
      if (i >= entry.idx + 3) return { exit: true, reason: 'exit_3_candles', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 47, name: 'EXIT_1130',
    desc: 'Exit at 11:30 (morning cutoff)',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time === '11:30') return { exit: true, reason: 'exit_1130', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 48, name: 'EXIT_1200',
    desc: 'Exit at 12:00 (lunch hour)',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time === '12:00') return { exit: true, reason: 'exit_1200', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 49, name: 'EXIT_IF_NO_PROFIT_BY_1400',
    desc: 'If not profitable by 14:00, exit at market',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time === '14:00') {
        const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
        if (move < 50) return { exit: true, reason: 'exit_no_profit_1400', exitType: 'TIME' };
      }
      return { exit: false };
    }
  },
  {
    id: 50, name: 'EXIT_CANDLE_AFTER_1500',
    desc: 'Exit after 15:00, mandatory by next candle',
    fn: (cs, i, entry, pd) => {
      if (cs[i].time && cs[i].time >= '15:00') return { exit: true, reason: 'exit_after_1500', exitType: 'TIME' };
      return { exit: false };
    }
  },

  // ── PATTERN-BASED EXITS (51–60) ───────────────────────────────────────────

  {
    id: 51, name: 'EXIT_REVERSAL_CANDLE',
    desc: 'Exit if candle reverses entry direction',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && isBear(c) && bodyPct(c) < -40) return { exit: true, reason: 'exit_reversal_bear', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && isBull(c) && bodyPct(c) > 40) return { exit: true, reason: 'exit_reversal_bull', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 52, name: 'EXIT_STRUCTURE_BREAK_OPPOSITE',
    desc: 'Exit if opposite structure breaks',
    fn: (cs, i, entry, pd) => {
      if (i < 1) return { exit: false };
      const c = cs[i], prev = cs[i-1];
      if (entry.dir === 'CE' && c.close < prev.low) return { exit: true, reason: 'exit_struct_bear', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && c.close > prev.high) return { exit: true, reason: 'exit_struct_bull', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 53, name: 'EXIT_2_CONSECUTIVE_REVERSALS',
    desc: 'Exit if 2 consecutive candles reverse direction',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 2) return { exit: false };
      const c1 = cs[i-1], c2 = cs[i];
      if (entry.dir === 'CE' && isBear(c1) && isBear(c2)) return { exit: true, reason: 'exit_2_bear', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && isBull(c1) && isBull(c2)) return { exit: true, reason: 'exit_2_bull', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 54, name: 'EXIT_DOJI_AFTER_PROFIT',
    desc: 'Exit if doji forms after 50pts profit',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move >= 50 && Math.abs(bodyPct(cs[i])) < 15) return { exit: true, reason: 'exit_doji_profit', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 55, name: 'EXIT_INSIDE_DAY',
    desc: 'Exit if inside day candle (range < 50% of avg)',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 2) return { exit: false };
      const avgR = avg(cs.slice(Math.max(0, i-5), i).map(range));
      if (range(cs[i]) < avgR * 0.5) return { exit: true, reason: 'exit_inside_day', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 56, name: 'EXIT_FALSE_BREAKOUT',
    desc: 'Exit if breaks above entry, closes below entry',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && c.high > entry.price + 50 && c.close < entry.price) return { exit: true, reason: 'exit_false_breakout', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && c.low < entry.price - 50 && c.close > entry.price) return { exit: true, reason: 'exit_false_breakdown', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 57, name: 'EXIT_ENGULF_REVERSAL',
    desc: 'Exit if opposite engulfing candle forms',
    fn: (cs, i, entry, pd) => {
      if (i < 1) return { exit: false };
      const p = cs[i-1], c = cs[i];
      if (entry.dir === 'CE' && isBull(p) && isBear(c) && c.close < Math.min(p.open, p.close)) return { exit: true, reason: 'exit_engulf_bear', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && isBear(p) && isBull(c) && c.close > Math.max(p.open, p.close)) return { exit: true, reason: 'exit_engulf_bull', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 58, name: 'EXIT_HAMMER_FORMATION',
    desc: 'Exit if hammer/shooting star forms (wick reversal)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && lowerWick(c) > Math.abs(body(c)) * 2 && isBear(c)) return { exit: true, reason: 'exit_hammer_bear', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && upperWick(c) > Math.abs(body(c)) * 2 && isBull(c)) return { exit: true, reason: 'exit_star_bull', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 59, name: 'EXIT_RANGE_CONTRACTION',
    desc: 'Exit if range shrinks below 0.5x avg (consolidation)',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 3) return { exit: false };
      const avgR = avg(cs.slice(entry.idx, i).map(range));
      if (range(cs[i]) < avgR * 0.5) return { exit: true, reason: 'exit_range_contract', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 60, name: 'EXIT_WICK_REJECTION',
    desc: 'Exit if long wick in opposite direction (>60% range)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && lowerWick(c) > range(c) * 0.6) return { exit: true, reason: 'exit_wick_rejection_bear', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && upperWick(c) > range(c) * 0.6) return { exit: true, reason: 'exit_wick_rejection_bull', exitType: 'PATTERN' };
      return { exit: false };
    }
  },

  // ── VWAP-BASED EXITS (61–70) ──────────────────────────────────────────────

  {
    id: 61, name: 'EXIT_CROSS_BELOW_VWAP_CE',
    desc: 'CE: exit if crosses back below VWAP',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'CE' && cs[i-1].close > v && cs[i].close < v) return { exit: true, reason: 'exit_cross_below_vwap', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 62, name: 'EXIT_CROSS_ABOVE_VWAP_PE',
    desc: 'PE: exit if crosses back above VWAP',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'PE' && cs[i-1].close < v && cs[i].close > v) return { exit: true, reason: 'exit_cross_above_vwap', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 63, name: 'EXIT_TOUCH_VWAP_EXTENDED',
    desc: 'Exit if price touches VWAP after 5 profitable candles',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 5) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move < 50) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (Math.abs(cs[i].close - v) < 20) return { exit: true, reason: 'exit_touch_vwap_extended', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 64, name: 'EXIT_BELOW_VWAP_3_CANDLES',
    desc: 'CE: exit if 3 consecutive candles close below VWAP',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 3) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'CE' && cs[i-2].close < v && cs[i-1].close < v && cs[i].close < v)
        return { exit: true, reason: 'exit_3_below_vwap', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 65, name: 'EXIT_ABOVE_VWAP_3_CANDLES',
    desc: 'PE: exit if 3 consecutive candles close above VWAP',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 3) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'PE' && cs[i-2].close > v && cs[i-1].close > v && cs[i].close > v)
        return { exit: true, reason: 'exit_3_above_vwap', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 66, name: 'EXIT_VWAP_REJECTION_AFTER_PROFIT',
    desc: 'Exit if price wicks to VWAP after +75pts profit',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move < 75) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'CE' && cs[i].high > v && cs[i].close < v) return { exit: true, reason: 'exit_vwap_rej_profit', exitType: 'VWAP' };
      if (entry.dir === 'PE' && cs[i].low < v && cs[i].close > v) return { exit: true, reason: 'exit_vwap_rej_profit', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 67, name: 'EXIT_VWAP_SUPPORT_CE',
    desc: 'CE: exit if closes below VWAP after being above',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx + 1) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'CE' && cs[i-1].close > v && cs[i].close < v - 30)
        return { exit: true, reason: 'exit_vwap_supp_ce', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 68, name: 'EXIT_VWAP_RESISTANCE_PE',
    desc: 'PE: exit if closes above VWAP after being below',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx + 1) return { exit: false };
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'PE' && cs[i-1].close < v && cs[i].close > v + 30)
        return { exit: true, reason: 'exit_vwap_res_pe', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 69, name: 'EXIT_PRICE_ABOVE_VWAP_CEILING',
    desc: 'CE: exit if price runs too far above VWAP (>2x ATR above)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'CE' && cs[i].close > v + (atrVal * 2))
        return { exit: true, reason: 'exit_above_vwap_ceiling', exitType: 'VWAP' };
      return { exit: false };
    }
  },
  {
    id: 70, name: 'EXIT_PRICE_BELOW_VWAP_FLOOR',
    desc: 'PE: exit if price runs too far below VWAP (>2x ATR below)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const v = vwap(cs.slice(0, i+1));
      if (entry.dir === 'PE' && cs[i].close < v - (atrVal * 2))
        return { exit: true, reason: 'exit_below_vwap_floor', exitType: 'VWAP' };
      return { exit: false };
    }
  },

  // ── MOVING AVERAGE / MEAN REVERSION (71–80) ────────────────────────────────

  {
    id: 71, name: 'EXIT_SMA10_CROSS',
    desc: 'Exit if crosses SMA10',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 10) return { exit: false };
      const sma10 = avg(cs.slice(i-9, i+1).map(c => c.close));
      if (entry.dir === 'CE' && cs[i-1].close > sma10 && cs[i].close < sma10) return { exit: true, reason: 'exit_sma10_cross', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i-1].close < sma10 && cs[i].close > sma10) return { exit: true, reason: 'exit_sma10_cross', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 72, name: 'EXIT_EMA5_CROSS',
    desc: 'Exit if crosses EMA5 (simplified)',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 5) return { exit: false };
      const ema5 = avg(cs.slice(i-4, i+1).map(c => c.close));
      if (entry.dir === 'CE' && cs[i-1].close > ema5 && cs[i].close < ema5) return { exit: true, reason: 'exit_ema5_cross', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i-1].close < ema5 && cs[i].close > ema5) return { exit: true, reason: 'exit_ema5_cross', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 73, name: 'EXIT_MEAN_REVERT_ORB',
    desc: 'Exit if price mean reverts to opening range midpoint',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const orMid = (cs[0].high + cs[0].low) / 2;
      if (entry.dir === 'CE' && cs[i].close < orMid) return { exit: true, reason: 'exit_mean_revert_or', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i].close > orMid) return { exit: true, reason: 'exit_mean_revert_or', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 74, name: 'EXIT_MEAN_REVERT_PDH_PDL_MID',
    desc: 'Exit if mean reverts to PDH-PDL midpoint',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const mid = (pd.pdh + pd.pdl) / 2;
      if (entry.dir === 'CE' && cs[i].close < mid - 50) return { exit: true, reason: 'exit_mean_revert_pdmid', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i].close > mid + 50) return { exit: true, reason: 'exit_mean_revert_pdmid', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 75, name: 'EXIT_3_CANDLE_MA',
    desc: 'Exit if candle closes on wrong side of 3-candle MA',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 2) return { exit: false };
      const ma3 = avg(cs.slice(i-2, i+1).map(c => c.close));
      if (entry.dir === 'CE' && cs[i].close < ma3 - 30) return { exit: true, reason: 'exit_3ma_bear', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i].close > ma3 + 30) return { exit: true, reason: 'exit_3ma_bull', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 76, name: 'EXIT_MOMENTUM_DIVERGENCE',
    desc: 'Exit if momentum diverges (higher/lower close, lower high)',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 2) return { exit: false };
      const prev = cs[i-1];
      if (entry.dir === 'CE' && cs[i].high < prev.high && cs[i].close < cs[i-2].close)
        return { exit: true, reason: 'exit_momentum_div', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i].low > prev.low && cs[i].close > cs[i-2].close)
        return { exit: true, reason: 'exit_momentum_div', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 77, name: 'EXIT_RANGE_MEAN_REVERT',
    desc: 'Exit if closes in middle 50% of daily range',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const mid = (pd.pdh + pd.pdl) / 2;
      const range1 = (pd.pdh - pd.pdl) / 4;
      if (cs[i].close > mid - range1 && cs[i].close < mid + range1)
        return { exit: true, reason: 'exit_range_mean_revert', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 78, name: 'EXIT_BOLLINGER_REVERSAL',
    desc: 'Exit if touches opposite Bollinger Band (simplified)',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 10) return { exit: false };
      const closes = cs.slice(i-9, i+1).map(c => c.close);
      const avg1 = avg(closes);
      const dev = Math.sqrt(avg(closes.map(c => (c - avg1) ** 2)));
      const bb_lower = avg1 - (2 * dev), bb_upper = avg1 + (2 * dev);
      if (entry.dir === 'CE' && cs[i].close < bb_lower) return { exit: true, reason: 'exit_bb_lower', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i].close > bb_upper) return { exit: true, reason: 'exit_bb_upper', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 79, name: 'EXIT_EXTREME_VOLATILITY_COMPRESSION',
    desc: 'Exit if volatility drops below 1xATR (squeeze)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      if (range(cs[i]) < atrVal * 0.5) return { exit: true, reason: 'exit_vol_compression', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },
  {
    id: 80, name: 'EXIT_CLOSE_BELOW_OPEN_PLUS_SL',
    desc: 'Exit if close below entry + half SL (75pts for CE)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const threshold = entry.dir === 'CE' ? entry.price - 75 : entry.price + 75;
      if (entry.dir === 'CE' && cs[i].close < threshold) return { exit: true, reason: 'exit_close_below_entry_75', exitType: 'REVERSAL' };
      if (entry.dir === 'PE' && cs[i].close > threshold) return { exit: true, reason: 'exit_close_above_entry_75', exitType: 'REVERSAL' };
      return { exit: false };
    }
  },

  // ── ADVANCED / COMPOSITE (81–100) ─────────────────────────────────────────

  {
    id: 81, name: 'EXIT_RISK_REWARD_COMBO',
    desc: 'Exit at either: SL=-150 OR profit=+150 (1:1 RR)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.close - entry.price : entry.price - c.close;
      if (move <= -150 || move >= 150) return { exit: true, reason: 'exit_rr_combo_1to1', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 82, name: 'EXIT_RISK_REWARD_2TO1',
    desc: 'Exit at either: SL=-100 OR profit=+200 (2:1 RR)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.close - entry.price : entry.price - c.close;
      if (move <= -100 || move >= 200) return { exit: true, reason: 'exit_rr_2to1', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 83, name: 'EXIT_SMART_SL',
    desc: 'Dynamic SL: tight (75pts) before 11:30, wide (200pts) after',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      const isMorning = cs[i].time && cs[i].time < '11:30';
      const sl = isMorning ? -75 : -200;
      if (move <= sl) return { exit: true, reason: 'exit_smart_sl', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 84, name: 'EXIT_VOLATILITY_ADJUSTED_SL',
    desc: 'SL = entry ± 2xATR',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const slLevel = entry.dir === 'CE' ? entry.price - (2 * atrVal) : entry.price + (2 * atrVal);
      const c = cs[i];
      if (entry.dir === 'CE' && c.low < slLevel) return { exit: true, reason: 'exit_atr_2x_sl', exitType: 'SL' };
      if (entry.dir === 'PE' && c.high > slLevel) return { exit: true, reason: 'exit_atr_2x_sl', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 85, name: 'EXIT_PROFIT_THEN_TRAIL',
    desc: 'After +100pts, switch to LOCK5 trail',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move < 100) return { exit: false };
      // Once profitable, trail from here
      const slicedCs = cs.slice(Math.max(entry.idx + 1, i - 5), i + 1);
      let peak = 0;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak >= 5 ? peak - 5 : -150;
      const m2 = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (m2 <= -trail) return { exit: true, reason: 'exit_profit_trail', exitType: 'PROFIT' };
      return { exit: false };
    }
  },
  {
    id: 86, name: 'EXIT_BREAKEVEN_HARD_EXIT',
    desc: 'At breakeven, exit next candle if no forward momentum',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].close - entry.price : entry.price - cs[i].close;
      if (Math.abs(move) < 10) {
        if (i + 1 < cs.length) {
          const next = cs[i+1];
          const nextMove = entry.dir === 'CE' ? next.high - entry.price : entry.price - next.low;
          if (nextMove < 20) return { exit: true, reason: 'exit_be_hard_exit', exitType: 'SL' };
        }
      }
      return { exit: false };
    }
  },
  {
    id: 87, name: 'EXIT_TIME_PROFIT_COMBO',
    desc: 'Exit at 14:00 OR +150pts, whichever comes first',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 150) return { exit: true, reason: 'exit_time_profit_150', exitType: 'PROFIT' };
      if (cs[i].time === '14:00') return { exit: true, reason: 'exit_time_profit_1400', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 88, name: 'EXIT_DECISION_AT_5CANDLES',
    desc: 'At 5 candles: if profitable exit 75%, else trail SL',
    fn: (cs, i, entry, pd) => {
      if (i !== entry.idx + 5) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move >= 50) return { exit: true, reason: 'exit_5candle_profit', exitType: 'PROFIT', partial: 0.75 };
      return { exit: false };
    }
  },
  {
    id: 89, name: 'EXIT_DUAL_CONDITION',
    desc: 'Exit if (reversal candle) AND (time >12:30)',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      if (!cs[i].time || cs[i].time < '12:30') return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && isBear(c) && bodyPct(c) < -40) return { exit: true, reason: 'exit_dual_rev_time', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && isBull(c) && bodyPct(c) > 40) return { exit: true, reason: 'exit_dual_rev_time', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 90, name: 'EXIT_PYRAMID_PROFIT',
    desc: 'Lock profit: 20% at 50pts, 30% at 100pts, 50% at 200pts',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 200) return { exit: true, reason: 'exit_pyramid_200', exitType: 'PROFIT', partial: 0.5 };
      if (move >= 100) return { exit: true, reason: 'exit_pyramid_100', exitType: 'PROFIT', partial: 0.3 };
      if (move >= 50) return { exit: true, reason: 'exit_pyramid_50', exitType: 'PROFIT', partial: 0.2 };
      return { exit: false };
    }
  },

  // ── AGGRESSIVE / CONSERVATIVE (91–100) ────────────────────────────────────

  {
    id: 91, name: 'EXIT_AGGRESSIVE_SCALP',
    desc: 'Tight SL=50pts, Target=25pts (short-term scalp)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.close - entry.price : entry.price - c.close;
      if (move <= -50 || move >= 25) return { exit: true, reason: 'exit_aggressive_scalp', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 92, name: 'EXIT_CONSERVATIVE_SWING',
    desc: 'Wide SL=300pts, Target=200pts (long hold)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.close - entry.price : entry.price - c.close;
      if (move <= -300 || move >= 200) return { exit: true, reason: 'exit_conservative_swing', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 93, name: 'EXIT_BREAKEVEN_ON_REVERSAL',
    desc: 'On reversal candle, exit at breakeven + 5pts',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && isBear(c) && bodyPct(c) < -30) return { exit: true, reason: 'exit_be_reversal', exitType: 'SL' };
      if (entry.dir === 'PE' && isBull(c) && bodyPct(c) > 30) return { exit: true, reason: 'exit_be_reversal', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 94, name: 'EXIT_ONLY_AT_PROFIT',
    desc: 'Never exit at SL, only at +50pts profit or EOD',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const move = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
      if (move >= 50) return { exit: true, reason: 'exit_only_profit', exitType: 'PROFIT' };
      if (cs[i].time === '15:15') return { exit: true, reason: 'exit_eod_no_sl', exitType: 'TIME' };
      return { exit: false };
    }
  },
  {
    id: 95, name: 'EXIT_STRICT_SL',
    desc: 'Hard SL with NO trail (75pts max loss)',
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      if (move <= -75) return { exit: true, reason: 'exit_strict_sl_75', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 96, name: 'EXIT_ANTI_WHIPSAW',
    desc: 'Require +50pts gain before allowing exit below entry',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move < 50) return { exit: false };
      // Now allow normal SL
      const m2 = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (m2 <= -150) return { exit: true, reason: 'exit_anti_whipsaw_sl', exitType: 'SL' };
      return { exit: false };
    }
  },
  {
    id: 97, name: 'EXIT_FIRST_RED_CANDLE',
    desc: 'Exit on first opposite candle with body >30%',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const c = cs[i];
      if (entry.dir === 'CE' && isBear(c) && bodyPct(c) < -30) return { exit: true, reason: 'exit_first_red', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && isBull(c) && bodyPct(c) > 30) return { exit: true, reason: 'exit_first_red', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 98, name: 'EXIT_PROFIT_PROTECTION_MANDATORY',
    desc: 'Once +75pts, SL moves to BE automatically',
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      if (move >= 75) {
        // Now SL = entry
        const m2 = entry.dir === 'CE' ? cs[i].close - entry.price : entry.price - cs[i].close;
        if (m2 <= 0) return { exit: true, reason: 'exit_profit_protect', exitType: 'SL' };
      }
      return { exit: false };
    }
  },
  {
    id: 99, name: 'EXIT_MOMENTUM_FADE',
    desc: 'Exit when momentum fades: each new candle lower high/higher low',
    fn: (cs, i, entry, pd) => {
      if (i < entry.idx + 2) return { exit: false };
      if (entry.dir === 'CE' && cs[i].high < cs[i-1].high && cs[i].high < cs[i-2].high)
        return { exit: true, reason: 'exit_momentum_fade', exitType: 'PATTERN' };
      if (entry.dir === 'PE' && cs[i].low > cs[i-1].low && cs[i].low > cs[i-2].low)
        return { exit: true, reason: 'exit_momentum_fade', exitType: 'PATTERN' };
      return { exit: false };
    }
  },
  {
    id: 100, name: 'EXIT_ADAPTIVE_CANDLE_COUNT',
    desc: 'Exit after max candles: 3 if losing, 8 if profitable',
    fn: (cs, i, entry, pd) => {
      const move = entry.dir === 'CE' ? cs[i].high - entry.price : entry.price - cs[i].low;
      const isProfit = move > 50;
      const maxCandles = isProfit ? 8 : 3;
      if (i >= entry.idx + maxCandles) return { exit: true, reason: 'exit_adaptive_candles', exitType: 'TIME' };
      return { exit: false };
    }
  },

];

module.exports = { EXITS };

// ── Quick summary print ───────────────────────────────────────────────────────
if (require.main === module) {
  console.log('');
  console.log('100 EXIT LOGICS — DRISHTI V2 CANDIDATES');
  console.log('═'.repeat(60));
  const groups = {
    'FIXED SL (1-10)':               EXITS.slice(0,10),
    'TRAILING SL (11-20)':           EXITS.slice(10,20),
    'FIXED PROFIT (21-30)':          EXITS.slice(20,30),
    'PARTIAL PROFIT (31-40)':        EXITS.slice(30,40),
    'TIME-BASED (41-50)':            EXITS.slice(40,50),
    'PATTERN-BASED (51-60)':         EXITS.slice(50,60),
    'VWAP-BASED (61-70)':            EXITS.slice(60,70),
    'MA / MEAN REVERSION (71-80)':   EXITS.slice(70,80),
    'ADVANCED / COMPOSITE (81-90)':  EXITS.slice(80,90),
    'AGGRESSIVE / CONSERVATIVE (91-100)': EXITS.slice(90,100),
  };
  for (const [grp, exits] of Object.entries(groups)) {
    console.log('\n' + grp);
    console.log('─'.repeat(60));
    for (const e of exits) {
      console.log('  #' + String(e.id).padStart(3) + '  ' + e.name.padEnd(35) + e.desc);
    }
  }
  console.log('\nTotal exits:', EXITS.length);
}

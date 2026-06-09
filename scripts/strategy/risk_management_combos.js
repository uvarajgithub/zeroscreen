'use strict';

/**
 * 100 STOP LOSS COMBINATIONS
 * Each returns: { exit: true/false, exitPrice: number, reason: string }
 */

function bodyPct(c) { return (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0; }
function range(c) { return c.high - c.low; }
function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a,b) => a+b, 0) / arr.length; }
function atr(candles, period = 14) {
  if (candles.length < period) return avg(candles.map(c => range(c)));
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(range(candles[i]), Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close));
    trs.push(tr);
  }
  return avg(trs.slice(-period));
}

const SL_COMBOS = [
  // ── FIXED PTS (1–20) ──────────────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 1,
    name: `SL_FIXED_${(i+1)*10}`,
    desc: `Fixed SL at ${(i+1)*10} pts`,
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (c.low - entry.price);
      const slPts = (i + 1) * 10;
      if (move <= -slPts) return { exit: true, exitPrice: entry.price - sign * slPts, reason: `sl_fixed_${slPts}` };
      return { exit: false };
    }
  })),

  // ── PERCENTAGE SL (21–30) ─────────────────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 21,
    name: `SL_PCT_${(i+1)}`,
    desc: `SL at ${(i+1)}% loss from entry`,
    fn: (cs, i, entry, pd) => {
      const c = cs[i];
      const slLevel = entry.dir === 'CE' ? entry.price * (1 - (i+1) / 100) : entry.price * (1 + (i+1) / 100);
      if (entry.dir === 'CE' && c.low < slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_pct_${i+1}` };
      if (entry.dir === 'PE' && c.high > slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_pct_${i+1}` };
      return { exit: false };
    }
  })),

  // ── ATR-BASED SL (31–50) ──────────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 31,
    name: `SL_ATR_${(i/10 + 0.5).toFixed(1)}X`,
    desc: `SL at entry ± ${(i/10 + 0.5).toFixed(1)}x ATR`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const multiplier = i / 10 + 0.5;
      const slLevel = entry.dir === 'CE' ? entry.price - (multiplier * atrVal) : entry.price + (multiplier * atrVal);
      if (entry.dir === 'CE' && cs[i].low < slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_atr_${multiplier}x` };
      if (entry.dir === 'PE' && cs[i].high > slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_atr_${multiplier}x` };
      return { exit: false };
    }
  })),

  // ── ENTRY CANDLE BASED (51–60) ────────────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 51,
    name: `SL_ENTRY_CANDLE_OFFSET_${(i+1)*5}`,
    desc: `SL at entry candle extreme ± ${(i+1)*5} pts`,
    fn: (cs, i, entry, pd) => {
      if (i === entry.idx) return { exit: false };
      const entryCandle = cs[entry.idx];
      const extreme = entry.dir === 'CE' ? entryCandle.low : entryCandle.high;
      const offset = (i + 1) * 5;
      const slLevel = entry.dir === 'CE' ? extreme - offset : extreme + offset;
      if (entry.dir === 'CE' && cs[i].low < slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_entry_offset_${offset}` };
      if (entry.dir === 'PE' && cs[i].high > slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_entry_offset_${offset}` };
      return { exit: false };
    }
  })),

  // ── RECENT CANDLES EXTREME (61–70) ────────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 61,
    name: `SL_LAST_${i+2}_CANDLES_EXTREME`,
    desc: `SL at extreme of last ${i+2} candles`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const lookback = i + 2;
      const slicedCs = cs.slice(Math.max(entry.idx, i - lookback + 1), i + 1);
      const slLevel = entry.dir === 'CE'
        ? Math.min(...slicedCs.map(c => c.low))
        : Math.max(...slicedCs.map(c => c.high));
      if (entry.dir === 'CE' && cs[i].low < slLevel - 10) return { exit: true, exitPrice: slLevel - 10, reason: `sl_last_${lookback}_extreme` };
      if (entry.dir === 'PE' && cs[i].high > slLevel + 10) return { exit: true, exitPrice: slLevel + 10, reason: `sl_last_${lookback}_extreme` };
      return { exit: false };
    }
  })),

  // ── BODY-BASED SL (71–80) ─────────────────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 71,
    name: `SL_ENTRY_BODY_${(i+1)*10}PCT_BEYOND`,
    desc: `SL beyond entry candle body by ${(i+1)*10}% of range`,
    fn: (cs, i, entry, pd) => {
      if (i === entry.idx) return { exit: false };
      const entryCandle = cs[entry.idx];
      const bodyExtreme = entry.dir === 'CE'
        ? Math.min(entryCandle.open, entryCandle.close)
        : Math.max(entryCandle.open, entryCandle.close);
      const rangeExt = range(entryCandle) * (i + 1) / 10;
      const slLevel = entry.dir === 'CE' ? bodyExtreme - rangeExt : bodyExtreme + rangeExt;
      if (entry.dir === 'CE' && cs[i].low < slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_body_${(i+1)*10}pct` };
      if (entry.dir === 'PE' && cs[i].high > slLevel) return { exit: true, exitPrice: slLevel, reason: `sl_body_${(i+1)*10}pct` };
      return { exit: false };
    }
  })),

  // ── TIME-BASED PROGRESSIVE SL (81–90) ─────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 81,
    name: `SL_PROGRESSIVE_CANDLE_${i+1}`,
    desc: `SL tightens by 10 pts every ${i+1} candle(s)`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const candles = i - entry.idx;
      const slPts = 150 - (Math.floor(candles / (i + 1)) * 10);
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (cs[i].low - entry.price);
      if (move <= -Math.max(50, slPts)) return { exit: true, exitPrice: entry.price - sign * Math.max(50, slPts), reason: `sl_prog_${i+1}` };
      return { exit: false };
    }
  })),

  // ── VOLATILITY COMPRESSION SL (91–100) ────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 91,
    name: `SL_VOL_SQUEEZE_${(i+1)/10}X`,
    desc: `Tight SL if volatility drops below ${(i+1)/10}x avg ATR`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(Math.max(0, i - 20), i + 1);
      const atrVal = atr(slicedCs, 14);
      const avgAtr = atr(cs.slice(Math.max(0, entry.idx - 20), entry.idx + 1), 14) || atrVal;
      const threshold = avgAtr * (i + 1) / 10;
      const currentVol = range(cs[i]);
      const slPts = currentVol < threshold ? 75 : 150;
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (cs[i].low - entry.price);
      if (move <= -slPts) return { exit: true, exitPrice: entry.price - sign * slPts, reason: `sl_vol_squeeze_${(i+1)/10}x` };
      return { exit: false };
    }
  }))
];

/**
 * 100 TRAIL SL COMBINATIONS
 */

const TRAIL_SL_COMBOS = [
  // ── SIMPLE LOCK (1–20) ────────────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 1,
    name: `TRAIL_LOCK${(i+1)*5}`,
    desc: `Trail: peak ≥ ${(i+1)*5}pts → trail = peak - ${(i+1)*5}pts`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, trail = entry.dir === 'CE' ? -150 : -150;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) { peak = fav; trail = peak >= (i+1)*5 ? peak - (i+1)*5 : -150; }
      }
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: `trail_lock_${(i+1)*5}` };
      return { exit: false };
    }
  })),

  // ── ATR MULTIPLE TRAIL (21–40) ────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 21,
    name: `TRAIL_ATR_${(i+1)/5}X`,
    desc: `Trail: peak - ${(i+1)/5}x ATR`,
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
      const trail = peak >= atrVal ? peak - (atrVal * (i + 1) / 5) : -150;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: `trail_atr_${(i+1)/5}x` };
      return { exit: false };
    }
  })),

  // ── PERCENTAGE OF PEAK (41–60) ────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 41,
    name: `TRAIL_PCT_PEAK_${50 - i*2}`,
    desc: `Trail: ${50 - i*2}% of peak gain`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const pctKeep = (50 - i*2) / 100;
      const trail = peak * pctKeep;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: `trail_pct_${50 - i*2}pct` };
      return { exit: false };
    }
  })),

  // ── BREAKEVEN+X (61–75) ───────────────────────────────────────────────────
  ...Array.from({length: 15}, (_, i) => ({
    id: i + 61,
    name: `TRAIL_BREAKEVEN_PLUS_${(i+1)*5}`,
    desc: `Trail to BE once peak ≥ ${(i+1)*20}pts, keep ${(i+1)*5}pts profit`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0;
      for (const c of slicedCs) {
        const fav = entry.dir === 'CE' ? c.high - entry.price : entry.price - c.low;
        if (fav > peak) peak = fav;
      }
      const trail = peak >= (i+1)*20 ? (i+1)*5 : -150;
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: `trail_be_plus_${(i+1)*5}` };
      return { exit: false };
    }
  })),

  // ── ACCELERATION TRAIL (76–85) ────────────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 76,
    name: `TRAIL_ACCEL_${(i+1)*2}`,
    desc: `Trail tightens by ${(i+1)*2}pts every candle after peak`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const slicedCs = cs.slice(entry.idx + 1, i + 1);
      let peak = 0, peakCandle = 0;
      for (let j = 0; j < slicedCs.length; j++) {
        const fav = entry.dir === 'CE' ? slicedCs[j].high - entry.price : entry.price - slicedCs[j].low;
        if (fav > peak) { peak = fav; peakCandle = j; }
      }
      const candlesAfterPeak = slicedCs.length - peakCandle - 1;
      const trail = Math.max(0, peak - (candlesAfterPeak * (i+1) * 2));
      const move = entry.dir === 'CE' ? cs[i].low - entry.price : entry.price - cs[i].high;
      if (move <= -trail) return { exit: true, reason: `trail_accel_${(i+1)*2}` };
      return { exit: false };
    }
  })),

  // ── DYNAMIC BASED ON TIME (86–100) ────────────────────────────────────────
  ...Array.from({length: 15}, (_, i) => ({
    id: i + 86,
    name: `TRAIL_TIME_BASED_${i+1}`,
    desc: `Trail: ${150 - (i+1)*5}pts if <${i+1+5} candles, else ${150 - (i+1)*10}pts`,
    fn: (cs, i, entry, pd) => {
      if (i <= entry.idx) return { exit: false };
      const candles = i - entry.idx;
      const slPts = candles < (i + 6) ? 150 - (i+1)*5 : 150 - (i+1)*10;
      const sign = entry.dir === 'CE' ? 1 : -1;
      const move = sign * (cs[i].low - entry.price);
      if (move <= -Math.max(50, slPts)) return { exit: true, reason: `trail_time_${i+1}` };
      return { exit: false };
    }
  }))
];

/**
 * 100 RE-ENTRY COMBINATIONS
 */

const REENTRY_COMBOS = [
  // ── SAME DIRECTION (1–20) ─────────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 1,
    name: `REENTRY_SAME_DIR_BODY_${(i+1)*5}PCT`,
    desc: `Same direction: first candle with body% > ${(i+1)*5}%`,
    fn: (today, exitIdx, lastDir, pd) => {
      const lastIdx = today.length - 1;
      if (lastIdx <= exitIdx) return null;
      const thresh = (i + 1) * 5;
      for (let j = exitIdx + 1; j <= lastIdx; j++) {
        const b = bodyPct(today[j]);
        if (lastDir === 'CE' && b > thresh) return { idx: j, dir: 'CE', reason: `reentry_same_${thresh}pct` };
        if (lastDir === 'PE' && b < -thresh) return { idx: j, dir: 'PE', reason: `reentry_same_${thresh}pct` };
      }
      return null;
    }
  })),

  // ── OPPOSITE DIRECTION (21–40) ────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 21,
    name: `REENTRY_REVERSE_BODY_${(i+1)*5}PCT`,
    desc: `Reverse direction: first candle with body% < -${(i+1)*5}% (if CE) or > ${(i+1)*5}% (if PE)`,
    fn: (today, exitIdx, lastDir, pd) => {
      const lastIdx = today.length - 1;
      if (lastIdx <= exitIdx) return null;
      const thresh = (i + 1) * 5;
      for (let j = exitIdx + 1; j <= lastIdx; j++) {
        const b = bodyPct(today[j]);
        if (lastDir === 'CE' && b < -thresh) return { idx: j, dir: 'PE', reason: `reentry_rev_${thresh}pct` };
        if (lastDir === 'PE' && b > thresh) return { idx: j, dir: 'CE', reason: `reentry_rev_${thresh}pct` };
      }
      return null;
    }
  })),

  // ── STRONGEST CANDLE (41–60) ──────────────────────────────────────────────
  ...Array.from({length: 20}, (_, i) => ({
    id: i + 41,
    name: `REENTRY_STRONGEST_ABS_BODY_${(i+1)*5}PCT`,
    desc: `Strongest direction: first candle with |body%| > ${(i+1)*5}%`,
    fn: (today, exitIdx, lastDir, pd) => {
      const lastIdx = today.length - 1;
      if (lastIdx <= exitIdx) return null;
      const thresh = (i + 1) * 5;
      for (let j = exitIdx + 1; j <= lastIdx; j++) {
        const b = bodyPct(today[j]);
        if (Math.abs(b) > thresh) {
          const dir = b > 0 ? 'CE' : 'PE';
          return { idx: j, dir, reason: `reentry_strongest_${thresh}pct` };
        }
      }
      return null;
    }
  })),

  // ── AFTER N CANDLES (61–75) ───────────────────────────────────────────────
  ...Array.from({length: 15}, (_, i) => ({
    id: i + 61,
    name: `REENTRY_AFTER_${i+2}_CANDLES_BODY_30PCT`,
    desc: `After ${i+2} candles: any body% > 30% same dir, <-30% opposite dir`,
    fn: (today, exitIdx, lastDir, pd) => {
      const lastIdx = today.length - 1;
      if (lastIdx <= exitIdx + (i+1)) return null;
      for (let j = exitIdx + (i+2); j <= lastIdx; j++) {
        const b = bodyPct(today[j]);
        if ((lastDir === 'CE' && b > 30) || (lastDir === 'PE' && b < -30)) {
          return { idx: j, dir: lastDir, reason: `reentry_after_${i+2}_same` };
        }
        if ((lastDir === 'CE' && b < -30) || (lastDir === 'PE' && b > 30)) {
          return { idx: j, dir: lastDir === 'CE' ? 'PE' : 'CE', reason: `reentry_after_${i+2}_rev` };
        }
      }
      return null;
    }
  })),

  // ── LIMIT REENTRIES (76–85) ───────────────────────────────────────────────
  ...Array.from({length: 10}, (_, i) => ({
    id: i + 76,
    name: `REENTRY_MAX_${i+2}_ATTEMPTS`,
    desc: `Allow max ${i+2} re-entry attempts`,
    fn: (today, exitIdx, lastDir, pd) => {
      const lastIdx = today.length - 1;
      if (lastIdx <= exitIdx) return null;
      const maxAttempts = i + 2;
      let attempts = 0;
      for (let j = exitIdx + 1; j <= lastIdx; j++) {
        const b = bodyPct(today[j]);
        if ((lastDir === 'CE' && b > 40) || (lastDir === 'PE' && b < -40)) {
          if (attempts < maxAttempts) {
            attempts++;
            return { idx: j, dir: lastDir, reason: `reentry_attempt_${attempts}` };
          }
        }
      }
      return null;
    }
  })),

  // ── NO REENTRY ZONES (86–100) ─────────────────────────────────────────────
  ...Array.from({length: 15}, (_, i) => ({
    id: i + 86,
    name: `REENTRY_NO_REENTRY_AFTER_${(i+1)*30}MIN`,
    desc: `No re-entry if ${(i+1)*30}+ mins since exit`,
    fn: (today, exitIdx, lastDir, pd) => {
      const lastIdx = today.length - 1;
      if (lastIdx <= exitIdx) return null;
      const noReentryCandles = (i+1)*2; // ~30 mins per 2 candles
      if (lastIdx - exitIdx < noReentryCandles) return null;
      for (let j = exitIdx + noReentryCandles; j <= lastIdx; j++) {
        const b = bodyPct(today[j]);
        if ((lastDir === 'CE' && b > 40) || (lastDir === 'PE' && b < -40)) {
          return { idx: j, dir: lastDir, reason: `reentry_no_zone_${(i+1)*30}min` };
        }
      }
      return null;
    }
  }))
];

module.exports = { SL_COMBOS, TRAIL_SL_COMBOS, REENTRY_COMBOS };

// ── Quick print ───────────────────────────────────────────────────────────
if (require.main === module) {
  console.log('\n100 SL + 100 TRAIL SL + 100 RE-ENTRY COMBINATIONS');
  console.log('═'.repeat(60));
  console.log('\nSTOP LOSS (1–100):');
  for (let i = 0; i < Math.min(10, SL_COMBOS.length); i++) {
    console.log(`  #${SL_COMBOS[i].id}  ${SL_COMBOS[i].name.padEnd(30)} ${SL_COMBOS[i].desc}`);
  }
  console.log('  ...');
  console.log(`\nTRAIL SL (1–100):`);
  for (let i = 0; i < Math.min(10, TRAIL_SL_COMBOS.length); i++) {
    console.log(`  #${TRAIL_SL_COMBOS[i].id}  ${TRAIL_SL_COMBOS[i].name.padEnd(30)} ${TRAIL_SL_COMBOS[i].desc}`);
  }
  console.log('  ...');
  console.log(`\nRE-ENTRY (1–100):`);
  for (let i = 0; i < Math.min(10, REENTRY_COMBOS.length); i++) {
    console.log(`  #${REENTRY_COMBOS[i].id}  ${REENTRY_COMBOS[i].name.padEnd(30)} ${REENTRY_COMBOS[i].desc}`);
  }
  console.log('  ...');
  console.log(`\nTotal: ${SL_COMBOS.length + TRAIL_SL_COMBOS.length + REENTRY_COMBOS.length} combinations`);
}

'use strict';
/**
 * AMINA T100 exact comparison: SL=60 vs SL=100
 * Uses the EXACT same logic as amina_t100.js
 * Loads from research-candles-cache.json (local, no Kite API needed)
 */
const fs = require('fs');
const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS_PER_PT   = 15;
const TRAIL_GAP   = 100;

// ── Load candles ──────────────────────────────────────────────────
console.log('Loading candles...');
const raw = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
  return { date, h: ist.getHours(), m: ist.getMinutes(),
           open: c.open, high: c.high, low: c.low, close: c.close };
}).filter(c => c.close > 0);

const byDay = {};
for (const c of candles) {
  if (!byDay[c.date]) byDay[c.date] = [];
  byDay[c.date].push(c);
}
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log(`Candles: ${candles.length}  |  Days: ${allDates.length}  (${allDates[0]} → ${allDates[allDates.length-1]})\n`);

// ── Exact amina_t100.js logic ──────────────────────────────────────
function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// AMINA C2 early entry (same as amina_t100.js)
function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, c2level = 0, c3level = 0;

    if (ca.bull === cb.bull) {
      sig     = ca.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.high      : ca.low;
      c3level = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig     = cb.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.body_high  : ca.body_low;
      c3level = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else { continue; }

    // C2 early entry
    if (sig === 'CE' && cb.close > c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, px: cb.close, entryIdx: i + 1 };

    // C3+ fallback
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// simLeg with configurable SL_INITIAL
// exitMode: 'sl_level' (original backtest) | 'candle_close' (live reality)
function simLeg(cs, startIdx, dir, isEOD, SL_INITIAL, exitMode) {
  const entry = cs[startIdx].close;
  let sl      = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak    = 0;

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c   = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;

    if (cur > peak) peak = cur;

    if (peak >= SL_INITIAL) {
      const lockedPts = Math.max(0, peak - TRAIL_GAP);
      if (dir === 'CE') sl = Math.max(sl, entry + lockedPts);
      else              sl = Math.min(sl, entry - lockedPts);
    }

    if (isEOD(c)) return { pts: cur, slType: 'eod' };

    const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
    if (slHit) {
      // sl_level: capped at SL (what backtest assumed)
      // candle_close: actual close (what live does — can be worse)
      const exitPts = exitMode === 'candle_close' ? cur : (dir === 'CE' ? sl - entry : entry - sl);
      return { pts: exitPts, slType: 'sl', exitIdx: idx };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod' };
}

function simDay(candles, SL_INITIAL, exitMode) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);
  let t1Dir = null, t1Pts = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    if (isEOD(cs[idx])) break;
    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir = res.sig;
    const t1Res = simLeg(cs, idx, t1Dir, isEOD, SL_INITIAL, exitMode);
    t1Pts = t1Res.pts;

    if (t1Res.slType === 'sl') {
      const reDir = t1Dir === 'CE' ? 'PE' : 'CE';
      const reRes = simLeg(cs, t1Res.exitIdx, reDir, isEOD, SL_INITIAL, exitMode);
      rePts = reRes.pts;
    }
    break;
  }
  return { dayPts: t1Pts + rePts, t1Dir };
}

function runBacktest(SL_INITIAL, exitMode) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {}, monthly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date], SL_INITIAL, exitMode);
    if (!t1Dir) { flat++; continue; }

    totalPts += dayPts; equity += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    yearly[date.slice(0,4)] = (yearly[date.slice(0,4)] || 0) + dayPts;
    monthly[date.slice(0,7)] = (monthly[date.slice(0,7)] || 0) + dayPts;
    if (dayPts > 0) wins++; else if (dayPts < 0) losses++; else flat++;
  }

  const tradeDays = wins + losses;
  return {
    netRs   : Math.round(totalPts * RS_PER_PT),
    netPts  : totalPts,
    winPct  : tradeDays ? ((wins / tradeDays) * 100).toFixed(1) : '0',
    maxDDRs : Math.round(maxDD * RS_PER_PT),
    avgDay  : tradeDays ? Math.round(totalPts * RS_PER_PT / tradeDays) : 0,
    wins, losses, yearly, monthly
  };
}

// ── Run 4 variants ────────────────────────────────────────────────
const variants = [
  { sl: 60,  exit: 'sl_level',    label: 'SL=60  exit@SL-level   [amina_t100 backtest = ₹19.25L]' },
  { sl: 60,  exit: 'candle_close',label: 'SL=60  exit@CandleClose [LIVE REALITY]              ' },
  { sl: 100, exit: 'sl_level',    label: 'SL=100 exit@SL-level   [proposed, idealized]         ' },
  { sl: 100, exit: 'candle_close',label: 'SL=100 exit@CandleClose [proposed, live reality]     ' },
];

console.log('Running...\n');
const results = variants.map(v => {
  process.stdout.write(`  ${v.label.padEnd(56)}... `);
  const r = runBacktest(v.sl, v.exit);
  console.log(`₹${r.netRs.toLocaleString('en-IN')}`);
  return { ...v, ...r };
});

// ── Print table ───────────────────────────────────────────────────
const LINE = '='.repeat(110);
const SEP  = '-'.repeat(100);
const fmt  = n => (n>=0?'+':'')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');

console.log('\n' + LINE);
console.log('  AMINA T100 — SL=60 vs SL=100  |  C2 early entry + trail 100pts behind peak');
console.log(LINE);
console.log(`  ${'Variant'.padEnd(56)} ${'Net ₹'.padStart(14)} ${'Win%'.padStart(7)} ${'Avg/Day'.padStart(9)} ${'MaxDD'.padStart(11)}`);
console.log('  ' + SEP);
for (const r of results) {
  console.log(`  ${r.label.padEnd(56)} ${fmt(r.netRs).padStart(14)} ${(r.winPct+'%').padStart(7)} ${fmt(r.avgDay).padStart(9)} ${fmt(-r.maxDDRs).padStart(11)}`);
}
console.log(LINE);

// Compare vs baseline
const base = results[0];
console.log(`\n  Comparison vs amina_t100 original (SL=60, sl-level exits):`);
for (const r of results.slice(1)) {
  const d = r.netRs - base.netRs;
  console.log(`  ${r.label.padEnd(56)} ${d>=0?'+':''}₹${Math.abs(d).toLocaleString('en-IN')}  (${d>=0?'+':''}${((d/Math.abs(base.netRs))*100).toFixed(1)}%)`);
}

// Year-by-year
const yrs = [...new Set(results.flatMap(r => Object.keys(r.yearly)))].sort();
console.log(`\n  YEAR-BY-YEAR (₹)`);
console.log(`  ${'Year'.padEnd(6)} ${'SL60-SLlvl'.padStart(13)} ${'SL60-Close'.padStart(13)} ${'SL100-SLlvl'.padStart(13)} ${'SL100-Close'.padStart(13)}  |  ${'Live SL60'.padStart(11)}  ${'Live SL100'.padStart(12)}`);
console.log('  '+'-'.repeat(100));
for (const yr of yrs) {
  const vals = results.map(r => r.yearly[yr] ? fmt(Math.round(r.yearly[yr]*RS_PER_PT)) : '—');
  const diff60  = (results[1].yearly[yr]||0) - (results[0].yearly[yr]||0);
  const diff100 = (results[3].yearly[yr]||0) - (results[2].yearly[yr]||0);
  console.log(`  ${yr.padEnd(6)} ${vals[0].padStart(13)} ${vals[1].padStart(13)} ${vals[2].padStart(13)} ${vals[3].padStart(13)}  |  ${fmt(Math.round(diff60*RS_PER_PT)).padStart(11)}  ${fmt(Math.round(diff100*RS_PER_PT)).padStart(12)}`);
}

// Overshoot analysis (sl-level vs candle-close difference = actual slippage cost)
const slip60  = base.netRs - results[1].netRs;
const slip100 = results[2].netRs - results[3].netRs;
console.log(`\n  WICK SLIPPAGE (backtest SL-level minus live candle-close reality):`);
console.log(`  SL=60  slippage over 5 years: ₹${slip60.toLocaleString('en-IN')}  (₹${Math.round(slip60/allDates.length)}/day avg)`);
console.log(`  SL=100 slippage over 5 years: ₹${slip100.toLocaleString('en-IN')}  (₹${Math.round(slip100/allDates.length)}/day avg)`);
console.log(`\n  ► Best live-reality option: ${results[1].netRs > results[3].netRs ? 'SL=60 (current)' : 'SL=100 (proposed)'}\n`);

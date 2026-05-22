'use strict';
/**
 * AMINA T100 - 3-way comparison (5-year backtest)
 * A: Candle Close exit        (original live bot)
 * B: Tick SL single-check     (intrabar low/high crosses SL -> exit at SL level)
 * C: Tick SL double-confirm   (intrabar touch + close confirms -> exit at SL level)
 *                              If only wick touched SL but close recovered -> STAY IN
 */
const fs = require('fs');
const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS_PER_PT   = 15;
const SL_INITIAL  = 60;
const TRAIL_GAP   = 100;

const raw = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
  return { date, h: ist.getHours(), m: ist.getMinutes(),
           open: c.open, high: c.high, low: c.low, close: c.close };
}).filter(c => c.close > 0);

const byDay = {};
for (const c of candles) {
  if (!byDay[c.date]) byDay[c.date] = [];
  byDay[c.date].push(c);
}
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log('Candles: ' + candles.length + '  Days: ' + allDates.length + '  (' + allDates[0] + ' -> ' + allDates[allDates.length-1] + ')\n');

function enrich(c) {
  const bull = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return Object.assign({}, c, { bull, body_high, body_low, body_size: body_high - body_low });
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, c2level = 0, c3level = 0;
    if (ca.bull === cb.bull) {
      sig     = ca.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.high     : ca.low;
      c3level = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig     = cb.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.body_high : ca.body_low;
      c3level = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else { continue; }
    if (sig === 'CE' && cb.close > c2level) return { sig: sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig: sig, px: cb.close, entryIdx: i + 1 };
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig: sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig: sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// exitMode: 'candle_close' | 'tick_single' | 'tick_double'
function simLeg(cs, startIdx, dir, isEOD, exitMode) {
  const entry = cs[startIdx].close;
  let sl   = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak = 0;

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c = cs[idx];
    if (isEOD(c)) {
      const cur = dir === 'CE' ? c.close - entry : entry - c.close;
      return { pts: cur, slType: 'eod', exitIdx: idx };
    }

    // Update peak using intrabar extremes (same as real tick SL bot)
    const intrabarBest = dir === 'CE' ? c.high - entry : entry - c.low;
    if (intrabarBest > peak) peak = intrabarBest;

    // Update trail SL
    if (peak >= SL_INITIAL) {
      const locked = Math.max(0, peak - TRAIL_GAP);
      if (dir === 'CE') sl = Math.max(sl, entry + locked);
      else              sl = Math.min(sl, entry - locked);
    }

    // Check SL breach
    const intraTouched = dir === 'CE' ? c.low <= sl   : c.high >= sl;  // wick crossed SL
    const closeConfirm = dir === 'CE' ? c.close <= sl : c.close >= sl; // close also beyond SL

    let slHit = false;
    if (exitMode === 'candle_close') slHit = closeConfirm;
    if (exitMode === 'tick_single')  slHit = intraTouched;
    if (exitMode === 'tick_double')  slHit = intraTouched && closeConfirm;

    if (slHit) {
      const exitPts = exitMode === 'candle_close'
        ? (dir === 'CE' ? c.close - entry : entry - c.close)  // full candle overshoot
        : (dir === 'CE' ? sl - entry      : entry - sl);      // capped at SL level
      return { pts: exitPts, slType: 'sl', exitIdx: idx };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod', exitIdx: cs.length - 1 };
}

function simDay(candles, exitMode) {
  const cs    = candles.map(enrich);
  const isEOD = function(c) { return c.h > 15 || (c.h === 15 && c.m >= 14); };
  let t1Dir = null, t1Pts = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    if (isEOD(cs[idx])) break;
    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir = res.sig;
    const t1Res = simLeg(cs, idx, t1Dir, isEOD, exitMode);
    t1Pts = t1Res.pts;

    if (t1Res.slType === 'sl') {
      const reDir = t1Dir === 'CE' ? 'PE' : 'CE';
      const reRes = simLeg(cs, t1Res.exitIdx, reDir, isEOD, exitMode);
      rePts = reRes.pts;
    }
    break;
  }
  return { dayPts: t1Pts + rePts, t1Dir: t1Dir };
}

function runBacktest(exitMode) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peakEq = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const res = simDay(byDay[date], exitMode);
    const dayPts = res.dayPts, t1Dir = res.t1Dir;
    if (!t1Dir) { flat++; continue; }

    totalPts += dayPts; equity += dayPts;
    if (equity > peakEq) peakEq = equity;
    if (peakEq - equity > maxDD) maxDD = peakEq - equity;
    const yr = date.slice(0,4);
    yearly[yr] = (yearly[yr] || 0) + Math.round(dayPts * RS_PER_PT);
    if (dayPts > 0) wins++; else if (dayPts < 0) losses++; else flat++;
  }
  const tradeDays = wins + losses;
  return {
    netRs : Math.round(totalPts * RS_PER_PT),
    winPct: tradeDays ? ((wins / tradeDays) * 100).toFixed(1) : '0',
    maxDD : Math.round(maxDD * RS_PER_PT),
    avgDay: tradeDays ? Math.round(totalPts * RS_PER_PT / tradeDays) : 0,
    wins: wins, losses: losses, yearly: yearly
  };
}

const variants = [
  { mode: 'candle_close', label: 'A: Candle Close (original bot)     ' },
  { mode: 'tick_single',  label: 'B: Tick SL single-check (was live) ' },
  { mode: 'tick_double',  label: 'C: Tick SL double-confirm (current)' },
];

console.log('Running 3 variants over 5 years...\n');
const results = variants.map(function(v) {
  const r = runBacktest(v.mode);
  return Object.assign({}, v, r);
});

const LINE = '='.repeat(95);
function frs(n) { return (n>=0?'+':'-') + '\u20b9' + Math.abs(n).toLocaleString('en-IN'); }
function fl(n)  { return (n>=0?'+':'-') + (Math.abs(n)/100000).toFixed(2) + 'L'; }

console.log(LINE);
console.log('  AMINA T100 -- 3-Way Backtest (SL=60, Trail=100)');
console.log(LINE);
console.log('  ' + 'Variant'.padEnd(38) + 'Net Rs'.padStart(14) + 'Net'.padStart(9) + 'Win%'.padStart(7) + 'Avg/Day'.padStart(10) + 'MaxDD'.padStart(12));
console.log('-'.repeat(93));
for (const r of results) {
  console.log('  ' + r.label.padEnd(38) + frs(r.netRs).padStart(14) + fl(r.netRs).padStart(9) + (r.winPct+'%').padStart(7) + frs(r.avgDay).padStart(10) + frs(r.maxDD).padStart(12));
}
console.log(LINE);

// Year-by-year
const years = Object.keys(results[0].yearly).sort();
console.log('\n  Year-by-year (Rs):');
console.log('  ' + 'Year'.padEnd(6) + 'A: CandleClose'.padStart(16) + 'B: TickSingle'.padStart(16) + 'C: TickDouble'.padStart(16));
console.log('-'.repeat(57));
for (const yr of years) {
  const a = results[0].yearly[yr] || 0;
  const b = results[1].yearly[yr] || 0;
  const c = results[2].yearly[yr] || 0;
  console.log('  ' + yr.padEnd(6) + frs(a).padStart(16) + frs(b).padStart(16) + frs(c).padStart(16));
}
console.log(LINE);
console.log('\n  Key insight:');
console.log('  B vs A: How much does intrabar exit help vs candle close?');
console.log('  C vs B: Does waiting for close confirmation help vs single tick?');
console.log('  C vs A: Best vs original?');

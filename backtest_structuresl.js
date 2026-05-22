'use strict';
/**
 * AMINA 100 — Structure SL vs Fixed SL backtest
 * 4 variants to isolate what actually helps:
 *   A. Fixed SL=60  + Tick SL  (current live bot)
 *   B. Fixed SL=60  + Candle-close SL only
 *   C. Structure SL (C1 high/low) + Candle-close only  ← user's suggestion
 *   D. Structure SL + Tick SL
 *
 * Structure SL = the HIGH of the first candle in the signal pair (for PE)
 *               = the LOW  of the first candle in the signal pair (for CE)
 */
const fs = require('fs');
const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS = 15, TRAIL_GAP = 100, BUFFER = 25;

const raw  = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
const all  = raw.map(c => {
  const ist  = new Date(new Date(c.date).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
  return { date, h: ist.getHours(), m: ist.getMinutes(), open: c.open, high: c.high, low: c.low, close: c.close };
});
const byDay    = {};
for (const c of all) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log(`Days: ${allDates.length}  (${allDates[0]} → ${allDates[allDates.length-1]})\n`);

function enrich(c) {
  const bull = c.close >= c.open;
  return { ...c, bull, body_high: Math.max(c.open, c.close), body_low: Math.min(c.open, c.close), body_size: Math.abs(c.close - c.open) };
}

// Returns { sig, px, entryIdx, structSL } or null
// structSL = the C1 candle extreme (high for PE, low for CE)
function entryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i+1];
    let sig = null, c2bl = 0, c3bl = 0, structSL = 0;
    if (ca.bull === cb.bull) {
      sig      = ca.bull ? 'CE' : 'PE';
      c2bl     = sig === 'CE' ? ca.high      : ca.low;
      c3bl     = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      structSL = sig === 'CE' ? ca.low       : ca.high;   // opposite extreme of C1
    } else if (cb.body_size > ca.body_size) {
      sig      = cb.bull ? 'CE' : 'PE';
      c2bl     = sig === 'CE' ? ca.body_high : ca.body_low;
      c3bl     = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
      structSL = sig === 'CE' ? ca.body_low  : ca.body_high;
    } else continue;

    // C2 early entry
    if (sig === 'CE' && cb.close > c2bl) return { sig, px: cb.close, entryIdx: i+1, structSL };
    if (sig === 'PE' && cb.close < c2bl) return { sig, px: cb.close, entryIdx: i+1, structSL };
    // C3+ fallback
    for (let j = i+2; j < cs.length; j++) {
      if (sig === 'CE' && cs[j].close > c3bl) return { sig, px: cs[j].close, entryIdx: j, structSL };
      if (sig === 'PE' && cs[j].close < c3bl) return { sig, px: cs[j].close, entryIdx: j, structSL };
    }
  }
  return null;
}

// Simulate one leg with configurable SL type
// slMode: 'fixed60' | 'struct'
// slCheck: 'tick' | 'candle'
function simLeg(cs, startIdx, dir, entryPx, slMode, slCheck, structSLLevel) {
  const fixedDist  = 60;
  const initialDist = slMode === 'struct'
    ? Math.abs(structSLLevel - entryPx)
    : fixedDist;

  let peak = 0;
  for (let i = startIdx + 1; i < cs.length; i++) {
    const c    = cs[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 14);

    // SL based on PREVIOUS peak
    const effSL = peak >= initialDist ? Math.max(0, peak - TRAIL_GAP) : -initialDist;
    const slPx  = dir === 'CE' ? entryPx + effSL : entryPx - effSL;

    if (slCheck === 'tick' && i > startIdx + 1) {
      const hit = dir === 'CE' ? c.low <= slPx : c.high >= slPx;
      if (hit) {
        return { pts: dir === 'CE' ? slPx - entryPx : entryPx - slPx, exitIdx: i };
      }
    }

    // Update peak
    const cur = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
    if (cur > peak) peak = cur;

    // Candle-close SL
    const effSL2 = peak >= initialDist ? Math.max(0, peak - TRAIL_GAP) : -initialDist;
    const slPx2  = dir === 'CE' ? entryPx + effSL2 : entryPx - effSL2;
    const candleHit = dir === 'CE' ? cur <= effSL2 - BUFFER : cur <= effSL2 - BUFFER;
    if (candleHit) return { pts: cur, exitIdx: i };

    if (isEOD) return { pts: cur, exitIdx: i };
  }
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entryPx : entryPx - last.close, exitIdx: cs.length - 1 };
}

function simDay(rawCandles, slMode, slCheck) {
  const cs    = rawCandles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  // T1
  let t1EntryIdx = -1, t1Dir, t1Entry, t1Pts = 0, t1StructSL = 0;
  for (let i = 1; i < cs.length; i++) {
    if (isEOD(cs[i])) break;
    const res = entryScan(cs.slice(0, i+1));
    if (!res || res.entryIdx !== i) continue;
    t1Dir = res.sig; t1Entry = cs[i].close; t1EntryIdx = i; t1StructSL = res.structSL;
    break;
  }
  if (t1EntryIdx < 0) return { dayPts: 0, t1Pts: 0, rePts: 0, traded: false };

  const t1Leg = simLeg(cs, t1EntryIdx, t1Dir, t1Entry, slMode, slCheck, t1StructSL);
  t1Pts = t1Leg.pts;

  const t1ExitC = cs[t1Leg.exitIdx];
  if (isEOD(t1ExitC) || t1Leg.exitIdx === cs.length - 1 || t1Pts > 0) {
    return { dayPts: t1Pts, t1Pts, rePts: 0, traded: true };
  }

  // RE entry (opposite direction, fixed 60 SL always — RE uses fixed regardless)
  const reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
  const reEntry = t1ExitC.close;
  const reLeg   = simLeg(cs, t1Leg.exitIdx, reDir, reEntry, 'fixed60', slCheck, 0);
  const rePts   = reLeg.pts;

  return { dayPts: t1Pts + rePts, t1Pts, rePts, traded: true };
}

function runBacktest(slMode, slCheck) {
  let totalPts = 0, winDays = 0, lossDays = 0, flatDays = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const r = simDay(byDay[date], slMode, slCheck);
    if (!r.traded) continue;

    totalPts += r.dayPts;
    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = 0;
    yearly[yr] += r.dayPts;

    if (r.dayPts > 0)      winDays++;
    else if (r.dayPts < 0) lossDays++;
    else                   flatDays++;

    equity += r.dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }

  const tradingDays = winDays + lossDays + flatDays;
  return { totalPts, totalRs: Math.round(totalPts * RS), winDays, lossDays,
           winPct: ((winDays / tradingDays) * 100).toFixed(1),
           maxDDRs: Math.round(maxDD * RS), yearly };
}

const variants = [
  { slMode: 'fixed60', slCheck: 'tick',   label: 'A. Fixed SL=60  + Tick SL    (current live)' },
  { slMode: 'fixed60', slCheck: 'candle', label: 'B. Fixed SL=60  + Candle-SL only           ' },
  { slMode: 'struct',  slCheck: 'candle', label: 'C. Structure SL + Candle-SL only  ← new    ' },
  { slMode: 'struct',  slCheck: 'tick',   label: 'D. Structure SL + Tick SL                  ' },
];

console.log('Running 4 variants...\n');
const results = [];
for (const v of variants) {
  process.stdout.write(`  ${v.label.trim().padEnd(44)}... `);
  const r = runBacktest(v.slMode, v.slCheck);
  results.push({ ...v, ...r });
  console.log(`done  ₹${r.totalRs.toLocaleString('en-IN')}  Win:${r.winPct}%`);
}

const LINE = '='.repeat(105);
const SEP  = '-'.repeat(100);
const fmt  = n => (n >= 0 ? '+' : '') + '₹' + Math.abs(n).toLocaleString('en-IN');
const base = results[0];

console.log('\n' + LINE);
console.log('  AMINA 100 — Structure SL vs Fixed SL  |  5 years  |  SL=60 / Trail=100 / Buf=25');
console.log(LINE);
console.log(`  ${'Variant'.padEnd(48)} ${'Total ₹'.padStart(13)} ${'Win%'.padStart(6)} ${'W/L Days'.padStart(10)} ${'MaxDD'.padStart(11)} ${'vs A'.padStart(11)}`);
console.log('  ' + SEP);
for (const r of results) {
  const diff = r === base ? '—' : fmt(r.totalRs - base.totalRs);
  console.log(`  ${r.label.padEnd(48)} ${fmt(r.totalRs).padStart(13)} ${(r.winPct+'%').padStart(6)} ${(r.winDays+'/'+r.lossDays).padStart(10)} ${fmt(-r.maxDDRs).padStart(11)} ${diff.padStart(11)}`);
}
console.log(LINE);

const allYears = [...new Set(results.flatMap(r => Object.keys(r.yearly)))].sort();
console.log('\n  YEAR-BY-YEAR (₹):');
console.log(`  ${'Year'.padEnd(6)} ${results.map(r => r.label.slice(0,4)).map(h => h.padStart(14)).join('')}`);
console.log('  ' + '-'.repeat(65));
for (const yr of allYears) {
  const vals = results.map(r => r.yearly[yr] != null ? fmt(Math.round(r.yearly[yr] * RS)) : '—');
  console.log(`  ${yr.padEnd(6)} ${vals.map(v => v.padStart(14)).join('')}`);
}
console.log(LINE);
console.log();

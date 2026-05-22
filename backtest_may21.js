'use strict';
/**
 * May 21, 2026 — Single Day Simulation
 * Compares: C2+C3 entry (current bot) vs C3-only entry (old backtest_amina_exact approach)
 * Strategy: SL=60, Trail=100, Buf=25, T1→RE→DONE (no T3)
 */
const fs = require('fs');
const SL_INITIAL = 60, TRAIL_GAP = 100, BUFFER = 25, RS = 15;
const TARGET_DATE = '2026-05-21';

const raw = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));
const all = raw.map(c => {
  const ist = new Date(new Date(c.date).toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  return { date: ist.getFullYear()+'-'+String(ist.getMonth()+1).padStart(2,'0')+'-'+String(ist.getDate()).padStart(2,'0'),
           h: ist.getHours(), m: ist.getMinutes(), open: c.open, high: c.high, low: c.low, close: c.close };
});
const day = all.filter(c => c.date === TARGET_DATE);
if (!day.length) { console.log('May 21 not in cache!'); process.exit(1); }
console.log(`May 21 candles loaded: ${day.length}`);

function enrich(c) {
  const bull = c.close >= c.open;
  return { ...c, bull, body_high: Math.max(c.open,c.close), body_low: Math.min(c.open,c.close), body_size: Math.abs(c.close-c.open) };
}
const cs = day.map(enrich);
const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

// ── Entry scan: C2+C3 (current bot = early C2 + C3 fallback) ─────────────────
function entryScanC2C3(slice) {
  for (let i = 0; i < slice.length - 1; i++) {
    const ca = slice[i], cb = slice[i+1];
    let sig = null, c2bl = 0, c3bl = 0;
    if (ca.bull === cb.bull) {
      sig  = ca.bull ? 'CE' : 'PE';
      c2bl = sig === 'CE' ? ca.high      : ca.low;
      c3bl = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig  = cb.bull ? 'CE' : 'PE';
      c2bl = sig === 'CE' ? ca.body_high : ca.body_low;
      c3bl = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    // C2 early entry
    if (sig === 'CE' && cb.close > c2bl) return { sig, px: cb.close, entryIdx: i+1, rule: 'C2', bl: c2bl };
    if (sig === 'PE' && cb.close < c2bl) return { sig, px: cb.close, entryIdx: i+1, rule: 'C2', bl: c2bl };
    // C3+ fallback
    for (let j = i+2; j < slice.length; j++) {
      if (sig === 'CE' && slice[j].close > c3bl) return { sig, px: slice[j].close, entryIdx: j, rule: 'C3', bl: c3bl };
      if (sig === 'PE' && slice[j].close < c3bl) return { sig, px: slice[j].close, entryIdx: j, rule: 'C3', bl: c3bl };
    }
  }
  return null;
}

// ── Entry scan: C3-only (old backtest_amina_exact approach) ──────────────────
function entryScanC3Only(slice) {
  for (let i = 0; i < slice.length - 1; i++) {
    const ca = slice[i], cb = slice[i+1];
    let sig = null, bl = 0;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i+2; j < slice.length; j++) {
      if (sig === 'CE' && slice[j].close > bl) return { sig, px: slice[j].close, entryIdx: j, rule: 'C3', bl };
      if (sig === 'PE' && slice[j].close < bl) return { sig, px: slice[j].close, entryIdx: j, rule: 'C3', bl };
    }
  }
  return null;
}

// ── Simulate a leg with trail SL ──────────────────────────────────────────────
function simLeg(startIdx, dir, entryPx, scanFn) {
  let peak = 0;
  const steps = [];
  for (let i = startIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const eod = isEOD(c);
    const effSL = peak >= SL_INITIAL ? Math.max(0, peak - TRAIL_GAP) : -SL_INITIAL;
    const slPx  = dir === 'CE' ? entryPx + effSL : entryPx - effSL;

    // Tick SL (intrabar)
    const tickHit = dir === 'CE' ? c.low <= slPx : c.high >= slPx;
    if (tickHit && i > startIdx + 1) {
      const pts = dir === 'CE' ? slPx - entryPx : entryPx - slPx;
      steps.push(`  ${c.h}:${String(c.m).padStart(2,'0')}  Tick-SL hit at ${slPx.toFixed(0)}  P&L: ${pts.toFixed(0)} pts`);
      return { pts, steps };
    }

    // Update peak
    const cur = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
    if (cur > peak) peak = cur;

    // Candle SL
    const effSL2 = peak >= SL_INITIAL ? Math.max(0, peak - TRAIL_GAP) : -SL_INITIAL;
    const slPx2  = dir === 'CE' ? entryPx + effSL2 : entryPx - effSL2;
    const candleSL = dir === 'CE' ? cur <= effSL2 - BUFFER : cur <= effSL2 - BUFFER;
    if (candleSL) {
      steps.push(`  ${c.h}:${String(c.m).padStart(2,'0')}  Candle-SL close=${c.close.toFixed(0)} slPx=${slPx2.toFixed(0)}  P&L: ${cur.toFixed(0)} pts`);
      return { pts: cur, steps };
    }

    if (eod) {
      steps.push(`  ${c.h}:${String(c.m).padStart(2,'0')}  EOD exit at ${c.close.toFixed(0)}  P&L: ${cur.toFixed(0)} pts`);
      return { pts: cur, steps };
    }
    steps.push(`  ${c.h}:${String(c.m).padStart(2,'0')}  unrealised=${cur.toFixed(0)} peak=${peak.toFixed(0)} slPx=${slPx2.toFixed(0)}`);
  }
  const last = cs[cs.length-1];
  const pts = dir === 'CE' ? last.close - entryPx : entryPx - last.close;
  return { pts, steps };
}

// ── Run one scenario ──────────────────────────────────────────────────────────
function runScenario(label, scanFn) {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${label}`);
  console.log('='.repeat(60));

  // Print all candles
  for (const c of cs) {
    if (isEOD(c)) break;
    console.log(`  ${c.h}:${String(c.m).padStart(2,'0')}  O:${c.open.toFixed(0)}  H:${c.high.toFixed(0)}  L:${c.low.toFixed(0)}  C:${c.close.toFixed(0)}  ${c.bull?'BULL':'BEAR'}`);
  }

  // T1
  let t1EntryIdx = -1, t1Dir, t1Entry, t1Pts = 0;
  for (let i = 1; i < cs.length; i++) {
    if (isEOD(cs[i])) break;
    const res = scanFn(cs.slice(0, i+1));
    if (!res || res.entryIdx !== i) continue;
    t1Dir = res.sig; t1Entry = cs[i].close; t1EntryIdx = i;
    const slLvl = t1Dir === 'CE' ? t1Entry - SL_INITIAL : t1Entry + SL_INITIAL;
    console.log(`\n  ▶ T1 Entry: ${t1Dir} @ ${t1Entry.toFixed(0)}  (${cs[i].h}:${String(cs[i].m).padStart(2,'0')})  Rule:${res.rule}  BL:${res.bl.toFixed(0)}  SL:${slLvl.toFixed(0)}`);
    break;
  }
  if (t1EntryIdx < 0) { console.log('\n  No T1 signal found'); return; }

  const t1Leg = simLeg(t1EntryIdx, t1Dir, t1Entry, scanFn);
  t1Leg.steps.forEach(s => console.log(s));
  t1Pts = t1Leg.pts;
  const t1ExitC = cs.find((c,i) => {
    if (i <= t1EntryIdx) return false;
    const effSL = 0 >= SL_INITIAL ? 0 : -SL_INITIAL;
    return true; // simplified — just take the pts
  });
  console.log(`  T1 P&L: ${t1Pts >= 0 ? '+' : ''}${t1Pts.toFixed(0)} pts  (₹${(t1Pts*RS).toFixed(0)})`);

  if (t1Pts > 0) {
    console.log(`\n  T1 profitable — no RE needed`);
    console.log(`\n  DAY TOTAL: +${t1Pts.toFixed(0)} pts  (₹${(t1Pts*RS).toFixed(0)})`);
    return;
  }

  // Find RE entry candle
  let reEntryIdx = -1;
  for (let i = t1EntryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const effSL = 0 >= SL_INITIAL ? 0 : -SL_INITIAL;
    const slPx  = t1Dir === 'CE' ? t1Entry + effSL : t1Entry - effSL;
    const hit = t1Dir === 'CE' ? c.low <= slPx : c.high >= slPx;
    if (hit) { reEntryIdx = i; break; }
  }
  if (reEntryIdx < 0) reEntryIdx = t1EntryIdx + Math.ceil(-t1Pts / 15); // fallback

  const reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
  const reEntry = cs[reEntryIdx] ? cs[reEntryIdx].close : t1Entry - t1Pts;
  const reSL    = reDir === 'CE' ? reEntry - SL_INITIAL : reEntry + SL_INITIAL;
  console.log(`\n  ▶ RE Entry: ${reDir} @ ${reEntry.toFixed(0)}  SL:${reSL.toFixed(0)}`);

  const reLeg = simLeg(reEntryIdx, reDir, reEntry, scanFn);
  reLeg.steps.forEach(s => console.log(s));
  const rePts = reLeg.pts;
  console.log(`  RE P&L: ${rePts >= 0 ? '+' : ''}${rePts.toFixed(0)} pts  (₹${(rePts*RS).toFixed(0)})`);

  const dayPts = t1Pts + rePts;
  const dayRs  = dayPts * RS;
  console.log(`\n  ─────────────────────────────────`);
  console.log(`  T1:    ${t1Pts >= 0 ? '+' : ''}${t1Pts.toFixed(0)} pts  (₹${(t1Pts*RS).toFixed(0)})`);
  console.log(`  RE:    ${rePts >= 0 ? '+' : ''}${rePts.toFixed(0)} pts  (₹${(rePts*RS).toFixed(0)})`);
  console.log(`  DAY:   ${dayPts >= 0 ? '+' : ''}${dayPts.toFixed(0)} pts  (₹${dayRs.toFixed(0)})`);
}

runScenario('SCENARIO 1: C2+C3 Entry (current live bot)', entryScanC2C3);
runScenario('SCENARIO 2: C3-Only Entry (old backtest_amina_exact style)', entryScanC3Only);

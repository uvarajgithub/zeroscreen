'use strict';
/**
 * AMINA 100 — Exact backtest using research-candles-cache.json
 * Ports the exact rollingEntryScan + simDay from amina_backtest.js
 * Tests SL=50 (original), SL=60 (current live), SL=100 (proposed)
 */
const fs = require('fs');
const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS_PER_PT   = 15;  // 30 qty × 0.5 delta × ₹1/pt

// ── Load & parse ─────────────────────────────────────────────────
console.log('Loading candles...');
const raw = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
  return { date, h: ist.getHours(), m: ist.getMinutes(),
           open: c.open, high: c.high, low: c.low, close: c.close };
}).filter(c => c.close > 0);

// Group by IST date
const byDay = {};
for (const c of candles) {
  if (!byDay[c.date]) byDay[c.date] = [];
  byDay[c.date].push(c);
}
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log(`Candles: ${candles.length}  |  Trading days: ${allDates.length}  (${allDates[0]} → ${allDates[allDates.length-1]})\n`);

// ── AMINA logic (exact port from amina_backtest.js) ───────────────
function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = 0, rule = '';
    if (ca.bull === cb.bull) {
      sig  = ca.bull ? 'CE' : 'PE';
      bl   = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule = 'A';
    } else if (cb.body_size > ca.body_size) {
      sig  = cb.bull ? 'CE' : 'PE';
      bl   = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
      rule = 'B';
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, entryIdx: j };
    }
  }
  return null;
}

function simDay(candles, SL_T1, SL_RE, trailMode) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase = 'SCANNING', t1Dir = null, t1Entry = 0, t1Pts = 0;
  let reDir = null, reEntry = 0, rePts = 0;
  let t1SL  = 0, reSL = 0, t1Peak = 0, rePeak = 0, trades = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      t1Dir = res.sig; t1Entry = res.px || c.close;
      // Fix: use c.close as entry price
      t1Entry = c.close;
      t1SL    = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
      t1Peak  = 0; phase = 'IN_T1'; trades++; continue;
    }

    if (phase === 'IN_T1') {
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;
      if (cur > t1Peak) t1Peak = cur;
      if (trailMode === 'lock' && t1Peak >= SL_T1) {
        t1SL = t1Dir === 'CE' ? Math.max(t1SL, t1Entry) : Math.min(t1SL, t1Entry);
      }
      if (isEOD(c)) { phase = 'DONE'; break; }
      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts   = t1Dir === 'CE' ? t1SL - t1Entry : t1Entry - t1SL;
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        reSL    = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
        rePeak  = 0; phase = 'IN_RE'; trades++; continue;
      }
    }

    if (phase === 'IN_RE') {
      const cur = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      rePts = cur;
      if (cur > rePeak) rePeak = cur;
      if (trailMode === 'lock' && rePeak >= SL_RE) {
        reSL = reDir === 'CE' ? Math.max(reSL, reEntry) : Math.min(reSL, reEntry);
      }
      if (isEOD(c)) { phase = 'DONE'; break; }
      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) { rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL; phase = 'DONE'; break; }
    }
  }
  return { dayPts: t1Pts + rePts, t1Pts, rePts, t1Dir, reDir, trades };
}

function runVariant(SL_T1, SL_RE, trailMode) {
  let totalPts = 0, winDays = 0, lossDays = 0, flatDays = 0;
  let grossWinPts = 0, grossLossPts = 0, equity = 0, peak = 0, maxDD = 0;
  let totalTrades = 0, worstDay = 0;
  const yearly = {};
  const monthly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir, trades } = simDay(byDay[date], SL_T1, SL_RE, trailMode);
    if (!t1Dir) { flatDays++; continue; }
    totalPts += dayPts; totalTrades += trades;
    const yr = date.slice(0, 4), mo = date.slice(0, 7);
    if (!yearly[yr]) yearly[yr] = 0;
    if (!monthly[mo]) monthly[mo] = 0;
    yearly[yr] += dayPts; monthly[mo] += dayPts;
    if (dayPts > 0)      { winDays++;  grossWinPts  += dayPts; }
    else if (dayPts < 0) { lossDays++; grossLossPts += dayPts; if (dayPts < worstDay) worstDay = dayPts; }
    else                   flatDays++;
    equity += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }
  return { totalPts, totalRs: Math.round(totalPts * RS_PER_PT), winDays, lossDays, flatDays,
           grossWinRs: Math.round(grossWinPts * RS_PER_PT), grossLossRs: Math.round(grossLossPts * RS_PER_PT),
           worstDayRs: Math.round(worstDay * RS_PER_PT), maxDDRs: Math.round(maxDD * RS_PER_PT),
           winPct: ((winDays/(winDays+lossDays))*100).toFixed(1), totalTrades, yearly, monthly };
}

// ── Run variants ──────────────────────────────────────────────────
const variants = [
  { SL_T1: 50,  SL_RE: 100, trail: 'none', label: 'SL=50  RE=100  NoTrail  [original amina]' },
  { SL_T1: 60,  SL_RE: 100, trail: 'none', label: 'SL=60  RE=100  NoTrail  [current live]   ' },
  { SL_T1: 100, SL_RE: 100, trail: 'none', label: 'SL=100 RE=100  NoTrail  [proposed]       ' },
  { SL_T1: 100, SL_RE: 100, trail: 'lock', label: 'SL=100 RE=100  LockBE   [proposed+trail] ' },
  { SL_T1: 60,  SL_RE: 100, trail: 'lock', label: 'SL=60  RE=100  LockBE   [current+trail]  ' },
];

console.log('Running variants...\n');
const results = variants.map(v => {
  process.stdout.write(`  ${v.label.padEnd(44)}... `);
  const r = runVariant(v.SL_T1, v.SL_RE, v.trail);
  console.log(`done  ₹${r.totalRs.toLocaleString('en-IN')}`);
  return { ...v, ...r };
});

// ── Print summary ─────────────────────────────────────────────────
const LINE = '='.repeat(110);
const SEP  = '-'.repeat(100);
const fmt  = (n) => (n >= 0 ? '+' : '') + '₹' + Math.abs(n).toLocaleString('en-IN');
const fmtP = (n) => (n >= 0 ? '+' : '') + n.toFixed(0) + ' pts';

console.log('\n' + LINE);
console.log('  AMINA 100 — EXACT BACKTEST  |  SL=60 (live) vs SL=100 (proposed)  |  5 years');
console.log(LINE);
console.log(`  ${'Variant'.padEnd(44)} ${'Total ₹'.padStart(14)} ${'Total Pts'.padStart(11)} ${'Win%'.padStart(7)} ${'W/L Days'.padStart(10)} ${'Worst Day'.padStart(11)} ${'MaxDD'.padStart(11)}`);
console.log('  ' + SEP);
for (const r of results) {
  console.log(`  ${r.label.padEnd(44)} ${fmt(r.totalRs).padStart(14)} ${fmtP(r.totalPts).padStart(11)} ${(r.winPct+'%').padStart(7)} ${(r.winDays+'/'+r.lossDays).padStart(10)} ${fmt(r.worstDayRs).padStart(11)} ${fmt(-r.maxDDRs).padStart(11)}`);
}
console.log(LINE);

// Compare vs SL=60 baseline
const base = results.find(r => r.SL_T1 === 60 && r.trail === 'none');
console.log(`\n  Improvement vs current (SL=60 RE=100 no-trail):`);
for (const r of results.filter(r => r !== base)) {
  const diff = r.totalRs - base.totalRs;
  console.log(`  ${r.label.padEnd(44)} ${(diff>=0?'+':'')+'₹'+Math.abs(diff).toLocaleString('en-IN')} (${diff>=0?'+':''}${((diff/Math.abs(base.totalRs))*100).toFixed(1)}%)`);
}

// ── Year-by-year ──────────────────────────────────────────────────
const allYears = [...new Set(results.flatMap(r => Object.keys(r.yearly)))].sort();
console.log(`\n  YEAR-BY-YEAR (₹)`);
console.log(`  ${'Year'.padEnd(6)} ${results.map(r => r.SL_T1+'/'+(r.trail==='lock'?'L':'N')).map(h=>h.padStart(13)).join('')}`);
console.log('  ' + '-'.repeat(90));
for (const yr of allYears) {
  const vals = results.map(r => r.yearly[yr] ? fmt(Math.round(r.yearly[yr]*RS_PER_PT)) : '—');
  console.log(`  ${yr.padEnd(6)} ${vals.map(v => v.padStart(13)).join('')}`);
}

// ── Reference comparison ──────────────────────────────────────────
console.log('\n  REFERENCE (stored results on VPS):');
try {
  const c5 = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/5yr_clean_result.json','utf8'));
  console.log(`  5yr_clean_result.json     pts=${c5.totalPts?.toFixed(0)}  rs=₹${c5.totalRs?.toLocaleString('en-IN')}  (different strategy: 2-candle body-confirm)`);
} catch(e) {}

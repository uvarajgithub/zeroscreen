/**
 * amina_target.js — AMINA Sweet Spot + Profit Target Lock
 *
 * Base config: SL_T1=50, SL_RE=60, LockBE trail (sweet spot)
 *
 * Tests TWO modes:
 *   MODE=T1  — profit target on T1 trade only (RE runs free)
 *   MODE=RE  — profit target on RE trade only (T1 runs free)
 *
 * Tests targets: 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1200
 *   + no target (baseline)
 *
 * Uses bnf_candles_full.json if available, else research-candles-cache.json
 */
'use strict';
const fs = require('fs');
require('dotenv').config();

const CACHE     = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const SL_T1     = 50;
const SL_RE     = 60;

const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));

// Parse candles into {date, h, m, open, high, low, close}
const allCandles = raw.map(c => {
  const ist = new Date(new Date(c.date).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  return {
    date : `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
    h: ist.getHours(), m: ist.getMinutes(),
    open: c.open, high: c.high, low: c.low, close: c.close
  };
});

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date] = []; m[c.date].push(c); }
  return m;
}
const byDay    = groupByDay(allCandles);
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log(`Cache: ${CACHE} | ${allCandles.length} candles | ${allDates.length} days\n`);

// ── Enrich ────────────────────────────────────────────────────────────────────
function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// ── Rolling entry scan (exact AMINA replica) ──────────────────────────────────
function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = 0;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── Sim one day with optional per-trade profit target ─────────────────────────
// tgtMode: 'T1' = apply target to T1 only, 'RE' = apply target to RE only, 'BOTH' = both
function simDay(candles, target, tgtMode) {
  const cs     = candles.map(enrich);
  const isEOD  = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase  = 'SCANNING';
  let t1Dir  = null, t1Entry = 0, t1Pts = 0;
  let reDir  = null, reEntry = 0, rePts = 0;
  let t1SL   = 0, reSL = 0, t1Peak = 0, rePeak = 0;
  let trades = 0;
  let tgtHitsT1 = 0, tgtHitsRE = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      t1Dir = res.sig; t1Entry = res.px;
      t1SL  = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
      t1Peak = 0; phase = 'IN_T1'; trades++;
      continue;
    }

    if (phase === 'IN_T1') {
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;
      if (cur > t1Peak) t1Peak = cur;
      // LockBE trail
      if (t1Peak >= SL_T1) { t1SL = t1Dir === 'CE' ? Math.max(t1SL, t1Entry) : Math.min(t1SL, t1Entry); }
      // Profit target (T1 phase)
      if (target && (tgtMode === 'T1' || tgtMode === 'BOTH') && cur >= target) { t1Pts = target; tgtHitsT1++; phase = 'DONE'; break; }
      if (isEOD(c)) { t1Pts = cur; phase = 'DONE'; break; }
      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts = t1Dir === 'CE' ? t1SL - t1Entry : t1Entry - t1SL;
        reDir = t1Dir === 'CE' ? 'PE' : 'CE'; reEntry = c.close;
        reSL  = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
        rePeak = 0; phase = 'IN_RE'; trades++;
      }
      continue;
    }

    if (phase === 'IN_RE') {
      const cur = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      rePts = cur;
      if (cur > rePeak) rePeak = cur;
      // LockBE trail
      if (rePeak >= SL_RE) { reSL = reDir === 'CE' ? Math.max(reSL, reEntry) : Math.min(reSL, reEntry); }
      // Profit target (RE phase)
      if (target && (tgtMode === 'RE' || tgtMode === 'BOTH') && cur >= target) { rePts = target; tgtHitsRE++; phase = 'DONE'; break; }
      if (isEOD(c)) { rePts = cur; phase = 'DONE'; break; }
      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) { rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL; phase = 'DONE'; break; }
    }
  }

  return { dayPts: t1Pts + rePts, t1Pts, rePts, t1Dir, reDir, trades, tgtHitsT1, tgtHitsRE };
}

// ── Run variant ───────────────────────────────────────────────────────────────
function runTarget(target, tgtMode) {
  let totalPts = 0, winDays = 0, lossDays = 0, tgtDays = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir, tgtHitsT1, tgtHitsRE } = simDay(byDay[date], target, tgtMode);
    if (!t1Dir) continue;

    totalPts += dayPts;
    equity   += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayPts;

    if (dayPts > 0) winDays++; else lossDays++;
    if (tgtHitsT1 || tgtHitsRE) tgtDays++;
  }

  const tradeDays = winDays + lossDays;
  return {
    target,
    netRs  : Math.round(totalPts * RS_PER_PT),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    winPct : tradeDays ? (winDays / tradeDays * 100).toFixed(1) : '0',
    tgtPct : tradeDays ? (tgtDays / tradeDays * 100).toFixed(0) : '0',
    avgDay : tradeDays ? Math.round(totalPts * RS_PER_PT / tradeDays) : 0,
    yearly,
  };
}

// ── Run all targets ───────────────────────────────────────────────────────────
const TARGETS = [null, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 900, 1000, 1200];

process.stdout.write('Running T1 targets');
const resultsT1 = TARGETS.map(t => { process.stdout.write('.'); return { ...runTarget(t, 'T1'), mode: 'T1' }; });
console.log();
process.stdout.write('Running RE targets');
const resultsRE = TARGETS.map(t => { process.stdout.write('.'); return { ...runTarget(t, 'RE'), mode: 'RE' }; });
console.log(' done\n');

const LINE = '─'.repeat(95);
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

function printTable(results, title) {
  const baseline = results[0].netRs;
  console.log(title);
  console.log(LINE);
  console.log(`${'Target'.padEnd(12)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'TGT days%'.padStart(10)} ${'Avg/Day'.padStart(9)} ${'vs baseline'.padStart(13)}`);
  console.log(LINE);
  for (const r of results) {
    const label = r.target ? `${r.target} pts` : 'No target';
    const diff  = r.target ? ` ${r.netRs >= baseline ? '+' : ''}${(((r.netRs - baseline) / baseline) * 100).toFixed(1)}%` : '  (baseline)';
    const flag  = r.netRs > baseline ? '  ✅ IMPROVEMENT' : '';
    console.log(
      `${label.padEnd(12)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.tgtPct + '%').padStart(10)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)} ${diff.padStart(13)}${flag}`
    );
  }
  console.log();
  // Yearly
  console.log('YEARLY (₹)');
  console.log('Target'.padEnd(12) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
  console.log(LINE);
  for (const r of results) {
    const label = r.target ? `T${r.target}` : 'No target';
    const row = label.padEnd(12)
      + years.map(y => {
          const rs = Math.round((r.yearly[y] || 0) * RS_PER_PT);
          return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
        }).join('')
      + ('  ₹' + r.netRs.toLocaleString('en-IN')).padStart(12);
    console.log(row);
  }
  console.log();
}

printTable(resultsT1, '═══ MODE: T1 TARGET (RE runs free to EOD) ═══');
printTable(resultsRE, '═══ MODE: RE TARGET (T1 runs free to EOD) ═══');

console.log(LINE);
console.log(`Cache: ${CACHE}`);
console.log('AMINA baseline (cache) = ₹12,49,954  |  AMINA (full 33K) = ₹14,24,023');
console.log(LINE);

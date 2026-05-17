/**
 * amina_daycap.js — AMINA + Daily Profit Cap
 *
 * Logic: Once cumulative day P&L reaches CAP pts → exit current trade immediately,
 *        stop trading for the rest of the day (lock the profit).
 *
 * This is different from per-trade targets:
 *   - T1 makes 200pts → keep holding (day P&L = 200, cap not hit yet)
 *   - T1 makes 300pts mid-candle → cap hit → exit at cap, done for day
 *   - If SL hit first (T1=-50), RE now needs 350+ pts to hit a 300pt day cap
 *
 * Tests day caps: 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000
 *   + no cap (baseline)
 *
 * Base: SL_T1=50, SL_RE=60, LockBE trail (sweet spot)
 */
'use strict';
const fs = require('fs');
require('dotenv').config();

const CACHE     = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const SL_T1     = 50;
const SL_RE     = 60;

const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
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

function enrich(c) {
  const bull = c.close >= c.open;
  const body_high = Math.max(c.open, c.close), body_low = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i+1];
    let sig = null, bl = 0;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i+2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// dayCap = total pts earned today before brokerage; once hit, exit & stop
function simDay(candles, dayCap) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase  = 'SCANNING';
  let t1Dir  = null, t1Entry = 0, t1Pts = 0;
  let reDir  = null, reEntry = 0, rePts = 0;
  let t1SL   = 0, reSL = 0, t1Peak = 0, rePeak = 0;
  let trades = 0, capHit = false;
  let dayPtsRunning = 0; // cumulative raw pts this day (before brokerage)

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx+1);
      const res   = rollingEntryScan(slice);
      if (!res || res.entryIdx !== slice.length-1) continue;
      t1Dir = res.sig; t1Entry = res.px;
      t1SL  = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
      t1Peak = 0; phase = 'IN_T1'; trades++;
      continue;
    }

    if (phase === 'IN_T1') {
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;
      if (cur > t1Peak) t1Peak = cur;
      // LockBE
      if (t1Peak >= SL_T1) { t1SL = t1Dir === 'CE' ? Math.max(t1SL, t1Entry) : Math.min(t1SL, t1Entry); }

      // Daily cap check (total day = prior settled pts + current running)
      if (dayCap && (dayPtsRunning + cur) >= dayCap) {
        t1Pts = dayCap - dayPtsRunning;  // exit exactly at cap
        capHit = true; phase = 'DONE'; break;
      }

      if (isEOD(c)) { t1Pts = cur; phase = 'DONE'; break; }

      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts = t1Dir === 'CE' ? t1SL - t1Entry : t1Entry - t1SL;
        dayPtsRunning += t1Pts; // settle T1
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
      // LockBE
      if (rePeak >= SL_RE) { reSL = reDir === 'CE' ? Math.max(reSL, reEntry) : Math.min(reSL, reEntry); }

      // Daily cap check
      if (dayCap && (dayPtsRunning + cur) >= dayCap) {
        rePts = dayCap - dayPtsRunning;
        capHit = true; phase = 'DONE'; break;
      }

      if (isEOD(c)) { rePts = cur; phase = 'DONE'; break; }

      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) { rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL; phase = 'DONE'; break; }
    }
  }

  const brok    = trades * 4;
  const dayPts  = t1Pts + rePts - brok;
  return { dayPts, t1Dir, trades, capHit };
}

function run(dayCap) {
  let totalPts = 0, winDays = 0, lossDays = 0, capDays = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir, capHit } = simDay(byDay[date], dayCap);
    if (!t1Dir) continue;

    totalPts += dayPts;
    equity   += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayPts;

    if (dayPts > 0) winDays++; else lossDays++;
    if (capHit) capDays++;
  }

  const tradeDays = winDays + lossDays;
  return {
    dayCap,
    netRs  : Math.round(totalPts * RS_PER_PT),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    winPct : tradeDays ? (winDays / tradeDays * 100).toFixed(1) : '0',
    capPct : tradeDays ? (capDays / tradeDays * 100).toFixed(0) : '0',
    avgDay : tradeDays ? Math.round(totalPts * RS_PER_PT / tradeDays) : 0,
    yearly,
  };
}

const CAPS = [null, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800, 1000];

process.stdout.write('Running');
const results = CAPS.map(c => { process.stdout.write('.'); return run(c); });
console.log(' done\n');

const LINE  = '─'.repeat(100);
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
const BASE  = results[0].netRs;

console.log('AMINA SL50+RE60+LockBE — DAILY PROFIT CAP TEST');
console.log('(Exit current trade + stop for the day once total day P&L hits cap)');
console.log(LINE);
console.log(`${'Day Cap'.padEnd(14)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'Cap fires%'.padStart(11)} ${'Avg/Day'.padStart(9)} ${'vs baseline'.padStart(13)}`);
console.log(LINE);

for (const r of results) {
  const label = r.dayCap ? `${r.dayCap} pts/day` : 'No cap (baseline)';
  const diff  = r.dayCap ? ` ${r.netRs >= BASE ? '+' : ''}${(((r.netRs - BASE) / BASE) * 100).toFixed(1)}%` : '  (baseline)';
  const flag  = r.netRs > BASE ? '  ✅ IMPROVEMENT' : '';
  console.log(
    `${label.padEnd(14)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.capPct + '%').padStart(11)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)} ${diff.padStart(13)}${flag}`
  );
}

console.log('\nYEARLY BREAKDOWN (₹)');
console.log('Day Cap'.padEnd(14) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
console.log(LINE);
for (const r of results) {
  const label = r.dayCap ? `Cap${r.dayCap}` : 'No cap';
  const row = label.padEnd(14)
    + years.map(y => {
        const rs = Math.round((r.yearly[y] || 0) * RS_PER_PT);
        return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
      }).join('')
    + ('  ₹' + r.netRs.toLocaleString('en-IN')).padStart(12);
  console.log(row);
}

console.log('\n' + LINE);
console.log(`Cache: ${CACHE}  |  AMINA (full 33K) = ₹14,24,023`);
console.log(LINE);

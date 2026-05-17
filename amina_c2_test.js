'use strict';
/**
 * amina_c2_test.js
 * Compare AMINA SL60+LockBE with:
 *   A) Current  — always wait for C3+ to confirm breakout
 *   B) Early    — enter at C2.close if C2 itself breaks C1's level
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_T1        = 60;
const SL_RE        = 60;

// ── Kite fetch ────────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchChunk(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`).catch(() => null);
  if (!r || !r.data || !r.data.candles) return [];
  return r.data.candles.map(c => {
    const ist = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return {
      date : `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
      h: ist.getHours(), m: ist.getMinutes(),
      open: c[1], high: c[2], low: c[3], close: c[4]
    };
  });
}

async function fetchAll(start, end) {
  const all = [], endD = new Date(end); let cur = new Date(start);
  process.stdout.write(`Fetching ${start}→${end} `);
  while (cur <= endD) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 90);
    if (ce > endD) ce.setTime(endD.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 91);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// ── A) CURRENT: always wait for C3+ ──────────────────────────────────────────
function scanCurrent(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = 0;

    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else { continue; }

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── B) EARLY: enter at C2.close if it already breaks C1's level ──────────────
function scanEarly(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, c2level = 0, c3level = 0;

    if (ca.bull === cb.bull) {
      sig      = ca.bull ? 'CE' : 'PE';
      c2level  = sig === 'CE' ? ca.high      : ca.low;
      c3level  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig      = cb.bull ? 'CE' : 'PE';
      c2level  = sig === 'CE' ? ca.body_high  : ca.body_low;
      c3level  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else { continue; }

    // C2 itself breaks C1's level → enter at C2.close
    if (sig === 'CE' && cb.close > c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, px: cb.close, entryIdx: i + 1 };

    // Fallback: wait for C3+ to break combined level
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one day — SL60 + LockBE ─────────────────────────────────────────
function simDay(candles, scanFn) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase   = 'SCANNING';
  let t1Dir   = null, t1Entry = 0, t1Pts = 0, t1SL = 0, t1Peak = 0;
  let reDir   = null, reEntry = 0, rePts = 0, reSL = 0, rePeak = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = scanFn(slice);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      t1Dir   = res.sig;
      t1Entry = res.px;
      t1SL    = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
      t1Peak  = 0;
      phase   = 'IN_T1';
      continue;
    }

    if (phase === 'IN_T1') {
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;
      if (cur > t1Peak) t1Peak = cur;

      // LockBE once peak >= SL_T1
      if (t1Peak >= SL_T1) {
        if (t1Dir === 'CE') t1SL = Math.max(t1SL, t1Entry);
        else                t1SL = Math.min(t1SL, t1Entry);
      }

      if (isEOD(c)) { t1Pts = cur; phase = 'DONE'; break; }

      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts   = t1Dir === 'CE' ? t1SL - t1Entry : t1Entry - t1SL;
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        reSL    = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
        rePeak  = 0;
        phase   = 'IN_RE';
        continue;
      }
    }

    if (phase === 'IN_RE') {
      const cur = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      rePts = cur;
      if (cur > rePeak) rePeak = cur;

      // LockBE once peak >= SL_RE
      if (rePeak >= SL_RE) {
        if (reDir === 'CE') reSL = Math.max(reSL, reEntry);
        else                reSL = Math.min(reSL, reEntry);
      }

      if (isEOD(c)) { rePts = cur; phase = 'DONE'; break; }

      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) { rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL; phase = 'DONE'; break; }
    }
  }

  return { dayPts: t1Pts + rePts, t1Dir };
}

function runBacktest(allDates, byDay, scanFn) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date], scanFn);
    if (!t1Dir) { flat++; continue; }

    totalPts += dayPts;
    equity   += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayPts;
    if (dayPts > 0) wins++; else losses++;
  }

  const tradeDays = wins + losses;
  return {
    netRs  : Math.round(totalPts * RS_PER_PT),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    winPct : tradeDays ? (wins / tradeDays * 100).toFixed(1) : '0',
    avgDay : tradeDays ? Math.round(totalPts * RS_PER_PT / tradeDays) : 0,
    wins, losses, flat, yearly
  };
}

(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const allCandles = await fetchAll('2021-01-01', today);

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}\n`);

  const rCurrent = runBacktest(allDates, byDay, scanCurrent);
  const rEarly   = runBacktest(allDates, byDay, scanEarly);

  const years = ['2021','2022','2023','2024','2025','2026'];
  const LINE  = '─'.repeat(105);

  console.log('AMINA SL60+LockBE — C3 confirm vs C2 early entry (33K candles Jan2021–May2026)');
  console.log(LINE);
  console.log('                         Net ₹       Win%   MaxDD ₹   Avg/day   2021    2022    2023    2024    2025    2026');
  console.log(LINE);

  for (const [label, r] of [['CURRENT  (C3 confirm)', rCurrent], ['EARLY    (C2 entry)  ', rEarly]]) {
    const yrCols = years.map(yr => {
      const rs = Math.round((r.yearly[yr] || 0) * RS_PER_PT);
      return ((rs >= 0 ? '+' : '') + Math.round(rs/1000) + 'K').padStart(6);
    }).join('  ');
    console.log(`  ${label}  ₹${String(r.netRs.toLocaleString('en-IN')).padStart(10)}  ${String(r.winPct+'%').padStart(5)}  ₹${String(r.maxDDRs.toLocaleString('en-IN')).padStart(8)}  ₹${String(r.avgDay).padStart(6)}   ${yrCols}`);
  }

  console.log(LINE);
  const diff = rEarly.netRs - rCurrent.netRs;
  console.log(`C2 early vs C3 confirm: ${diff >= 0 ? '+' : ''}₹${diff.toLocaleString('en-IN')}  → ${diff > 0 ? 'C2 EARLY WINS' : 'C3 CONFIRM WINS'}`);
  console.log(LINE);
})().catch(console.error);

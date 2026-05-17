'use strict';
/**
 * entry_compare.js — C2 early entry vs C3 confirm (AMINA-S7R50 config)
 *
 * EARLY  : enter at C2.close if C2 already breaks C1's level
 *   Rule A CE: C2.close > C1.high  → enter at C2.close
 *   Rule A PE: C2.close < C1.low   → enter at C2.close
 *   Rule B CE: C2.close > C1.body_high → enter at C2.close
 *   Rule B PE: C2.close < C1.body_low  → enter at C2.close
 *   otherwise: wait for C3+ to break max(C1.h, C2.h) as usual
 *
 * CURRENT: always wait for C3+ to close above max(C1.high, C2.high)
 *
 * Both use: T1 SL = SMMA7 | RE SL = 50 pts fixed (AMINA-S7R50 config)
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SMMA_LEN     = 7;
const RE_SL_PTS    = 50;

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

function calcSMMA(closes) {
  const result = new Array(closes.length).fill(null);
  const seed = closes.slice(0, SMMA_LEN).reduce((s, v) => s + v, 0) / SMMA_LEN;
  result[SMMA_LEN - 1] = seed;
  for (let i = SMMA_LEN; i < closes.length; i++) {
    result[i] = (result[i - 1] * (SMMA_LEN - 1) + closes[i]) / SMMA_LEN;
  }
  return result;
}

function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// ── CURRENT: C3+ confirm — enter when close > max(C1.h, C2.h) ────────────────
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

    // always start at C3 (j = i+2)
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── EARLY: enter at C2.close if it already breaks C1's level ─────────────────
function scanEarly(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, c2level = 0, c3level = 0;

    if (ca.bull === cb.bull) {
      sig      = ca.bull ? 'CE' : 'PE';
      c2level  = sig === 'CE' ? ca.high          : ca.low;           // just C1
      c3level  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low); // C1+C2
    } else if (cb.body_size > ca.body_size) {
      sig      = cb.bull ? 'CE' : 'PE';
      c2level  = sig === 'CE' ? ca.body_high     : ca.body_low;
      c3level  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else { continue; }

    // check C2 itself for early entry
    if (sig === 'CE' && cb.close > c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, px: cb.close, entryIdx: i + 1 };

    // else wait for C3+ against combined level
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one day ──────────────────────────────────────────────────────────
// filterSMMA: if true, skip entry when price is on wrong side of SMMA7
function simDay(candles, scanFn, filterSMMA) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase   = 'SCANNING';
  let t1Dir   = null, t1Entry = 0, t1Pts = 0;
  let reDir   = null, reEntry = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = scanFn(slice);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      // SMMA7 filter: only enter if price is on correct side
      if (filterSMMA && c.smma !== null) {
        if (res.sig === 'CE' && res.px <= c.smma) continue;  // CE needs price > SMMA7
        if (res.sig === 'PE' && res.px >= c.smma) continue;  // PE needs price < SMMA7
      }
      t1Dir   = res.sig;
      t1Entry = res.px;
      phase   = 'IN_T1';
      continue;
    }

    if (phase === 'IN_T1') {
      if (isEOD(c)) {
        t1Pts = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
        phase = 'DONE'; break;
      }
      const slHit = c.smma !== null && (t1Dir === 'CE' ? c.close < c.smma : c.close > c.smma);
      if (slHit) {
        t1Pts   = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;  // exit at close, not smma
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        phase   = 'IN_RE';
        continue;
      }
    }

    if (phase === 'IN_RE') {
      if (isEOD(c)) {
        rePts = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
        phase = 'DONE'; break;
      }
      const slHit = reDir === 'CE'
        ? c.close <= reEntry - RE_SL_PTS
        : c.close >= reEntry + RE_SL_PTS;
      if (slHit) { rePts = -RE_SL_PTS; phase = 'DONE'; break; }
    }
  }

  return { dayPts: t1Pts + rePts, t1Dir };
}

function runBacktest(allDates, byDay, scanFn, filterSMMA) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date], scanFn, filterSMMA);
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

  const closes  = allCandles.map(c => c.close);
  const smmaAll = calcSMMA(closes);
  for (let i = 0; i < allCandles.length; i++) allCandles[i].smma = smmaAll[i];

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}\n`);

  const rCurrent     = runBacktest(allDates, byDay, scanCurrent, false);
  const rCurrentF    = runBacktest(allDates, byDay, scanCurrent, true);
  const rEarly       = runBacktest(allDates, byDay, scanEarly,   false);
  const rEarlyF      = runBacktest(allDates, byDay, scanEarly,   true);

  const years = ['2021','2022','2023','2024','2025','2026'];
  const LINE  = '─'.repeat(105);

  console.log('ENTRY COMPARISON  (T1 SL=SMMA7 exit@close | RE SL=50pts | 33K candles Jan2021–May2026)');
  console.log(LINE);
  console.log('                                Net ₹       Win%   MaxDD ₹   Avg/day   2021    2022    2023    2024    2025    2026');
  console.log(LINE);

  const variants = [
    ['C3 confirm  no filter ', rCurrent ],
    ['C3 confirm  +SMMA7 filter', rCurrentF],
    ['C2 early    no filter ', rEarly   ],
    ['C2 early    +SMMA7 filter', rEarlyF  ],
  ];

  for (const [label, r] of variants) {
    const yrCols = years.map(yr => {
      const rs = Math.round((r.yearly[yr] || 0) * RS_PER_PT);
      return ((rs >= 0 ? '+' : '') + Math.round(rs/1000) + 'K').padStart(6);
    }).join('  ');
    console.log(`  ${label.padEnd(26)}  ₹${String(r.netRs.toLocaleString('en-IN')).padStart(10)}  ${String(r.winPct+'%').padStart(5)}  ₹${String(r.maxDDRs.toLocaleString('en-IN')).padStart(8)}  ₹${String(r.avgDay).padStart(6)}  ${yrCols}`);
  }

  console.log(LINE);
  const all4 = variants.map(([l,r]) => ({ l, r }));
  const best = all4.reduce((a, b) => a.r.netRs > b.r.netRs ? a : b);
  console.log(`BEST: ${best.l.trim()}  →  ₹${best.r.netRs.toLocaleString('en-IN')}`);
  console.log(`AMINA SL60 baseline = ₹14,24,023`);
  console.log(LINE);
})().catch(console.error);

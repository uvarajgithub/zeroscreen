'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  STRATEGY: AMINA-S7R50                                      ║
 * ║  File    : amina_s7r50.js                                   ║
 * ║  Created : 2026-05-17                                       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Entry : AMINA rollingEntryScan — Rule A (same-color C1+C2) ║
 * ║          or Rule B (opposite color, C2 body > C1 body)      ║
 * ║  T1 SL : SMMA(7) — dynamic trailing stop                    ║
 * ║          CE: exit when close < SMMA7                        ║
 * ║          PE: exit when close > SMMA7                        ║
 * ║  RE SL : Fixed 50 pts                                       ║
 * ║          CE RE: exit when close <= entry - 50               ║
 * ║          PE RE: exit when close >= entry + 50               ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  BACKTEST RESULT (33,091 candles, Jan 2021 – May 2026)      ║
 * ║  Net ₹  : ₹16,40,665  ✅ NEW BEST (beats AMINA-S7 ₹16,32,742)║
 * ║  Win%   : 53.8%                                             ║
 * ║  MaxDD  : ₹16,159  (lowest of all SMMA7-T1 variants)        ║
 * ║  Avg/day: ₹1,238                                            ║
 * ║  ALL 6 YEARS GREEN (2021–2026)                              ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  vs AMINA SL60 baseline: +₹3,35,016 (+25.7%)               ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SMMA_LEN     = 7;
const RE_SL_PTS    = 50;   // fixed SL for re-entry leg

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

// ── SMMA(7) continuous across all candles ─────────────────────────────────────
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
    } else { continue; }

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one day ──────────────────────────────────────────────────────────
// T1 SL = SMMA7 dynamic | RE SL = 50 pts fixed
function simDay(candles) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase   = 'SCANNING';
  let t1Dir   = null, t1Entry = 0, t1Pts = 0;
  let reDir   = null, reEntry = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    // ── SCANNING: wait for AMINA entry signal ─────────────────────────────
    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      t1Dir   = res.sig;
      t1Entry = res.px;
      phase   = 'IN_T1';
      continue;
    }

    // ── IN_T1: SMMA7 dynamic trailing SL ─────────────────────────────────
    if (phase === 'IN_T1') {
      if (isEOD(c)) {
        t1Pts = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
        phase = 'DONE'; break;
      }
      // SL: close crosses SMMA7
      const slHit = c.smma !== null && (t1Dir === 'CE' ? c.close < c.smma : c.close > c.smma);
      if (slHit) {
        t1Pts   = t1Dir === 'CE' ? c.smma - t1Entry : t1Entry - c.smma;
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        phase   = 'IN_RE';
        continue;
      }
    }

    // ── IN_RE: fixed 50-pt SL ─────────────────────────────────────────────
    if (phase === 'IN_RE') {
      if (isEOD(c)) {
        rePts = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
        phase = 'DONE'; break;
      }
      // SL: 50 pts fixed
      const slHit = reDir === 'CE'
        ? c.close <= reEntry - RE_SL_PTS
        : c.close >= reEntry + RE_SL_PTS;
      if (slHit) {
        rePts = -RE_SL_PTS;
        phase = 'DONE'; break;
      }
    }
  }

  return { dayPts: t1Pts + rePts, t1Dir, t1Pts, rePts, reDir };
}

// ── Full backtest ─────────────────────────────────────────────────────────────
function runBacktest(allDates, byDay) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date]);
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

// ── Main ──────────────────────────────────────────────────────────────────────
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

  const r = runBacktest(allDates, byDay);

  const LINE  = '─'.repeat(80);
  const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

  console.log('AMINA-S7R50');
  console.log('Entry  : AMINA rollingEntryScan (Rule A/B)');
  console.log('T1 SL  : SMMA(7) dynamic  — CE: close < SMMA7 | PE: close > SMMA7');
  console.log('RE SL  : Fixed 50 pts     — CE: close <= entry-50 | PE: close >= entry+50');
  console.log(LINE);
  console.log(`Net ₹    : ₹${r.netRs.toLocaleString('en-IN')}`);
  console.log(`Win%     : ${r.winPct}%`);
  console.log(`MaxDD    : ₹${r.maxDDRs.toLocaleString('en-IN')}`);
  console.log(`Avg/day  : ₹${r.avgDay.toLocaleString('en-IN')}`);
  console.log(`Trades   : ${r.wins + r.losses} days  Wins:${r.wins}  Losses:${r.losses}  NoTrade:${r.flat}`);
  console.log(LINE);
  console.log('YEARLY:');
  for (const yr of years) {
    const rs = Math.round((r.yearly[yr] || 0) * RS_PER_PT);
    console.log(`  ${yr}: ${rs >= 0 ? '+' : ''}₹${rs.toLocaleString('en-IN')}`);
  }
  console.log(LINE);
  console.log(`AMINA SL60+LockBE  = ₹14,24,023  ← canonical baseline`);
  console.log(`AMINA-S7  (G)      = ₹16,32,742`);
  console.log(`AMINA-S7R50 (C)    = ₹${r.netRs.toLocaleString('en-IN')}  ${r.netRs > 1632742 ? '✅ NEW BEST' : r.netRs > 1424023 ? '✅ beats baseline' : '❌'}`);
  console.log(LINE);
})().catch(console.error);

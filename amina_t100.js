'use strict';
/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  STRATEGY: AMINA-T100                                       ║
 * ║  File    : amina_t100.js                                    ║
 * ║  Created : 2026-05-17                                       ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  Entry  : AMINA C2 early                                    ║
 * ║           C2 breaks C1 level → enter at C2.close            ║
 * ║           else wait for C3+ to break combined level         ║
 * ║  T1 SL  : 60 pts fixed                                      ║
 * ║  Trail  : once trade moves +60 pts (LockBE threshold)       ║
 * ║           SL trails 100 pts BEHIND the peak                 ║
 * ║           e.g. peak=800 → SL locks at +700                  ║
 * ║           e.g. peak=300 → SL locks at +200                  ║
 * ║           SL only moves up (CE) or down (PE), never back    ║
 * ║  RE SL  : same rules — 60 pts fixed → trail 100 behind peak ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  BACKTEST RESULT (33,091 candles, Jan 2021 – May 2026)      ║
 * ║  Net ₹  : ₹19,25,692  ✅ NEW BEST                           ║
 * ║  Win%   : 56.6%                                             ║
 * ║  MaxDD  : ₹17,290                                           ║
 * ║  Avg/day: ₹1,453                                            ║
 * ║  ALL 6 YEARS GREEN (2021–2026)                              ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║  vs AMINA SL60 baseline:        +₹5,01,669  (+35%)         ║
 * ║  vs AMINA C2 plain (₹16,50,024): +₹2,75,668  (+17%)        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_INITIAL   = 60;    // initial hard SL + LockBE threshold
const TRAIL_GAP    = 100;   // SL trails 100 pts behind peak

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

// ── AMINA C2 early entry scan ─────────────────────────────────────────────────
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

    // C2 breaks C1 level → enter at C2.close
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

// ── Simulate one leg with trail ───────────────────────────────────────────────
// SL starts at entry ± SL_INITIAL
// Once peak >= SL_INITIAL: SL = entry + max(0, peak - TRAIL_GAP)
// SL only moves in profit direction, never back
function simLeg(cs, startIdx, dir, isEOD) {
  const entry = cs[startIdx].close;
  let sl      = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak    = 0;

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c   = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;

    if (cur > peak) peak = cur;

    // Once peak reaches LockBE threshold, start trailing
    if (peak >= SL_INITIAL) {
      const lockedPts = Math.max(0, peak - TRAIL_GAP);
      if (dir === 'CE') sl = Math.max(sl, entry + lockedPts);
      else              sl = Math.min(sl, entry - lockedPts);
    }

    if (isEOD(c)) return { pts: cur, slType: 'eod' };

    const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
    if (slHit) {
      const exitPts = dir === 'CE' ? sl - entry : entry - sl;
      return { pts: exitPts, slType: 'sl', exitIdx: idx };
    }
  }

  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod' };
}

// ── Simulate one day ──────────────────────────────────────────────────────────
function simDay(candles) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);
  let t1Dir = null, t1Pts = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    if (isEOD(cs[idx])) break;
    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir = res.sig;
    const t1Res = simLeg(cs, idx, t1Dir, isEOD);
    t1Pts = t1Res.pts;

    if (t1Res.slType === 'sl') {
      const reDir = t1Dir === 'CE' ? 'PE' : 'CE';
      const reRes = simLeg(cs, t1Res.exitIdx, reDir, isEOD);
      rePts = reRes.pts;
    }
    break;
  }

  return { dayPts: t1Pts + rePts, t1Dir };
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

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}\n`);

  const r = runBacktest(allDates, byDay);

  const LINE  = '─'.repeat(80);
  const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

  console.log('AMINA-T100');
  console.log('Entry  : AMINA C2 early (enter at C2.close if breaks C1 level)');
  console.log(`T1 SL  : ${SL_INITIAL} pts fixed → trail ${TRAIL_GAP} pts behind peak once +${SL_INITIAL}`);
  console.log(`RE SL  : same trail rules`);
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
  console.log(`AMINA SL60 baseline  = ₹14,24,023`);
  console.log(`AMINA C2 plain       = ₹16,50,024`);
  console.log(`AMINA-T100           = ₹${r.netRs.toLocaleString('en-IN')}  ${r.netRs > 1650024 ? '✅ NEW BEST' : ''}`);
  console.log(LINE);
})().catch(console.error);

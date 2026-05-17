'use strict';
/**
 * amina_t100_market.js
 * AMINA-T100 broken down by market type (trending/reversal/choppy)
 *
 * Day classification (same logic as amina_backtest.js):
 *   trend-bull  : range > 350pts AND day closed in top 35%
 *   trend-bear  : range > 350pts AND day closed in bottom 35%
 *   reversal-bull: range > 250pts, opened high (top 35%), closed low (bot 35%) → flip up
 *   reversal-bear: range > 250pts, opened low (bot 35%), closed high (top 35%) → flip down
 *   choppy      : everything else
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_INITIAL   = 60;
const TRAIL_GAP    = 100;

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

// ── Day classifier ────────────────────────────────────────────────────────────
function classifyDay(candles) {
  const dayHigh = Math.max(...candles.map(c => c.high));
  const dayLow  = Math.min(...candles.map(c => c.low));
  const range   = dayHigh - dayLow;
  const first   = candles.find(c => c.h === 9 && c.m === 15);
  const last    = candles[candles.length - 1];
  if (!first || !last || range === 0) return 'choppy';

  const pos = v => (v - dayLow) / range;
  const openPos  = pos(first.open);
  const closePos = pos(last.close);

  if (range > 350) {
    if (closePos >= 0.65) return 'trend-bull';
    if (closePos <= 0.35) return 'trend-bear';
  }
  if (range > 250) {
    if (openPos >= 0.65 && closePos <= 0.35) return 'reversal-bear';
    if (openPos <= 0.35 && closePos >= 0.65) return 'reversal-bull';
  }
  return 'choppy';
}

// ── Entry scan ────────────────────────────────────────────────────────────────
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

    if (sig === 'CE' && cb.close > c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one leg ──────────────────────────────────────────────────────────
function simLeg(cs, startIdx, dir, isEOD) {
  const entry = cs[startIdx].close;
  let sl      = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak    = 0;

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c   = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;
    if (cur > peak) peak = cur;

    if (peak >= SL_INITIAL) {
      const locked = Math.max(0, peak - TRAIL_GAP);
      if (dir === 'CE') sl = Math.max(sl, entry + locked);
      else              sl = Math.min(sl, entry - locked);
    }

    if (isEOD(c)) return { pts: cur, slType: 'eod' };

    const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
    if (slHit) {
      return { pts: dir === 'CE' ? sl - entry : entry - sl, slType: 'sl', exitIdx: idx };
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
      rePts = simLeg(cs, t1Res.exitIdx, reDir, isEOD).pts;
    }
    break;
  }
  return { dayPts: t1Pts + rePts, t1Dir };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const today = new Date().toISOString().slice(0, 10);
  const allCandles = await fetchAll('2021-01-01', today);

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}\n`);

  // Buckets
  const cats = ['trend-bull', 'trend-bear', 'reversal-bull', 'reversal-bear', 'choppy'];
  const stat  = {};
  for (const cat of cats) stat[cat] = { pts: 0, wins: 0, losses: 0, days: 0, worstDay: 0, bestDay: 0 };

  let totalPts = 0, equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const candles = byDay[date];
    const { dayPts, t1Dir } = simDay(candles);
    if (!t1Dir) continue;

    const cat = classifyDay(candles);
    stat[cat].pts  += dayPts;
    stat[cat].days++;
    if (dayPts > 0) stat[cat].wins++;
    else            stat[cat].losses++;
    if (dayPts > stat[cat].bestDay)  stat[cat].bestDay  = dayPts;
    if (dayPts < stat[cat].worstDay) stat[cat].worstDay = dayPts;

    totalPts += dayPts;
    equity   += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayPts;
  }

  const LINE = '─'.repeat(95);
  const rs   = v => Math.round(v * RS_PER_PT);

  console.log('AMINA-T100 — BREAKDOWN BY MARKET TYPE');
  console.log(`Net ₹ ${rs(totalPts).toLocaleString('en-IN')}  |  MaxDD ₹${rs(maxDD).toLocaleString('en-IN')}  |  33,091 candles Jan2021–May2026`);
  console.log(LINE);
  console.log(`${'Market Type'.padEnd(16)} ${'Days'.padStart(5)} ${'Wins'.padStart(5)} ${'Loss'.padStart(5)} ${'Win%'.padStart(6)} ${'Net ₹'.padStart(12)} ${'Avg/day ₹'.padStart(10)} ${'Best day ₹'.padStart(12)} ${'Worst day ₹'.padStart(12)}`);
  console.log(LINE);

  const labels = {
    'trend-bull'    : 'Trend Bull   ',
    'trend-bear'    : 'Trend Bear   ',
    'reversal-bull' : 'Reversal Bull',
    'reversal-bear' : 'Reversal Bear',
    'choppy'        : 'Choppy       ',
  };

  for (const cat of cats) {
    const s    = stat[cat];
    const td   = s.wins + s.losses;
    const winP = td ? (s.wins / td * 100).toFixed(1) : '0';
    const netRs  = rs(s.pts);
    const avgRs  = td ? Math.round(netRs / td) : 0;
    const bestRs = rs(s.bestDay);
    const wrstRs = rs(s.worstDay);
    console.log(
      `${labels[cat].padEnd(16)} ${String(s.days).padStart(5)} ${String(s.wins).padStart(5)} ${String(s.losses).padStart(5)} ${String(winP+'%').padStart(6)} ${String('₹'+netRs.toLocaleString('en-IN')).padStart(12)} ${String('₹'+avgRs.toLocaleString('en-IN')).padStart(10)} ${String('₹'+bestRs.toLocaleString('en-IN')).padStart(12)} ${String('₹'+wrstRs.toLocaleString('en-IN')).padStart(12)}`
    );
  }

  console.log(LINE);
  console.log('YEARLY:');
  for (const yr of ['2021','2022','2023','2024','2025','2026']) {
    const yrs = Math.round((yearly[yr] || 0) * RS_PER_PT);
    console.log(`  ${yr}: ${yrs >= 0 ? '+' : ''}₹${yrs.toLocaleString('en-IN')}`);
  }
  console.log(LINE);
})().catch(console.error);

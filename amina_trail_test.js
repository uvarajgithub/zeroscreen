'use strict';
/**
 * amina_trail_test.js
 * AMINA C2 early entry — test trailing stop variants
 *
 * Base:    SL60 + LockBE only (exits at 0 on big reversal)
 * Goal:    trail SL behind peak to lock in profits on big moves
 *
 * Variants (trail gap = how far SL trails behind peak):
 *   Plain  : SL60 + LockBE only (no trail after BE)
 *   T50    : SL trails 50 pts behind peak  (once > BE)
 *   T75    : SL trails 75 pts behind peak
 *   T100   : SL trails 100 pts behind peak
 *   T150   : SL trails 150 pts behind peak
 *   T200   : SL trails 200 pts behind peak
 *   PCT30  : SL = peak - 30% of peak  (keeps 70% of move)
 *   PCT40  : SL = peak - 40% of peak  (keeps 60% of move)
 *   PCT50  : SL = peak - 50% of peak  (keeps 50% of move)
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_INITIAL   = 60;   // initial SL and LockBE threshold

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
// trail: { type: 'fixed', gap: N } | { type: 'pct', keep: 0.7 }
//        gap = pts behind peak;  keep = fraction of peak to protect
function simLeg(cs, startIdx, dir, trail, isEOD) {
  const entry  = cs[startIdx].close;
  let   sl     = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let   peak   = 0;

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c   = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;

    // Update peak
    if (cur > peak) peak = cur;

    // ── Compute trailing SL ──────────────────────────────────────────────
    if (peak >= SL_INITIAL) {
      let trailSL;
      if (trail.type === 'fixed') {
        // SL trails `gap` pts behind peak, minimum at entry (BE)
        trailSL = Math.max(0, peak - trail.gap);
      } else {
        // SL protects `keep` fraction of peak, minimum at entry (BE)
        trailSL = Math.max(0, peak * trail.keep);
      }
      // Convert pts back to price
      if (dir === 'CE') sl = Math.max(sl, entry + trailSL);
      else              sl = Math.min(sl, entry - trailSL);
    }

    // EOD exit
    if (isEOD(c)) return { pts: cur, slType: 'eod' };

    // SL hit
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
function simDay(candles, trail) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);
  let t1Dir = null, t1Pts = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];
    if (isEOD(c)) break;
    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir = res.sig;
    const t1Res = simLeg(cs, idx, t1Dir, trail, isEOD);
    t1Pts = t1Res.pts;

    if (t1Res.slType === 'sl') {
      const reDir = t1Dir === 'CE' ? 'PE' : 'CE';
      const reRes = simLeg(cs, t1Res.exitIdx, reDir, trail, isEOD);
      rePts = reRes.pts;
    }
    break;
  }

  return { dayPts: t1Pts + rePts, t1Dir };
}

function runBacktest(allDates, byDay, trail) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date], trail);
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

  const variants = [
    { label: 'Plain  SL60+LockBE only      ', trail: { type: 'fixed', gap: 999999 } },
    { label: 'Trail  50pts behind peak      ', trail: { type: 'fixed', gap: 50     } },
    { label: 'Trail  75pts behind peak      ', trail: { type: 'fixed', gap: 75     } },
    { label: 'Trail 100pts behind peak      ', trail: { type: 'fixed', gap: 100    } },
    { label: 'Trail 150pts behind peak      ', trail: { type: 'fixed', gap: 150    } },
    { label: 'Trail 200pts behind peak      ', trail: { type: 'fixed', gap: 200    } },
    { label: 'Trail % keep 60% of peak      ', trail: { type: 'pct',   keep: 0.60  } },
    { label: 'Trail % keep 70% of peak      ', trail: { type: 'pct',   keep: 0.70  } },
    { label: 'Trail % keep 50% of peak      ', trail: { type: 'pct',   keep: 0.50  } },
  ];

  const years = ['2021','2022','2023','2024','2025','2026'];
  const LINE  = '─'.repeat(110);
  const BASE  = 1650024;

  console.log('AMINA C2 early — Trailing Stop variants (33K candles Jan2021–May2026)');
  console.log('Trail activates after LockBE (+60pts), then SL follows peak');
  console.log(LINE);
  console.log('                                  Net ₹       Win%   MaxDD ₹   Avg/day   2021    2022    2023    2024    2025    2026');
  console.log(LINE);

  for (const v of variants) {
    const r = runBacktest(allDates, byDay, v.trail);
    const yrCols = years.map(yr => {
      const rs = Math.round((r.yearly[yr] || 0) * RS_PER_PT);
      return ((rs >= 0 ? '+' : '') + Math.round(rs/1000) + 'K').padStart(6);
    }).join('  ');
    const tag = r.netRs > BASE ? ' ✅ NEW BEST' : '';
    console.log(`  ${v.label}  ₹${String(r.netRs.toLocaleString('en-IN')).padStart(10)}  ${String(r.winPct+'%').padStart(5)}  ₹${String(r.maxDDRs.toLocaleString('en-IN')).padStart(8)}  ₹${String(r.avgDay).padStart(6)}   ${yrCols}${tag}`);
  }
  console.log(LINE);
})().catch(console.error);

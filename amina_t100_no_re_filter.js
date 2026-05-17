'use strict';
/**
 * amina_t100_no_re_filter.js
 * AMINA-T100 with RE skip filter:
 *   After T1 SL hit, if intraday range so far > 300pts AND
 *   price moved > 200pts against entry → skip RE trade
 *
 * Compare: baseline AMINA-T100 = ₹19,25,692
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_INITIAL   = 60;
const TRAIL_GAP    = 100;

// Filter thresholds to test
const RANGE_THRESH = [200, 250, 300, 350, 400];
const MOVE_THRESH  = [150, 200, 250];

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

function simLeg(cs, startIdx, dir, isEOD) {
  const entry = cs[startIdx].close;
  let sl = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak = 0;

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
      return { pts: dir === 'CE' ? sl - entry : entry - sl, slType: 'sl', exitIdx: idx, exitPrice: dir === 'CE' ? sl : sl };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod' };
}

// Simulate one day with configurable RE filter
function simDay(candles, rangeThresh, moveThresh) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);
  let t1Pts = 0, rePts = 0, reSkipped = false;
  let t1Dir = null;

  for (let idx = 0; idx < cs.length; idx++) {
    if (isEOD(cs[idx])) break;
    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir = res.sig;
    const t1Res = simLeg(cs, idx, t1Dir, isEOD);
    t1Pts = t1Res.pts;

    if (t1Res.slType === 'sl') {
      const reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
      const exitIdx = t1Res.exitIdx;

      // Compute intraday range and move-against at T1 exit
      const prevCandles  = cs.slice(0, exitIdx + 1);
      const intradayHigh = Math.max(...prevCandles.map(c => c.high));
      const intradayLow  = Math.min(...prevCandles.map(c => c.low));
      const intradayRange = intradayHigh - intradayLow;

      // Move against T1 entry = how far price moved in SL direction
      const t1Entry = cs[idx].close;
      const moveAgainst = t1Dir === 'CE'
        ? t1Entry - cs[exitIdx].close   // price fell by this much
        : cs[exitIdx].close - t1Entry;  // price rose by this much

      // Skip RE if range > thresh AND move > thresh
      if (intradayRange > rangeThresh && moveAgainst > moveThresh) {
        reSkipped = true;
      } else {
        rePts = simLeg(cs, exitIdx, reDir, isEOD).pts;
      }
    }
    break;
  }
  return { dayPts: t1Pts + rePts, reSkipped, t1Dir };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const today      = new Date().toISOString().slice(0, 10);
  const allCandles = await fetchAll('2021-01-01', today);

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}`);
  console.log(`Baseline AMINA-T100 = ₹19,25,692\n`);

  const LINE = '─'.repeat(80);
  console.log(`${'RangeTh'.padEnd(9)} ${'MoveTh'.padEnd(8)} ${'Skipped'.padStart(8)} ${'Net ₹'.padStart(12)} ${'vs Baseline'.padStart(12)} ${'MaxDD ₹'.padStart(10)}`);
  console.log(LINE);

  for (const rangeThresh of RANGE_THRESH) {
    for (const moveThresh of MOVE_THRESH) {
      let totalPts = 0, skipped = 0;
      let equity = 0, peak = 0, maxDD = 0;

      for (const date of allDates) {
        const { dayPts, reSkipped, t1Dir } = simDay(byDay[date], rangeThresh, moveThresh);
        if (!t1Dir) continue;
        if (reSkipped) skipped++;
        totalPts += dayPts;
        equity   += dayPts;
        if (equity > peak) peak = equity;
        if (peak - equity > maxDD) maxDD = peak - equity;
      }

      const netRs  = Math.round(totalPts * RS_PER_PT);
      const ddRs   = Math.round(maxDD   * RS_PER_PT);
      const diff   = netRs - 1925692;
      const diffStr = (diff >= 0 ? '+' : '') + '₹' + Math.abs(diff).toLocaleString('en-IN');
      console.log(
        `R>${String(rangeThresh).padEnd(6)} M>${String(moveThresh).padEnd(5)} ${String(skipped).padStart(8)} ${String('₹'+netRs.toLocaleString('en-IN')).padStart(12)} ${diffStr.padStart(12)} ${String('₹'+ddRs.toLocaleString('en-IN')).padStart(10)}`
      );
    }
    console.log('');
  }
  console.log(LINE);
})().catch(console.error);

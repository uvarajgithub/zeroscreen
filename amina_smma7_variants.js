'use strict';
/**
 * amina_smma7_variants.js
 * All 3 SMMA7 trail fixes vs plain SL60+LockBE baseline
 *
 * Base: AMINA C2 early entry + SL60+LockBE (₹16,50,024)
 * 
 * Fix 1: SMMA14 trail (slower, less noise)
 * Fix 2: SMMA21 trail (even slower)
 * Fix 3: 2 consecutive candles below SMMA7 to trigger exit
 * Fix 4: SMMA7 trail only after 13:00 (1pm)
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_PTS       = 60;

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

function calcSMMA(closes, len) {
  const result = new Array(closes.length).fill(null);
  const seed = closes.slice(0, len).reduce((s, v) => s + v, 0) / len;
  result[len - 1] = seed;
  for (let i = len; i < closes.length; i++) {
    result[i] = (result[i - 1] * (len - 1) + closes[i]) / len;
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
// mode: 'plain' | 'smma14' | 'smma21' | 'smma7x2' | 'smma7_1pm'
function simLeg(cs, startIdx, dir, mode, isEOD) {
  const entry = cs[startIdx].close;
  let sl      = dir === 'CE' ? entry - SL_PTS : entry + SL_PTS;
  let peak    = 0;
  let smmaActive = false;
  let consecBelow = 0;  // for smma7x2

  // pick smma key
  const smmaKey = mode === 'smma14' ? 'smma14' : mode === 'smma21' ? 'smma21' : 'smma7';

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c   = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;
    const ma  = c[smmaKey];

    // LockBE before smma activates
    if (!smmaActive) {
      if (cur > peak) peak = cur;
      if (peak >= SL_PTS) {
        if (dir === 'CE') sl = Math.max(sl, entry);
        else              sl = Math.min(sl, entry);
      }
    }

    // EOD exit
    if (isEOD(c)) return { pts: cur, slType: 'eod' };

    // ── SMMA activation check ──────────────────────────────────────────────
    if (!smmaActive && ma !== null) {
      const afterPm1 = mode === 'smma7_1pm' ? (c.h > 13 || (c.h === 13 && c.m >= 0)) : true;
      if (afterPm1) {
        if (dir === 'CE' && c.close > ma) smmaActive = true;
        if (dir === 'PE' && c.close < ma) smmaActive = true;
      }
    }

    // ── SMMA trail exit ────────────────────────────────────────────────────
    if (smmaActive && ma !== null) {
      if (mode === 'smma7x2') {
        // need 2 consecutive closes on wrong side
        const wrongSide = dir === 'CE' ? c.close < ma : c.close > ma;
        if (wrongSide) {
          consecBelow++;
          if (consecBelow >= 2) return { pts: cur, slType: 'smma' };
        } else {
          consecBelow = 0;
        }
      } else {
        // single candle cross
        if (dir === 'CE' && c.close < ma) return { pts: cur, slType: 'smma' };
        if (dir === 'PE' && c.close > ma) return { pts: cur, slType: 'smma' };
      }
    }

    // ── Fixed SL (before smma active) ─────────────────────────────────────
    if (!smmaActive) {
      const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
      if (slHit) {
        const exitPts = dir === 'CE' ? sl - entry : entry - sl;
        return { pts: exitPts, slType: 'fixed', exitIdx: idx };
      }
    }
  }

  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod' };
}

// ── Simulate one day ──────────────────────────────────────────────────────────
function simDay(candles, mode) {
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

    if (mode === 'plain') {
      // ── Plain SL60+LockBE ────────────────────────────────────────────────
      let sl = t1Dir === 'CE' ? res.px - SL_PTS : res.px + SL_PTS;
      let peak = 0;
      for (let j = idx + 1; j < cs.length; j++) {
        const cc  = cs[j];
        const cur = t1Dir === 'CE' ? cc.close - res.px : res.px - cc.close;
        if (cur > peak) peak = cur;
        if (peak >= SL_PTS) {
          if (t1Dir === 'CE') sl = Math.max(sl, res.px);
          else                sl = Math.min(sl, res.px);
        }
        if (isEOD(cc)) { t1Pts = cur; break; }
        const slHit = t1Dir === 'CE' ? cc.close <= sl : cc.close >= sl;
        if (slHit) {
          t1Pts = t1Dir === 'CE' ? sl - res.px : res.px - sl;
          const reDir = t1Dir === 'CE' ? 'PE' : 'CE';
          const reEntry = cc.close;
          let reSL  = reDir === 'CE' ? reEntry - SL_PTS : reEntry + SL_PTS;
          let rePk  = 0;
          for (let k = j + 1; k < cs.length; k++) {
            const rc  = cs[k];
            const rc2 = reDir === 'CE' ? rc.close - reEntry : reEntry - rc.close;
            if (rc2 > rePk) rePk = rc2;
            if (rePk >= SL_PTS) {
              if (reDir === 'CE') reSL = Math.max(reSL, reEntry);
              else                reSL = Math.min(reSL, reEntry);
            }
            if (isEOD(rc)) { rePts = rc2; break; }
            if (reDir === 'CE' ? rc.close <= reSL : rc.close >= reSL) {
              rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL; break;
            }
          }
          break;
        }
      }
    } else {
      // ── SMMA variant ────────────────────────────────────────────────────
      const t1Res = simLeg(cs, idx, t1Dir, mode, isEOD);
      t1Pts = t1Res.pts;

      if (t1Res.slType === 'fixed') {
        const reDir    = t1Dir === 'CE' ? 'PE' : 'CE';
        const exitIdx  = t1Res.exitIdx;
        const reRes    = simLeg(cs, exitIdx, reDir, mode, isEOD);
        rePts = reRes.pts;
      }
    }

    break;
  }

  return { dayPts: t1Pts + rePts, t1Dir };
}

function runBacktest(allDates, byDay, mode) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date], mode);
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

  const closes = allCandles.map(c => c.close);
  const s7  = calcSMMA(closes, 7);
  const s14 = calcSMMA(closes, 14);
  const s21 = calcSMMA(closes, 21);
  for (let i = 0; i < allCandles.length; i++) {
    allCandles[i].smma7  = s7[i];
    allCandles[i].smma14 = s14[i];
    allCandles[i].smma21 = s21[i];
  }

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}\n`);

  const variants = [
    { mode: 'plain',      label: 'Plain SL60+LockBE (baseline C2)' },
    { mode: 'smma14',     label: 'SL60+LockBE + SMMA14 trail      ' },
    { mode: 'smma21',     label: 'SL60+LockBE + SMMA21 trail      ' },
    { mode: 'smma7x2',    label: 'SL60+LockBE + SMMA7 2-candle    ' },
    { mode: 'smma7_1pm',  label: 'SL60+LockBE + SMMA7 after 1pm   ' },
  ];

  const years = ['2021','2022','2023','2024','2025','2026'];
  const LINE  = '─'.repeat(110);

  console.log('AMINA C2 early — SMMA trail variants (33K candles Jan2021–May2026)');
  console.log(LINE);
  console.log('                                        Net ₹       Win%   MaxDD ₹   Avg/day   2021    2022    2023    2024    2025    2026');
  console.log(LINE);

  for (const v of variants) {
    const r = runBacktest(allDates, byDay, v.mode);
    const yrCols = years.map(yr => {
      const rs = Math.round((r.yearly[yr] || 0) * RS_PER_PT);
      return ((rs >= 0 ? '+' : '') + Math.round(rs/1000) + 'K').padStart(6);
    }).join('  ');
    const tag = r.netRs > 1650024 ? ' ✅ NEW BEST' : r.netRs > 1424023 ? ' ✅ beats baseline' : '';
    console.log(`  ${v.label}  ₹${String(r.netRs.toLocaleString('en-IN')).padStart(10)}  ${String(r.winPct+'%').padStart(5)}  ₹${String(r.maxDDRs.toLocaleString('en-IN')).padStart(8)}  ₹${String(r.avgDay).padStart(6)}   ${yrCols}${tag}`);
  }
  console.log(LINE);
})().catch(console.error);

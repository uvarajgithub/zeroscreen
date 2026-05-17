'use strict';
/**
 * amina_c2_smma7.js
 * AMINA C2 early entry + SL60+LockBE + SMMA7 trail (activate after SMMA7 cross)
 *
 * SMMA7 logic:
 *   - NOT active at entry
 *   - CE: once close > SMMA7 → activate. Then exit when close < SMMA7
 *   - PE: once close < SMMA7 → activate. Then exit when close > SMMA7
 *   - Before activation: normal SL60 + LockBE protects the trade
 *   - After activation: SMMA7 is the trailing SL (exit at c.close)
 *
 * Compare vs plain C2 + SL60+LockBE (no SMMA7)
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const SL_T1        = 60;
const SL_RE        = 60;
const SMMA_LEN     = 7;

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

// ── C2 early entry scan ───────────────────────────────────────────────────────
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

    // C2 breaks C1's level → early entry
    if (sig === 'CE' && cb.close > c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, px: cb.close, entryIdx: i + 1 };

    // fallback: C3+
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig, px: c.close, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig, px: c.close, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one leg (T1 or RE) with SL60+LockBE + SMMA7 trail ───────────────
// Returns { pts, exitClose } — exits at c.close always (either SL hit close or EOD close)
function simLeg(cs, startIdx, dir, slPts, isEOD) {
  const entry = cs[startIdx].close;
  let sl      = dir === 'CE' ? entry - slPts : entry + slPts;
  let peak    = 0;
  let smma7Active = false;

  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;

    // Update peak & LockBE (only before SMMA7 takes over)
    if (!smma7Active) {
      if (cur > peak) peak = cur;
      if (peak >= slPts) {
        // Lock SL at breakeven
        if (dir === 'CE') sl = Math.max(sl, entry);
        else              sl = Math.min(sl, entry);
      }
    }

    // Activate SMMA7 once price crosses MA in trade direction
    if (!smma7Active && c.smma !== null) {
      if (dir === 'CE' && c.close > c.smma) smma7Active = true;
      if (dir === 'PE' && c.close < c.smma) smma7Active = true;
    }

    // EOD — exit at close
    if (isEOD(c)) return { pts: cur, slType: 'eod' };

    // SMMA7 trail: exit when price crosses back through SMMA7
    if (smma7Active && c.smma !== null) {
      if (dir === 'CE' && c.close < c.smma) return { pts: cur, slType: 'smma7' };
      if (dir === 'PE' && c.close > c.smma) return { pts: cur, slType: 'smma7' };
    }

    // Fixed SL (before SMMA7 active)
    if (!smma7Active) {
      const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
      if (slHit) {
        const exitPts = dir === 'CE' ? sl - entry : entry - sl;
        return { pts: exitPts, slType: 'fixed', exitClose: c.close };
      }
    }
  }

  // Ran out of candles (shouldn't happen)
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod' };
}

// ── Simulate one day ──────────────────────────────────────────────────────────
function simDay(candles, useSmma7) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let t1Dir = null, t1Pts = 0, rePts = 0, reDir = null;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];
    if (isEOD(c)) break;

    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir = res.sig;

    if (!useSmma7) {
      // ── Plain SL60+LockBE ──────────────────────────────────────────────
      let sl    = t1Dir === 'CE' ? res.px - SL_T1 : res.px + SL_T1;
      let peak  = 0;
      let found = false;
      for (let j = idx + 1; j < cs.length; j++) {
        const cc  = cs[j];
        const cur = t1Dir === 'CE' ? cc.close - res.px : res.px - cc.close;
        if (cur > peak) peak = cur;
        if (peak >= SL_T1) {
          if (t1Dir === 'CE') sl = Math.max(sl, res.px);
          else                sl = Math.min(sl, res.px);
        }
        if (isEOD(cc)) { t1Pts = cur; found = true; break; }
        const slHit = t1Dir === 'CE' ? cc.close <= sl : cc.close >= sl;
        if (slHit) {
          t1Pts  = t1Dir === 'CE' ? sl - res.px : res.px - sl;
          reDir  = t1Dir === 'CE' ? 'PE' : 'CE';
          const reEntry = cc.close;
          let reSL = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
          let rePeak2 = 0;
          for (let k = j + 1; k < cs.length; k++) {
            const rc  = cs[k];
            const rcur = reDir === 'CE' ? rc.close - reEntry : reEntry - rc.close;
            if (rcur > rePeak2) rePeak2 = rcur;
            if (rePeak2 >= SL_RE) {
              if (reDir === 'CE') reSL = Math.max(reSL, reEntry);
              else                reSL = Math.min(reSL, reEntry);
            }
            if (isEOD(rc)) { rePts = rcur; break; }
            const rSlHit = reDir === 'CE' ? rc.close <= reSL : rc.close >= reSL;
            if (rSlHit) { rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL; break; }
          }
          found = true; break;
        }
      }
      if (!found) {
        const last = cs[cs.length - 1];
        t1Pts = t1Dir === 'CE' ? last.close - res.px : res.px - last.close;
      }
    } else {
      // ── SL60+LockBE + SMMA7 trail ─────────────────────────────────────
      const t1Res = simLeg(cs, idx, t1Dir, SL_T1, isEOD);
      t1Pts = t1Res.pts;

      if (t1Res.slType === 'fixed') {
        // Fixed SL hit → RE in opposite direction from t1Res.exitClose
        reDir = t1Dir === 'CE' ? 'PE' : 'CE';
        // find RE start candle index
        let reStartIdx = idx + 1;
        for (let j = idx + 1; j < cs.length; j++) {
          if (cs[j].close === t1Res.exitClose || j === cs.length - 1) { reStartIdx = j; break; }
        }
        const reRes = simLeg(cs, reStartIdx, reDir, SL_RE, isEOD);
        rePts = reRes.pts;
      }
    }

    break; // one trade sequence per day
  }

  return { dayPts: t1Pts + rePts, t1Dir };
}

function runBacktest(allDates, byDay, useSmma7) {
  let totalPts = 0, wins = 0, losses = 0, flat = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const { dayPts, t1Dir } = simDay(byDay[date], useSmma7);
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

  // Compute SMMA7 continuously across all candles
  const closes  = allCandles.map(c => c.close);
  const smmaAll = calcSMMA(closes);
  for (let i = 0; i < allCandles.length; i++) allCandles[i].smma = smmaAll[i];

  const byDay    = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}\n`);

  const rPlain = runBacktest(allDates, byDay, false);
  const rSmma7 = runBacktest(allDates, byDay, true);

  const years = ['2021','2022','2023','2024','2025','2026'];
  const LINE  = '─'.repeat(105);

  console.log('AMINA C2 early — plain SL60+LockBE  vs  SL60+LockBE + SMMA7 trail');
  console.log('SMMA7 trail: activates after price crosses SMMA7, then exits on reverse cross');
  console.log(LINE);
  console.log('                              Net ₹       Win%   MaxDD ₹   Avg/day   2021    2022    2023    2024    2025    2026');
  console.log(LINE);

  for (const [label, r] of [
    ['C2 + SL60+LockBE          ', rPlain],
    ['C2 + SL60+LockBE + SMMA7  ', rSmma7],
  ]) {
    const yrCols = years.map(yr => {
      const rs = Math.round((r.yearly[yr] || 0) * RS_PER_PT);
      return ((rs >= 0 ? '+' : '') + Math.round(rs/1000) + 'K').padStart(6);
    }).join('  ');
    console.log(`  ${label}  ₹${String(r.netRs.toLocaleString('en-IN')).padStart(10)}  ${String(r.winPct+'%').padStart(5)}  ₹${String(r.maxDDRs.toLocaleString('en-IN')).padStart(8)}  ₹${String(r.avgDay).padStart(6)}   ${yrCols}`);
  }

  console.log(LINE);
  const diff = rSmma7.netRs - rPlain.netRs;
  console.log(`SMMA7 trail vs plain: ${diff >= 0 ? '+' : ''}₹${diff.toLocaleString('en-IN')}  → ${diff > 0 ? 'SMMA7 TRAIL WINS' : 'PLAIN SL60 WINS'}`);
  console.log(`AMINA SL60 baseline = ₹14,24,023`);
  console.log(LINE);
})().catch(console.error);

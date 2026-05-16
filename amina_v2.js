'use strict';
/**
 * amina_v2.js — Testing 3 new ideas to reduce choppy-day damage
 *
 * Idea 1: NO re-entry at all — T1 only, hold to EOD
 * Idea 2: Skip RE if T1 SL hit within first N candles (fast SL = bad entry)
 * Idea 3: T1 with profit target (exit T1 early if up X pts), no RE needed
 *
 * All compared against:
 *   Baseline: SL50+RE100 NoTrail (current AMINA)
 *   Sweet spot: SL50+RE60 LockBE
 */
require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } });
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
      date:  `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
      h: ist.getHours(), m: ist.getMinutes(),
      open: c[1], high: c[2], low: c[3], close: c[4]
    };
  });
}

async function fetchAll(start, end) {
  const all = [], endD = new Date(end); let cur = new Date(start);
  process.stdout.write(`Fetching 15-min BNF ${start}→${end} `);
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

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date] = []; m[c.date].push(c); }
  return m;
}

function enrich(c) {
  const bull = c.close >= c.open;
  return { ...c, bull, body_high: Math.max(c.open, c.close), body_low: Math.min(c.open, c.close), body_size: Math.abs(c.close - c.open) };
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = 0, rule = '';
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule = 'A';
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
      rule = 'B';
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, bl, rule, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, bl, rule, entryIdx: j };
    }
  }
  return null;
}

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

/**
 * mode:
 *  'baseline'   — SL50+RE100, no trail  (current AMINA)
 *  'sweetspot'  — SL50+RE60, lock-BE trail
 *  'no-re'      — T1 only, no re-entry, hold to EOD
 *  'fast-sl'    — skip RE if T1 SL hit within FAST_CANDLES candles of entry
 *  'target'     — T1 exits at +TARGET pts profit (no RE after target hit), SL still in place
 *  'target+re'  — T1 exits at +TARGET pts, RE still taken if SL hit (not target hit)
 */
function simDay(candles, mode, opts = {}) {
  const cs = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  const SL_T1  = opts.SL_T1  ?? 50;
  const SL_RE  = opts.SL_RE  ?? 100;
  const TARGET = opts.TARGET ?? 0;
  const FAST   = opts.FAST   ?? 2;   // candles threshold for "fast SL"
  const LOCK   = opts.LOCK   ?? false;

  let phase = 'SCANNING';
  let t1Dir = null, t1Entry = 0, t1Pts = 0, t1SL = 0, t1Peak = 0, t1EntryIdx = 0;
  let reDir = null, reEntry = 0, rePts = 0, reSL = 0, rePeak = 0;
  let t1ExitedByTarget = false;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice);
      if (!res || res.entryIdx !== slice.length - 1) continue;

      t1Dir      = res.sig;
      t1Entry    = res.px;
      t1SL       = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
      t1Peak     = 0;
      t1EntryIdx = idx;
      phase      = 'IN_T1';
      continue;
    }

    if (phase === 'IN_T1') {
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;

      if (cur > t1Peak) t1Peak = cur;
      if (LOCK && t1Peak >= SL_T1) {
        if (t1Dir === 'CE') t1SL = Math.max(t1SL, t1Entry);
        else                 t1SL = Math.min(t1SL, t1Entry);
      }

      // TARGET exit
      if (TARGET > 0 && cur >= TARGET) {
        t1Pts = TARGET;
        t1ExitedByTarget = true;
        phase = 'DONE';
        break;
      }

      if (isEOD(c)) {
        t1Pts = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
        phase = 'DONE'; break;
      }

      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts = t1Dir === 'CE' ? t1SL - t1Entry : t1Entry - t1SL;

        // Decide whether to take re-entry
        const candlesSinceEntry = idx - t1EntryIdx;
        let takeRE = false;

        if (mode === 'baseline')   takeRE = true;
        if (mode === 'sweetspot')  takeRE = true;
        if (mode === 'no-re')      takeRE = false;
        if (mode === 'fast-sl')    takeRE = candlesSinceEntry > FAST; // skip RE if SL hit fast
        if (mode === 'target')     takeRE = false;
        if (mode === 'target+re')  takeRE = true;

        if (!takeRE) { phase = 'DONE'; break; }

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
      if (LOCK && rePeak >= SL_RE) {
        if (reDir === 'CE') reSL = Math.max(reSL, reEntry);
        else                 reSL = Math.min(reSL, reEntry);
      }

      if (isEOD(c)) {
        rePts = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
        phase = 'DONE'; break;
      }

      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) {
        rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL;
        phase = 'DONE'; break;
      }
    }
  }

  return { dayPts: t1Pts + rePts, t1Pts, rePts, t1Dir, reDir };
}

function runVariant(allDates, byDay, mode, opts) {
  let totalPts = 0, winDays = 0, lossDays = 0, flatDays = 0;
  let grossWinPts = 0, grossLossPts = 0, worstDay = 0;
  let equity = 0, peak = 0, maxDD = 0;

  const cats = ['trend-bull', 'trend-bear', 'reversal-bull', 'reversal-bear', 'choppy'];
  const bycat = {};
  for (const c of cats) bycat[c] = { pts: 0, win: 0, loss: 0, count: 0 };

  const yearly = {};

  for (const date of allDates) {
    const year = date.slice(0, 4);
    if (!yearly[year]) yearly[year] = 0;

    const candles = byDay[date];
    const { dayPts, t1Dir } = simDay(candles, mode, opts);

    if (!t1Dir) { flatDays++; continue; }

    const cat = classifyDay(candles);
    bycat[cat].pts   += dayPts;
    bycat[cat].count++;
    if (dayPts > 0)      bycat[cat].win++;
    else if (dayPts < 0) bycat[cat].loss++;

    totalPts    += dayPts;
    yearly[year]+= dayPts;

    if (dayPts > 0)      { winDays++;  grossWinPts  += dayPts; }
    else if (dayPts < 0) { lossDays++; grossLossPts += dayPts; if (dayPts < worstDay) worstDay = dayPts; }
    else                   flatDays++;

    equity += dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }

  const tradeDays = winDays + lossDays;
  return {
    totalRs:     Math.round(totalPts * RS_PER_PT),
    grossWinRs:  Math.round(grossWinPts * RS_PER_PT),
    grossLossRs: Math.round(grossLossPts * RS_PER_PT),
    worstDayRs:  Math.round(worstDay * RS_PER_PT),
    winPct:      tradeDays > 0 ? ((winDays / tradeDays) * 100).toFixed(1) : '0',
    winDays, lossDays, flatDays,
    maxDDRs:     Math.round(maxDD * RS_PER_PT),
    bycat, yearly
  };
}

async function main() {
  const allCandles = await fetchAll('2021-01-01', '2026-05-16');
  const byDay      = groupByDay(allCandles);
  const allDates   = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 2026)\n`);

  const variants = [
    // Reference
    { mode: 'baseline',  opts: { SL_T1:50, SL_RE:100, LOCK:false }, label: 'Baseline  SL50+RE100 NoTrail [CURRENT]   ' },
    { mode: 'sweetspot', opts: { SL_T1:50, SL_RE: 60, LOCK:true  }, label: 'SweetSpot SL50+RE60  LockBE              ' },
    // Idea 1: No re-entry
    { mode: 'no-re',     opts: { SL_T1:50,             LOCK:false }, label: 'NoRE      SL50        NoTrail             ' },
    { mode: 'no-re',     opts: { SL_T1:50,             LOCK:true  }, label: 'NoRE      SL50        LockBE              ' },
    { mode: 'no-re',     opts: { SL_T1:75,             LOCK:true  }, label: 'NoRE      SL75        LockBE              ' },
    { mode: 'no-re',     opts: { SL_T1:100,            LOCK:true  }, label: 'NoRE      SL100       LockBE              ' },
    // Idea 2: Skip RE if T1 SL hit fast (within N candles)
    { mode: 'fast-sl',   opts: { SL_T1:50, SL_RE:100, FAST:1, LOCK:false }, label: 'FastSL-1  SL50+RE100 skip-if-1c          ' },
    { mode: 'fast-sl',   opts: { SL_T1:50, SL_RE:100, FAST:2, LOCK:false }, label: 'FastSL-2  SL50+RE100 skip-if-2c          ' },
    { mode: 'fast-sl',   opts: { SL_T1:50, SL_RE:100, FAST:3, LOCK:false }, label: 'FastSL-3  SL50+RE100 skip-if-3c          ' },
    { mode: 'fast-sl',   opts: { SL_T1:50, SL_RE: 60, FAST:2, LOCK:true  }, label: 'FastSL-2  SL50+RE60  LockBE skip-if-2c   ' },
    { mode: 'fast-sl',   opts: { SL_T1:50, SL_RE: 60, FAST:3, LOCK:true  }, label: 'FastSL-3  SL50+RE60  LockBE skip-if-3c   ' },
    // Idea 3: T1 profit target, no RE (lock in T1 gains)
    { mode: 'target',    opts: { SL_T1:50, TARGET: 50             }, label: 'Target50  SL50 T+50  NoRE                ' },
    { mode: 'target',    opts: { SL_T1:50, TARGET: 75             }, label: 'Target75  SL50 T+75  NoRE                ' },
    { mode: 'target',    opts: { SL_T1:50, TARGET:100             }, label: 'Target100 SL50 T+100 NoRE                ' },
    { mode: 'target',    opts: { SL_T1:50, TARGET:150             }, label: 'Target150 SL50 T+150 NoRE                ' },
    // Idea 3b: T1 profit target + still take RE on SL hit
    { mode: 'target+re', opts: { SL_T1:50, SL_RE:60, TARGET: 75, LOCK:true }, label: 'T+RE  T+75 SL50+RE60 LockBE             ' },
    { mode: 'target+re', opts: { SL_T1:50, SL_RE:60, TARGET:100, LOCK:true }, label: 'T+RE  T+100 SL50+RE60 LockBE            ' },
  ];

  const SEP = '─'.repeat(130);
  console.log('Variant                                      NetRs    GrossWins   GrossLoss  WorstDay  WinPct  WinDays  LossDays  MaxDD');
  console.log(SEP);

  const results = [];
  for (const v of variants) {
    const r = runVariant(allDates, byDay, v.mode, v.opts);
    results.push({ ...v, r });
    console.log([
      v.label,
      String(r.totalRs).padStart(9),
      String(r.grossWinRs).padStart(11),
      String(r.grossLossRs).padStart(11),
      String(r.worstDayRs).padStart(10),
      (r.winPct + '%').padStart(7),
      String(r.winDays).padStart(8),
      String(r.lossDays).padStart(9),
      String(r.maxDDRs).padStart(7)
    ].join('  '));
  }

  // Market type breakdown for top 5 by NetRs
  const top5 = [...results].sort((a,b) => b.r.totalRs - a.r.totalRs).slice(0, 5);
  console.log('\n\n══ MARKET TYPE BREAKDOWN — TOP 5 VARIANTS ══════════════════════════════════════════════════');
  console.log(`${'Category'.padEnd(13)}  ${'Days'.padStart(4)}  ${top5.map(v => v.label.trim().slice(0,18).padStart(18)).join('  ')}`);
  console.log('─'.repeat(130));

  const catKeys = ['trend-bull','trend-bear','reversal-bull','reversal-bear','choppy'];
  const catLabels = { 'trend-bull':'Trend UP','trend-bear':'Trend DOWN','reversal-bull':'Rev BULL','reversal-bear':'Rev BEAR','choppy':'Choppy' };
  for (const cat of catKeys) {
    const dayCnt = top5[0].r.bycat[cat].count;
    const cols = top5.map(v => {
      const bc = v.r.bycat[cat];
      return String(Math.round(bc.pts * RS_PER_PT)).padStart(18);
    });
    console.log(`${catLabels[cat].padEnd(13)}  ${String(dayCnt).padStart(4)}  ${cols.join('  ')}`);
  }

  const best = results.sort((a,b) => b.r.totalRs - a.r.totalRs)[0];
  console.log(`\n══ WINNER: ${best.label.trim()}  →  ₹${best.r.totalRs.toLocaleString()}  MaxDD ₹${best.r.maxDDRs.toLocaleString()}  Win ${best.r.winPct}%`);

  console.log('\n  Yearly breakdown:');
  for (const [yr, pts] of Object.entries(best.r.yearly).sort()) {
    console.log(`    ${yr}: ₹${Math.round(pts * RS_PER_PT).toLocaleString()}`);
  }
}

main().catch(console.error);

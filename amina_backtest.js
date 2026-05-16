'use strict';
/**
 * amina_backtest.js — Exact replica of amina-live.ts logic for backtesting
 *
 * Replicates precisely:
 *   - rollingEntryScan: Rule A (same-color pair) + Rule B (C2 body > C1 body)
 *   - Entry on latest candle only (entryIdx === candles.length - 1)
 *   - SL check on each candle CLOSE (not wick — same as live)
 *   - Re-entry: unconditional opposite direction (no mar<0 filter)
 *   - EOD exit at 3:15 PM candle
 *   - No trailing stop (hold to EOD)
 *
 * Tests all SL_T1 × SL_RE combinations + optional trail variant
 */
require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT = 15; // 30 qty × 0.5 delta × ₹1/pt

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

// Enrich candle — exact same as amina-live.ts
function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// Rolling C1+C2 scan — exact replica of amina-live.ts rollingEntryScan()
// Returns first valid signal where entry is on candle at index entryIdx
function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = 0, rule = '';

    if (ca.bull === cb.bull) {
      // Rule A — same color pair
      sig  = ca.bull ? 'CE' : 'PE';
      bl   = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule = 'A';
    } else if (cb.body_size > ca.body_size) {
      // Rule B — opposite color, C2 body > C1 body
      sig  = cb.bull ? 'CE' : 'PE';
      bl   = sig === 'CE'
        ? Math.max(ca.body_high, cb.body_high)
        : Math.min(ca.body_low,  cb.body_low);
      rule = 'B';
    } else {
      continue;
    }

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, bl, rule, pairIdx: i, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, bl, rule, pairIdx: i, entryIdx: j };
    }
  }
  return null;
}

// Classify a day's candles into market type
// Trending  : range > 350 pts AND close in top/bottom 30% of range (directional)
// Reversal  : open in top/bottom 30% of range AND close in opposite 30% (intraday flip)
// Choppy    : everything else (whipsaw, small range)
function classifyDay(candles) {
  const dayHigh  = Math.max(...candles.map(c => c.high));
  const dayLow   = Math.min(...candles.map(c => c.low));
  const range    = dayHigh - dayLow;
  const first    = candles.find(c => c.h === 9 && c.m === 15);
  const last     = candles[candles.length - 1];
  if (!first || !last || range === 0) return 'choppy';

  const open  = first.open;
  const close = last.close;
  const pos   = (v) => (v - dayLow) / range; // 0=bottom, 1=top

  const openPos  = pos(open);
  const closePos = pos(close);

  // Trending: big range + close pushed to extremes
  if (range > 350) {
    if (closePos >= 0.65) return 'trend-bull';
    if (closePos <= 0.35) return 'trend-bear';
  }

  // Reversal: opened at extreme, closed at opposite extreme
  if (range > 250) {
    if (openPos >= 0.65 && closePos <= 0.35) return 'reversal-bear'; // opened high, closed low
    if (openPos <= 0.35 && closePos >= 0.65) return 'reversal-bull'; // opened low, closed high
  }

  return 'choppy';
}


// trailMode: 'none' (current AMINA) | 'lock' (lock breakeven at peak >= SL_T1)
function simDay(candles, SL_T1, SL_RE, trailMode) {
  const cs = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase   = 'SCANNING';
  let t1Dir   = null, t1Entry = 0, t1Pts = 0;
  let reDir   = null, reEntry = 0, rePts = 0;
  let t1SL    = 0, reSL = 0;
  let t1Peak  = 0, rePeak = 0;
  let trades  = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      // rollingEntryScan on candles up to and including current
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice);
      if (!res) continue;
      // Entry must be on THIS candle (latest)
      if (res.entryIdx !== slice.length - 1) continue;

      t1Dir   = res.sig;
      t1Entry = res.px;
      t1SL    = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
      t1Peak  = 0;
      phase   = 'IN_T1';
      trades++;
      continue;
    }

    if (phase === 'IN_T1') {
      // SL check on candle CLOSE (same as live)
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;

      // Update peak and optional trail
      if (cur > t1Peak) t1Peak = cur;
      if (trailMode === 'lock' && t1Peak >= SL_T1) {
        // Lock SL at breakeven once peak >= SL_T1
        if (t1Dir === 'CE') t1SL = Math.max(t1SL, t1Entry);
        else                 t1SL = Math.min(t1SL, t1Entry);
      }

      if (isEOD(c)) {
        t1Pts = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
        phase = 'DONE';
        break;
      }

      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts = t1Dir === 'CE' ? t1SL - t1Entry : t1Entry - t1SL;
        // Unconditional re-entry — opposite direction
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        reSL    = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
        rePeak  = 0;
        phase   = 'IN_RE';
        trades++;
        continue;
      }
    }

    if (phase === 'IN_RE') {
      const cur = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      rePts = cur;

      if (cur > rePeak) rePeak = cur;
      if (trailMode === 'lock' && rePeak >= SL_RE) {
        if (reDir === 'CE') reSL = Math.max(reSL, reEntry);
        else                 reSL = Math.min(reSL, reEntry);
      }

      if (isEOD(c)) {
        rePts = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
        phase = 'DONE';
        break;
      }

      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) {
        rePts = reDir === 'CE' ? reSL - reEntry : reEntry - reSL;
        phase = 'DONE';
        break;
      }
    }
  }

  const dayPts = t1Pts + rePts;
  return { dayPts, t1Pts, rePts, t1Dir, reDir, trades };
}

function runVariant(allDates, byDay, SL_T1, SL_RE, trailMode) {
  let totalPts = 0, winDays = 0, lossDays = 0, flatDays = 0;
  let grossWinPts = 0, grossLossPts = 0;
  let equity = 0, peak = 0, maxDD = 0;
  let totalTrades = 0;
  let worstDay = 0;

  const cats = ['trend-bull', 'trend-bear', 'reversal-bull', 'reversal-bear', 'choppy'];
  const bycat = {};
  for (const c of cats) bycat[c] = { pts: 0, win: 0, loss: 0, count: 0 };

  const yearly = {};

  for (const date of allDates) {
    const year = date.slice(0, 4);
    if (!yearly[year]) yearly[year] = 0;

    const candles = byDay[date];
    const { dayPts, trades, t1Dir } = simDay(candles, SL_T1, SL_RE, trailMode);

    if (!t1Dir) { flatDays++; continue; }

    const cat = classifyDay(candles);
    bycat[cat].pts   += dayPts;
    bycat[cat].count++;
    if (dayPts > 0)       bycat[cat].win++;
    else if (dayPts < 0)  bycat[cat].loss++;

    totalPts    += dayPts;
    totalTrades += trades;
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
    totalRs:      Math.round(totalPts * RS_PER_PT),
    grossWinRs:   Math.round(grossWinPts * RS_PER_PT),
    grossLossRs:  Math.round(grossLossPts * RS_PER_PT),
    worstDayRs:   Math.round(worstDay * RS_PER_PT),
    winPct:       tradeDays > 0 ? ((winDays / tradeDays) * 100).toFixed(1) : '0',
    winDays, lossDays, flatDays,
    totalTrades,
    maxDDRs:      Math.round(maxDD * RS_PER_PT),
    avgPtDay:     (totalPts / allDates.length).toFixed(1),
    bycat, yearly
  };
}

async function main() {
  const allCandles = await fetchAll('2021-01-01', '2026-05-16');
  const byDay      = groupByDay(allCandles);
  const allDates   = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 2026)\n`);

  const variants = [
    { SL_T1: 50, SL_RE: 100, trail: 'none', label: 'SL50+RE100  NoTrail  [CURRENT AMINA]' },
    { SL_T1: 50, SL_RE:  60, trail: 'lock', label: 'SL50+RE60   LockBE   [SWEET SPOT]   ' },
    { SL_T1: 25, SL_RE:  25, trail: 'lock', label: 'SL25+RE25   LockBE   [BEST P&L]     ' },
  ];

  console.log('Variant                                  NetRs       GrossWins    GrossLoss   WorstDay   WinPct  WinDays  LossDays  MaxDD');
  console.log('─'.repeat(125));

  let bestRs = -Infinity, bestV = null, bestR = null;
  const results = [];
  for (const v of variants) {
    const r = runVariant(allDates, byDay, v.SL_T1, v.SL_RE, v.trail);
    results.push(r);
    console.log([
      v.label,
      String(r.totalRs).padStart(9),
      String(r.grossWinRs).padStart(12),
      String(r.grossLossRs).padStart(12),
      String(r.worstDayRs).padStart(10),
      (r.winPct + '%').padStart(8),
      String(r.winDays).padStart(8),
      String(r.lossDays).padStart(9),
      String(r.maxDDRs).padStart(8)
    ].join('  '));
    if (r.totalRs > bestRs) { bestRs = r.totalRs; bestV = v; bestR = r; }
  }

  // Per-category breakdown for all 3 variants
  const catLabels = {
    'trend-bull':    'Trend UP   ',
    'trend-bear':    'Trend DOWN ',
    'reversal-bull': 'Rev BULL   ',
    'reversal-bear': 'Rev BEAR   ',
    'choppy':        'Choppy     ',
  };

  console.log('\n══ MARKET TYPE BREAKDOWN (P&L per category) ════════════════════════════════════════════════════════════');
  console.log(`${'Category'.padEnd(14)}  ${'Days'.padStart(5)}  ${'CURRENT AMINA'.padStart(15)}  ${'SWEET SPOT'.padStart(15)}  ${'BEST P&L'.padStart(15)}  ${'Win% curr'.padStart(10)}  ${'Win% sweet'.padStart(11)}  ${'Win% best'.padStart(10)}`);
  console.log('─'.repeat(110));

  const allResults = results;
  const catKeys = ['trend-bull','trend-bear','reversal-bull','reversal-bear','choppy'];
  for (const cat of catKeys) {
    const cols = allResults.map(r => {
      const bc = r.bycat[cat];
      const rs = Math.round(bc.pts * RS_PER_PT);
      const wp = bc.count > 0 ? ((bc.win / bc.count) * 100).toFixed(0) + '%' : '-';
      return { rs, wp, count: bc.count };
    });
    console.log([
      catLabels[cat],
      String(cols[0].count).padStart(5),
      String(cols[0].rs).padStart(15),
      String(cols[1].rs).padStart(15),
      String(cols[2].rs).padStart(15),
      cols[0].wp.padStart(10),
      cols[1].wp.padStart(11),
      cols[2].wp.padStart(10),
    ].join('  '));
  }
}

main().catch(console.error);

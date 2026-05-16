'use strict';
/**
 * vmt_v2.js — Corrected VMT Telegram strategy backtest
 *
 * RULES (corrected):
 *   - Entry: BNF 1-min close breaks open+BUFFER (CE) or open-BUFFER (PE)
 *   - Entry window: 9:15 AM – 3:14 PM (all day, maximum re-entries)
 *   - SL: 10 BNF pts (~5 option pts at delta 0.5) — FIXED as per VMT guy
 *   - Target: NONE — trailing stop, let winner run to 800+ BNF if it wants
 *   - Exit: 3:30 PM EOD (last candle close)
 *   - After SL hit: immediately re-enter on next breakout (same or opposite side)
 *
 * Three trail variants tested:
 *   A) tight       — SL always trails 10 pts below peak from candle 1
 *   B) cost-trail  — SL stays at entry-10 until peak profit >= SL, then trails peak-10
 *   C) hold        — No trail, fixed SL, exit at EOD close only
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
  const r = await kiteGet(`/instruments/historical/260105/minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`).catch(() => null);
  if (!r || !r.data || !r.data.candles) return [];
  return r.data.candles.map(c => {
    const ist = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return {
      date: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
      h: ist.getHours(), m: ist.getMinutes(),
      open: c[1], high: c[2], low: c[3], close: c[4]
    };
  });
}

async function fetchAll(start, end) {
  const all = [], endD = new Date(end); let cur = new Date(start);
  process.stdout.write(`Fetching 1-min BNF ${start}→${end} `);
  while (cur <= endD) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 54);
    if (ce > endD) ce.setTime(endD.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 55);
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date] = []; m[c.date].push(c); }
  return m;
}

// trailMode: 'tight' | 'cost-trail' | 'hold'
function simDay(candles, BUFFER, SL_PTS, trailMode) {
  const first = candles.find(c => c.h === 9 && c.m === 15);
  if (!first) return { pts: 0, trades: 0, wins: 0 };

  const BNF_OPEN   = first.open;
  const CE_TRIGGER = BNF_OPEN + BUFFER;
  const PE_TRIGGER = BNF_OPEN - BUFFER;

  let totalPts = 0, trades = 0, wins = 0;
  let inTrade = false, dir = null, entry = 0, sl = 0, peakPrice = 0;

  for (const c of candles) {
    const minOfDay = c.h * 60 + c.m;
    if (minOfDay < 9*60+15) continue;
    const isEOD = minOfDay >= 15*60+29;

    if (inTrade) {
      // EOD exit at market close
      if (isEOD) {
        const pts = dir === 'CE' ? c.close - entry : entry - c.close;
        totalPts += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        continue;
      }

      // Check SL
      const slHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
      if (slHit) {
        const pts = dir === 'CE' ? sl - entry : entry - sl;
        totalPts += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        continue; // re-entry from NEXT candle
      }

      // Update trail SL
      if (trailMode === 'tight') {
        if (dir === 'CE') {
          if (c.high > peakPrice) { peakPrice = c.high; sl = Math.max(sl, peakPrice - SL_PTS); }
        } else {
          if (c.low < peakPrice) { peakPrice = c.low; sl = Math.min(sl, peakPrice + SL_PTS); }
        }
      } else if (trailMode === 'cost-trail') {
        if (dir === 'CE') {
          if (c.high > peakPrice) peakPrice = c.high;
          if (peakPrice - entry >= SL_PTS)  // once up 1× SL, trail peak-SL
            sl = Math.max(sl, peakPrice - SL_PTS);
        } else {
          if (c.low < peakPrice) peakPrice = c.low;
          if (entry - peakPrice >= SL_PTS)
            sl = Math.min(sl, peakPrice + SL_PTS);
        }
      }
      // 'hold': no trail — SL stays fixed at entry ± SL_PTS
      continue;
    }

    // Not in trade — look for entry all day until 3:14 PM
    if (!isEOD && minOfDay <= 15*60+14) {
      if (c.close >= CE_TRIGGER) {
        dir = 'CE'; entry = c.close;
        sl = entry - SL_PTS; peakPrice = c.high;
        inTrade = true;
      } else if (c.close <= PE_TRIGGER) {
        dir = 'PE'; entry = c.close;
        sl = entry + SL_PTS; peakPrice = c.low;
        inTrade = true;
      }
    }
  }

  return { pts: totalPts, trades, wins };
}

function runVariant(allDates, byDay, BUFFER, SL_PTS, trailMode) {
  let totalPts = 0, totalTrades = 0, totalWins = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const year = date.slice(0, 4);
    if (!yearly[year]) yearly[year] = 0;
    const { pts, trades, wins } = simDay(byDay[date], BUFFER, SL_PTS, trailMode);
    totalPts    += pts;
    totalTrades += trades;
    totalWins   += wins;
    yearly[year]+= pts;
    equity += pts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }

  return {
    totalPts:    Math.round(totalPts),
    totalRs:     Math.round(totalPts * RS_PER_PT),
    winPct:      totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0',
    totalTrades, totalWins,
    maxDDRs:     Math.round(maxDD * RS_PER_PT),
    yearly
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const allCandles = await fetchAll('2021-01-01', '2026-05-16');
  const byDay      = groupByDay(allCandles);
  const allDates   = Object.keys(byDay).sort().filter(d => byDay[d].length >= 50);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 2026)\n`);

  const variants = [
    { BUFFER: 10, SL: 10, trail: 'hold',       label: 'B10  SL10  Hold       ' },
    { BUFFER: 10, SL: 10, trail: 'tight',      label: 'B10  SL10  Tight      ' },
    { BUFFER: 10, SL: 10, trail: 'cost-trail', label: 'B10  SL10  Cost→Trail ' },
    { BUFFER: 15, SL: 10, trail: 'hold',       label: 'B15  SL10  Hold       ' },
    { BUFFER: 15, SL: 10, trail: 'tight',      label: 'B15  SL10  Tight      ' },
    { BUFFER: 15, SL: 10, trail: 'cost-trail', label: 'B15  SL10  Cost→Trail ' },
    { BUFFER: 20, SL: 10, trail: 'hold',       label: 'B20  SL10  Hold       ' },
    { BUFFER: 20, SL: 10, trail: 'tight',      label: 'B20  SL10  Tight      ' },
    { BUFFER: 20, SL: 10, trail: 'cost-trail', label: 'B20  SL10  Cost→Trail ' },
    { BUFFER: 10, SL: 15, trail: 'tight',      label: 'B10  SL15  Tight      ' },
    { BUFFER: 10, SL: 20, trail: 'tight',      label: 'B10  SL20  Tight      ' },
    { BUFFER: 10, SL: 20, trail: 'cost-trail', label: 'B10  SL20  Cost→Trail ' },
  ];

  console.log('Variant               Trail         TotalRs         WinPct  Trades   MaxDD');
  console.log('─'.repeat(90));

  let bestRs = -Infinity, bestV = null, bestR = null;
  for (const v of variants) {
    const r = runVariant(allDates, byDay, v.BUFFER, v.SL, v.trail);
    console.log([
      v.label,
      v.trail.padEnd(12),
      String(r.totalRs).padStart(14),
      (r.winPct + '%').padStart(8),
      String(r.totalTrades).padStart(7),
      String(r.maxDDRs).padStart(9)
    ].join('  '));
    if (r.totalRs > bestRs) { bestRs = r.totalRs; bestV = v; bestR = r; }
  }

  if (bestR) {
    console.log('\n══ BEST VARIANT ════════════════════════════════════════════════════════');
    console.log(`  ${bestV.label.trim()}  Buffer=${bestV.BUFFER}  SL=${bestV.SL}  Trail=${bestV.trail}`);
    console.log(`  Total P&L  : ₹${bestR.totalRs.toLocaleString()}`);
    console.log(`  Win Rate   : ${bestR.winPct}%  (${bestR.totalWins}/${bestR.totalTrades} trades)`);
    console.log(`  Max DD     : ₹${bestR.maxDDRs.toLocaleString()}`);
    console.log('\n  Yearly breakdown:');
    for (const [yr, pts] of Object.entries(bestR.yearly).sort()) {
      console.log(`    ${yr}: ₹${Math.round(pts * RS_PER_PT).toLocaleString()}`);
    }
  }

  console.log('\n══ REFERENCE ════════════════════════════════════════════════════════════');
  console.log('  AMINA C1C2 (SL50+Re100, unconditional): ~₹10,76,428  MaxDD ~₹25,485');
  console.log('  VMT   C1C2 (SL25+Re25,  mar<0 filter) :  ₹10,88,805  MaxDD ~₹10,425\n');
}

main().catch(console.error);

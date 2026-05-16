'use strict';
/**
 * vmt_v3.js — VMT strategy with rolling N-candle breakout entry
 *
 * RULES:
 *   - Entry: BNF close breaks highest-high (CE) or lowest-low (PE)
 *             of the last N 1-min candles (rolling window)
 *   - This prevents re-entering at the same exhausted level
 *   - SL: 10 BNF pts (~5 option pts at delta 0.5)
 *   - Trail: cost-trail — hold SL at entry-10 until up 10pts, then trail peak-10
 *   - Re-entry: after SL hit, window resets, looks for next breakout
 *   - Exit: 3:30 PM EOD
 *   - Brokerage: ₹60 per round-trip (₹20 buy + ₹20 sell + taxes ~₹20)
 */
require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT   = 15;   // 30 qty × 0.5 delta × ₹1/pt
const BROK_RS     = 60;   // ₹ per round-trip (buy+sell+taxes)
const BROK_PT     = BROK_RS / RS_PER_PT; // BNF pts equivalent per trade

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

function simDay(candles, N, SL_PTS) {
  // Only use market hours candles
  const mkt = candles.filter(c => {
    const min = c.h * 60 + c.m;
    return min >= 9*60+15 && min <= 15*60+30;
  });
  if (mkt.length < N + 1) return { pts: 0, netPts: 0, trades: 0, wins: 0 };

  let totalPts = 0, trades = 0, wins = 0;
  let inTrade = false, dir = null, entry = 0, sl = 0, peakPrice = 0;
  // Rolling window index — tracks which candles form the breakout reference
  let windowStart = 0; // index into mkt[] where current window begins

  for (let i = 0; i < mkt.length; i++) {
    const c = mkt[i];
    const minOfDay = c.h * 60 + c.m;
    const isEOD = minOfDay >= 15*60+29;

    if (inTrade) {
      if (isEOD) {
        const pts = dir === 'CE' ? c.close - entry : entry - c.close;
        totalPts += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        break;
      }

      // SL check
      const slHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
      if (slHit) {
        const pts = dir === 'CE' ? sl - entry : entry - sl;
        totalPts += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        windowStart = i + 1; // reset window from next candle
        continue;
      }

      // Cost→Trail: once up SL_PTS, trail peak − SL_PTS
      if (dir === 'CE') {
        if (c.high > peakPrice) peakPrice = c.high;
        if (peakPrice - entry >= SL_PTS)
          sl = Math.max(sl, peakPrice - SL_PTS);
      } else {
        if (c.low < peakPrice) peakPrice = c.low;
        if (entry - peakPrice >= SL_PTS)
          sl = Math.min(sl, peakPrice + SL_PTS);
      }
      continue;
    }

    // Not in trade — need at least N candles in window before entering
    if (i - windowStart < N) continue;
    if (isEOD) break;

    // Rolling window: candles[windowStart .. i-1] (last N before current)
    const winEnd = i;         // exclusive — current candle is the breakout candle
    const winFrom = winEnd - N;
    let rollHigh = -Infinity, rollLow = Infinity;
    for (let j = winFrom; j < winEnd; j++) {
      if (mkt[j].high > rollHigh) rollHigh = mkt[j].high;
      if (mkt[j].low  < rollLow)  rollLow  = mkt[j].low;
    }

    if (c.close > rollHigh) {
      dir = 'CE'; entry = c.close;
      sl = entry - SL_PTS; peakPrice = c.high;
      inTrade = true;
    } else if (c.close < rollLow) {
      dir = 'PE'; entry = c.close;
      sl = entry + SL_PTS; peakPrice = c.low;
      inTrade = true;
    }
  }

  const netPts = totalPts - trades * BROK_PT;
  return { pts: totalPts, netPts, trades, wins };
}

function runVariant(allDates, byDay, N, SL_PTS) {
  let totalPts = 0, totalNetPts = 0, totalTrades = 0, totalWins = 0;
  let equity = 0, peak = 0, maxDD = 0;
  let netEquity = 0, netPeak = 0, netMaxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const year = date.slice(0, 4);
    if (!yearly[year]) yearly[year] = { gross: 0, net: 0 };
    const { pts, netPts, trades, wins } = simDay(byDay[date], N, SL_PTS);
    totalPts     += pts;
    totalNetPts  += netPts;
    totalTrades  += trades;
    totalWins    += wins;
    yearly[year].gross += pts;
    yearly[year].net   += netPts;

    equity += pts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    netEquity += netPts;
    if (netEquity > netPeak) netPeak = netEquity;
    if (netPeak - netEquity > netMaxDD) netMaxDD = netPeak - netEquity;
  }

  return {
    grossRs:    Math.round(totalPts * RS_PER_PT),
    netRs:      Math.round(totalNetPts * RS_PER_PT),
    winPct:     totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0',
    totalTrades, totalWins,
    maxDDRs:    Math.round(maxDD * RS_PER_PT),
    netMaxDDRs: Math.round(netMaxDD * RS_PER_PT),
    avgTradesDay: (totalTrades / allDates.length).toFixed(1),
    yearly
  };
}

async function main() {
  const allCandles = await fetchAll('2021-01-01', '2026-05-16');
  const byDay      = groupByDay(allCandles);
  const allDates   = Object.keys(byDay).sort().filter(d => byDay[d].length >= 50);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 2026)\n`);
  console.log(`Brokerage: ₹${BROK_RS}/trade (${BROK_PT.toFixed(1)} BNF pts)\n`);

  const variants = [
    { N:  3, SL: 10 },
    { N:  5, SL: 10 },
    { N: 10, SL: 10 },
    { N: 15, SL: 10 },
    { N: 20, SL: 10 },
    { N: 30, SL: 10 },
    { N:  5, SL: 15 },
    { N: 10, SL: 15 },
    { N: 15, SL: 15 },
    { N:  5, SL: 20 },
    { N: 10, SL: 20 },
    { N: 15, SL: 20 },
  ];

  console.log('N    SL   GrossRs         NetRs           WinPct  Trades  AvgT/Day  MaxDD(net)');
  console.log('─'.repeat(95));

  let bestNet = -Infinity, bestV = null, bestR = null;
  for (const v of variants) {
    const r = runVariant(allDates, byDay, v.N, v.SL);
    console.log([
      String(v.N).padStart(3),
      String(v.SL).padStart(4),
      String(r.grossRs).padStart(14),
      String(r.netRs).padStart(14),
      (r.winPct + '%').padStart(8),
      String(r.totalTrades).padStart(7),
      r.avgTradesDay.padStart(9),
      String(r.netMaxDDRs).padStart(12)
    ].join('  '));
    if (r.netRs > bestNet) { bestNet = r.netRs; bestV = v; bestR = r; }
  }

  if (bestR) {
    console.log('\n══ BEST VARIANT (by Net P&L after brokerage) ════════════════════════════');
    console.log(`  N=${bestV.N}  SL=${bestV.SL}  Trail=cost-trail`);
    console.log(`  Gross P&L  : ₹${bestR.grossRs.toLocaleString()}`);
    console.log(`  Net P&L    : ₹${bestR.netRs.toLocaleString()}  (after ₹${BROK_RS}/trade brokerage)`);
    console.log(`  Win Rate   : ${bestR.winPct}%  (${bestR.totalWins}/${bestR.totalTrades} trades)`);
    console.log(`  Avg Trades : ${bestR.avgTradesDay}/day`);
    console.log(`  Max DD     : ₹${bestR.netMaxDDRs.toLocaleString()} (net)`);
    console.log('\n  Yearly (Net after brokerage):');
    for (const [yr, v] of Object.entries(bestR.yearly).sort()) {
      console.log(`    ${yr}: ₹${Math.round(v.net * RS_PER_PT).toLocaleString()}  (gross ₹${Math.round(v.gross * RS_PER_PT).toLocaleString()})`);
    }
  }

  console.log('\n══ REFERENCE ════════════════════════════════════════════════════════════');
  console.log('  AMINA C1C2 (SL50+Re100, unconditional): ~₹10,76,428  MaxDD ~₹25,485');
  console.log('  VMT   C1C2 (SL25+Re25,  mar<0 filter) :  ₹10,88,805  MaxDD ~₹10,425\n');
}

main().catch(console.error);

'use strict';
// Telegram VMT Guy Strategy Backtest
//
// Strategy (decoded from what user described):
//   - At 9:15 AM market opens. Use the BNF opening price as reference level.
//   - CE side: buy if BNF breaks ABOVE open + BUFFER within 9:15-9:45 AM
//   - PE side: buy if BNF breaks BELOW open - BUFFER within 9:15-9:45 AM
//   - First side to trigger = the trade for that day (only 1 trade/day)
//   - SL  : fixed pts from entry
//   - Target: fixed pts from entry
//   - Time exit: 11:30 AM if still open
//   - No entry after 9:45 AM
//
// We test 8 parameter combos and show which performs best vs AMINA/C1C2 baselines.
//
// Conversion: 1 BNF index pt → ₹15 P&L  (30 qty × 0.5 delta, same as existing bot)

require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;

// ── API helper ───────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 25000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)) } catch(e) { reject(e) } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) });
    req.end();
  });
}

// ── Fetch 1-min BNF data in 55-day chunks (Kite limit ~60 days for 1-min) ──
async function fetchChunk(from, to) {
  const r = await kiteGet(
    `/instruments/historical/260105/minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`
  ).catch(() => null);
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
    const chunk = await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10));
    all.push(...chunk);
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 55);
    await new Promise(r => setTimeout(r, 450));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(c) {
  const m = {};
  for (const x of c) { if (!m[x.date]) m[x.date] = []; m[x.date].push(x); }
  return m;
}

// ── Simulate one day ─────────────────────────────────────────────────────────
// mode: 'both' | 'gap-filter'
// gap-filter: if open > prevClose+GAP_THRESH → CE only
//             if open < prevClose-GAP_THRESH → PE only
//             else → both sides
function simDay(candles, BUFFER, SL_PTS, TARGET_PTS, mode, prevClose, GAP_THRESH) {
  let refOpen = null;

  // Determine which sides are allowed
  let allowCE = true, allowPE = true;
  if (mode === 'gap-filter' && prevClose > 0) {
    const firstOpen = candles.find(c => c.h === 9 && c.m === 15);
    if (firstOpen) {
      const gap = firstOpen.open - prevClose;
      if (gap > GAP_THRESH)       { allowPE = false; } // gap-up → CE only
      else if (gap < -GAP_THRESH) { allowCE = false; } // gap-down → PE only
      // flat gap → both allowed
    }
  }

  // CE side state
  let ceIn = false, ceEntry = 0, ceSl = 0, ceTarget = 0, ceResult = null;
  // PE side state
  let peIn = false, peEntry = 0, peSl = 0, peTarget = 0, peResult = null;

  for (const c of candles) {
    if (c.h === 9 && c.m === 15 && refOpen === null) refOpen = c.open;
    if (refOpen === null) continue;

    const inWindow = (c.h === 9 && c.m >= 15 && c.m <= 44);
    const isTimeExit = c.h > 11 || (c.h === 11 && c.m >= 30);

    // ── CE side ──────────────────────────────────────────────────────────────
    if (allowCE) {
      if (ceIn && ceResult === null) {
        if (c.low <= ceSl)           { ceResult = -SL_PTS; }
        else if (c.high >= ceTarget) { ceResult = TARGET_PTS; }
        else if (isTimeExit)         { ceResult = c.close - ceEntry; }
      } else if (!ceIn && ceResult === null && inWindow) {
        if (c.close > refOpen + BUFFER) {
          ceEntry = c.close; ceSl = ceEntry - SL_PTS; ceTarget = ceEntry + TARGET_PTS;
          ceIn = true;
        }
      }
    }

    // ── PE side ──────────────────────────────────────────────────────────────
    if (allowPE) {
      if (peIn && peResult === null) {
        if (c.high >= peSl)          { peResult = -SL_PTS; }
        else if (c.low <= peTarget)  { peResult = TARGET_PTS; }
        else if (isTimeExit)         { peResult = peEntry - c.close; }
      } else if (!peIn && peResult === null && inWindow) {
        if (c.close < refOpen - BUFFER) {
          peEntry = c.close; peSl = peEntry + SL_PTS; peTarget = peEntry - TARGET_PTS;
          peIn = true;
        }
      }
    }

    if (ceResult !== null && peResult !== null) break;
  }

  const last = candles[candles.length - 1];
  if (ceIn && ceResult === null) ceResult = last.close - ceEntry;
  if (peIn && peResult === null) peResult = peEntry - last.close;

  const cePts = ceResult ?? 0;
  const pePts = peResult ?? 0;
  return {
    pts: cePts + pePts,
    cePts, pePts,
    ceTraded: ceResult !== null,
    peTraded: peResult !== null
  };
}

// ── Run one variant across all dates ─────────────────────────────────────────
function runVariant(allDates, byDay, BUFFER, SL_PTS, TARGET_PTS, mode, GAP_THRESH) {
  let totalPts = 0, winDays = 0, lossDays = 0, noTrades = 0;
  let ceTrades = 0, peTrades = 0, ceWins = 0, peWins = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};
  let prevClose = 0;

  for (const date of allDates) {
    const year = date.slice(0, 4);
    if (!yearly[year]) yearly[year] = 0;

    const candles = byDay[date];
    const { pts, cePts, pePts, ceTraded, peTraded } =
      simDay(candles, BUFFER, SL_PTS, TARGET_PTS, mode, prevClose, GAP_THRESH || 0);

    const lastC = candles[candles.length - 1];
    prevClose = lastC.close;

    if (!ceTraded && !peTraded) { noTrades++; continue; }

    totalPts += pts;
    yearly[year] += pts;
    if (pts > 0) winDays++; else if (pts < 0) lossDays++;

    if (ceTraded) { ceTrades++; if (cePts > 0) ceWins++; }
    if (peTraded) { peTrades++; if (pePts > 0) peWins++; }

    equity += pts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }

  const totalTrades = ceTrades + peTrades;
  const totalWins   = ceWins + peWins;
  return {
    totalPts: Math.round(totalPts),
    totalRs:  Math.round(totalPts * RS_PER_PT),
    winPct:   totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0',
    winDays, lossDays, noTrades,
    ceTrades, peTrades, ceWins, peWins,
    maxDDRs:  Math.round(maxDD * RS_PER_PT),
    avgPtDay: (totalPts / allDates.length).toFixed(2),
    yearly
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const allCandles = await fetchAll('2021-01-01', '2026-05-16');
  const byDay      = groupByDay(allCandles);
  const allDates   = Object.keys(byDay).sort().filter(d => byDay[d].length >= 50);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 2026)\n`);

  // ── Round 1: Both sides, best params from previous run ───────────────────
  console.log('══ ROUND 1: Both sides (no filter) — recap best params ════════════════');
  const r1 = runVariant(allDates, byDay, 10, 10, 100, 'both', 0);
  console.log(`  Buffer=10 SL=10 Target=100 → ₹${r1.totalRs.toLocaleString()}  WinPct=${r1.winPct}%  MaxDD=₹${r1.maxDDRs.toLocaleString()}`);

  // ── Round 2: Gap-direction filter ────────────────────────────────────────
  // Only trade in direction of opening gap vs previous close
  // Gap threshold variants: 50, 100, 150, 200 BNF pts
  console.log('\n══ ROUND 2: Gap-direction filter (trade only in gap direction) ════════');
  console.log('  If BNF opens >GAP above prevClose → CE only');
  console.log('  If BNF opens >GAP below prevClose → PE only');
  console.log('  Flat open (gap < threshold) → both sides\n');

  const gapVariants = [
    { BUFFER: 10, SL: 10, TARGET: 100, GAP:  50, label: 'Gap50  B10-SL10-T100' },
    { BUFFER: 10, SL: 10, TARGET: 100, GAP: 100, label: 'Gap100 B10-SL10-T100' },
    { BUFFER: 10, SL: 10, TARGET: 100, GAP: 150, label: 'Gap150 B10-SL10-T100' },
    { BUFFER: 10, SL: 10, TARGET: 100, GAP: 200, label: 'Gap200 B10-SL10-T100' },
    { BUFFER: 10, SL: 10, TARGET:  80, GAP:  50, label: 'Gap50  B10-SL10-T80 ' },
    { BUFFER: 10, SL: 10, TARGET:  80, GAP: 100, label: 'Gap100 B10-SL10-T80 ' },
    { BUFFER: 20, SL: 10, TARGET: 100, GAP:  50, label: 'Gap50  B20-SL10-T100' },
    { BUFFER: 20, SL: 10, TARGET: 100, GAP: 100, label: 'Gap100 B20-SL10-T100' },
    { BUFFER: 10, SL: 10, TARGET: 150, GAP:  50, label: 'Gap50  B10-SL10-T150' },
    { BUFFER: 10, SL: 10, TARGET: 150, GAP: 100, label: 'Gap100 B10-SL10-T150' },
  ];

  console.log('Variant                Buffer  SL  Target  Gap  TotalRs         WinPct  NoTrade  MaxDD');
  console.log('─'.repeat(100));

  let bestRs = -Infinity, bestV = null, bestR = null;
  for (const v of gapVariants) {
    const r = runVariant(allDates, byDay, v.BUFFER, v.SL, v.TARGET, 'gap-filter', v.GAP);
    console.log([
      v.label,
      String(v.BUFFER).padStart(6),
      String(v.SL).padStart(4),
      String(v.TARGET).padStart(6),
      String(v.GAP).padStart(5),
      String(r.totalRs).padStart(14),
      (r.winPct + '%').padStart(8),
      String(r.noTrades).padStart(8),
      String(r.maxDDRs).padStart(8)
    ].join('  '));
    if (r.totalRs > bestRs) { bestRs = r.totalRs; bestV = v; bestR = r; }
  }

  if (bestR) {
    console.log('\n══ BEST GAP-FILTER VARIANT ═════════════════════════════════════════════');
    console.log(`  ${bestV.label.trim()}  Gap=${bestV.GAP}  Buffer=${bestV.BUFFER}  SL=${bestV.SL}  Target=${bestV.TARGET}`);
    console.log(`  Total P&L : ₹${bestR.totalRs.toLocaleString()}`);
    console.log(`  Win Rate  : ${bestR.winPct}%  (CE: ${bestR.ceWins}/${bestR.ceTrades} | PE: ${bestR.peWins}/${bestR.peTrades})`);
    console.log(`  Win Days  : ${bestR.winDays} / Loss Days: ${bestR.lossDays}`);
    console.log(`  No Trade  : ${bestR.noTrades} days`);
    console.log(`  Max DD    : ₹${bestR.maxDDRs.toLocaleString()}`);
    console.log(`  Avg Pt/Day: ${bestR.avgPtDay} pts BNF`);
    console.log('\n  Yearly breakdown:');
    for (const [yr, pts] of Object.entries(bestR.yearly).sort()) {
      console.log(`    ${yr}: ₹${Math.round(pts * RS_PER_PT).toLocaleString()}`);
    }
  }

  console.log('\n══ REFERENCE ═══════════════════════════════════════════════════════════');
  console.log('  AMINA C1C2 (SL50+Re100, unconditional): ~₹10,76,428  MaxDD ~₹25,485');
  console.log('  VMT   C1C2 (SL25+Re25,  mar<0 filter) :  ₹10,88,805  MaxDD ~₹10,425\n');
}

main().catch(console.error);


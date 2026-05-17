/**
 * candle_target.js — Candle Direction + Profit Target Exit
 *
 * Strategy: Enter on candle N direction, exit when:
 *   (a) Profit target hit (100/200/.../1200 pts)
 *   (b) SL hit
 *   (c) EOD
 *
 * Tests all C1-C4 × SL1/SL2/SL3/SL4 × targets 100-1200 (step 100)
 * Shows: top 20 combos + per-strategy best target summary
 *
 * AMINA baseline: cache=₹9,54,163  |  full 33K=₹14,24,023
 */
'use strict';
const fs = require('fs');

const CACHE     = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const BROKERAGE = 4;

const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
const all = raw.map(c => ({
  day    : String(c.date).slice(0, 10),
  timeIST: (() => { const d = new Date(c.date); d.setMinutes(d.getMinutes() + 330); return d.toISOString().slice(11, 16); })(),
  open: c.open, high: c.high, low: c.low, close: c.close,
  bull: c.close >= c.open,
}));

const byDay = {};
for (const c of all) { if (!byDay[c.day]) byDay[c.day] = []; byDay[c.day].push(c); }
const allDates = Object.keys(byDay).sort();
console.log(`Cache: ${CACHE} | ${all.length} candles | ${allDates.length} days\n`);

function isEOD(c) { return c.timeIST >= '15:00'; }

const TIMES = ['09:15', '09:30', '09:45', '10:00'];

function sim(candles, ci, slMode, target) {
  const signal = candles[ci];
  if (!signal || signal.timeIST !== TIMES[ci]) return null;
  for (let k = 0; k < ci; k++) {
    if (!candles[k] || candles[k].timeIST !== TIMES[k]) return null;
  }

  const dir   = signal.bull ? 'CE' : 'PE';
  const entry = signal.close;
  const prev  = ci > 0 ? candles[ci - 1] : null;

  let slPx = null;
  if      (slMode === 'SL1')        slPx = dir === 'CE' ? signal.low  : signal.high;
  else if (slMode === 'SL2' && prev) slPx = dir === 'CE' ? prev.low   : prev.high;
  else if (slMode === 'SL3')        slPx = dir === 'CE' ? entry - 50  : entry + 50;
  else if (slMode === 'SL4')        slPx = dir === 'CE' ? entry - 100 : entry + 100;

  let pts = 0, exitReason = 'EOD';
  for (let i = ci + 1; i < candles.length; i++) {
    const c = candles[i];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;

    // Profit target
    if (target && cur >= target) { pts = target; exitReason = 'TGT'; break; }

    // SL
    if (slPx !== null && (dir === 'CE' ? c.close <= slPx : c.close >= slPx)) {
      pts = dir === 'CE' ? slPx - entry : entry - slPx; exitReason = 'SL'; break;
    }

    // EOD
    if (isEOD(c)) { pts = cur; exitReason = 'EOD'; break; }
  }

  return { net: pts - BROKERAGE, rawPts: pts, exitReason };
}

// ── Build all combos ──────────────────────────────────────────────────────────
const CANDLES = [
  { ci: 0, sl: 'SL1', name: 'C1-SL1' },
  { ci: 0, sl: 'SL3', name: 'C1-SL3' },
  { ci: 0, sl: 'SL4', name: 'C1-SL4' },
  { ci: 1, sl: 'SL1', name: 'C2-SL1' },
  { ci: 1, sl: 'SL2', name: 'C2-SL2' },
  { ci: 1, sl: 'SL3', name: 'C2-SL3' },
  { ci: 1, sl: 'SL4', name: 'C2-SL4' },
  { ci: 2, sl: 'SL1', name: 'C3-SL1' },
  { ci: 2, sl: 'SL2', name: 'C3-SL2' },
  { ci: 2, sl: 'SL3', name: 'C3-SL3' },
  { ci: 2, sl: 'SL4', name: 'C3-SL4' },
  { ci: 3, sl: 'SL1', name: 'C4-SL1' },
  { ci: 3, sl: 'SL2', name: 'C4-SL2' },
  { ci: 3, sl: 'SL3', name: 'C4-SL3' },
  { ci: 3, sl: 'SL4', name: 'C4-SL4' },
];

const TARGETS = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200];

process.stdout.write('Running combinations');
const results = [];

for (const v of CANDLES) {
  const bestForStrategy = { netRs: -Infinity };

  for (const tgt of TARGETS) {
    let net = 0, wins = 0, losses = 0, tgtHits = 0, slHits = 0, eodExits = 0;
    let peak = 0, maxDD = 0, equity = 0, total = 0;
    const yearly = {};

    for (const date of allDates) {
      const res = sim(byDay[date], v.ci, v.sl, tgt);
      if (!res) continue;
      total++;
      net    += res.net;
      equity += res.net;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
      const yr = date.slice(0, 4);
      yearly[yr] = (yearly[yr] || 0) + res.net;
      if (res.net > 0) wins++; else losses++;
      if (res.exitReason === 'TGT') tgtHits++;
      else if (res.exitReason === 'SL') slHits++;
      else eodExits++;
    }

    const netRs   = Math.round(net * RS_PER_PT);
    const maxDDRs = Math.round(maxDD * RS_PER_PT);
    const winPct  = total ? (wins / total * 100).toFixed(1) : '0';
    const tgtPct  = total ? (tgtHits / total * 100).toFixed(0) : '0';
    const avgDay  = total ? Math.round(netRs / total) : 0;

    const r = {
      name: v.name, target: tgt, netRs, maxDDRs, winPct,
      tgtPct, avgDay, yearly,
    };
    results.push(r);
    if (netRs > bestForStrategy.netRs) Object.assign(bestForStrategy, r);
  }

  v._best = bestForStrategy;
  process.stdout.write('.');
}
console.log(' done\n');

// ── TOP 20 combos ─────────────────────────────────────────────────────────────
results.sort((a, b) => b.netRs - a.netRs);

const LINE = '─'.repeat(90);
console.log('TOP 20 COMBINATIONS (Candle + SL + Profit Target)');
console.log(LINE);
console.log(`${'Strategy+Target'.padEnd(22)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'TGT%'.padStart(5)} ${'Avg/Day'.padStart(9)}`);
console.log(LINE);

const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

for (const r of results.slice(0, 20)) {
  const flag = r.netRs > 954163 ? (r.netRs > 1424023 ? '  ✅ BEATS 33K' : '  ▲ beats cache') : '';
  console.log(
    `${(r.name + ' T' + r.target).padEnd(22)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.tgtPct + '%').padStart(5)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)}${flag}`
  );
}

// ── Best target per strategy ───────────────────────────────────────────────────
console.log('\n' + LINE);
console.log('BEST PROFIT TARGET PER STRATEGY');
console.log(LINE);
console.log(`${'Strategy'.padEnd(12)} ${'BestTgt'.padStart(8)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'TGT%'.padStart(5)} ${'Avg/Day'.padStart(9)}`);
console.log(LINE);

CANDLES.sort((a, b) => b._best.netRs - a._best.netRs);
for (const v of CANDLES) {
  const r = v._best;
  if (!r || r.netRs === -Infinity) continue;
  const flag = r.netRs > 954163 ? (r.netRs > 1424023 ? '  ✅ BEATS 33K' : '  ▲ beats cache') : '';
  console.log(
    `${v.name.padEnd(12)} ${String(r.target + ' pts').padStart(8)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.tgtPct + '%').padStart(5)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)}${flag}`
  );
}

// ── Yearly for top 5 ───────────────────────────────────────────────────────────
console.log('\n' + LINE);
console.log('YEARLY BREAKDOWN — TOP 5 COMBOS');
console.log(LINE);
results.sort((a, b) => b.netRs - a.netRs);
console.log('Strategy+Target'.padEnd(22) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
console.log(LINE);
for (const r of results.slice(0, 5)) {
  const row = (r.name + ' T' + r.target).padEnd(22)
    + years.map(y => {
        const rs = Math.round((r.yearly[y] || 0) * RS_PER_PT);
        return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
      }).join('')
    + ('  ₹' + r.netRs.toLocaleString('en-IN')).padStart(12);
  console.log(row);
}

console.log('\n' + LINE);
console.log('AMINA (cache 30K) = ₹9,54,163  |  AMINA (full 33K) = ₹14,24,023');
console.log(LINE);

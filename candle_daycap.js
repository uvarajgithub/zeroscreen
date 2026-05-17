/**
 * candle_daycap.js — C3 & C4 Direction Strategy + Daily Profit Cap
 *
 * Same daily cap logic as amina_daycap.js:
 *   Once cumulative day P&L hits CAP pts → exit immediately, stop for day
 *
 * Tests:
 *   C3 SL1/SL2/SL3/SL4  ×  caps: null, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800
 *   C4 SL1/SL2/SL3/SL4  ×  same caps
 *
 * Shows: best cap per strategy + top combos
 * AMINA baseline (cache): ₹11,17,894  |  full 33K: ₹14,24,023 (no cap)
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

function simDay(candles, ci, slMode, dayCap) {
  const signal = candles[ci];
  if (!signal || signal.timeIST !== TIMES[ci]) return null;
  for (let k = 0; k < ci; k++) {
    if (!candles[k] || candles[k].timeIST !== TIMES[k]) return null;
  }

  const dir   = signal.bull ? 'CE' : 'PE';
  const entry = signal.close;
  const prev  = ci > 0 ? candles[ci - 1] : null;

  let slPx = null;
  if      (slMode === 'SL1')         slPx = dir === 'CE' ? signal.low  : signal.high;
  else if (slMode === 'SL2' && prev) slPx = dir === 'CE' ? prev.low    : prev.high;
  else if (slMode === 'SL3')         slPx = dir === 'CE' ? entry - 50  : entry + 50;
  else if (slMode === 'SL4')         slPx = dir === 'CE' ? entry - 100 : entry + 100;

  let pts = 0, exitReason = 'EOD', capHit = false;

  for (let i = ci + 1; i < candles.length; i++) {
    const c = candles[i];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;

    // Daily cap check
    if (dayCap && cur >= dayCap) {
      pts = dayCap; exitReason = 'CAP'; capHit = true; break;
    }

    // SL
    if (slPx !== null && (dir === 'CE' ? c.close <= slPx : c.close >= slPx)) {
      pts = dir === 'CE' ? slPx - entry : entry - slPx; exitReason = 'SL'; break;
    }

    // EOD
    if (isEOD(c)) { pts = cur; exitReason = 'EOD'; break; }
  }

  return { net: pts - BROKERAGE, rawPts: pts, capHit };
}

function runVariant(ci, slMode, dayCap) {
  let net = 0, wins = 0, losses = 0, capDays = 0;
  let peak = 0, maxDD = 0, equity = 0, total = 0;
  const yearly = {};

  for (const date of allDates) {
    const res = simDay(byDay[date], ci, slMode, dayCap);
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
    if (res.capHit) capDays++;
  }

  return {
    netRs  : Math.round(net * RS_PER_PT),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    winPct : total ? (wins / total * 100).toFixed(1) : '0',
    capPct : total ? (capDays / total * 100).toFixed(0) : '0',
    avgDay : total ? Math.round(net * RS_PER_PT / total) : 0,
    yearly,
  };
}

const STRATEGIES = [
  { name: 'C3-SL1', ci: 2, sl: 'SL1' },
  { name: 'C3-SL2', ci: 2, sl: 'SL2' },
  { name: 'C3-SL3', ci: 2, sl: 'SL3' },
  { name: 'C3-SL4', ci: 2, sl: 'SL4' },
  { name: 'C4-SL1', ci: 3, sl: 'SL1' },
  { name: 'C4-SL2', ci: 3, sl: 'SL2' },
  { name: 'C4-SL3', ci: 3, sl: 'SL3' },
  { name: 'C4-SL4', ci: 3, sl: 'SL4' },
];
const CAPS = [null, 100, 150, 200, 250, 300, 400, 500, 600, 700, 800];

process.stdout.write('Running');
const allResults = [];
for (const v of STRATEGIES) {
  v._bestNetRs = -Infinity;
  for (const cap of CAPS) {
    process.stdout.write('.');
    const r = runVariant(v.ci, v.sl, cap);
    allResults.push({ strat: v.name, cap, ...r });
    if (r.netRs > v._bestNetRs) { v._bestNetRs = r.netRs; v._best = { cap, ...r }; }
  }
}
console.log(' done\n');

const LINE  = '─'.repeat(100);
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

// ── Best cap per strategy ─────────────────────────────────────────────────────
console.log('BEST DAILY CAP PER STRATEGY (C3 & C4)');
console.log('AMINA no-cap baseline (cache) = ₹11,17,894');
console.log(LINE);
console.log(`${'Strategy'.padEnd(12)} ${'BestCap'.padStart(10)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'Cap%'.padStart(6)} ${'Avg/Day'.padStart(9)} ${'vs NoCap'.padStart(10)}`);
console.log(LINE);

let lastGroup = '';
for (const v of STRATEGIES) {
  const group = v.name.slice(0, 2);
  if (group !== lastGroup) { if (lastGroup) console.log(); lastGroup = group; }

  const base = allResults.find(r => r.strat === v.name && r.cap === null);
  const r    = v._best;
  const diff = r.cap ? ` ${r.netRs >= base.netRs ? '+' : ''}${(((r.netRs - base.netRs) / base.netRs) * 100).toFixed(1)}%` : '  (baseline)';
  const flag = r.netRs > base.netRs ? '  ✅' : '';
  const capLabel = r.cap ? `${r.cap} pts` : 'No cap';

  console.log(
    `${v.name.padEnd(12)} ${capLabel.padStart(10)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.capPct + '%').padStart(6)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)} ${diff.padStart(10)}${flag}`
  );
}

// ── Full breakdown for C3-SL3 and C4-SL4 (best of each candle) ───────────────
for (const stratName of ['C3-SL3', 'C4-SL4']) {
  const v = STRATEGIES.find(s => s.name === stratName);
  const rows = allResults.filter(r => r.strat === stratName);
  const base = rows.find(r => r.cap === null).netRs;

  console.log(`\n${LINE}`);
  console.log(`${stratName} — All Caps`);
  console.log(LINE);
  console.log(`${'Day Cap'.padEnd(12)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'Cap%'.padStart(6)} ${'Avg/Day'.padStart(9)} ${'vs NoCap'.padStart(10)}`);
  console.log(LINE);
  for (const r of rows) {
    const label = r.cap ? `${r.cap} pts` : 'No cap';
    const diff  = r.cap ? ` ${r.netRs >= base ? '+' : ''}${(((r.netRs - base) / base) * 100).toFixed(1)}%` : '  (baseline)';
    const flag  = r.netRs > base ? '  ✅' : '';
    console.log(
      `${label.padEnd(12)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.capPct + '%').padStart(6)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)} ${diff.padStart(10)}${flag}`
    );
  }

  // Yearly for best cap
  console.log(`\nYEARLY — ${stratName} best cap (${v._best.cap ? v._best.cap + ' pts' : 'no cap'}) vs no cap`);
  console.log('Cap'.padEnd(12) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
  for (const r of rows.filter(x => x.cap === null || x.cap === v._best.cap)) {
    const label = r.cap ? `Cap${r.cap}` : 'No cap';
    const row = label.padEnd(12)
      + years.map(y => {
          const rs = Math.round((r.yearly[y] || 0) * RS_PER_PT);
          return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
        }).join('')
      + ('  ₹' + r.netRs.toLocaleString('en-IN')).padStart(12);
    console.log(row);
  }
}

// ── Top 10 overall ────────────────────────────────────────────────────────────
console.log(`\n${LINE}`);
console.log('TOP 10 COMBOS (C3+C4, all SLs, all caps)');
console.log(`AMINA no-cap = ₹11,17,894`);
console.log(LINE);
allResults.sort((a, b) => b.netRs - a.netRs);
console.log(`${'Strategy+Cap'.padEnd(20)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'Cap%'.padStart(6)} ${'Avg/Day'.padStart(9)}`);
console.log(LINE);
for (const r of allResults.slice(0, 10)) {
  const label = `${r.strat} ${r.cap ? 'C' + r.cap : 'NoCap'}`;
  const flag  = r.netRs > 1117894 ? '  ▲ beats AMINA cache' : '';
  console.log(
    `${label.padEnd(20)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${(r.capPct + '%').padStart(6)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)}${flag}`
  );
}

console.log(`\n${LINE}`);
console.log(`Cache: ${CACHE}  |  AMINA (full 33K no cap) = ₹14,24,023`);
console.log(LINE);

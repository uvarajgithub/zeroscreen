/**
 * candle_test.js — Candle Direction Strategy: C1 vs C2 vs C3
 *
 * Rules:
 *   C1: Enter at close of 9:15 candle (9:30 AM)
 *   C2: Enter at close of 9:30 candle (9:45 AM)
 *   C3: Enter at close of 9:45 candle (10:00 AM)
 *   Signal: candle GREEN → Buy CE, RED → Buy PE
 *   Exit: EOD (3:15 PM)
 *
 * SL Variants per candle:
 *   SL1 — Same candle low/high
 *   SL2 — Previous candle low/high
 *   SL3 — Fixed 50 pts
 *   SL4 — Fixed 100 pts
 *
 * Other metrics shown:
 *   Avg win pts | Avg loss pts | Win/Loss ratio | SL hit% | EOD exit%
 *
 * BASELINE: AMINA SL60+LockBE cache=₹9,54,163  full33K=₹14,24,023
 */
'use strict';
const fs = require('fs');

const CACHE     = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const BROKERAGE = 4;

// ── Load ──────────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
// Handle both cache formats: {date,open,...} or flat array with date string
const all = raw.map(c => ({
  day    : String(c.date).slice(0, 10),
  timeIST: (() => { const d = new Date(c.date); d.setMinutes(d.getMinutes() + 330); return d.toISOString().slice(11, 16); })(),
  open   : c.open,
  high   : c.high,
  low    : c.low,
  close  : c.close,
  bull   : c.close >= c.open,
}));

const byDay = {};
for (const c of all) {
  if (!byDay[c.day]) byDay[c.day] = [];
  byDay[c.day].push(c);
}
const allDates = Object.keys(byDay).sort();
console.log(`Cache: ${CACHE}`);
console.log(`Loaded ${all.length} candles | ${allDates.length} trading days`);
console.log(`AMINA BASELINE → cache: ₹9,54,163  |  full 33K: ₹14,24,023\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function isEOD(c) { return c.timeIST >= '15:00'; }

function simCandle(candles, candleIdx, slMode) {
  // candleIdx: 0=C1(09:15), 1=C2(09:30), 2=C3(09:45), 3=C4(10:00)
  const expectedTimes = ['09:15', '09:30', '09:45', '10:00'];

  const signal = candles[candleIdx];
  if (!signal || signal.timeIST !== expectedTimes[candleIdx]) return null;

  // Validate prior candles exist at correct times
  for (let k = 0; k < candleIdx; k++) {
    if (!candles[k] || candles[k].timeIST !== expectedTimes[k]) return null;
  }

  const dir   = signal.bull ? 'CE' : 'PE';
  const entry = signal.close;
  const prev  = candleIdx > 0 ? candles[candleIdx - 1] : null;

  let slPx = null;
  if (slMode === 'SL1') {
    slPx = dir === 'CE' ? signal.low : signal.high;
  } else if (slMode === 'SL2' && prev) {
    slPx = dir === 'CE' ? prev.low : prev.high;
  } else if (slMode === 'SL3') {
    slPx = dir === 'CE' ? entry - 50 : entry + 50;
  } else if (slMode === 'SL4') {
    slPx = dir === 'CE' ? entry - 100 : entry + 100;
  }

  let pts = 0, exitReason = 'EOD';
  const startIdx = candleIdx + 1;

  for (let i = startIdx; i < candles.length; i++) {
    const c = candles[i];
    if (slPx !== null && (dir === 'CE' ? c.close <= slPx : c.close >= slPx)) {
      pts = dir === 'CE' ? slPx - entry : entry - slPx;
      exitReason = 'SL';
      break;
    }
    if (isEOD(c)) {
      pts = dir === 'CE' ? c.close - entry : entry - c.close;
      exitReason = 'EOD';
      break;
    }
  }

  return { net: pts - BROKERAGE, rawPts: pts, exitReason, dir };
}

// ── Variants ──────────────────────────────────────────────────────────────────
const variants = [
  // C1
  { name: 'C1 SL1  Same candle H/L',     ci: 0, sl: 'SL1', group: 'C1' },
  { name: 'C1 SL3  Fixed 50 pts',         ci: 0, sl: 'SL3', group: 'C1' },
  { name: 'C1 SL4  Fixed 100 pts',        ci: 0, sl: 'SL4', group: 'C1' },
  // C2
  { name: 'C2 SL1  Same candle H/L',     ci: 1, sl: 'SL1', group: 'C2' },
  { name: 'C2 SL2  Prev candle H/L',     ci: 1, sl: 'SL2', group: 'C2' },
  { name: 'C2 SL3  Fixed 50 pts',         ci: 1, sl: 'SL3', group: 'C2' },
  { name: 'C2 SL4  Fixed 100 pts',        ci: 1, sl: 'SL4', group: 'C2' },
  // C3
  { name: 'C3 SL1  Same candle H/L',     ci: 2, sl: 'SL1', group: 'C3' },
  { name: 'C3 SL2  Prev candle H/L',     ci: 2, sl: 'SL2', group: 'C3' },
  { name: 'C3 SL3  Fixed 50 pts',         ci: 2, sl: 'SL3', group: 'C3' },
  { name: 'C3 SL4  Fixed 100 pts',        ci: 2, sl: 'SL4', group: 'C3' },
  // C4
  { name: 'C4 SL1  Same candle H/L',     ci: 3, sl: 'SL1', group: 'C4' },
  { name: 'C4 SL2  Prev candle H/L',     ci: 3, sl: 'SL2', group: 'C4' },
  { name: 'C4 SL3  Fixed 50 pts',         ci: 3, sl: 'SL3', group: 'C4' },
  { name: 'C4 SL4  Fixed 100 pts',        ci: 3, sl: 'SL4', group: 'C4' },
];

// ── Run ───────────────────────────────────────────────────────────────────────
const LINE = '─'.repeat(115);
console.log(LINE);
console.log(
  `${'Variant'.padEnd(30)} ${'Net ₹'.padStart(10)} ${'Win%'.padStart(5)} ${'MaxDD ₹'.padStart(9)} ${'AvgWin'.padStart(7)} ${'AvgLoss'.padStart(8)} ${'W/L'.padStart(5)} ${'SL%'.padStart(5)} ${'Avg/Day'.padStart(8)}`
);
console.log(LINE);

let lastGroup = '';
for (const v of variants) {
  if (v.group !== lastGroup) { if (lastGroup) console.log(); lastGroup = v.group; }

  let net = 0, wins = 0, losses = 0, peak = 0, maxDD = 0, equity = 0;
  let sumWinPts = 0, sumLossPts = 0, slHits = 0, total = 0;
  const yearly = {};

  for (const date of allDates) {
    const res = simCandle(byDay[date], v.ci, v.sl);
    if (!res) continue;
    total++;

    net    += res.net;
    equity += res.net;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + res.net;

    if (res.net > 0) { wins++; sumWinPts += res.rawPts; }
    else              { losses++; sumLossPts += res.rawPts; }
    if (res.exitReason === 'SL') slHits++;
  }

  const netRs   = Math.round(net * RS_PER_PT);
  const maxDDRs = Math.round(maxDD * RS_PER_PT);
  const avgDay  = total ? Math.round(netRs / total) : 0;
  const winPct  = total ? (wins / total * 100).toFixed(1) : '0.0';
  const avgWin  = wins   ? (sumWinPts  / wins).toFixed(1)   : '0';
  const avgLoss = losses ? (sumLossPts / losses).toFixed(1) : '0';
  const wlRatio = losses ? (sumWinPts / wins / (-sumLossPts / losses)).toFixed(2) : '-';
  const slPct   = total  ? (slHits / total * 100).toFixed(0) : '0';
  const flag    = netRs > 954163 ? (netRs > 1424023 ? '  ✅ BEATS 33K' : '  ▲ beats cache') : netRs < 0 ? '  ❌' : '';

  console.log(
    `${v.name.padEnd(30)} ${('₹' + netRs.toLocaleString('en-IN')).padStart(10)} ${winPct.padStart(4)}% ${('₹' + maxDDRs.toLocaleString('en-IN')).padStart(9)} ${avgWin.padStart(7)} ${avgLoss.padStart(8)} ${wlRatio.padStart(5)} ${(slPct + '%').padStart(5)} ${('₹' + avgDay.toLocaleString('en-IN')).padStart(8)}${flag}`
  );

  v._yearly = yearly;
  v._netRs  = netRs;
}

// ── Yearly breakdown ──────────────────────────────────────────────────────────
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
console.log('\n' + LINE);
console.log('YEARLY BREAKDOWN (₹)');
console.log(LINE);
console.log('Variant'.padEnd(30) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
console.log(LINE);

lastGroup = '';
for (const v of variants) {
  if (!v._yearly) continue;
  if (v.group !== lastGroup) { if (lastGroup) console.log(); lastGroup = v.group; }
  const row = v.name.padEnd(30)
    + years.map(y => {
        const rs = Math.round((v._yearly[y] || 0) * RS_PER_PT);
        return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
      }).join('')
    + ('  ₹' + v._netRs.toLocaleString('en-IN')).padStart(12);
  console.log(row);
}

console.log('\n' + LINE);
console.log('AMINA (cache 30K) = ₹9,54,163  |  AMINA (full 33K) = ₹14,24,023');
console.log(LINE);

/**
 * second_candle.js — Second 15-Min Candle Direction Strategy
 *
 * Rules:
 *   Signal : 9:15 candle = first candle (direction reference)
 *            9:30 candle = second candle (GREEN→CE, RED→PE)
 *   Entry  : Close of 9:30 candle (9:45 AM)
 *   Exit   : EOD (3:15 PM)
 *
 * SL Variants (second candle):
 *   C2_SL1 — Same candle (9:30) low/high
 *   C2_SL2 — Previous candle (9:15) low/high
 *   C2_SL3 — Fixed 50 pts
 *   C2_SL4 — Fixed 100 pts
 *
 * Comparison table also includes all first candle results.
 * BASELINE TO BEAT: ₹14,24,023 (AMINA SL60+LockBE on 33K candles)
 */
'use strict';
const fs = require('fs');

const CACHE     = require('fs').existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const BROKERAGE = 4; // pts per trade

// ── Load & enrich ─────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
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
console.log(`Loaded ${all.length} candles | ${allDates.length} trading days`);
console.log(`BASELINE TO BEAT (AMINA 33K): ₹14,24,023  |  On this cache: ₹9,54,163\n`);

// ── helpers ───────────────────────────────────────────────────────────────────
function isEOD(c) { return c.timeIST >= '15:00'; }

// ── FIRST CANDLE sims (replicated from first_candle.js for comparison) ─────────
function simFirst(candles, slMode) {
  const c1 = candles[0];
  if (!c1 || c1.timeIST !== '09:15') return null;

  const dir   = c1.bull ? 'CE' : 'PE';
  const entry = c1.close;

  let slPx = null;
  if      (slMode === 'SL1') slPx = dir === 'CE' ? c1.low  : c1.high;
  else if (slMode === 'SL3') slPx = dir === 'CE' ? entry - 50  : entry + 50;
  else if (slMode === 'SL4') slPx = dir === 'CE' ? entry - 100 : entry + 100;

  let pts = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (slPx !== null && (dir === 'CE' ? c.close <= slPx : c.close >= slPx)) {
      pts = dir === 'CE' ? slPx - entry : entry - slPx; break;
    }
    if (isEOD(c)) { pts = dir === 'CE' ? c.close - entry : entry - c.close; break; }
  }
  return { net: pts - BROKERAGE };
}

function simFirstRE(candles) {
  const c1 = candles[0];
  if (!c1 || c1.timeIST !== '09:15') return null;
  const dir1 = c1.bull ? 'CE' : 'PE';
  const entry1 = c1.close;
  const sl1    = dir1 === 'CE' ? c1.low : c1.high;

  let t1Pts = 0, rePts = 0, reDir = null;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    if (!reDir) {
      const slHit = dir1 === 'CE' ? c.close <= sl1 : c.close >= sl1;
      if (slHit) {
        t1Pts = dir1 === 'CE' ? sl1 - entry1 : entry1 - sl1;
        reDir = dir1 === 'CE' ? 'PE' : 'CE';
        const reEntry = c.close;
        for (let j = i + 1; j < candles.length; j++) {
          const r = candles[j];
          if (isEOD(r)) { rePts = reDir === 'CE' ? r.close - reEntry : reEntry - r.close; break; }
        }
        break;
      }
      if (isEOD(c)) { t1Pts = dir1 === 'CE' ? c.close - entry1 : entry1 - c.close; break; }
    }
  }
  return { net: t1Pts + rePts - (reDir ? 2 : 1) * BROKERAGE };
}

// ── SECOND CANDLE sim ─────────────────────────────────────────────────────────
function simSecond(candles, slMode) {
  const c1 = candles[0]; // 09:15
  const c2 = candles[1]; // 09:30
  if (!c1 || c1.timeIST !== '09:15') return null;
  if (!c2 || c2.timeIST !== '09:30') return null;

  const dir   = c2.bull ? 'CE' : 'PE';
  const entry = c2.close; // enter at 9:45 close

  let slPx = null;
  if      (slMode === 'C2_SL1') slPx = dir === 'CE' ? c2.low  : c2.high;          // same candle
  else if (slMode === 'C2_SL2') slPx = dir === 'CE' ? c1.low  : c1.high;          // prev candle
  else if (slMode === 'C2_SL3') slPx = dir === 'CE' ? entry - 50  : entry + 50;   // fixed 50
  else if (slMode === 'C2_SL4') slPx = dir === 'CE' ? entry - 100 : entry + 100;  // fixed 100

  let pts = 0;
  for (let i = 2; i < candles.length; i++) {  // start from candle 3 (09:45)
    const c = candles[i];
    if (slPx !== null && (dir === 'CE' ? c.close <= slPx : c.close >= slPx)) {
      pts = dir === 'CE' ? slPx - entry : entry - slPx; break;
    }
    if (isEOD(c)) { pts = dir === 'CE' ? c.close - entry : entry - c.close; break; }
  }
  return { net: pts - BROKERAGE };
}

// ── Variants ──────────────────────────────────────────────────────────────────
const variants = [
  // ── FIRST CANDLE (from prior test) ──
  { name: 'C1 SL1  First candle H/L',        fn: cs => simFirst(cs, 'SL1'), group: 'C1' },
  { name: 'C1 SL2  No SL (hold to EOD)',      fn: cs => simFirst(cs, null),  group: 'C1' },
  { name: 'C1 SL3  Fixed 50 pts',             fn: cs => simFirst(cs, 'SL3'), group: 'C1' },
  { name: 'C1 SL4  Fixed 100 pts',            fn: cs => simFirst(cs, 'SL4'), group: 'C1' },
  { name: 'C1 SL1+RE  reverse on SL hit',     fn: cs => simFirstRE(cs),      group: 'C1' },
  // ── SECOND CANDLE ──
  { name: 'C2 SL1  Same candle (9:30) H/L',  fn: cs => simSecond(cs, 'C2_SL1'), group: 'C2' },
  { name: 'C2 SL2  Prev candle (9:15) H/L',  fn: cs => simSecond(cs, 'C2_SL2'), group: 'C2' },
  { name: 'C2 SL3  Fixed 50 pts',            fn: cs => simSecond(cs, 'C2_SL3'), group: 'C2' },
  { name: 'C2 SL4  Fixed 100 pts',           fn: cs => simSecond(cs, 'C2_SL4'), group: 'C2' },
];

// ── Run ───────────────────────────────────────────────────────────────────────
const LINE = '─'.repeat(100);
console.log(LINE);
console.log(`${'Variant'.padEnd(40)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'Avg/Day'.padStart(9)}`);
console.log(LINE);

let lastGroup = '';
for (const v of variants) {
  if (v.group !== lastGroup) { if (lastGroup) console.log(); lastGroup = v.group; }

  let net = 0, wins = 0, losses = 0, peak = 0, maxDD = 0, equity = 0;
  const yearly = {};

  for (const date of allDates) {
    const res = v.fn(byDay[date]);
    if (!res) continue;

    net    += res.net;
    equity += res.net;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + res.net;

    if (res.net > 0) wins++; else losses++;
  }

  const total   = wins + losses;
  const netRs   = Math.round(net * RS_PER_PT);
  const maxDDRs = Math.round(maxDD * RS_PER_PT);
  const avgDay  = total ? Math.round(netRs / total) : 0;
  const winPct  = total ? (wins / total * 100).toFixed(1) : '0.0';
  const flag    = netRs > 1424023 ? '  ✅ BEATS BASELINE' : netRs < 0 ? '  ❌' : '';

  console.log(
    `${v.name.padEnd(40)} ${('₹' + netRs.toLocaleString('en-IN')).padStart(11)} ${winPct.padStart(5)}% ${('₹' + maxDDRs.toLocaleString('en-IN')).padStart(10)} ${('₹' + avgDay.toLocaleString('en-IN')).padStart(9)}${flag}`
  );

  v._yearly = yearly;
  v._netRs  = netRs;
}

// ── Yearly breakdown ──────────────────────────────────────────────────────────
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
console.log('\n' + LINE);
console.log('YEARLY BREAKDOWN (₹)');
console.log(LINE);
console.log('Variant'.padEnd(40) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
console.log(LINE);

lastGroup = '';
for (const v of variants) {
  if (!v._yearly) continue;
  if (v.group !== lastGroup) { if (lastGroup) console.log(); lastGroup = v.group; }
  const row = v.name.padEnd(40)
    + years.map(y => {
        const rs = Math.round((v._yearly[y] || 0) * RS_PER_PT);
        return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
      }).join('')
    + ('  ₹' + v._netRs.toLocaleString('en-IN')).padStart(12);
  console.log(row);
}

console.log('\n' + LINE);
console.log('AMINA SL60+LockBE (cache) = ₹9,54,163  |  AMINA on full 33K = ₹14,24,023');
console.log(LINE);

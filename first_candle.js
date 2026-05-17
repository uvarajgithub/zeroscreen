/**
 * first_candle.js — First 15-Min Candle Direction Strategy
 *
 * Rules:
 *   Entry  : 9:30 AM — close of first 15-min candle (9:15–9:30)
 *   Signal : First candle GREEN → Buy CE (bullish)
 *            First candle RED   → Buy PE (bearish)
 *   Exit   : EOD (3:15 PM)
 *
 * SL Variants tested:
 *   SL1 — Low  of first candle (CE) / High of first candle (PE)
 *   SL2 — No SL at all (hold to EOD no matter what)
 *   SL3 — Fixed 50 pts (same as AMINA T1)
 *   SL4 — Fixed 100 pts
 *   SL5 — Low of first candle + RE-entry opposite if SL hit
 *
 * RS_PER_PT = 15 (30 qty × 0.5 delta)
 * Brokerage = 4 pts per trade
 *
 * BASELINE TO BEAT: ₹14,24,023 (AMINA SL_RE=60 LockBE)
 */

'use strict';
const fs = require('fs');
const CACHE     = require('fs').existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const BROKERAGE = 4; // pts per trade

// ── Load & enrich ─────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
const all = raw.map(c => ({
  day      : String(c.date).slice(0, 10),
  time     : String(c.date).slice(11, 16), // UTC time
  timeIST  : (() => { const d = new Date(c.date); d.setMinutes(d.getMinutes() + 330); return d.toISOString().slice(11,16); })(),
  open     : c.open,
  high     : c.high,
  low      : c.low,
  close    : c.close,
  bull     : c.close >= c.open,
}));

// Group by day
const byDay = {};
for (const c of all) {
  if (!byDay[c.day]) byDay[c.day] = [];
  byDay[c.day].push(c);
}
const allDates = Object.keys(byDay).sort();

console.log(`Loaded ${all.length} candles | ${allDates.length} trading days\n`);
console.log(`BASELINE TO BEAT: ₹14,24,023 (AMINA SL60+LockBE)\n`);

// ── Simulate one day ──────────────────────────────────────────────────────────
function isEOD(c) { return c.timeIST >= '15:00'; }

function simDay(candles, slMode) {
  // First candle = 09:15 candle (index 0)
  const c1 = candles[0];
  if (!c1 || c1.timeIST !== '09:15') return null; // no valid first candle

  const dir    = c1.bull ? 'CE' : 'PE';
  const entry  = c1.close; // enter at close of first candle (9:30 AM)

  // SL level
  let slPx = null;
  if (slMode === 'SL1_candle') {
    slPx = dir === 'CE' ? c1.low : c1.high;
  } else if (slMode === 'SL3_50pts') {
    slPx = dir === 'CE' ? entry - 50 : entry + 50;
  } else if (slMode === 'SL4_100pts') {
    slPx = dir === 'CE' ? entry - 100 : entry + 100;
  }
  // SL2 = no SL (slPx stays null)

  let pts = 0, exitReason = 'EOD';

  // Scan from candle 1 onwards (first candle already used for signal)
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];

    // Check SL
    if (slPx !== null) {
      const slHit = dir === 'CE' ? c.close <= slPx : c.close >= slPx;
      if (slHit) {
        pts       = dir === 'CE' ? slPx - entry : entry - slPx;
        exitReason = 'SL';
        break;
      }
    }

    // EOD exit
    if (isEOD(c)) {
      pts       = dir === 'CE' ? c.close - entry : entry - c.close;
      exitReason = 'EOD';
      break;
    }
  }

  const net = pts - BROKERAGE;
  return { dir, entry, pts, net, exitReason };
}

// SL1 with RE-entry: if SL1 hit, immediately reverse direction, hold to EOD
function simDayWithRE(candles) {
  const c1 = candles[0];
  if (!c1 || c1.timeIST !== '09:15') return null;

  const dir1   = c1.bull ? 'CE' : 'PE';
  const entry1 = c1.close;
  const sl1    = dir1 === 'CE' ? c1.low : c1.high;

  let t1Pts = 0, rePts = 0, reDir = null;
  let phase = 'T1';

  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];

    if (phase === 'T1') {
      const slHit = dir1 === 'CE' ? c.close <= sl1 : c.close >= sl1;
      if (slHit) {
        t1Pts = dir1 === 'CE' ? sl1 - entry1 : entry1 - sl1;
        // RE-entry opposite
        reDir         = dir1 === 'CE' ? 'PE' : 'CE';
        const reEntry = c.close;
        phase         = 'RE';
        // Continue from same candle
        let reFinal = 0;
        for (let j = i + 1; j < candles.length; j++) {
          const r = candles[j];
          if (isEOD(r)) { reFinal = reDir === 'CE' ? r.close - reEntry : reEntry - r.close; break; }
        }
        rePts = reFinal;
        break;
      }
      if (isEOD(c)) {
        t1Pts = dir1 === 'CE' ? c.close - entry1 : entry1 - c.close;
        break;
      }
    }
  }

  const trades = reDir ? 2 : 1;
  const net    = t1Pts + rePts - trades * BROKERAGE;
  return { dir1, t1Pts, rePts, net };
}

// ── Run all variants ──────────────────────────────────────────────────────────
const variants = [
  { name: 'SL1 — First candle low/high',       mode: 'SL1_candle',  fn: (cs) => simDay(cs, 'SL1_candle') },
  { name: 'SL2 — No SL (hold to EOD)',          mode: 'SL2_nosl',    fn: (cs) => simDay(cs, 'SL2_nosl') },
  { name: 'SL3 — Fixed 50 pts',                 mode: 'SL3_50pts',   fn: (cs) => simDay(cs, 'SL3_50pts') },
  { name: 'SL4 — Fixed 100 pts',                mode: 'SL4_100pts',  fn: (cs) => simDay(cs, 'SL4_100pts') },
  { name: 'SL1 + RE-entry opposite if SL hit',  mode: 'SL1+RE',      fn: (cs) => simDayWithRE(cs) },
];

console.log('─'.repeat(95));
console.log(`${'Variant'.padEnd(38)} ${'NetRs'.padStart(11)} ${'WinDays'.padStart(8)} ${'LossDays'.padStart(9)} ${'Win%'.padStart(6)} ${'MaxDD'.padStart(8)} ${'Avg/Day'.padStart(9)}`);
console.log('─'.repeat(95));

for (const v of variants) {
  let netPts  = 0;
  let wins = 0, losses = 0, noSignal = 0;
  let maxDD = 0, peak = 0, equity = 0;
  const yearly = {};

  for (const date of allDates) {
    const cs  = byDay[date];
    const res = v.fn(cs);
    if (!res) { noSignal++; continue; }

    netPts += res.net;
    equity += res.net;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;

    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = 0;
    yearly[yr] += res.net;

    if (res.net > 0) wins++; else losses++;
  }

  const total   = wins + losses;
  const netRs   = Math.round(netPts * RS_PER_PT);
  const maxDDRs = Math.round(maxDD * RS_PER_PT);
  const avgDay  = total ? Math.round(netRs / total) : 0;
  const winPct  = total ? (wins / total * 100).toFixed(1) : '0.0';

  const flag = netRs > 1424023 ? ' ✅ BEATS BASELINE' : netRs > 0 ? '' : ' ❌';
  console.log(
    `${v.name.padEnd(38)} ${('₹' + netRs.toLocaleString('en-IN')).padStart(11)} ${String(wins).padStart(8)} ${String(losses).padStart(9)} ${winPct.padStart(6)}% ${('₹' + maxDDRs.toLocaleString('en-IN')).padStart(8)} ${('₹' + avgDay.toLocaleString('en-IN')).padStart(9)}${flag}`
  );

  // Store for yearly breakdown
  v._yearly = yearly;
  v._netRs  = netRs;
  v._winPct = winPct;
}

// ── Yearly breakdown ──────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(95));
console.log('YEARLY BREAKDOWN (₹)');
console.log('─'.repeat(95));
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];
const header = 'Variant'.padEnd(38) + years.map(y => y.padStart(10)).join('') + '  Total'.padStart(12);
console.log(header);
console.log('─'.repeat(95));

for (const v of variants) {
  if (!v._yearly) continue;
  const row = v.name.padEnd(38)
    + years.map(y => {
        const rs = Math.round((v._yearly[y] || 0) * RS_PER_PT);
        return (rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN').padStart(10);
      }).join('')
    + ('  ₹' + v._netRs.toLocaleString('en-IN')).padStart(12);
  console.log(row);
}

// Reference row
console.log('─'.repeat(95));
console.log('AMINA SL60+LockBE [BASELINE]'.padEnd(38) + ' '.repeat(60) + '₹14,24,023'.padStart(12));
console.log('─'.repeat(95));

// ── Direction analysis ────────────────────────────────────────────────────────
console.log('\nFIRST CANDLE DIRECTION ACCURACY');
console.log('─'.repeat(50));
let bullDays = 0, bearDays = 0;
let bullWins = 0, bearWins = 0;

for (const date of allDates) {
  const cs  = byDay[date];
  const c1  = cs[0];
  if (!c1 || c1.timeIST !== '09:15') continue;

  const res = simDay(cs, 'SL2_nosl');
  if (!res) continue;

  if (c1.bull) { bullDays++; if (res.net > 0) bullWins++; }
  else         { bearDays++; if (res.net > 0) bearWins++; }
}

console.log(`Green first candle → CE: ${bullDays} days | Win ${(bullWins/bullDays*100).toFixed(1)}%`);
console.log(`Red   first candle → PE: ${bearDays} days | Win ${(bearWins/bearDays*100).toFixed(1)}%`);
console.log(`Overall: ${bullDays + bearDays} days | Win ${((bullWins+bearWins)/(bullDays+bearDays)*100).toFixed(1)}%`);

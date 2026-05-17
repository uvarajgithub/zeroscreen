/**
 * bb_percent.js — Bollinger Band %B Strategy Backtest + Last Day Analysis
 *
 * Config:
 *   Length = 20 candles  |  Multiplier = 2
 *   %B <= 0.0 → lower band (CE zone)
 *   %B >= 1.0 → upper band (PE zone)
 *
 * Entry rule (with candle confirmation):
 *   %B hits lower band → WAIT for first GREEN candle → enter CE at that close
 *   %B hits upper band → WAIT for first RED  candle → enter PE at that close
 *   (Green = close >= open, Red = close < open)
 *   If no confirming candle before EOD → no trade
 *
 * Example (May 13):
 *   09:15 %B=-0.052  RED candle  → lower band hit, waiting for green
 *   09:30 %B=-0.122  RED candle  → still waiting
 *   09:45 %B=+0.059  GREEN candle → ENTER CE at 53,407
 *
 * SL variants: SL1=50pts, SL2=100pts, SL3=150pts, No SL
 */
'use strict';
const fs = require('fs');
require('dotenv').config();

const CACHE     = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const RS_PER_PT = 15;
const BROKERAGE = 4;
const BB_LEN    = 20;
const BB_MULT   = 2;

// ── Load cache ────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
const allCandles = raw.map(c => ({
  day    : String(c.date).slice(0, 10),
  timeIST: (() => { const d = new Date(c.date); d.setMinutes(d.getMinutes() + 330); return d.toISOString().slice(11, 16); })(),
  open: c.open, high: c.high, low: c.low, close: c.close,
}));

// Sort all candles chronologically (they span multiple days)
allCandles.sort((a, b) => (a.day + a.timeIST) < (b.day + b.timeIST) ? -1 : 1);

const byDay = {};
for (const c of allCandles) { if (!byDay[c.day]) byDay[c.day] = []; byDay[c.day].push(c); }
const allDates = Object.keys(byDay).sort();
console.log(`Cache: ${CACHE} | ${allCandles.length} candles | ${allDates.length} days\n`);

// ── Bollinger Band %B calculation ─────────────────────────────────────────────
// Input: array of close prices (all candles in order, cross-day)
// Returns array of %B values (null for first 19 candles)
function calcBB(closes) {
  const result = new Array(closes.length).fill(null);
  for (let i = BB_LEN - 1; i < closes.length; i++) {
    const slice = closes.slice(i - BB_LEN + 1, i + 1);
    const mean  = slice.reduce((s, v) => s + v, 0) / BB_LEN;
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / BB_LEN;
    const std   = Math.sqrt(variance);
    const upper = mean + BB_MULT * std;
    const lower = mean - BB_MULT * std;
    result[i]   = std === 0 ? 0.5 : (closes[i] - lower) / (upper - lower);
  }
  return result;
}

// Pre-compute %B for ALL candles in chronological order
const allCloses = allCandles.map(c => c.close);
const allBB     = calcBB(allCloses);

// Attach %B to each candle
for (let i = 0; i < allCandles.length; i++) {
  allCandles[i].bb = allBB[i];
}

// ── Backtest ──────────────────────────────────────────────────────────────────
function isEOD(c) { return c.timeIST >= '15:00'; }

// slMode: 'candle' = entry candle low/high, 'fixed' = fixed pts, null = no SL
function runBacktest(slMode, slPts) {
  let net = 0, wins = 0, losses = 0, signals = 0, noConfirm = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};

  for (const date of allDates) {
    const cs = byDay[date];
    let traded = false;
    let watchDir = null; // 'CE' or 'PE' — waiting for confirming candle

    for (let i = 0; i < cs.length; i++) {
      if (traded) break;
      const c = cs[i];
      if (!c.bb || isEOD(c)) continue;

      // Check for new signal (only if not already watching)
      if (!watchDir) {
        if (c.bb <= 0.0) { watchDir = 'CE'; signals++; }
        else if (c.bb >= 1.0) { watchDir = 'PE'; signals++; }
      }

      if (!watchDir) continue;

      // Check if current candle is confirming
      const isGreen = c.close >= c.open;
      const confirms = (watchDir === 'CE' && isGreen) || (watchDir === 'PE' && !isGreen);
      if (!confirms) continue;

      // Enter at close of this confirming candle
      traded = true;
      const dir   = watchDir;
      const entry = c.close;
      // SL: candle low/high of the entry candle, fixed pts, or none
      let slPx = null;
      if (slMode === 'candle') slPx = dir === 'CE' ? c.low : c.high;
      else if (slMode === 'fixed') slPx = dir === 'CE' ? entry - slPts : entry + slPts;
      let pts = 0;

      for (let j = i + 1; j < cs.length; j++) {
        const r = cs[j];
        if (slPx && (dir === 'CE' ? r.low <= slPx : r.high >= slPx)) {
          pts = dir === 'CE' ? slPx - entry : entry - slPx; break;
        }
        if (isEOD(r)) { pts = dir === 'CE' ? r.close - entry : entry - r.close; break; }
      }

      const dayNet = pts - BROKERAGE;
      net    += dayNet;
      equity += dayNet;
      if (equity > peak) peak = equity;
      if (peak - equity > maxDD) maxDD = peak - equity;

      const yr = date.slice(0, 4);
      yearly[yr] = (yearly[yr] || 0) + dayNet;
      if (dayNet > 0) wins++; else losses++;
    }

    if (watchDir && !traded) noConfirm++;
  }

  const total = wins + losses;
  return {
    netRs  : Math.round(net * RS_PER_PT),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    winPct : total ? (wins / total * 100).toFixed(1) : '0',
    avgDay : total ? Math.round(net * RS_PER_PT / total) : 0,
    signals, wins, losses, noConfirm, yearly
  };
}

process.stdout.write('Running BB%B backtest');
const variants = [
  { name: 'Candle SL (low/high)', mode: 'candle', sl: null },
  { name: 'No SL (hold EOD)',     mode: null,     sl: null },
  { name: 'SL 50 pts',           mode: 'fixed',  sl: 50   },
  { name: 'SL 100 pts',          mode: 'fixed',  sl: 100  },
];
const results = variants.map(v => { process.stdout.write('.'); return { ...v, ...runBacktest(v.mode, v.sl) }; });
console.log(' done\n');

const LINE  = '─'.repeat(100);
const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

console.log('BOLLINGER BAND %B STRATEGY  (Length=20, Mult=2)');
console.log('%B <= 0.0 → CE  |  %B >= 1.0 → PE  |  Entry: next candle close');
console.log(LINE);
console.log(`${'Variant'.padEnd(20)} ${'Net ₹'.padStart(11)} ${'Win%'.padStart(6)} ${'MaxDD ₹'.padStart(10)} ${'Signals'.padStart(8)} ${'NoConfirm'.padStart(10)} ${'Avg/Day'.padStart(9)}`);
console.log(LINE);
for (const r of results) {
  const flag = r.netRs > 1117894 ? '  ✅ BEATS AMINA cache' : r.netRs < 0 ? '  ❌' : '';
  console.log(
    `${r.name.padEnd(20)} ${('₹' + r.netRs.toLocaleString('en-IN')).padStart(11)} ${r.winPct.padStart(5)}% ${('₹' + r.maxDDRs.toLocaleString('en-IN')).padStart(10)} ${String(r.signals).padStart(8)} ${String(r.noConfirm).padStart(10)} ${('₹' + r.avgDay.toLocaleString('en-IN')).padStart(9)}${flag}`
  );
}

console.log('\nYEARLY BREAKDOWN (₹)');
console.log('Variant'.padEnd(20) + years.map(y => y.padStart(11)).join('') + '   Total'.padStart(12));
console.log(LINE);
for (const r of results) {
  const row = r.name.padEnd(20)
    + years.map(y => {
        const rs = Math.round((r.yearly[y] || 0) * RS_PER_PT);
        return ((rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN')).padStart(11);
      }).join('')
    + ('  ₹' + r.netRs.toLocaleString('en-IN')).padStart(12);
  console.log(row);
}

// ── Last Day Analysis — fetch fresh from Kite API ────────────────────────────
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname:'api.kite.trade', path, headers:{'X-Kite-Version':'3','Authorization':`token ${API_KEY}:${ACCESS_TOKEN}`}, timeout:20000 }, res => {
      let buf = ''; res.on('data', d => buf += d); res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(e); } });
    }); req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); }); req.end();
  });
}

async function fetchRecent(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`).catch(()=>null);
  if (!r || r.status !== 'success') return [];
  return r.data.candles.map(([dt, open, high, low, close]) => ({
    date: String(dt).slice(0,10), time: String(dt).slice(11,16),
    open, high, low, close
  }));
}

(async () => {
  console.log('\n' + '═'.repeat(100));
  // Fetch last 25 trading days: from 2026-04-10 to today
  const today = new Date().toISOString().slice(0, 10);
  console.log(`LAST DAY ANALYSIS — fetching fresh from Kite API (up to ${today})`);
  console.log('═'.repeat(100));

  const recent = await fetchRecent('2026-04-10', today);
  if (!recent.length) { console.log('No data returned — check API_KEY/ACCESS_TOKEN in .env'); return; }

  recent.sort((a,b) => (a.date+a.time) < (b.date+b.time) ? -1 : 1);

  // Compute %B on the recent candles
  const closes3 = recent.map(c => c.close);
  const bb3 = calcBB(closes3);
  for (let i = 0; i < recent.length; i++) recent[i].bb = bb3[i];

  // Show all available dates
  const dates3 = [...new Set(recent.map(c => c.date))].sort();
  console.log(`Fetched ${recent.length} candles across ${dates3.length} days. Latest: ${dates3[dates3.length-1]}`);

  // Show last 3 trading days (or whichever exist)
  const showDays = dates3.slice(-3);
  for (const targetDate of showDays) {
    const dayCandles = recent.filter(c => c.date === targetDate);
    console.log(`\n${'─'.repeat(85)}`);
    console.log(`Date: ${targetDate} | ${dayCandles.length} candles`);
    console.log(`${'─'.repeat(85)}`);
    console.log(`${'Time'.padEnd(7)} ${'Candle'.padEnd(7)} ${'Open'.padStart(9)} ${'High'.padStart(9)} ${'Low'.padStart(9)} ${'Close'.padStart(9)} ${'%B'.padStart(7)}  Action`);
    console.log(`${'─'.repeat(85)}`);

    let watchDir3 = null, entered3 = false, slPx3 = null, dir3 = null, entryPx3 = null;
    for (const c of dayCandles) {
      const bbStr   = c.bb !== null ? c.bb.toFixed(3) : '  ---';
      const isGreen = c.close >= c.open;
      const color   = isGreen ? 'GREEN' : 'RED  ';

      let action = '';
      if (!entered3) {
        if (!watchDir3) {
          if (c.bb !== null && c.bb <= 0.0) { watchDir3 = 'CE'; action = '🔵 LOWER BAND → waiting for GREEN'; }
          else if (c.bb !== null && c.bb >= 1.0) { watchDir3 = 'PE'; action = '🔴 UPPER BAND → waiting for RED'; }
          else if (c.bb !== null && c.bb < 0.2) action = '↓ near lower';
          else if (c.bb !== null && c.bb > 0.8) action = '↑ near upper';
        } else {
          const confirms = (watchDir3 === 'CE' && isGreen) || (watchDir3 === 'PE' && !isGreen);
          if (confirms) {
            dir3 = watchDir3;
            entryPx3 = c.close;
            slPx3 = dir3 === 'CE' ? c.low : c.high;  // SL = entry candle low/high
            action = `⚡ ENTER ${dir3} @ ${entryPx3.toFixed(0)}  SL @ ${slPx3.toFixed(0)} (candle ${dir3==='CE'?'low':'high'})`;
            entered3 = true;
          } else {
            if (c.bb !== null && c.bb <= 0.0) action = `🔵 still lower band, waiting (${watchDir3})`;
            else if (c.bb !== null && c.bb >= 1.0) action = `🔴 still upper band, waiting (${watchDir3})`;
            else action = `waiting for ${watchDir3 === 'CE' ? 'GREEN' : 'RED'} candle (${watchDir3})`;
          }
        }
      } else {
        // Check SL hit using candle low/high
        const slHit = dir3 === 'CE' ? c.low <= slPx3 : c.high >= slPx3;
        if (slHit) {
          const pts = dir3 === 'CE' ? slPx3 - entryPx3 : entryPx3 - slPx3;
          action = `🛑 SL HIT @ ${slPx3.toFixed(0)}  P&L: ${pts.toFixed(0)} pts = ₹${Math.round(pts*RS_PER_PT).toLocaleString('en-IN')}  ← EXIT`;
          entered3 = false; // mark done
        } else if (isEOD(c)) {
          const pts = dir3 === 'CE' ? c.close - entryPx3 : entryPx3 - c.close;
          const pnl = Math.round(pts * RS_PER_PT);
          action = `🏁 EOD EXIT @ ${c.close.toFixed(0)}  P&L: ${pts.toFixed(0)} pts = ₹${pnl.toLocaleString('en-IN')} ${pnl >= 0 ? '✅' : '❌'}`;
        } else {
          const unrealised = dir3 === 'CE' ? c.close - entryPx3 : entryPx3 - c.close;
          action = `in trade  SL@${slPx3.toFixed(0)}  unrealised: ${unrealised>=0?'+':''}${unrealised.toFixed(0)} pts`;
        }
      }

      console.log(
        `${c.time.padEnd(7)} ${color.padEnd(7)} ${String(c.open.toFixed(0)).padStart(9)} ${String(c.high.toFixed(0)).padStart(9)} ${String(c.low.toFixed(0)).padStart(9)} ${String(c.close.toFixed(0)).padStart(9)} ${bbStr.padStart(7)}  ${action}`
      );
    }
    if (!entered3 && watchDir3) console.log(`\n  → NO TRADE: signal (${watchDir3}) but no confirming candle before EOD`);
    if (!entered3 && !watchDir3) console.log(`\n  → NO SIGNAL: %B stayed between 0 and 1 all day`);
  }

  console.log('\n' + LINE);
  console.log(`AMINA (cache) = ₹11,17,894  |  AMINA (full 33K) = ₹14,24,023`);
  console.log(LINE);
})();

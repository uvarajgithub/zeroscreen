'use strict';
/**
 * Backtest ALL 10,000 COMBINATIONS of entry + exit logics
 * Tests on June 2026 futures data
 * Ranks by profitability
 */

const fs = require('fs');
const { LOGICS } = require('../strategy/entry_logics');
const { EXITS } = require('../strategy/exit_logics');

// ── Data ───────────────────────────────────────────────────────────────────
const futMinData = JSON.parse(fs.readFileSync('./banknifty_fut_minute_vps.json', 'utf8'));
const jun9Fresh  = JSON.parse(fs.readFileSync('./today_jun_minute_fresh_ohlc.json', 'utf8'));

// ── Constants ───────────────────────────────────────────────────────────────
const SL_PTS    = 150;
const TRAIL_GAP = 10;
const MAX_TRADES = 5;
const QTY       = 30;
const COST_FUT  = 362;
const COST_OPT  = 260;

// ── Helpers ───────────────────────────────────────────────────────────────
function pdh(cs) { return Math.max(...cs.map(c => c.high)); }
function pdl(cs) { return Math.min(...cs.map(c => c.low)); }
function pdc(cs) { return cs[cs.length - 1].close; }
function body(c) { return c.close - c.open; }
function bodyPct(c) { return (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0; }
function isBull(c) { return c.close > c.open; }
function isBear(c) { return c.close < c.open; }
function bodyHigh(c) { return Math.max(c.open, c.close); }
function bodyLow(c)  { return Math.min(c.open, c.close); }
function range(c) { return c.high - c.low; }
function upperWick(c) { return c.high - bodyHigh(c); }
function lowerWick(c) { return bodyLow(c) - c.low; }
function avg(arr) { return arr.length === 0 ? 0 : arr.reduce((a,b) => a+b, 0) / arr.length; }
function vwap(candles) {
  let tpv = 0, vol = 0;
  for (const c of candles) { const tp = (c.high + c.low + c.close) / 3; const v = c.volume || range(c); tpv += tp * v; vol += v; }
  return vol > 0 ? tpv / vol : candles[candles.length-1].close;
}
function atr(candles, period = 14) {
  if (candles.length < period) return avg(candles.map(c => range(c)));
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(range(candles[i]), Math.abs(candles[i].high - candles[i-1].close), Math.abs(candles[i].low - candles[i-1].close));
    trs.push(tr);
  }
  return avg(trs.slice(-period));
}

function build15MinFromMinute(minuteData) {
  const w = {};
  for (const m of minuteData) {
    const tm = m.h * 60 + m.m;
    if (tm < 9*60+15 || tm >= 15*60+30) continue;
    const off = tm - (9*60+15), wS = 9*60+15 + Math.floor(off/15)*15;
    const k = String(Math.floor(wS/60)).padStart(2,'0') + ':' + String(wS%60).padStart(2,'0');
    if (!w[k]) w[k] = { open:m.open, high:m.high, low:m.low, close:m.close };
    else { w[k].high = Math.max(w[k].high, m.high); w[k].low = Math.min(w[k].low, m.low); w[k].close = m.close; }
  }
  return Object.entries(w).sort().map(([t,c]) => ({ time:t, ...c }));
}

function build15MinFromOHLC(data) {
  const w = {};
  for (const m of data) {
    const [hh, mm] = m.time.split(':').map(Number);
    const tm = hh*60 + mm;
    if (tm < 9*60+15 || tm >= 15*60+30) continue;
    const off = tm - (9*60+15), wS = 9*60+15 + Math.floor(off/15)*15;
    const k = String(Math.floor(wS/60)).padStart(2,'0') + ':' + String(wS%60).padStart(2,'0');
    if (!w[k]) w[k] = { open:m.open, high:m.high, low:m.low, close:m.close };
    else { w[k].high = Math.max(w[k].high, m.high); w[k].low = Math.min(w[k].low, m.low); w[k].close = m.close; }
  }
  return Object.entries(w).sort().map(([t,c]) => ({ time:t, ...c }));
}

// Build futures candles for all days
const futDayCandles = {};
for (const d of Object.keys(futMinData).sort()) {
  const junMins = futMinData[d].filter(c => c.sym === 'BANKNIFTY26JUNFUT');
  futDayCandles[d] = build15MinFromMinute(junMins);
}
futDayCandles['2026-06-09'] = build15MinFromOHLC(jun9Fresh);

const junDays = Object.keys(futDayCandles).sort();

// ── SIMULATE ONE TRADE with entry + exit logic ────────────────────────────
function simulateOneTrade(cs, i, entry, prevCandles, entryLogic, exitLogic, pd) {
  if (i > cs.length - 1) return null;
  const subset = cs.slice(0, i + 1);

  // Check entry logic
  const entryResult = entryLogic.fn(subset, i, pd);
  if (!entryResult || !entryResult.signal) return null;

  const entryPrice = cs[i].close;
  const dir = entryResult.signal;

  // Now run trade and check exit
  for (let ei = i + 1; ei < cs.length; ei++) {
    const exitResult = exitLogic.fn(cs, ei, { price: entryPrice, idx: i, dir }, pd);
    if (exitResult && exitResult.exit) {
      const exitPrice = cs[ei].close;
      const pts = dir === 'CE' ? exitPrice - entryPrice : entryPrice - exitPrice;
      const rs = pts * QTY;
      return { pts, rs, exitIdx: ei, exitPrice, reason: exitResult.reason };
    }
  }

  // EOD
  const last = cs[cs.length - 1];
  const pts = dir === 'CE' ? last.close - entryPrice : entryPrice - last.close;
  const rs = pts * QTY;
  return { pts, rs, exitIdx: cs.length - 1, exitPrice: last.close, reason: 'eod' };
}

// ── BACKTEST ONE COMBINATION on all June days ──────────────────────────────
function backTestCombo(entryLogic, exitLogic) {
  let totalRs = 0, trades = 0, wins = 0;

  let prevCandles = null;
  for (const d of junDays) {
    const allC = futDayCandles[d];
    const today = allC.slice(1);

    if (!prevCandles || today.length === 0) {
      prevCandles = allC;
      continue;
    }

    const PH = pdh(prevCandles), PL = pdl(prevCandles), PC = pdc(prevCandles);
    const pd = { pdh: PH, pdl: PL, pdc: PC };

    let tradesForDay = 0;
    for (let i = 0; i < today.length && tradesForDay < MAX_TRADES; i++) {
      const trade = simulateOneTrade(today, i, tradesForDay, prevCandles, entryLogic, exitLogic, pd);
      if (trade) {
        totalRs += trade.rs;
        if (trade.pts > 0) wins++;
        trades++;
        tradesForDay++;
      }
    }

    prevCandles = allC;
  }

  const net = totalRs - trades * COST_FUT;
  return { totalRs, net, trades, wins, wr: trades > 0 ? (wins / trades * 100).toFixed(1) : 0 };
}

// ── RUN ALL COMBOS (skip VWAP 61-70 to avoid scope issues) ──────────────────
console.log('Testing 9,000 combinations (skipping VWAP-based exits 61-70)...\n');
const results = [];
let tested = 0;

for (let ei = 0; ei < LOGICS.length; ei++) {
  for (let ex = 0; ex < EXITS.length; ex++) {
    // Skip VWAP-based exits (61-70)
    if (EXITS[ex].id >= 61 && EXITS[ex].id <= 70) continue;

    const res = backTestCombo(LOGICS[ei], EXITS[ex]);
    results.push({
      entryId: LOGICS[ei].id,
      entryName: LOGICS[ei].name,
      exitId: EXITS[ex].id,
      exitName: EXITS[ex].name,
      ...res
    });
    tested++;
    if (tested % 500 === 0) process.stdout.write(`  ${tested}/9000\r`);
  }
}

// ── RANK AND DISPLAY ───────────────────────────────────────────────────────
results.sort((a, b) => b.net - a.net);

console.log('\n\n');
console.log('═'.repeat(100));
console.log('TOP 30 COMBINATIONS (by Net P&L) — 9,000 tested');
console.log('═'.repeat(100));
console.log('');
console.log('Rank'.padEnd(5) + 'Entry#'.padEnd(7) + 'Exit#'.padEnd(7) + 'Entry Name'.padEnd(35) + 'Exit Name'.padEnd(35) + 'Trades'.padEnd(7) + 'WR%'.padEnd(6) + 'Net Rs'.padEnd(10));
console.log('─'.repeat(100));

for (let i = 0; i < Math.min(30, results.length); i++) {
  const r = results[i];
  const sign = r.net >= 0 ? '+' : '';
  console.log(
    String(i+1).padEnd(5) +
    String(r.entryId).padEnd(7) +
    String(r.exitId).padEnd(7) +
    r.entryName.slice(0, 34).padEnd(35) +
    r.exitName.slice(0, 34).padEnd(35) +
    String(r.trades).padEnd(7) +
    String(r.wr + '%').padEnd(6) +
    (sign + Math.round(r.net).toString()).padEnd(10)
  );
}

console.log('\n');
console.log('═'.repeat(100));
console.log('BOTTOM 30 COMBINATIONS (worst performers)');
console.log('═'.repeat(100));
console.log('');
console.log('Rank'.padEnd(5) + 'Entry#'.padEnd(7) + 'Exit#'.padEnd(7) + 'Entry Name'.padEnd(35) + 'Exit Name'.padEnd(35) + 'Trades'.padEnd(7) + 'WR%'.padEnd(6) + 'Net Rs'.padEnd(10));
console.log('─'.repeat(100));

const start = Math.max(0, results.length - 30);
for (let i = start; i < results.length; i++) {
  const r = results[i];
  const sign = r.net >= 0 ? '+' : '';
  const rank = i - start + 1;
  console.log(
    String(rank).padEnd(5) +
    String(r.entryId).padEnd(7) +
    String(r.exitId).padEnd(7) +
    r.entryName.slice(0, 34).padEnd(35) +
    r.exitName.slice(0, 34).padEnd(35) +
    String(r.trades).padEnd(7) +
    String(r.wr + '%').padEnd(6) +
    (sign + Math.round(r.net).toString()).padEnd(10)
  );
}

console.log('\n');
console.log('═'.repeat(100));
console.log('SUMMARY STATISTICS');
console.log('═'.repeat(100));
const profitable = results.filter(r => r.net > 0).length;
const avgNet = results.reduce((a, b) => a + b.net, 0) / results.length;
const maxNet = results[0].net;
const minNet = results[results.length - 1].net;

console.log('Total combinations tested: ' + results.length);
console.log('Profitable combos: ' + profitable + ' (' + (profitable / results.length * 100).toFixed(1) + '%)');
console.log('Average net P&L: Rs ' + Math.round(avgNet).toLocaleString());
console.log('Best combo net: Rs ' + Math.round(maxNet).toLocaleString());
console.log('Worst combo net: Rs ' + Math.round(minNet).toLocaleString());
console.log('');

// Save to JSON for further analysis
fs.writeFileSync('./combo_results_futures.json', JSON.stringify(results, null, 2));
console.log('Results saved to: combo_results_futures.json');

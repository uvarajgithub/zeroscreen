'use strict';
/**
 * Same 9,000 combos tested on OPTIONS
 * Black-Scholes ATM premium approximation
 */

const fs = require('fs');
const { LOGICS } = require('../strategy/entry_logics');
const { EXITS } = require('../strategy/exit_logics');

const futMinData = JSON.parse(fs.readFileSync('./banknifty_fut_minute_vps.json', 'utf8'));
const jun9Fresh  = JSON.parse(fs.readFileSync('./today_jun_minute_fresh_ohlc.json', 'utf8'));

const SL_PTS    = 150;
const MAX_TRADES = 5;
const QTY       = 30;
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

const futDayCandles = {};
for (const d of Object.keys(futMinData).sort()) {
  const junMins = futMinData[d].filter(c => c.sym === 'BANKNIFTY26JUNFUT');
  futDayCandles[d] = build15MinFromMinute(junMins);
}
futDayCandles['2026-06-09'] = build15MinFromOHLC(jun9Fresh);

const junDays = Object.keys(futDayCandles).sort();

// ── Black-Scholes ATM Premium ─────────────────────────────────────────────
function bsATMPremium(spot, daysToExpiry, iv = 0.18) {
  const T = daysToExpiry / 252;
  return spot * iv * Math.sqrt(T) / 2.507 * 100;
}

function estimateOptPnl(dir, entrySpot, exitSpot, daysToExpiry) {
  const delta = 0.45;
  const spotMove = dir === 'CE' ? (exitSpot - entrySpot) : (entrySpot - exitSpot);
  const entryPrem = bsATMPremium(entrySpot, daysToExpiry, 0.18);
  const rawPnl = delta * spotMove * QTY;
  return Math.max(-entryPrem * QTY * 0.01, rawPnl);
}

// ── Simulate trade ────────────────────────────────────────────────────────
function simulateOneTrade(cs, i, entry, prevCandles, entryLogic, exitLogic, pd) {
  if (i > cs.length - 1) return null;
  const subset = cs.slice(0, i + 1);

  const entryResult = entryLogic.fn(subset, i, pd);
  if (!entryResult || !entryResult.signal) return null;

  const entryPrice = cs[i].close;
  const dir = entryResult.signal;

  for (let ei = i + 1; ei < cs.length; ei++) {
    const exitResult = exitLogic.fn(cs, ei, { price: entryPrice, idx: i, dir }, pd);
    if (exitResult && exitResult.exit) {
      const exitPrice = cs[ei].close;
      const optPnl = estimateOptPnl(dir, entryPrice, exitPrice, 14);
      return { pnl: optPnl, exitIdx: ei, exitPrice, reason: exitResult.reason };
    }
  }

  const last = cs[cs.length - 1];
  const optPnl = estimateOptPnl(dir, entryPrice, last.close, 14);
  return { pnl: optPnl, exitIdx: cs.length - 1, exitPrice: last.close, reason: 'eod' };
}

// ── Backtest combo ────────────────────────────────────────────────────────
function backTestCombo(entryLogic, exitLogic) {
  let totalPnl = 0, trades = 0, wins = 0;

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
        totalPnl += trade.pnl;
        if (trade.pnl > 0) wins++;
        trades++;
        tradesForDay++;
      }
    }

    prevCandles = allC;
  }

  const net = totalPnl - trades * COST_OPT;
  return { totalPnl, net, trades, wins, wr: trades > 0 ? (wins / trades * 100).toFixed(1) : 0 };
}

// ── Run all combos ────────────────────────────────────────────────────────
console.log('Testing 9,000 combinations on OPTIONS (skipping VWAP 61-70)...\n');
const results = [];
let tested = 0;

for (let ei = 0; ei < LOGICS.length; ei++) {
  for (let ex = 0; ex < EXITS.length; ex++) {
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

// ── Rank and display ───────────────────────────────────────────────────────
results.sort((a, b) => b.net - a.net);

console.log('\n\n');
console.log('═'.repeat(100));
console.log('TOP 30 OPTIONS COMBINATIONS (by Net P&L) — 9,000 tested');
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
console.log('SUMMARY STATISTICS — OPTIONS');
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

fs.writeFileSync('./combo_results_options.json', JSON.stringify(results, null, 2));
console.log('Results saved to: combo_results_options.json');

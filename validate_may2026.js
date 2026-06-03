'use strict';
// validate_may2026.js — Detailed trade-by-trade proof for every May 2026 day
// Shows: candle OHLC + time, entry signal, entry price, peak, trail stop, exit, pts

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } = require('./dist/src/drishti_strategy.js');

const MAX_TRADES = 5;
const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

const TIMES = [
  '9:15','9:30','9:45','10:00','10:15','10:30','10:45',
  '11:00','11:15','11:30','11:45','12:00','12:15','12:30',
  '12:45','1:00','1:15','1:30','1:45','2:00',
  'C19','C20','C21','C22','C23','C24','C25'
];

function pad(s, n) { return String(s).padStart(n); }
function ppts(p)   { return (p >= 0 ? '+' : '') + p.toFixed(1); }

function simulateDayVerbose(date, todayCandles, prevCandles) {
  const state  = createDrishtiState();
  let tradeCount = 0, dayPts = 0;

  const lines = [];
  lines.push(`\n${'═'.repeat(72)}`);
  lines.push(`  ${date}   (prev-day close: ${prevCandles[prevCandles.length-1].close})`);
  lines.push(`${'═'.repeat(72)}`);
  lines.push(`  #   Time    Open      High      Low       Close     | Trade`);
  lines.push(`  ${'─'.repeat(68)}`);

  let tradeNum = 0;

  for (let i = 0; i < todayCandles.length; i++) {
    const c     = todayCandles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);
    const time  = TIMES[i] || `C${i}`;
    let note    = '';

    // Monitor active trade
    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts   = trail.peakPts;
      state.trailStop = trail.trailStop;

      const intrabarNote = `  IN TRADE | peak=${ppts(trail.peakPts)} trail=${ppts(trail.trailStop)} curr=${ppts(c.close - state.entry)}`;

      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        const exitPrice = state.entry + trail.pts;
        note = `  ← EXIT [${trail.action}] @ ~${exitPrice.toFixed(1)} | pts=${ppts(trail.pts)} | day_total=${ppts(dayPts)}`;
        lines.push(`  ${pad(i,2)}  ${pad(time,6)}  ${pad(c.open.toFixed(1),8)}  ${pad(c.high.toFixed(1),8)}  ${pad(c.low.toFixed(1),8)}  ${pad(c.close.toFixed(1),8)}${note}`);

        state.lastExitPts = trail.pts;
        state.lastExitIdx = i;
        state.lastExitDir = state.dir;
        if (trail.action !== 'EXIT_EOD') {
          // show SL level
          lines.push(`          SL was: entry(${state.entry.toFixed(1)}) - 150 = ${(state.entry-150).toFixed(1)} | peaked at +${trail.peakPts.toFixed(1)}`);
        }
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -150;
        tradeNum++;
        continue;
      }
      lines.push(`  ${pad(i,2)}  ${pad(time,6)}  ${pad(c.open.toFixed(1),8)}  ${pad(c.high.toFixed(1),8)}  ${pad(c.low.toFixed(1),8)}  ${pad(c.close.toFixed(1),8)}${intrabarNote}`);
      continue;
    }

    // Done for day
    if (tradeCount >= MAX_TRADES || isEOD) {
      lines.push(`  ${pad(i,2)}  ${pad(time,6)}  ${pad(c.open.toFixed(1),8)}  ${pad(c.high.toFixed(1),8)}  ${pad(c.low.toFixed(1),8)}  ${pad(c.close.toFixed(1),8)}`);
      continue;
    }

    // Look for entry / re-entry
    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade   = true;
      state.dir       = sig.side;
      state.entry     = c.close;
      state.entryIdx  = i;
      state.peakPts   = 0;
      state.trailStop = -150;
      state.firstDone = true;
      tradeCount++;
      const reLabel = tradeCount > 1 ? ` RE#${tradeCount-1}` : ' ENTRY';
      note = `  ← ${reLabel} ${sig.side} @ ${c.close.toFixed(1)} (reason:${sig.reason||'body_break'}) | SL=${(c.close-150).toFixed(1)}`;
    }

    lines.push(`  ${pad(i,2)}  ${pad(time,6)}  ${pad(c.open.toFixed(1),8)}  ${pad(c.high.toFixed(1),8)}  ${pad(c.low.toFixed(1),8)}  ${pad(c.close.toFixed(1),8)}${note}`);
  }

  // Force close if still in trade
  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    dayPts += trail.pts;
    lines.push(`          FORCED EOD EXIT | pts=${ppts(trail.pts)}`);
  }

  if (tradeCount === 0) {
    lines.push(`  → NO SIGNAL today`);
  }
  lines.push(`  ${'─'.repeat(68)}`);
  lines.push(`  RESULT: ${tradeCount} trade(s) | Day P&L = ${ppts(dayPts)} pts = ₹${(dayPts*15).toFixed(0)}`);

  return { dayPts, tradeCount, lines };
}

// ── Run for all May 2026 days ─────────────────────────────────────────────────
const MAY_DATES = dates.filter(d => d.startsWith('2026-05'));
let monthTotal = 0, monthTrades = 0, tradedDays = 0;

for (const date of MAY_DATES) {
  const di      = dates.indexOf(date);
  const today   = raw[date];
  const prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) {
    console.log(`\n[${date}] — SKIPPED (insufficient candles)`);
    continue;
  }
  const todayC = today.map(c => ({ ...c }));
  const prevC  = prevDay.map(c => ({ ...c }));

  const { dayPts, tradeCount, lines } = simulateDayVerbose(date, todayC, prevC);
  lines.forEach(l => console.log(l));

  monthTotal  += dayPts;
  monthTrades += tradeCount;
  if (tradeCount > 0) tradedDays++;
}

console.log(`\n${'═'.repeat(72)}`);
console.log(`  MAY 2026 SUMMARY`);
console.log(`  Traded days : ${tradedDays}`);
console.log(`  Total trades: ${monthTrades}`);
console.log(`  Month P&L   : ${ppts(monthTotal)} pts = ₹${(monthTotal*15).toFixed(0)}`);
console.log(`${'═'.repeat(72)}\n`);

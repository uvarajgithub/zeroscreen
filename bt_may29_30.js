'use strict';
// bt_may29_30.js — Simulate DRISHTI_V1 for May 29 + May 30 (2026)
// Uses compiled drishti_strategy.js from dist/ + Kite historical data
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail } = require('./dist/src/drishti_strategy.js');

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const SL_PTS   = 150;
const TRAIL_GAP = 10;
const MAX_TRADES = 5;
const LOT_SIZE   = 15;

async function getCandles(from, to) {
  const data = await kite.getHistoricalData(260105287, '15minute', from, to, false);
  return data.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close, date: c.date }));
}

function toIST(d) {
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600000);
  return ist.getUTCHours().toString().padStart(2,'0') + ':' + ist.getUTCMinutes().toString().padStart(2,'0');
}

function isMarketCandle(c) {
  const t = toIST(c.date);
  return t >= '09:15' && t <= '15:00';
}

function hr(n=68) { return '─'.repeat(n); }
function fmtPts(n) { return (n > 0 ? '+' : '') + n.toFixed(1); }

// ── Simulate one day ──────────────────────────────────────────────────────────
function simulateDay(todayCandles, prevCandles, dateLabel) {
  const candles = todayCandles.filter(isMarketCandle);
  const PH = Math.max(...prevCandles.map(c => c.high));
  const PL = Math.min(...prevCandles.map(c => c.low));

  let trades = [];
  let totalPts = 0;
  let tradeCount = 0;
  let firstDone = false;
  let lastExitIdx = -1;
  let lastExitDir = null;
  let lastExitPts = 0;

  // Active trade state
  let inTrade = false;
  let dir = null, entryPrice = 0, entryIdx = 0;
  let peakGain = 0;

  console.log(`\n${'═'.repeat(68)}`);
  console.log(` ${dateLabel}  |  PDH: ${PH.toFixed(0)}  PDL: ${PL.toFixed(0)}`);
  console.log('═'.repeat(68));
  console.log(` ${'C#'.padEnd(4)} ${'Time'.padEnd(7)} ${'Close'.padStart(9)} ${'Body%'.padStart(7)}  Event`);
  console.log(hr());

  for (let i = 0; i < candles.length; i++) {
    const c   = candles[i];
    const t   = toIST(c.date);
    const bPct = (c.high - c.low) > 0 ? Math.round((c.close - c.open) / (c.high - c.low) * 100) : 0;
    const partial = candles.slice(0, i + 1).map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close }));

    if (t >= '15:15') {
      // EOD — force close
      if (inTrade) {
        const gain = dir === 'PE' ? entryPrice - c.close : c.close - entryPrice;
        const locked = Math.max(-SL_PTS, Math.min(gain, peakGain > TRAIL_GAP ? peakGain - TRAIL_GAP : gain));
        totalPts += locked;
        trades.push({ n: tradeCount, dir, entry: entryPrice, exitPrice: c.close, pts: +locked.toFixed(1), reason: 'EOD' });
        console.log(` C${i.toString().padEnd(3)} ${t.padEnd(7)} ${c.close.toFixed(2).padStart(9)} ${(bPct > 0 ? '+' : '') + bPct + '%'}  ← ⏹ EOD EXIT | gain ${fmtPts(locked)} pts`);
        inTrade = false;
      }
      break;
    }

    let event = '';

    if (inTrade) {
      const gain = dir === 'PE' ? entryPrice - c.close : c.close - entryPrice;
      if (gain > peakGain) peakGain = gain;
      const trail = peakGain - TRAIL_GAP;

      // SL check
      if (gain <= -SL_PTS) {
        const exitPts = -SL_PTS;
        totalPts += exitPts;
        lastExitIdx = entryIdx; lastExitDir = dir; lastExitPts = exitPts;
        trades.push({ n: tradeCount, dir, entry: entryPrice, exitPrice: dir === 'PE' ? entryPrice + SL_PTS : entryPrice - SL_PTS, pts: exitPts, reason: 'SL' });
        event = `🛑 SL EXIT (−${SL_PTS} pts) | peak was ${fmtPts(peakGain)}`;
        inTrade = false; dir = null; peakGain = 0;
      }
      // Trail check
      else if (peakGain > TRAIL_GAP && gain < trail) {
        const exitPts = +trail.toFixed(1);
        totalPts += exitPts;
        lastExitIdx = entryIdx; lastExitDir = dir; lastExitPts = exitPts;
        trades.push({ n: tradeCount, dir, entry: entryPrice, exitPrice: dir === 'PE' ? entryPrice - exitPts : entryPrice + exitPts, pts: exitPts, reason: 'TRAIL' });
        event = `✅ TRAIL EXIT +${exitPts} pts`;
        inTrade = false; dir = null; peakGain = 0;
      } else {
        event = `  IN TRADE ${dir} | gain ${fmtPts(gain)} | peak ${fmtPts(peakGain)}`;
      }
    }

    if (!inTrade && tradeCount < MAX_TRADES) {
      let sig = null;
      if (!firstDone) {
        sig = findDrishtiEntry(partial, prevCandles.map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close })));
        if (sig && sig.idx === i) {
          firstDone = true; tradeCount++;
          dir = sig.side; entryPrice = c.close; entryIdx = i; peakGain = 0; inTrade = true;
          event = `🚀 ENTRY ${dir} @ ${c.close.toFixed(2)} (${sig.reason})`;
        }
      } else if (lastExitIdx >= 0 && lastExitDir) {
        sig = findDrishtiReEntry(partial, lastExitIdx, lastExitDir, true);
        if (sig && sig.idx === i) {
          tradeCount++;
          dir = sig.side; entryPrice = c.close; entryIdx = i; peakGain = 0; inTrade = true;
          event = `🔄 RE-ENTRY ${dir} @ ${c.close.toFixed(2)} (${sig.reason}) T${tradeCount}`;
        }
      }
    }

    const bStr = ((bPct > 0 ? '+' : '') + bPct + '%').padStart(7);
    if (event) console.log(` C${i.toString().padEnd(3)} ${t.padEnd(7)} ${c.close.toFixed(2).padStart(9)} ${bStr}  ← ${event}`);
    else        console.log(` C${i.toString().padEnd(3)} ${t.padEnd(7)} ${c.close.toFixed(2).padStart(9)} ${bStr}`);
  }

  console.log(hr());

  if (trades.length === 0) {
    console.log(` No trades — no entry signal fired`);
  } else {
    console.log(`\n Trades:`);
    for (const t of trades) {
      const sign = t.pts > 0 ? '+' : '';
      console.log(`  T${t.n} ${t.dir}: Entry ${t.entry.toFixed(2)} → Exit ${t.exitPrice.toFixed(2)} = ${sign}${t.pts} pts  [${t.reason}]`);
    }
  }
  console.log(`\n TOTAL: ${fmtPts(totalPts)} pts  |  ₹${(totalPts * LOT_SIZE).toFixed(0)} per lot`);
  console.log(`  (Actual on this day: 0 pts — bot was DOWN)`);
  return totalPts;
}

// ── Main ───────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('\n Loading BankNifty historical data...');
    const [may27, may28, may29, may30] = await Promise.all([
      getCandles('2026-05-27', '2026-05-27'),
      getCandles('2026-05-28', '2026-05-28'),
      getCandles('2026-05-29', '2026-05-29'),
      getCandles('2026-05-30', '2026-05-30'),
    ]);
    console.log(` May 27: ${may27.length} candles | May 28: ${may28.length} candles | May 29: ${may29.length} candles | May 30: ${may30.length} candles`);

    const p29 = simulateDay(may29, may28, 'May 29, 2026 (Thursday)');
    const p30 = simulateDay(may30, may29, 'May 30, 2026 (Friday)');

    const june1actual  = 27;
    const june1expected = 196;

    console.log(`\n${'═'.repeat(68)}`);
    console.log(' DRISHTI_V1 — 3-Day Summary (Fixed Bot vs Actual)');
    console.log('═'.repeat(68));
    console.log(` ${'Day'.padEnd(15)} ${'Actual'.padStart(10)} ${'Fixed Bot'.padStart(12)}  ${'Missed'.padStart(10)}`);
    console.log(hr());
    console.log(` ${'May 29'.padEnd(15)} ${'0 pts (down)'.padStart(10)} ${fmtPts(p29).padStart(12)}  ${fmtPts(p29 - 0).padStart(10)}`);
    console.log(` ${'May 30'.padEnd(15)} ${'0 pts (down)'.padStart(10)} ${fmtPts(p30).padStart(12)}  ${fmtPts(p30 - 0).padStart(10)}`);
    console.log(` ${'June 1'.padEnd(15)} ${('+' + june1actual + ' pts').padStart(10)} ${('+' + june1expected + ' pts (sim)').padStart(12)}  ${('+' + (june1expected - june1actual)).padStart(10)}`);
    console.log(hr());
    const totalActual  = 0 + 0 + june1actual;
    const totalExpected = p29 + p30 + june1expected;
    console.log(` ${'TOTAL'.padEnd(15)} ${('+' + totalActual + ' pts').padStart(10)} ${fmtPts(totalExpected).padStart(12)}  ${fmtPts(totalExpected - totalActual).padStart(10)}`);
    console.log(` ${'₹ per lot'.padEnd(15)} ${'₹' + (totalActual * LOT_SIZE).padStart(9)} ${'₹' + (totalExpected * LOT_SIZE).toFixed(0).padStart(11)}  ${'₹' + ((totalExpected - totalActual) * LOT_SIZE).toFixed(0).padStart(9)}`);
    console.log('═'.repeat(68));

  } catch (e) {
    console.error('Error:', e.message);
  }
})();

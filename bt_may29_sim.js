'use strict';
// bt_may29_sim.js — Simulate DRISHTI_V1 for May 29 (2026) using Yahoo data
// May 28 = market holiday (no data), May 30 = Saturday (no trading)
// Prev day for May 29 = May 27 (last trading day)

const https = require('https');
const { findDrishtiEntry, findDrishtiReEntry } = require('./dist/src/drishti_strategy.js');

const SL_PTS = 150, TRAIL_GAP = 10, MAX_TRADES = 5, LOT_SIZE = 15;

function fetchYahoo(from, to) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=15m&period1=${from}&period2=${to}`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const r = j.chart.result[0];
          const q = r.indicators.quote[0];
          const candles = r.timestamp.map((ts, i) => ({
            date: new Date(ts * 1000),
            open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i]
          })).filter(c => c.open && c.close);
          resolve(candles);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function toIST(d) {
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600000);
  return ist.getUTCHours().toString().padStart(2,'0') + ':' + ist.getUTCMinutes().toString().padStart(2,'0');
}
function dateIST(d) {
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600000);
  return ist.toISOString().slice(0,10);
}
function isMarket(c) { const t = toIST(c.date); return t >= '09:15' && t <= '15:00'; }
function hr(n=68)  { return '─'.repeat(n); }
function fmtP(n)   { return (n > 0 ? '+' : '') + n.toFixed(1); }

// ── Simulate one day ──────────────────────────────────────────────────────────
function simulateDay(todayCandles, prevCandles, label) {
  const today = todayCandles.filter(isMarket);
  const prev  = prevCandles.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
  const PH    = Math.max(...prev.map(c => c.high));
  const PL    = Math.min(...prev.map(c => c.low));

  let trades = [], totalPts = 0, tradeCount = 0;
  let firstDone = false, lastExitIdx = -1, lastExitDir = null;
  let inTrade = false, dir = null, entryPrice = 0, entryIdx = 0, peakGain = 0;

  console.log(`\n${'═'.repeat(68)}`);
  console.log(` ${label}  |  PDH:${PH.toFixed(0)}  PDL:${PL.toFixed(0)}  (${today.length} candles)`);
  console.log('═'.repeat(68));
  console.log(` ${'C#'.padEnd(4)} ${'Time'.padEnd(6)} ${'Close'.padStart(9)} ${'Body%'.padStart(7)}  Event`);
  console.log(hr());

  for (let i = 0; i < today.length; i++) {
    const c    = today[i];
    const t    = toIST(c.date);
    const bPct = (c.high - c.low) > 0 ? Math.round((c.close - c.open)/(c.high - c.low)*100) : 0;
    const partial = today.slice(0, i+1).map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close }));
    let event = '';

    if (inTrade) {
      const gain = dir === 'PE' ? entryPrice - c.close : c.close - entryPrice;
      if (gain > peakGain) peakGain = gain;
      const trail = peakGain - TRAIL_GAP;
      if (gain <= -SL_PTS) {
        const ep = -SL_PTS;
        totalPts += ep; lastExitIdx = entryIdx; lastExitDir = dir;
        trades.push({ n:tradeCount, dir, entry:entryPrice, pts:ep, reason:'SL' });
        event = `🛑 SL EXIT (−${SL_PTS} pts)`;
        inTrade = false; peakGain = 0;
      } else if (peakGain > TRAIL_GAP && gain < trail) {
        const ep = +trail.toFixed(1);
        totalPts += ep; lastExitIdx = entryIdx; lastExitDir = dir;
        trades.push({ n:tradeCount, dir, entry:entryPrice, pts:ep, reason:`TRAIL` });
        event = `✅ TRAIL EXIT +${ep} pts  (peak was +${peakGain.toFixed(1)})`;
        inTrade = false; peakGain = 0;
      } else {
        event = `  IN ${dir} | gain ${fmtP(gain)} | peak ${fmtP(peakGain)}`;
      }
    }

    // EOD close
    if (t >= '15:00' && inTrade) {
      const gain = dir === 'PE' ? entryPrice - c.close : c.close - entryPrice;
      const ep = Math.max(-SL_PTS, gain);
      totalPts += ep;
      trades.push({ n:tradeCount, dir, entry:entryPrice, pts:+ep.toFixed(1), reason:'EOD' });
      event = `⏹ EOD EXIT | ${fmtP(ep)} pts`;
      inTrade = false; peakGain = 0;
    }

    if (!inTrade && tradeCount < MAX_TRADES && t < '15:00') {
      if (!firstDone) {
        const sig = findDrishtiEntry(partial, prev);
        if (sig && sig.idx === i) {
          firstDone = true; tradeCount++; dir = sig.side;
          entryPrice = c.close; entryIdx = i; peakGain = 0; inTrade = true;
          event = `🚀 ENTRY ${dir} @ ${c.close.toFixed(2)}  (${sig.reason})`;
        }
      } else if (lastExitIdx >= 0 && lastExitDir) {
        const sig = findDrishtiReEntry(partial, lastExitIdx, lastExitDir, true);
        if (sig && sig.idx === i) {
          tradeCount++; dir = sig.side;
          entryPrice = c.close; entryIdx = i; peakGain = 0; inTrade = true;
          event = `🔄 RE-ENTRY ${dir} @ ${c.close.toFixed(2)}  T${tradeCount}  (${sig.reason})`;
        }
      }
    }

    const bStr = ((bPct > 0 ? '+' : '') + bPct + '%').padStart(7);
    console.log(` C${i.toString().padEnd(3)} ${t.padEnd(6)} ${c.close.toFixed(2).padStart(9)} ${bStr}${event ? '  ← ' + event : ''}`);
  }

  console.log(hr());
  if (trades.length === 0) { console.log(' No entry signal fired — 0 pts'); }
  else {
    for (const t of trades)
      console.log(`  T${t.n} ${t.dir}: Entry ${t.entry.toFixed(2)} → ${fmtP(t.pts)} pts  [${t.reason}]`);
  }
  console.log(` TOTAL: ${fmtP(totalPts)} pts  |  ₹${(totalPts*LOT_SIZE).toFixed(0)} per lot`);
  console.log(` Actual on this day: 0 pts (bot was DOWN/crashing)`);
  return totalPts;
}

// ── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    console.log('\n Fetching BankNifty data (Yahoo Finance)...');
    const from = Math.floor(new Date('2026-05-26T00:00:00Z').getTime()/1000);
    const to   = Math.floor(new Date('2026-06-02T00:00:00Z').getTime()/1000);
    const all  = await fetchYahoo(from, to);

    const byDay = {};
    for (const c of all) {
      const d = dateIST(c.date);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(c);
    }
    const days = Object.keys(byDay).sort();
    console.log(' Available days:', days.join(', '));

    // May 29: prev day = May 27 (last trading day; May 28 was holiday)
    const may27 = byDay['2026-05-27'] || [];
    const may29 = byDay['2026-05-29'] || [];
    const june1 = byDay['2026-06-01'] || [];

    if (!may29.length) { console.log('No May 29 data'); return; }

    const p29 = simulateDay(may29, may27, 'May 29, 2026 (Friday) — Bot was DOWN');

    // Note: May 30 = Saturday, no trading
    // June 1: already simulated separately (actual +27, sim +196)

    console.log(`\n${'═'.repeat(68)}`);
    console.log(' SUMMARY: DRISHTI_V1 since launch');
    console.log('═'.repeat(68));
    console.log(` ${'Day'.padEnd(16)} ${'Actual'.padStart(12)} ${'Fixed Bot (sim)'.padStart(16)}`);
    console.log(hr());
    console.log(` ${'May 28 (Thu)'.padEnd(16)} ${'HOLIDAY'.padStart(12)} ${'—'.padStart(16)}`);
    console.log(` ${'May 29 (Fri)'.padEnd(16)} ${'0 (bot DOWN)'.padStart(12)} ${fmtP(p29).padStart(16)}`);
    console.log(` ${'May 30 (Sat)'.padEnd(16)} ${'WEEKEND'.padStart(12)} ${'—'.padStart(16)}`);
    console.log(` ${'June 1 (Mon)'.padEnd(16)} ${'+27 pts'.padStart(12)} ${'+196 pts (sim)'.padStart(16)}`);
    console.log(hr());
    const totalActual   = 27;
    const totalExpected = p29 + 196;
    console.log(` ${'TOTAL'.padEnd(16)} ${('+' + totalActual + ' pts').padStart(12)} ${fmtP(totalExpected).padStart(16)}`);
    console.log(` ${'₹ per lot'.padEnd(16)} ${'₹' + (totalActual*LOT_SIZE).padStart(11)} ${'₹'+(totalExpected*LOT_SIZE).toFixed(0).padStart(15)}`);
    console.log('═'.repeat(68));
  } catch(e) {
    console.error('Error:', e.message, e.stack);
  }
})();

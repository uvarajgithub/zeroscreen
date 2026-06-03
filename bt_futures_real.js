'use strict';
// bt_futures_real.js
// BankNifty FUTURES simulation — clean, no options decay/delta/OTM
// P&L = index pts × 30 exactly. All real costs included.
// Strategy: DRISHTI_V1, candle-close exits, SL=150, TRAIL_GAP=10, MAX_TRADES=5

const fs  = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require('./dist/src/drishti_strategy.js');

const LOT         = 30;
const TRAIL_GAP   = 10;
const SL_PTS      = 150;
const MAX_TRADES  = 5;

// Real per-trade cost (Zerodha, BNF futures, avg contract ~45k × 30 = 13.5L)
// Brokerage=40, STT=135, Exchange=51, SEBI=3, Stamp=27, GST=16 = Rs 272 + Rs 180 slippage
const COST_PER_TRADE = 452;   // Rs per round-trip trade
const ROLLOVER_COST  = 1500;  // Rs per month (expiry rollover)

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

function simulateDay(todayCandles, prevCandles) {
  const state = createDrishtiState();
  let tradeCount = 0, dayPts = 0;
  const trades = [];

  for (let i = 0; i < todayCandles.length; i++) {
    const c      = todayCandles[i];
    const isEOD  = c.h > 15 || (c.h === 15 && c.m >= 30);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts   = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        dayPts += trail.pts;
        trades.push({ entry: state.entry, exitPts: trail.pts, reason: trail.action });
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null;
        state.peakPts = 0; state.trailStop = -SL_PTS;
      }
      continue;
    }

    if (tradeCount >= MAX_TRADES || isEOD) continue;

    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -SL_PTS;
      state.firstDone = true; tradeCount++;
    }
  }

  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    dayPts += trail.pts;
    trades.push({ entry: state.entry, exitPts: trail.pts, reason: 'EXIT_EOD' });
  }

  return { dayPts: parseFloat(dayPts.toFixed(1)), trades };
}

// ── Main loop ────────────────────────────────────────────────────────────────
const monthly = {};
let totalGrossPts = 0, totalGrossRs = 0, totalTrades = 0;
const allDays = [];

for (let di = 1; di < dates.length; di++) {
  const date    = dates[di];
  const today   = raw[date];
  const prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  const todayC = today.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close,
    h: new Date(c.date).getUTCHours(),
    m: new Date(c.date).getUTCMinutes()
  }));
  const prevC = prevDay.map(c => ({
    open: c.open, high: c.high, low: c.low, close: c.close
  }));

  const res = simulateDay(todayC, prevC);
  if (res.trades.length === 0) continue;

  const grossRs  = res.dayPts * LOT;
  const costRs   = res.trades.length * COST_PER_TRADE;
  const netRs    = grossRs - costRs;

  totalGrossPts += res.dayPts;
  totalGrossRs  += grossRs;
  totalTrades   += res.trades.length;

  const mon = date.slice(0, 7);
  if (!monthly[mon]) monthly[mon] = {
    grossPts: 0, grossRs: 0, netRs: 0, costs: 0,
    W: 0, L: 0, days: 0, trades: 0
  };
  monthly[mon].grossPts += res.dayPts;
  monthly[mon].grossRs  += grossRs;
  monthly[mon].netRs    += netRs;
  monthly[mon].costs    += costRs;
  monthly[mon].days     += 1;
  monthly[mon].trades   += res.trades.length;
  if (netRs > 0) monthly[mon].W++;
  else if (netRs < 0) monthly[mon].L++;

  allDays.push({ date, grossPts: res.dayPts, grossRs, costRs, netRs, tradeCount: res.trades.length });
}

// ── Output ───────────────────────────────────────────────────────────────────
const fmt  = n => Math.round(n).toLocaleString('en-IN');
const pad  = (s, n) => String(s).padStart(n);

const months = Object.keys(monthly).sort();
const totalNetRs = months.reduce((s, m) => s + monthly[m].netRs - ROLLOVER_COST, 0);
const totalCosts = totalTrades * COST_PER_TRADE + months.length * ROLLOVER_COST;

console.log('\n' + '═'.repeat(74));
console.log('  DRISHTI_V1 — BankNifty FUTURES  |  REAL SIMULATION');
console.log('  No options decay. No delta. No OTM. P&L = index pts × 30 EXACT.');
console.log('  Costs: Rs 452/trade (STT+brokerage+slippage) + Rs 1,500/month rollover');
console.log('═'.repeat(74));
console.log('\nMonth    | Gross Pts | Gross Rs    | Costs Rs   | NET Rs      | WR%');
console.log('─'.repeat(74));

let cumNet = 0;
for (const m of months) {
  const r    = monthly[m];
  const net  = r.netRs - ROLLOVER_COST;
  cumNet    += net;
  const wr   = r.W + r.L > 0 ? ((r.W / (r.W + r.L)) * 100).toFixed(0) : '-';
  const sign = net >= 0 ? '+' : '';
  console.log(
    m + ' | ' +
    pad(r.grossPts.toFixed(1), 9) + ' | ' +
    ('+Rs ' + fmt(r.grossRs)).padStart(12) + ' | ' +
    ('-Rs ' + fmt(r.costs + ROLLOVER_COST)).padStart(11) + ' | ' +
    (sign + 'Rs ' + fmt(net)).padStart(12) + ' | ' +
    wr + '%'
  );
}

console.log('─'.repeat(74));
console.log(
  'TOTAL    | ' +
  pad(totalGrossPts.toFixed(1), 9) + ' | ' +
  ('+Rs ' + fmt(totalGrossRs)).padStart(12) + ' | ' +
  ('-Rs ' + fmt(totalCosts)).padStart(11) + ' | ' +
  ('+Rs ' + fmt(totalNetRs)).padStart(12)
);

const tradingDays = allDays.length;
const winDays  = allDays.filter(d => d.netRs > 0).length;
const lossDays = allDays.filter(d => d.netRs < 0).length;
const flatDays = allDays.filter(d => d.netRs === 0).length;
const avgNet   = totalNetRs / months.length;

// Worst drawdown (monthly)
let peak = 0, maxDD = 0, runningNet = 0;
for (const m of months) {
  runningNet += monthly[m].netRs - ROLLOVER_COST;
  if (runningNet > peak) peak = runningNet;
  const dd = peak - runningNet;
  if (dd > maxDD) maxDD = dd;
}

console.log('\n' + '═'.repeat(74));
console.log('  SUMMARY');
console.log('═'.repeat(74));
console.log('  Net 5-yr P&L         : +Rs ' + fmt(totalNetRs));
console.log('  Net monthly avg      : +Rs ' + fmt(avgNet));
console.log('  Gross monthly avg    : +Rs ' + fmt(totalGrossRs / months.length));
console.log('  Cost per month avg   :  -Rs ' + fmt(totalCosts / months.length));
console.log('');
console.log('  Win days (net)       : ' + winDays + ' / ' + tradingDays + '  (' + (winDays/tradingDays*100).toFixed(1) + '%)');
console.log('  Loss days (net)      : ' + lossDays + ' / ' + tradingDays + '  (' + (lossDays/tradingDays*100).toFixed(1) + '%)');
console.log('  Avg trades/day       : ' + (totalTrades/tradingDays).toFixed(2));
console.log('  Total trades 5yr     : ' + totalTrades);
console.log('');
console.log('  Best day (net)       : +Rs ' + fmt(Math.max(...allDays.map(d => d.netRs))));
console.log('  Worst day (net)      :  Rs ' + fmt(Math.min(...allDays.map(d => d.netRs))));
console.log('  Max monthly drawdown :  Rs ' + fmt(maxDD));
console.log('');
console.log('  WHY FUTURES BEATS OPTIONS:');
console.log('  ✓ P&L = exact index pts × 30 — no delta, no theta, no OTM surprise');
console.log('  ✓ Exit at candle close — strategy designed for this');
console.log('  ✓ No LTP monitor needed — no re-entry cutting');
console.log('  ✓ Slippage is low (3 pts each side on liquid futures)');
console.log('  ✗ Higher margin needed vs options (~Rs 1.75L per lot)');
console.log('═'.repeat(74));

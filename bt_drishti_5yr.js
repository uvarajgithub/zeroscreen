'use strict';
// bt_drishti_5yr.js — DRISHTI_V1 full 5-year backtest
// Uses cache/banknifty_5yr.json + compiled dist/src/drishti_strategy.js
// SL=100 pts | TRAIL_GAP=10 (LOCK10) | MAX_TRADES=5/day | DAILY_LOSS_CAP=200

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } = require('./dist/src/drishti_strategy.js');

const MAX_TRADES    = 5;
const DAILY_LOSS_CAP = 200;  // stop after 2 SL hits — matches live bot user-settings.json
const RS_PER_PT     = 30;   // 30 qty x 1.0 (futures, delta=1.0) = 1 lot
const RISK_FREE     = 0.07; // 7% annual risk-free rate for fair premium calc

// ── Fair futures premium calculator ─────────────────────────────────────────
// Returns days-to-expiry for a given date (BankNifty monthly = last Thursday of month)
function getDTE(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear(), month = d.getMonth();
  // Find last Thursday of same month
  const lastDay = new Date(year, month + 1, 0);  // last day of month
  const dow = lastDay.getDay();  // 0=Sun, 4=Thu
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - ((dow >= 4 ? dow - 4 : dow + 3)));
  // If already past expiry this month, use next month's expiry
  const expiry = d >= lastThursday ? new Date(year, month + 2, 0) : lastThursday;
  if (d >= expiry) {
    const nm = new Date(year, month + 2, 0);
    const ndow = nm.getDay();
    nm.setDate(nm.getDate() - (ndow >= 4 ? ndow - 4 : ndow + 3));
    return Math.max(1, Math.ceil((nm - d) / 86400000));
  }
  return Math.max(1, Math.ceil((expiry - d) / 86400000));
}

// Fair futures price = index × (1 + risk_free × DTE / 365)
function fairPremium(indexPrice, dte) {
  return Math.round(indexPrice * RISK_FREE * dte / 365);
}

// ── Load data ────────────────────────────────────────────────────────────────
const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();   // chronological order

// ── Results storage ──────────────────────────────────────────────────────────
let totalPts = 0, totalFutPts = 0, wins = 0, losses = 0, tradedDays = 0, totalTrades = 0, totalRE = 0;
let maxDD = 0, peak = 0, maxWin = 0, maxLoss = 0;
let consec = 0, maxConsecW = 0, maxConsecL = 0, lastResult = 0;
const byYear = {}, byMonth = {}, byCandle = {}, byReason = {};
const monthlyRows = [];
const dailyResults = {};  // date → dayPts

// ── Simulate one trading day ─────────────────────────────────────────────────
function simulateDay(todayCandles, prevCandles, dte) {
  const state  = createDrishtiState();
  let tradeCount = 0, dayPts = 0, dayFutPts = 0;
  let tradesLog = [];

  // PDR filter — skip first entry on low-volatility days (matches live bot)
  const _pdrH = prevCandles.length > 0 ? Math.max(...prevCandles.map(c => c.high)) : 0;
  const _pdrL = prevCandles.length > 0 ? Math.min(...prevCandles.map(c => c.low))  : 0;
  const _pdrOk = _pdrH > 0 && _pdrL > 0 && (_pdrH - _pdrL) >= 150;

  for (let i = 0; i < todayCandles.length; i++) {
    const c     = todayCandles[i];
    // Match live bot: EOD fires when 3:15 PM candle closes (at 3:30 PM real time)
    // h/m present in old data; new data uses candle index (last candle = EOD)
    const isEOD = c.h !== undefined
      ? (c.h > 15 || (c.h === 15 && c.m >= 15))
      : (i === todayCandles.length - 1);
    const partial = todayCandles.slice(0, i + 1);

    // ── 1. Monitor active trade ───────────────────────────────────────────
    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts   = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        // Index-based P&L (backtest standard)
        const idxPts = trail.pts;
        dayPts     += idxPts;
        totalPts   += idxPts;
        totalTrades++;
        if (idxPts > maxWin)  maxWin  = idxPts;
        if (idxPts < maxLoss) maxLoss = idxPts;

        // Futures-based P&L with fair premium (new)
        // entry futures = state.entry + fairPrem(entry)
        // exit futures  = trail.exitPrice + fairPrem(exit)
        // Both same day → DTE is same → premium change = (exitPrice - entry) × RISK_FREE × DTE/365
        const _prem = fairPremium(state.entry, dte);
        const _futEntry = state.entry + _prem;
        const _futExit  = trail.exitPrice + fairPremium(trail.exitPrice, dte);
        const _futPts   = state.dir === 'CE' ? _futExit - _futEntry : _futEntry - _futExit;
        dayFutPts  += _futPts;
        totalFutPts += _futPts;

        tradesLog.push({ dir: state.dir, entry: state.entry, pts: idxPts, futPts: _futPts, entryCandle: state.entryIdx, exitCandle: i, reason: trail.action });
        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -150;
        if (dayPts <= -DAILY_LOSS_CAP) break;  // daily loss cap — stop for today
      }
      continue;  // don't look for entries while in trade
    }

    // ── 2. Done for day ───────────────────────────────────────────────────
    if (tradeCount >= MAX_TRADES || isEOD || dayPts <= -DAILY_LOSS_CAP) continue;

    // ── 3. Look for entry / re-entry ─────────────────────────────────────
    let sig = null;
    if (!state.firstDone) {
      if (!_pdrOk) continue;  // PDR filter — skip first entry on low-vol days
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
      if (tradeCount > 1) totalRE++;

      // Track by candle and reason
      if (!byCandle[i]) byCandle[i] = { W: 0, L: 0, pts: 0, sl: 0 };
      if (!byReason[sig.reason]) byReason[sig.reason] = { W: 0, L: 0, pts: 0, count: 0 };
      byReason[sig.reason].count++;
    }
  }

  // ── 4. Force-close any trade still open at end of day (EOD missed?) ──
  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    const idxPts = trail.pts;
    dayPts     += idxPts;
    totalPts   += idxPts;
    totalTrades++;
    const _prem = fairPremium(state.entry, dte);
    const _futPts = state.dir === 'CE'
      ? (trail.exitPrice + fairPremium(trail.exitPrice, dte)) - (state.entry + _prem)
      : (state.entry + _prem) - (trail.exitPrice + fairPremium(trail.exitPrice, dte));
    dayFutPts  += _futPts;
    totalFutPts += _futPts;
    tradesLog.push({ dir: state.dir, entry: state.entry, pts: idxPts, futPts: _futPts, entryCandle: state.entryIdx, exitCandle: todayCandles.length - 1, reason: 'EXIT_EOD_FORCED' });
  }

  // Update byCandle stats
  for (const t of tradesLog) {
    const ci = t.entryCandle;
    if (!byCandle[ci]) byCandle[ci] = { W: 0, L: 0, pts: 0, sl: 0 };
    byCandle[ci].pts += t.pts;
    if (t.pts > 0)      byCandle[ci].W++;
    else                byCandle[ci].L++;
    if (t.pts <= -150)  byCandle[ci].sl++;
    if (byReason[tradesLog.find(x=>x.entryCandle===ci)?.reason ?? '']) {
      const r = byReason[tradesLog.find(x=>x.entryCandle===ci)?.reason ?? ''];
      if (r) { r.pts += t.pts; if (t.pts > 0) r.W++; else r.L++; }
    }
  }

  return { dayPts, dayFutPts, trades: tradeCount, tradesLog };
}

// ── Main loop ─────────────────────────────────────────────────────────────────
console.log('\nDRISHTI_V1 — 5-Year Backtest');
console.log('SL=100 pts | TRAIL_GAP=10 (LOCK10) | MAX_TRADES=5/day | DAILY_LOSS_CAP=200 | PDR>=150 filter');
console.log('Data: ' + dates[0] + ' → ' + dates[dates.length - 1]);
console.log('─'.repeat(70));

for (let di = 1; di < dates.length; di++) {
  const date    = dates[di];
  const today   = raw[date];
  const prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  // Skip 9:15 AM candle — matches live bot which seeds it and starts C0 from 9:30 AM
  // Add h/m from index for candles that lack timestamp fields (recent cache data)
  const todayC = today.slice(1).map((c, i) => {
    const totalMin = 9*60 + 30 + i*15;  // C0=9:30, C1=9:45, ..., C23=3:15
    return { open:c.open, high:c.high, low:c.low, close:c.close,
             h: c.h !== undefined ? c.h : Math.floor(totalMin/60),
             m: c.m !== undefined ? c.m : totalMin % 60 };
  });
  const prevC  = prevDay.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));

  const dte = getDTE(date);
  const { dayPts, dayFutPts, trades } = simulateDay(todayC, prevC, dte);
  if (trades === 0) continue;

  dailyResults[date] = parseFloat(dayPts.toFixed(1));
  tradedDays++;
  const yr  = date.slice(0, 4);
  const mon = date.slice(0, 7);

  if (!byYear[yr])  byYear[yr]  = { pts: 0, W: 0, L: 0, days: 0 };
  if (!byMonth[mon]) byMonth[mon] = { pts: 0, W: 0, L: 0, days: 0 };

  if (dayPts > 0) {
    wins++;
    byYear[yr].W++; byMonth[mon].W++;
    if (lastResult <= 0) consec = 0;
    consec++;
    if (consec > maxConsecW) maxConsecW = consec;
    lastResult = 1;
  } else if (dayPts < 0) {
    losses++;
    byYear[yr].L++; byMonth[mon].L++;
    if (lastResult >= 0) consec = 0;
    consec++;
    if (consec > maxConsecL) maxConsecL = consec;
    lastResult = -1;
  } else {
    lastResult = 0;
  }

  byYear[yr].pts  += dayPts; byYear[yr].days++;
  byMonth[mon].pts += dayPts; byMonth[mon].days++;

  totalPts += 0;  // already added inside simulateDay
  peak = Math.max(peak, totalPts);
  const dd = peak - totalPts;
  if (dd > maxDD) maxDD = dd;
}

// ── Print results ─────────────────────────────────────────────────────────────
const totalDays = dates.length - 1;
const WR   = tradedDays > 0 ? (wins / tradedDays * 100).toFixed(1) : 0;
const avgD = tradedDays > 0 ? (totalPts / tradedDays).toFixed(1) : 0;

const avgFutD = tradedDays > 0 ? (totalFutPts / tradedDays).toFixed(1) : 0;
const premDelta = totalFutPts - totalPts;
const premDeltaPct = totalPts > 0 ? (premDelta / totalPts * 100).toFixed(2) : 0;

console.log('\n' + '═'.repeat(70));
console.log(' DRISHTI_V1 — FULL RESULTS');
console.log('═'.repeat(70));
console.log(` ── INDEX-BASED (backtest, no premium) ──`);
console.log(` P&L:         ${totalPts > 0 ? '+' : ''}${totalPts.toFixed(1)} pts  =  ₹${(totalPts * RS_PER_PT).toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log(` Avg per day: ${avgD} pts = ₹${(parseFloat(avgD) * RS_PER_PT).toFixed(0)}`);
console.log('');
console.log(` ── FUTURES-BASED (fair premium = index × 7% × DTE/365) ──`);
console.log(` P&L:         ${totalFutPts > 0 ? '+' : ''}${totalFutPts.toFixed(1)} pts  =  ₹${(totalFutPts * RS_PER_PT).toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log(` Avg per day: ${avgFutD} pts = ₹${(parseFloat(avgFutD) * RS_PER_PT).toFixed(0)}`);
console.log(` Premium delta (5yr): ${premDelta > 0 ? '+' : ''}${premDelta.toFixed(0)} pts = ₹${(premDelta*RS_PER_PT).toLocaleString('en-IN',{maximumFractionDigits:0})}  (${premDeltaPct}% of index)`);
console.log('');
console.log(` Win rate:    ${WR}%  (${wins}W / ${losses}L / ${tradedDays - wins - losses} flat)`);
console.log(` Traded days: ${tradedDays} / ${totalDays} total`);
console.log(` Total trades:${totalTrades}  |  Re-entries: ${totalRE}`);
console.log(` Max DD:      ${maxDD.toFixed(1)} pts = ₹${(maxDD * RS_PER_PT).toFixed(0)}`);
console.log(` Max win:     +${maxWin.toFixed(1)} pts = ₹${(maxWin * RS_PER_PT).toFixed(0)}`);
console.log(` Max loss:    ${maxLoss.toFixed(1)} pts = ₹${(maxLoss * RS_PER_PT).toFixed(0)}`);
console.log(` Max consec W: ${maxConsecW}  |  Max consec L: ${maxConsecL}`);
console.log('═'.repeat(70));

// ── Year breakdown ────────────────────────────────────────────────────────────
console.log('\n BY YEAR');
console.log('─'.repeat(55));
console.log(` ${'Year'.padEnd(6)} ${'P&L (pts)'.padStart(12)} ${'₹'.padStart(12)} ${'W'.padStart(5)} ${'L'.padStart(5)} ${'WR'.padStart(7)} ${'Days'.padStart(6)}`);
console.log('─'.repeat(55));
for (const yr of Object.keys(byYear).sort()) {
  const y = byYear[yr];
  const wr = (y.W / (y.W + y.L) * 100).toFixed(0) + '%';
  const ps = (y.pts > 0 ? '+' : '') + y.pts.toFixed(0);
  const rs = '₹' + (y.pts * RS_PER_PT).toFixed(0);
  console.log(` ${yr.padEnd(6)} ${ps.padStart(12)} ${rs.padStart(12)} ${y.W.toString().padStart(5)} ${y.L.toString().padStart(5)} ${wr.padStart(7)} ${y.days.toString().padStart(6)}`);
}

// ── Month breakdown ───────────────────────────────────────────────────────────
console.log('\n BY MONTH (last 12)');
console.log('─'.repeat(55));
const months = Object.keys(byMonth).sort().slice(-12);
for (const mon of months) {
  const m = byMonth[mon];
  const wr = m.W + m.L > 0 ? (m.W / (m.W + m.L) * 100).toFixed(0) + '%' : '—';
  const ps = (m.pts > 0 ? '+' : '') + m.pts.toFixed(0);
  const rs = '₹' + (m.pts * RS_PER_PT).toFixed(0);
  console.log(` ${mon}  ${ps.padStart(10)} pts  ${rs.padStart(12)}  ${m.W}W ${m.L}L  ${wr.padStart(5)}`);
}

// ── By candle breakdown ───────────────────────────────────────────────────────
const times = {0:'9:30',1:'9:45',2:'10:00',3:'10:15',4:'10:30',5:'10:45',6:'11:00',7:'11:15',8:'11:30',9:'11:45',10:'12:00',11:'12:15',12:'12:30',13:'12:45',14:'1:00',15:'1:15',16:'1:30',17:'1:45',18:'2:00'};
console.log('\n BY CANDLE (entry distribution)');
console.log('─'.repeat(65));
console.log(` ${'C#'.padEnd(4)} ${'Time'.padEnd(7)} ${'Entries'.padStart(8)} ${'W'.padStart(5)} ${'L'.padStart(5)} ${'WR'.padStart(7)} ${'SL hits'.padStart(8)} ${'Pts'.padStart(10)}`);
console.log('─'.repeat(65));
for (const ci of Object.keys(byCandle).map(Number).sort((a,b)=>a-b)) {
  const bc = byCandle[ci];
  const total = bc.W + bc.L;
  if (total === 0) continue;
  const wr = (bc.W / total * 100).toFixed(0) + '%';
  const t  = times[ci] || `C${ci}`;
  const ps = (bc.pts > 0 ? '+' : '') + bc.pts.toFixed(0);
  console.log(` C${ci.toString().padEnd(3)} ${t.padEnd(7)} ${total.toString().padStart(8)} ${bc.W.toString().padStart(5)} ${bc.L.toString().padStart(5)} ${wr.padStart(7)} ${bc.sl.toString().padStart(8)} ${ps.padStart(10)}`);
}

// ── Write 5year-backtest-result.json for dashboard ───────────────────────────
const monthly = {};
for (const [mon, m] of Object.entries(byMonth)) {
  monthly[mon] = { bbTotal: parseFloat(m.pts.toFixed(1)), bbTrades: m.W + m.L, bbWins: m.W };
}

// Build noTradeDays as array of {date} objects (server expects iterable)
const noTradeDaysArr = [];
for (let di = 1; di < dates.length; di++) {
  const date = dates[di];
  if (!dailyResults[date]) noTradeDaysArr.push({ date });
}

// Build daily as array of {date, bbPnL} objects (server does .filter() on it)
const dailyArr = Object.entries(dailyResults)
  .sort((a, b) => (a[0] < b[0] ? -1 : 1))
  .map(([date, pts]) => ({ date, bbPnL: pts }));

const result = {
  totals: { bodyBreakout: parseFloat(totalPts.toFixed(1)) },
  tradingDays: totalDays,
  tradedDays,
  winRate: parseFloat(WR),
  period: { from: dates[0], to: dates[dates.length - 1] },
  monthly,
  daily: dailyArr,
  noTradeDays: noTradeDaysArr
};

fs.writeFileSync('./5year-backtest-result.json', JSON.stringify(result, null, 2));
console.log('\n ✅ 5year-backtest-result.json updated for dashboard.');

// ── REAL FUTURES COST BREAKDOWN ───────────────────────────────────────────────
// Cost per trade (Zerodha BankNifty Futures, 1 lot = 30 qty, avg contract ~₹48k×30=₹14.4L):
//   STT on sell side : 0.01% × 14.4L = ₹144
//   Brokerage        : ₹20 × 2       = ₹40
//   Exchange + SEBI  :                  ₹30
//   Slippage         : 3 pts × 2 × 30 = ₹180
//   ─────────────────────────────────────────
//   Total per trade  :                  ₹394  (use ₹400 round number)
const COST_PER_TRADE = 400;
const ROLLOVER_PER_MONTH = 1500;   // monthly futures rollover
const months5yr = Object.keys(byMonth).length;
const grossRs = totalPts * RS_PER_PT;
const tradeCosts = totalTrades * COST_PER_TRADE;
const rolloverCosts = months5yr * ROLLOVER_PER_MONTH;
const totalCosts = tradeCosts + rolloverCosts;
const netRs = grossRs - totalCosts;
const netMonthlyAvg = netRs / months5yr;

console.log('\n' + '═'.repeat(70));
console.log(' FUTURES REALITY CHECK (same rules, real costs)');
console.log('═'.repeat(70));
console.log(` Gross P&L        : ₹${grossRs.toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log(` Trade costs      : -₹${tradeCosts.toLocaleString('en-IN', {maximumFractionDigits:0})}  (${totalTrades} trades × ₹${COST_PER_TRADE}/trade)`);
console.log(` Rollover costs   : -₹${rolloverCosts.toLocaleString('en-IN', {maximumFractionDigits:0})}  (${months5yr} months × ₹${ROLLOVER_PER_MONTH}/month)`);
console.log(` Total costs      : -₹${totalCosts.toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log('─'.repeat(70));
console.log(` NET P&L (5yr)    : ₹${netRs.toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log(` NET monthly avg  : ₹${netMonthlyAvg.toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log(` Cost drag        : ${(totalCosts / grossRs * 100).toFixed(1)}% of gross`);
console.log('═'.repeat(70));

console.log('\n Done.\n');

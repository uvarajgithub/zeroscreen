'use strict';
const path = require('path');
// bt_options.js — DRISHTI V1 backtest on ATM OPTIONS vs INDEX
// Uses same entry/exit signals as bt_drishti_5yr.js
// Models: delta=0.5, theta decay, bid-ask spread
// Shows WHY options lose even when index strategy profits

const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const MAX_TRADES     = 5;
const DAILY_LOSS_CAP = 150;
const QTY            = 30;
const RISK_FREE      = 0.07;

// ── Options model parameters ──────────────────────────────────────────────────
const DELTA    = 0.5;    // ATM delta (CE or PE, by symmetry)
const IV       = 0.20;   // 20% annual implied vol (typical BankNifty)
const SPREAD   = 3;      // pts bid-ask per entry OR exit (6 total round-trip)

// Estimate ATM option premium using simplified Black-Scholes
// premium ≈ IV × sqrt(DTE/365) × index × 0.4  (standard ATM formula approximation)
function atmPremium(index, dte) {
  return Math.max(10, Math.round(IV * Math.sqrt(dte / 365) * index * 0.4));
}

// DTE helper (last Thursday of month)
function getDTE(dateStr) {
  const d = new Date(dateStr);
  const year = d.getFullYear(), month = d.getMonth();
  const lastDay = new Date(year, month + 1, 0);
  const dow = lastDay.getDay();
  const lastThursday = new Date(lastDay);
  lastThursday.setDate(lastDay.getDate() - (dow >= 4 ? dow - 4 : dow + 3));
  if (d >= lastThursday) {
    const nm = new Date(year, month + 2, 0);
    const ndow = nm.getDay();
    nm.setDate(nm.getDate() - (ndow >= 4 ? ndow - 4 : ndow + 3));
    return Math.max(1, Math.ceil((nm - d) / 86400000));
  }
  return Math.max(1, Math.ceil((lastThursday - d) / 86400000));
}

// ── Load data ────────────────────────────────────────────────────────────────
const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json', 'utf-8'));
const dates = Object.keys(raw).sort();

// ── Accumulators ─────────────────────────────────────────────────────────────
let idxTotal = 0, optTotal = 0;
let idxWins = 0, idxLosses = 0, optWins = 0, optLosses = 0;
let tradedDays = 0, totalTrades = 0;
let idxMaxWin = 0, idxMaxLoss = 0, optMaxWin = 0, optMaxLoss = 0;
const byYear = {}, byCandle = {};
const breakdownRows = [];  // per-trade breakdown for inspection

// ── Simulate one day ─────────────────────────────────────────────────────────
function simulateDay(todayCandles, prevCandles, dte) {
  const state = createDrishtiState();
  let tradeCount = 0, dayIdx = 0, dayOpt = 0;

  const _pdrH = prevCandles.length > 0 ? Math.max(...prevCandles.map(c => c.high)) : 0;
  const _pdrL = prevCandles.length > 0 ? Math.min(...prevCandles.map(c => c.low))  : 0;
  const _pdrOk = _pdrH > 0 && _pdrL > 0 && (_pdrH - _pdrL) >= 150;

  for (let i = 0; i < todayCandles.length; i++) {
    const c = todayCandles[i];
    const isEOD = c.h !== undefined
      ? (c.h > 15 || (c.h === 15 && c.m >= 15))
      : (i === todayCandles.length - 1);
    const partial = todayCandles.slice(0, i + 1);

    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, isEOD);
      state.peakPts = trail.peakPts;
      state.trailStop = trail.trailStop;

      if (trail.action !== 'HOLD') {
        const idxPts = trail.pts;
        const candlesHeld = Math.max(1, i - state.entryIdx);

        // Options P&L model:
        // 1. Premium at entry (estimated)
        const entryPrem = atmPremium(state.entry, dte);
        // 2. Theta per 15-min candle: entryPrem / (DTE × 26 candles/day)
        const thetaPerCandle = entryPrem / (dte * 26);
        // 3. Option move: delta × index pts (the locked trail amount)
        const optMove = DELTA * idxPts;
        // 4. Theta drag over holding period
        const thetaDrag = thetaPerCandle * candlesHeld;
        // 5. Spread cost (paid twice: entry + exit)
        const spreadCost = SPREAD * 2;
        // 6. Net option P&L in pts
        const optPts = optMove - thetaDrag - spreadCost;

        dayIdx += idxPts;
        dayOpt += optPts;
        idxTotal += idxPts;
        optTotal += optPts;
        totalTrades++;

        if (idxPts > idxMaxWin)   idxMaxWin  = idxPts;
        if (idxPts < idxMaxLoss)  idxMaxLoss = idxPts;
        if (optPts > optMaxWin)   optMaxWin  = optPts;
        if (optPts < optMaxLoss)  optMaxLoss = optPts;

        if (idxPts > 0) idxWins++; else idxLosses++;
        if (optPts > 0) optWins++; else optLosses++;

        breakdownRows.push({ idxPts, optPts, entryPrem, thetaPerCandle: thetaPerCandle.toFixed(2), thetaDrag: thetaDrag.toFixed(1), candlesHeld, dte, entry: state.entry.toFixed(0), reason: trail.action });

        if (!byCandle[state.entryIdx]) byCandle[state.entryIdx] = { idxPts:0, optPts:0, n:0, optWins:0, optLosses:0 };
        byCandle[state.entryIdx].idxPts += idxPts;
        byCandle[state.entryIdx].optPts += optPts;
        byCandle[state.entryIdx].n++;
        if (optPts > 0) byCandle[state.entryIdx].optWins++;
        else            byCandle[state.entryIdx].optLosses++;

        if (trail.action !== 'EXIT_EOD') {
          state.lastExitPts = trail.pts;
          state.lastExitIdx = i;
          state.lastExitDir = state.dir;
        }
        state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -150;
        if (dayIdx <= -DAILY_LOSS_CAP) break;
      }
      continue;
    }

    if (tradeCount >= MAX_TRADES || isEOD || dayIdx <= -DAILY_LOSS_CAP) continue;

    let sig = null;
    if (!state.firstDone) {
      if (!_pdrOk) continue;
      sig = findDrishtiEntry(partial, prevCandles);
    } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }

    if (sig && sig.idx === i) {
      state.inTrade = true; state.dir = sig.side; state.entry = c.close;
      state.entryIdx = i; state.peakPts = 0; state.trailStop = -150;
      state.firstDone = true;
      tradeCount++;
    }
  }

  // Force-close if open
  if (state.inTrade) {
    const lastC = todayCandles[todayCandles.length - 1];
    const trail = updateDrishtiTrail(state, lastC, true);
    const idxPts = trail.pts;
    const candlesHeld = Math.max(1, (todayCandles.length - 1) - state.entryIdx);
    const entryPrem = atmPremium(state.entry, dte);
    const thetaPerCandle = entryPrem / (dte * 26);
    const optPts = DELTA * idxPts - thetaPerCandle * candlesHeld - SPREAD * 2;
    dayIdx += idxPts; dayOpt += optPts;
    idxTotal += idxPts; optTotal += optPts; totalTrades++;
    if (idxPts > 0) idxWins++; else idxLosses++;
    if (optPts > 0) optWins++; else optLosses++;
  }

  return { dayIdx, dayOpt, trades: tradeCount };
}

// ── Main loop ─────────────────────────────────────────────────────────────────
console.log('\nDRISHTI V1 — OPTIONS vs INDEX BACKTEST');
console.log('Options model: delta=0.5 | IV=20% | spread=3pts/side | lot=30');
console.log('Data: ' + dates[0] + ' → ' + dates[dates.length - 1]);
console.log('─'.repeat(70));

for (let di = 1; di < dates.length; di++) {
  const date = dates[di];
  const today = raw[date], prevDay = raw[dates[di - 1]];
  if (!today || today.length < 5 || !prevDay || prevDay.length < 5) continue;

  const dte = getDTE(date);
  const todayC = today.slice(1).map((c, i) => {
    const totalMin = 9*60 + 30 + i*15;
    return { open:c.open, high:c.high, low:c.low, close:c.close,
             h: c.h !== undefined ? c.h : Math.floor(totalMin/60),
             m: c.m !== undefined ? c.m : totalMin % 60 };
  });
  const prevC = prevDay.map(c => ({ open:c.open, high:c.high, low:c.low, close:c.close }));

  const { dayIdx, dayOpt, trades } = simulateDay(todayC, prevC, dte);
  if (trades === 0) continue;

  tradedDays++;
  const yr = date.slice(0, 4);
  if (!byYear[yr]) byYear[yr] = { idx:0, opt:0, W_idx:0, L_idx:0, W_opt:0, L_opt:0, days:0 };
  byYear[yr].idx += dayIdx; byYear[yr].opt += dayOpt; byYear[yr].days++;
  if (dayIdx > 0) byYear[yr].W_idx++; else if (dayIdx < 0) byYear[yr].L_idx++;
  if (dayOpt > 0) byYear[yr].W_opt++; else if (dayOpt < 0) byYear[yr].L_opt++;
}

// ── Results ───────────────────────────────────────────────────────────────────
const idxWR = (idxWins / totalTrades * 100).toFixed(1);
const optWR = (optWins / totalTrades * 100).toFixed(1);

console.log('\n' + '═'.repeat(70));
console.log(' COMPARISON: INDEX vs OPTIONS (same signals, different instrument)');
console.log('═'.repeat(70));
console.log(`                        ${'INDEX (Futures)'.padEnd(22)} ${'OPTIONS (ATM)'.padEnd(22)}`);
console.log('─'.repeat(70));
console.log(` 5yr P&L (pts):         ${(idxTotal > 0?'+':'')+idxTotal.toFixed(0).padEnd(22)} ${(optTotal > 0?'+':'')+optTotal.toFixed(0)}`);
console.log(` 5yr P&L (₹):           ₹${(idxTotal*QTY).toLocaleString('en-IN',{maximumFractionDigits:0}).padEnd(21)} ₹${(optTotal*QTY).toLocaleString('en-IN',{maximumFractionDigits:0})}`);
console.log(` Avg per day (pts):     ${((idxTotal/tradedDays) > 0?'+':'')+(idxTotal/tradedDays).toFixed(1).padEnd(22)} ${((optTotal/tradedDays) > 0?'+':'')+(optTotal/tradedDays).toFixed(1)}`);
console.log(` Trade win rate:        ${idxWR}%  ${(idxWins+'W/'+idxLosses+'L').padEnd(16)} ${optWR}%  ${optWins+'W/'+optLosses+'L'}`);
console.log(` Max win (pts):         +${idxMaxWin.toFixed(1).padEnd(22)} +${optMaxWin.toFixed(1)}`);
console.log(` Max loss (pts):        ${idxMaxLoss.toFixed(1).padEnd(23)} ${optMaxLoss.toFixed(1)}`);
console.log('═'.repeat(70));

console.log('\n BY YEAR');
console.log('─'.repeat(75));
console.log(' Year     Idx P&L       Idx Rs    Opt P&L       Opt Rs   Idx WR  Opt WR');
console.log('─'.repeat(75));
for (const yr of Object.keys(byYear).sort()) {
  const y = byYear[yr];
  const idxWr = y.W_idx + y.L_idx > 0 ? (y.W_idx/(y.W_idx+y.L_idx)*100).toFixed(0)+'%' : '—';
  const optWr = y.W_opt + y.L_opt > 0 ? (y.W_opt/(y.W_opt+y.L_opt)*100).toFixed(0)+'%' : '—';
  const ip = (y.idx > 0?'+':'')+y.idx.toFixed(0);
  const op = (y.opt > 0?'+':'')+y.opt.toFixed(0);
  const ir = '₹'+(y.idx*QTY).toLocaleString('en-IN',{maximumFractionDigits:0});
  const or_ = '₹'+(y.opt*QTY).toLocaleString('en-IN',{maximumFractionDigits:0});
  console.log(' ' + yr.padEnd(6) + ip.padStart(10) + ir.padStart(13) + op.padStart(11) + or_.padStart(13) + idxWr.padStart(8) + optWr.padStart(8));
}

// ── Trade-level breakdown: why options fail on small wins ──────────────────
const tiny  = breakdownRows.filter(r => r.idxPts > 0  && r.idxPts < 20 && r.optPts <= 0);
const small = breakdownRows.filter(r => r.idxPts >= 20 && r.idxPts < 50 && r.optPts <= 0);
const big   = breakdownRows.filter(r => r.idxPts >= 50);

console.log('\n BREAKDOWN: Options P&L by Index P&L category');
console.log('─'.repeat(70));
console.log(` Index win 0–20 pts:   ${breakdownRows.filter(r=>r.idxPts>0&&r.idxPts<20).length} trades → ${tiny.length} become OPTIONS LOSS`);
console.log(`   Reason: delta(0.5) × ~10 pts = 5 pts gain, minus theta(${(+breakdownRows[0]?.thetaPerCandle*1).toFixed(1)} pts/candle) + spread(6 pts) = net LOSS`);
console.log(` Index win 20–50 pts:  ${breakdownRows.filter(r=>r.idxPts>=20&&r.idxPts<50).length} trades → ${small.length} become OPTIONS LOSS`);
console.log(` Index win 50+ pts:    ${big.length} trades → most OPTIONS wins (delta gain > theta + spread)`);
console.log(` Index SL (−150 pts):  ${breakdownRows.filter(r=>r.idxPts<=-140).length} trades → Option SL ≈ ${(-150*0.5-6).toFixed(0)} pts (delta halves the loss)`);

// ── Breakeven analysis ────────────────────────────────────────────────────────
const avgDTE = Math.round(breakdownRows.reduce((s,r)=>s+r.dte,0)/breakdownRows.length);
const avgPrem = Math.round(atmPremium(53500, avgDTE));
const avgTheta = (avgPrem / (avgDTE * 26)).toFixed(2);
const avgCandles = (breakdownRows.reduce((s,r)=>s+r.candlesHeld,0)/breakdownRows.length).toFixed(1);
const breakevenIdx = ((+avgTheta * +avgCandles + 6) / DELTA).toFixed(0);

console.log('\n BREAKEVEN ANALYSIS');
console.log('─'.repeat(70));
console.log(` Average DTE at entry:       ${avgDTE} days`);
console.log(` ATM option premium (avg):   ${avgPrem} pts`);
console.log(` Theta per 15-min candle:    ${avgTheta} pts`);
console.log(` Avg candles held per trade: ${avgCandles}`);
console.log(` Theta drag per trade:       ${(+avgTheta * +avgCandles).toFixed(1)} pts`);
console.log(` Spread cost (entry+exit):   6 pts`);
console.log(` ─────────────────────────────────────────`);
console.log(` MIN INDEX WIN to break even: ${breakevenIdx} pts`);
console.log(` (index win × 0.5 must exceed theta + spread)`);
console.log(` Trades below breakeven: ${breakdownRows.filter(r=>r.idxPts<+breakevenIdx&&r.idxPts>0).length} / ${breakdownRows.filter(r=>r.idxPts>0).length} winners`);

console.log('\n CONCLUSION');
console.log('─'.repeat(70));
console.log(` DRISHTI V1 with LOCK10 trail was designed for FUTURES (delta=1.0)`);
console.log(` With options (delta=0.5), you need index win > ${breakevenIdx} pts just to break even`);
console.log(` Many DRISHTI trades lock only 5–30 pts — these become OPTION LOSSES`);
console.log(` Only trades with index win > ${breakevenIdx} pts are profitable with options`);
console.log(` Solution: use FUTURES (current), or increase trail gap for options`);
console.log('─'.repeat(70));

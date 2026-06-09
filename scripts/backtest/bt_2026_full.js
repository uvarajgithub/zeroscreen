'use strict';
/**
 * bt_2026_full.js — Full 2026 backtest
 * Jan-May: uses banknifty_2026_vps.json (spot 15-min candles, already stored)
 * Jun:     uses banknifty_fut_minute_vps.json (futures minute data → build 15-min)
 * Runs BOTH spot-based AND futures-based signals for June so we can compare directly.
 * Options estimated via Black-Scholes ATM premium approximation.
 */

const fs = require('fs');

// ── Data ─────────────────────────────────────────────────────────────────────
const spotData   = JSON.parse(fs.readFileSync('./banknifty_2026_vps.json',   'utf8'));
const futMinData = JSON.parse(fs.readFileSync('./banknifty_fut_minute_vps.json', 'utf8'));

// ── Params (match live bot exactly) ──────────────────────────────────────────
const SL_PTS    = 150;
const TRAIL_GAP = 10;     // LOCK10
const MAX_TRADES = 5;
const QTY       = 30;
const FUT_RS    = 30;     // Rs per pt futures (30 qty × Rs1)
const COST_FUT  = 362;    // cost per futures trade (from real-premium BT)
const COST_OPT  = 260;    // cost per options trade

// ── Helpers ───────────────────────────────────────────────────────────────────
function bp(c) { return (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0; }
function _pdh(cs) { return Math.max(...cs.map(c => c.high)); }
function _pdl(cs) { return Math.min(...cs.map(c => c.low)); }
function _pdc(cs) { return cs[cs.length - 1].close; }

// Build 15-min candles from {h,m,open,high,low,close} minute records
function build15Min(minuteData) {
  const w = {};
  for (const m of minuteData) {
    const tm = m.h * 60 + m.m;
    if (tm < 9*60+15 || tm >= 15*60+30) continue;
    const off = tm - (9*60+15), wS = 9*60+15 + Math.floor(off/15)*15;
    const wh = Math.floor(wS/60), wm = wS % 60;
    const k = String(wh).padStart(2,'0') + ':' + String(wm).padStart(2,'0');
    if (!w[k]) w[k] = { open: m.open, high: m.high, low: m.low, close: m.close };
    else { w[k].high = Math.max(w[k].high, m.high); w[k].low = Math.min(w[k].low, m.low); w[k].close = m.close; }
  }
  return Object.entries(w).sort().map(([t, c]) => ({ time: t, ...c }));
}

// ── Entry/exit logic (exact copy of findDrishtiEntry from backtest_bhav5yr.js) ─
function firstBull(cs, from, thresh) { thresh = thresh || 30; for (let i = from; i < cs.length; i++) if (bp(cs[i]) > thresh) return i; return -1; }
function firstBear(cs, from, thresh) { thresh = thresh || 30; for (let i = from; i < cs.length; i++) if (bp(cs[i]) < -thresh) return i; return -1; }
function firstStrong(cs, from, thresh) { thresh = thresh || 55; for (let i = from; i < cs.length; i++) { const b = bp(cs[i]); if (Math.abs(b) > thresh) return { i, side: b > 0 ? 'CE' : 'PE' }; } return null; }

function findEntry(today, prevCandles) {
  if (!today || today.length < 1 || !prevCandles || !prevCandles.length) return null;
  const PH = _pdh(prevCandles), PL = _pdl(prevCandles), PC = _pdc(prevCandles);
  const C0 = today[0], gap = C0.open - PC, lastIdx = today.length - 1;
  const vsPDH = C0.open - PH, vsPDL = C0.open - PL;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0), C1bp = today[1] ? bp(today[1]) : 0;
  const bps4 = today.slice(0, Math.min(4, today.length)).map(bp);
  let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++) if (bps4[i] * bps4[i-1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i-1]) > 65) wipsaws++;
  if (wipsaws >= 2) return null;
  const at = function(idx, side, reason) { return idx === lastIdx ? { idx, side, ctx, reason } : null; };
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return at(0, 'CE', 'extraordinary_gap_ce');
    if (C0bp > 85)    return at(0, 'CE', 'above_pdh_trend_day_ce');
    if (C0bp < -20)   return at(0, 'PE', 'above_pdh_c0_reversal_pe');
    const bearIdx = firstBear(today, 1, 35); if (bearIdx > 0 && bearIdx <= 7) return at(bearIdx, 'PE', 'above_pdh_delayed_pe');
    const contIdx = firstStrong(today, 2, 55); if (contIdx) return at(contIdx.i, contIdx.side, 'above_pdh_continuation');
    return null;
  }
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -80) return at(0, 'PE', 'below_pdl_trend_day_pe');
    if (C0bp < -65) return null;
    if (C0bp > 65) { const i = firstBear(today, 1, 30); if (i > 0) return at(i, 'PE', 'recovery_bounce_pe'); }
    if (C0.high < PL) {
      if (today.length >= 2 && C1bp > 20)  return at(1, 'CE', 'below_pdl_c1_bull_ce');
      if (today.length >= 1 && C1bp < -20) return at(0, 'PE', 'below_pdl_no_recovery_pe');
      const s = firstStrong(today, 2, 40); if (s && s.i <= 5) return at(s.i, s.side, 'below_pdl_c2_signal');
      return null;
    }
    if (C0bp > 20) { const i = firstBear(today, 1, 30); if (i > 0 && i <= 6) return at(i, 'PE', 'below_pdl_partial_bounce_pe'); }
    if (C0bp < -10) { for (let i = 2; i <= Math.min(7, today.length-2); i++) if (bp(today[i]) < -45 && today[i-1].close < PL) return at(i, 'PE', 'below_pdl_failed_bounce_pe'); }
    return null;
  }
  // INSIDE
  if (C0.close < PL && lastIdx === 0) return at(0, 'PE', 'inside_c0_breaks_below_pdl');
  if (C0.close > PH && lastIdx === 0) return at(0, 'CE', 'inside_c0_breaks_above_pdh');
  const gapUp = gap > 50, gapDown = gap < -50;
  if (Math.abs(C0bp) > 55) {
    const c0isBull = C0bp > 0, aligned = (c0isBull && !gapDown) || (!c0isBull && !gapUp);
    if (aligned) {
      if (today.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 72) { const s = at(1, C1bp > 0 ? 'CE' : 'PE', 'inside_c0_trap_c1_signal'); if (s) return s; }
      { const s = at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum'); if (s) return s; }
    } else {
      const gapSide = gapUp ? 'CE' : 'PE', revCandle = gapUp ? firstBull(today, 1, 35) : firstBear(today, 1, 35);
      if (revCandle > 0 && revCandle <= 5) { const s = at(revCandle, gapSide, 'inside_counter_gap_reversal'); if (s) return s; }
      { const s = at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum_no_reversal'); if (s) return s; }
    }
  }
  for (let i = 1; i < today.length; i++) {
    const prevC = today[i-1], curr = today[i];
    if (curr.close < prevC.low)  { if (gapUp && C0bp > 20) continue; const s = at(i, 'PE', 'struct_c' + (i+1) + '_pe'); if (s) return s; }
    if (curr.close > prevC.high) { if (gapDown && C0bp < -20) continue; const s = at(i, 'CE', 'struct_c' + (i+1) + '_ce'); if (s) return s; }
  }
  for (let i = 5; i < Math.min(today.length, 21); i++) {
    const prevClose = today[i-1].close;
    if (today[i].low  <= PL && prevClose > PL && bp(today[i]) > 35)  return at(i, 'CE', 'inside_pdl_test_ce');
    if (today[i].high >= PH && prevClose < PH && bp(today[i]) < -35) return at(i, 'PE', 'inside_pdh_test_pe');
  }
  return null;
}

function findReEntry(today, exitIdx, lastDir) {
  const lastIdx = today.length - 1; if (lastIdx <= exitIdx) return null;
  let sdIdx = -1, rvIdx = -1;
  for (let i = exitIdx + 1; i <= lastIdx; i++) {
    const b = bp(today[i]);
    if (sdIdx < 0 && ((lastDir === 'CE' && b > 40) || (lastDir === 'PE' && b < -40))) sdIdx = i;
    if (rvIdx < 0 && ((lastDir === 'CE' && b < -40) || (lastDir === 'PE' && b > 40))) rvIdx = i;
    if (sdIdx >= 0 && rvIdx >= 0) break;
  }
  if (sdIdx < 0 && rvIdx < 0) return null;
  if (sdIdx < 0) return { idx: rvIdx, dir: lastDir === 'CE' ? 'PE' : 'CE', reason: 're_reverse' };
  if (rvIdx < 0) return { idx: sdIdx, dir: lastDir, reason: 're_same_dir' };
  if (sdIdx <= rvIdx) return { idx: sdIdx, dir: lastDir, reason: 're_same_dir' };
  return { idx: rvIdx, dir: lastDir === 'CE' ? 'PE' : 'CE', reason: 're_reverse' };
}

function runTrade(dir, entryPrice, entryIdx, today) {
  let peak = 0, trailStop = -SL_PTS;
  const sign = dir === 'CE' ? 1 : -1;
  for (let i = entryIdx + 1; i < today.length; i++) {
    const c = today[i];
    const fav = dir === 'CE' ? c.high - entryPrice : entryPrice - c.low;
    if (fav > peak) { peak = fav; trailStop = peak >= TRAIL_GAP ? peak - TRAIL_GAP : -SL_PTS; }
    const exitLevel = entryPrice + sign * trailStop;
    const hitSL = dir === 'CE' ? c.low <= exitLevel : c.high >= exitLevel;
    if (hitSL || c.time === '15:15') {
      const exitPrice = c.time === '15:15' ? c.close : exitLevel;
      const pts = sign * (exitPrice - entryPrice);
      return { pts, rs: pts * FUT_RS, exitIdx: i, exitPrice, exitTime: c.time, peak, type: pts <= -SL_PTS ? 'SL' : 'TRAIL' };
    }
  }
  const last = today[today.length - 1];
  const pts = sign * (last.close - entryPrice);
  return { pts, rs: pts * FUT_RS, exitIdx: today.length - 1, exitPrice: last.close, exitTime: last.time, peak, type: 'EOD' };
}

// Black-Scholes ATM premium approximation (simplified)
function bsATMPremium(spot, daysToExpiry, iv) {
  iv = iv || 0.18; // 18% IV typical for BankNifty
  const T = daysToExpiry / 252;
  // ATM option ≈ spot × iv × sqrt(T) / sqrt(2π) × 0.4 (delta)
  return spot * iv * Math.sqrt(T) / 2.507 * 100; // scaled to approximate
}

function estimateOptPnl(dir, entrySpot, exitSpot, entryPts, exitPts, daysToExpiry) {
  // Approximate: ATM option delta 0.45, gamma effect on big moves
  const delta = 0.45;
  const spotMove = dir === 'CE' ? (exitSpot - entrySpot) : (entrySpot - exitSpot);
  // Option P&L ≈ delta × spot_move pts × QTY × Rs1
  // But capped: option can't lose more than premium paid
  const entryPrem = bsATMPremium(entrySpot, daysToExpiry, 0.18);
  const rawPnl = delta * spotMove * QTY;
  return Math.max(-entryPrem * QTY * 0.01, rawPnl); // cap loss at premium
}

// ── Simulate one day ──────────────────────────────────────────────────────────
function simulateDay(today, prevCandles, daysToExpiry) {
  let dayFutRs = 0, dayOptRs = 0, trades = 0, wins = 0, noTrade = false;
  let firstDone = false, lastExitIdx = -1, lastExitDir = null;
  const tradeLog = [];

  for (let ci = 0; ci < today.length && trades < MAX_TRADES; ci++) {
    const subset = today.slice(0, ci + 1);
    let dir, reason, re;
    if (!firstDone) {
      const sig = findEntry(subset, prevCandles);
      if (!sig) continue;
      dir = sig.side; reason = sig.reason;
    } else {
      re = findReEntry(today, lastExitIdx, lastExitDir);
      if (!re) break;
      dir = re.dir; reason = re.reason;
      ci = re.idx;
    }
    const entryPrice = today[ci].close;
    const r = runTrade(dir, entryPrice, ci, today);
    const optPnl = estimateOptPnl(dir, entryPrice, r.exitPrice, 0, 0, daysToExpiry);
    tradeLog.push({ n: trades + 1, dir, reason, entryTime: today[ci].time, entry: entryPrice, exitTime: r.exitTime, exit: r.exitPrice, pts: r.pts, futRs: r.rs, optRs: optPnl, type: r.type, peak: r.peak });
    dayFutRs += r.rs;
    dayOptRs += optPnl;
    if (r.pts > 0) wins++;
    firstDone = true; lastExitIdx = r.exitIdx; lastExitDir = dir; trades++;
    ci = r.exitIdx;
  }
  if (trades === 0) noTrade = true;
  const futNet = dayFutRs - trades * COST_FUT;
  const optNet = dayOptRs - trades * COST_OPT;
  return { dayFutRs, dayOptRs, futNet, optNet, trades, wins, tradeLog, noTrade };
}

// ── Build month summary ───────────────────────────────────────────────────────
function monthKey(dateStr) { return dateStr.slice(0, 7); }

// ── Process SPOT data (Jan-May 2026) ─────────────────────────────────────────
const spotDays = Object.keys(spotData).sort().filter(d => d >= '2026-01-01');
const spotMonthly = {};
let prevSpotCandles = null;
let spotGrandFut = 0, spotGrandOpt = 0, spotGrandFutNet = 0, spotTrades = 0, spotWins = 0, spotTradedDays = 0, spotNoTradeDays = 0;

for (let di = 0; di < spotDays.length; di++) {
  const d = spotDays[di];
  const candles15 = spotData[d]; // already 15-min candles stored as array
  if (!Array.isArray(candles15) || candles15.length === 0) continue;
  // Normalize candle format (spot data has {open,high,low,close,h,m})
  const allC = candles15.map(c => ({ time: String(c.h).padStart(2,'0') + ':' + String(c.m).padStart(2,'0'), open: c.open, high: c.high, low: c.low, close: c.close })).sort((a,b) => a.time.localeCompare(b.time));
  const today = allC.slice(1); // skip 09:15 seed
  if (!prevSpotCandles || today.length === 0) { prevSpotCandles = allC; continue; }

  // Days to expiry (approx — BankNifty weekly/monthly)
  const dte = 7; // rough approximation
  const res = simulateDay(today, prevSpotCandles, dte);

  const mk = monthKey(d);
  if (!spotMonthly[mk]) spotMonthly[mk] = { futGross: 0, optGross: 0, futNet: 0, optNet: 0, trades: 0, wins: 0, tradedDays: 0, noTradeDays: 0, days: 0 };
  spotMonthly[mk].futGross  += res.dayFutRs;
  spotMonthly[mk].optGross  += res.dayOptRs;
  spotMonthly[mk].futNet    += res.futNet;
  spotMonthly[mk].optNet    += res.optNet;
  spotMonthly[mk].trades    += res.trades;
  spotMonthly[mk].wins      += res.wins;
  spotMonthly[mk].days++;
  if (res.noTrade) spotMonthly[mk].noTradeDays++; else spotMonthly[mk].tradedDays++;
  spotGrandFut    += res.dayFutRs;
  spotGrandOpt    += res.dayOptRs;
  spotGrandFutNet += res.futNet;
  spotTrades      += res.trades;
  spotWins        += res.wins;
  if (res.noTrade) spotNoTradeDays++; else spotTradedDays++;
  prevSpotCandles = allC;
}

// ── Process FUTURES data (Jun 2026) ──────────────────────────────────────────
const futDays = Object.keys(futMinData).sort();
const futMonthly = {};
let prevFutCandles = null;
let futGrandFut = 0, futGrandOpt = 0, futGrandFutNet = 0, futTrades = 0, futWins = 0, futTradedDays = 0, futNoTradeDays = 0;

for (let di = 0; di < futDays.length; di++) {
  const d = futDays[di];
  const junMins = futMinData[d].filter(c => c.sym === 'BANKNIFTY26JUNFUT');
  const allC = build15Min(junMins);
  const today = allC.slice(1); // skip 09:15

  if (!prevFutCandles || today.length === 0) { prevFutCandles = allC; continue; }

  const dte = 17 - parseInt(d.slice(8,10), 10) + 26; // approx DTE to Jun 26 expiry
  const res = simulateDay(today, prevFutCandles, Math.max(1, dte));

  const mk = monthKey(d);
  if (!futMonthly[mk]) futMonthly[mk] = { futGross: 0, optGross: 0, futNet: 0, optNet: 0, trades: 0, wins: 0, tradedDays: 0, noTradeDays: 0, days: 0 };
  futMonthly[mk].futGross  += res.dayFutRs;
  futMonthly[mk].optGross  += res.dayOptRs;
  futMonthly[mk].futNet    += res.futNet;
  futMonthly[mk].optNet    += res.optNet;
  futMonthly[mk].trades    += res.trades;
  futMonthly[mk].wins      += res.wins;
  futMonthly[mk].days++;
  if (res.noTrade) futMonthly[mk].noTradeDays++; else futMonthly[mk].tradedDays++;
  futGrandFut    += res.dayFutRs;
  futGrandOpt    += res.dayOptRs;
  futGrandFutNet += res.futNet;
  futTrades      += res.trades;
  futWins        += res.wins;
  if (res.noTrade) futNoTradeDays++; else futTradedDays++;
  prevFutCandles = allC;
}

// ── Print results ─────────────────────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║        2026 DRISHTI V1 BACKTEST — SPOT vs FUTURES SIGNALS           ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝');
console.log('');
console.log('SPOT-BASED SIGNALS (Jan–May 2026, current live bot behaviour)');
console.log('─────────────────────────────────────────────────────────────');
console.log(('Month').padEnd(10) + ('Days').padStart(5) + ('Trades').padStart(8) + ('WR%').padStart(7) + ('FutGross').padStart(12) + ('FutNet').padStart(12) + ('OptGross').padStart(12) + ('OptNet').padStart(10));
Object.keys(spotMonthly).sort().forEach(m => {
  const v = spotMonthly[m];
  const wr = v.trades > 0 ? (v.wins / v.trades * 100).toFixed(0) : '0';
  console.log(m.padEnd(10) + String(v.days).padStart(5) + String(v.trades).padStart(8) + (wr + '%').padStart(7) + String(Math.round(v.futGross)).padStart(12) + String(Math.round(v.futNet)).padStart(12) + String(Math.round(v.optGross)).padStart(12) + String(Math.round(v.optNet)).padStart(10));
});
const spotWR = spotTrades > 0 ? (spotWins / spotTrades * 100).toFixed(1) : '0';
console.log('─────────────────────────────────────────────────────────────');
console.log(('TOTAL').padEnd(10) + String(spotTradedDays + spotNoTradeDays).padStart(5) + String(spotTrades).padStart(8) + (spotWR + '%').padStart(7) + String(Math.round(spotGrandFut)).padStart(12) + String(Math.round(spotGrandFutNet)).padStart(12) + String(Math.round(spotGrandOpt)).padStart(12));
console.log('');
console.log('FUTURES-BASED SIGNALS (Jun 2026 only — proposed fix)');
console.log('─────────────────────────────────────────────────────────────');
Object.keys(futMonthly).sort().forEach(m => {
  const v = futMonthly[m];
  const wr = v.trades > 0 ? (v.wins / v.trades * 100).toFixed(0) : '0';
  console.log(m.padEnd(10) + String(v.days).padStart(5) + String(v.trades).padStart(8) + (wr + '%').padStart(7) + String(Math.round(v.futGross)).padStart(12) + String(Math.round(v.futNet)).padStart(12) + String(Math.round(v.optGross)).padStart(12) + String(Math.round(v.optNet)).padStart(10));
});
const futWR = futTrades > 0 ? (futWins / futTrades * 100).toFixed(1) : '0';
console.log('─────────────────────────────────────────────────────────────');
console.log(('TOTAL').padEnd(10) + String(futTradedDays + futNoTradeDays).padStart(5) + String(futTrades).padStart(8) + (futWR + '%').padStart(7) + String(Math.round(futGrandFut)).padStart(12) + String(Math.round(futGrandFutNet)).padStart(12) + String(Math.round(futGrandOpt)).padStart(12));
console.log('');
console.log('ACTUAL LIVE JUNE 2026 (spot signals, real execution)');
console.log('─────────────────────────────────────────────────────────────');
console.log('2026-06   7 days  35 trades   ~51%   FutGross: Rs  2,337   FutNet: ~Rs  1,987');
console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log('FULL 5-YEAR REAL-PREMIUM BACKTEST (reference, spot signals)');
console.log('════════════════════════════════════════════════════════════');
console.log('Period: Jan 2021 – Jun 2026 | 1,232 days | 5,383 trades');
console.log('Futures Gross: Rs 62,87,836  |  Futures Net: Rs 43,39,190');
console.log('Options Gross: Rs  4,46,956  |  Options Net: Rs  2,91,381');
console.log('Futures WR: 73.4%  |  Options WR: 50.7%');
console.log('Avg per month: Fut Net Rs 59,154  |  Opt Net Rs 3,970');
console.log('');
console.log('NOTE: Options estimated via Black-Scholes ATM approximation (delta 0.45).');
console.log('      For real options P&L, historical minute-level premium data is needed.');

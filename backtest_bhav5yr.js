// backtest_bhav5yr.js — DRISHTI V1 5-Year Backtest (exact live bot params)
// Fixes applied: LOCK10 trail, MAX_RE=5, re-entry body>40%, re-entry gate=0 (OFF), REV_UNLOCK=50,
//   trap C1 threshold=72%, C0 seeding fix (skip 9:15 candle, use 9:30 as C0)
// Outputs: 5year-backtest-result.json  (format: {daily:[{date,bbPnL}], monthly:{YYYY-MM:{bbTotal,bbTrades,bbWins}}})

'use strict';
const { KiteConnect } = require('kiteconnect');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105; // BANKNIFTY
const SL_PTS    = 150;
const TRAIL_GAP = 10;   // LOCK10 (live bot)
const MAX_TRADES = 5;
const MAX_RE     = 5;   // live bot allows 5 re-entries
const DAILY_LOSS_CAP = 150; // live bot: user-settings.json dailyLossCap=150

// ─── Strategy helpers (translated from drishti_strategy.ts) ────────────────────
function bp(c)  { return (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0; }
function pdh(cs){ return Math.max(...cs.map(c => c.high)); }
function pdl(cs){ return Math.min(...cs.map(c => c.low)); }
function pdc(cs){ return cs[cs.length - 1].close; }

function firstBull(cs, from, thresh = 30) {
  for (let i = from; i < cs.length; i++) if (bp(cs[i]) > thresh) return i;
  return -1;
}
function firstBear(cs, from, thresh = 30) {
  for (let i = from; i < cs.length; i++) if (bp(cs[i]) < -thresh) return i;
  return -1;
}
function firstStrong(cs, from, thresh = 55) {
  for (let i = from; i < cs.length; i++) {
    const b = bp(cs[i]);
    if (Math.abs(b) > thresh) return { i, side: b > 0 ? 'CE' : 'PE' };
  }
  return null;
}

function findDrishtiEntry(today, prev) {
  if (!today || today.length < 1) return null;
  if (!prev  || prev.length  === 0) return null;

  const PH  = pdh(prev);
  const PL  = pdl(prev);
  const PC  = pdc(prev);
  const C0  = today[0];
  const gap = C0.open - PC;
  const lastIdx = today.length - 1;

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const ctx   = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';

  const C0bp = bp(C0);
  const C1bp = today[1] ? bp(today[1]) : 0;

  // Whipsaw guard
  const bps4 = today.slice(0, Math.min(4, today.length)).map(bp);
  let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++) {
    if (bps4[i] * bps4[i - 1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i - 1]) > 65)
      wipsaws++;
  }
  if (wipsaws >= 2) return null;

  const at = (idx, side, reason) => idx === lastIdx ? { idx, side, ctx, reason } : null;

  // CONTEXT 1: ABOVE PDH
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return at(0, 'CE', 'extraordinary_gap_ce');
    if (C0bp > 85)    return at(0, 'CE', 'above_pdh_trend_day_ce');
    if (C0bp < -20)   return at(0, 'PE', 'above_pdh_c0_reversal_pe');
    const bearIdx = firstBear(today, 1, 35);
    if (bearIdx > 0 && bearIdx <= 7) return at(bearIdx, 'PE', 'above_pdh_delayed_pe');
    const contIdx = firstStrong(today, 2, 55);
    if (contIdx) return at(contIdx.i, contIdx.side, 'above_pdh_continuation');
    return null;
  }

  // CONTEXT 2: BELOW PDL
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -80) return at(0, 'PE', 'below_pdl_trend_day_pe');
    if (C0bp < -65) return null;
    if (C0bp > 65) {
      const i = firstBear(today, 1, 30);
      if (i > 0) return at(i, 'PE', 'recovery_bounce_pe');
    }
    if (C0.high < PL) {
      if (today.length >= 2 && C1bp > 20)  return at(1, 'CE', 'below_pdl_c1_bull_ce');
      if (today.length >= 1 && C1bp < -20) return at(0, 'PE', 'below_pdl_no_recovery_pe');
      const s = firstStrong(today, 2, 40);
      if (s && s.i <= 5) return at(s.i, s.side, 'below_pdl_c2_signal');
      return null;
    }
    if (C0bp > 20) {
      const i = firstBear(today, 1, 30);
      if (i > 0 && i <= 6) return at(i, 'PE', 'below_pdl_partial_bounce_pe');
    }
    if (C0bp < -10) {
      for (let i = 2; i <= Math.min(7, today.length - 2); i++) {
        if (bp(today[i]) < -45 && today[i - 1].close < PL)
          return at(i, 'PE', 'below_pdl_failed_bounce_pe');
      }
    }
    return null;
  }

  // CONTEXT 3: INSIDE
  if (C0.close < PL && lastIdx === 0) return at(0, 'PE', 'inside_c0_breaks_below_pdl');
  if (C0.close > PH && lastIdx === 0) return at(0, 'CE', 'inside_c0_breaks_above_pdh');

  const gapUp   = gap > 50;
  const gapDown = gap < -50;

  if (Math.abs(C0bp) > 55) {
    const c0isBull = C0bp > 0;
    const aligned  = (c0isBull && !gapDown) || (!c0isBull && !gapUp);
    if (aligned) {
      if (today.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 72) {  // live: 72
        const s = at(1, C1bp > 0 ? 'CE' : 'PE', 'inside_c0_trap_c1_signal');
        if (s) return s;
      }
      { const s = at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum'); if (s) return s; }
    } else {
      const gapSide  = gapUp ? 'CE' : 'PE';
      const revCandle = gapUp ? firstBull(today, 1, 35) : firstBear(today, 1, 35);
      if (revCandle > 0 && revCandle <= 5) {
        const s = at(revCandle, gapSide, 'inside_counter_gap_reversal');
        if (s) return s;
      }
      { const s = at(0, c0isBull ? 'CE' : 'PE', 'inside_c0_momentum_no_reversal'); if (s) return s; }
    }
  }

  // Structural candle break: close outside previous candle's range
  for (let i = 1; i < today.length; i++) {
    const prevC = today[i - 1], curr = today[i];
    if (curr.close < prevC.low) {
      const oppGap = gapUp, c0opp = C0bp > 20;
      if (oppGap && c0opp) continue;
      const s = at(i, 'PE', `struct_c${i + 1}_pe`); if (s) return s;
    }
    if (curr.close > prevC.high) {
      const oppGap = gapDown, c0opp = C0bp < -20;
      if (oppGap && c0opp) continue;
      const s = at(i, 'CE', `struct_c${i + 1}_ce`); if (s) return s;
    }
  }

  for (let i = 5; i < Math.min(today.length, 21); i++) {
    const prevClose = today[i - 1].close;
    if (today[i].low  <= PL && prevClose > PL && bp(today[i]) > 35)
      return at(i, 'CE', 'inside_pdl_test_ce');
    if (today[i].high >= PH && prevClose < PH && bp(today[i]) < -35)
      return at(i, 'PE', 'inside_pdh_test_pe');
  }

  return null;
}

function findDrishtiReEntry(today, exitIdx, side, allowReverse) {
  const lastIdx = today.length - 1;
  if (lastIdx <= exitIdx) return null;

  // live bot: same dir body > 40%
  for (let i = exitIdx + 1; i <= lastIdx; i++) {
    const b = bp(today[i]);
    if (side === 'CE' && b > 40) return { idx: i, side, reason: 're_same_dir' };
    if (side === 'PE' && b < -40) return { idx: i, side, reason: 're_same_dir' };
  }

  // live bot: reverse body > 40% (same threshold)
  if (allowReverse) {
    const revSide = side === 'CE' ? 'PE' : 'CE';
    for (let i = exitIdx + 1; i <= lastIdx; i++) {
      const b = bp(today[i]);
      if (revSide === 'CE' && b > 40) return { idx: i, side: revSide, reason: 're_reverse' };
      if (revSide === 'PE' && b < -40) return { idx: i, side: revSide, reason: 're_reverse' };
    }
  }
  return null;
}

function updateDrishtiTrail(state, candle, isEOD) {
  const sign = state.dir === 'CE' ? 1 : -1;
  const favPts = state.dir === 'CE' ? candle.high - state.entry : state.entry - candle.low;

  let peakPts   = state.peakPts;
  let trailStop = state.trailStop;

  if (favPts > peakPts) {
    peakPts   = favPts;
    trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
  }

  const closePts = sign * (candle.close - state.entry);

  if (isEOD || closePts <= trailStop) {
    const exitType  = isEOD ? 'EXIT_EOD' : trailStop <= 0 ? 'EXIT_SL' : 'EXIT_TRAIL';
    const lockedPts = isEOD ? closePts : trailStop;
    const exitPrice = isEOD ? candle.close : state.entry + sign * trailStop;
    return { action: exitType, pts: lockedPts, exitPrice, trailStop, peakPts };
  }

  state.peakPts   = peakPts;
  state.trailStop = trailStop;
  return { action: 'HOLD', pts: 0, exitPrice: 0, trailStop, peakPts };
}

// ─── Run one trading day ────────────────────────────────────────────────────
function runDay(today, prev) {
  // ── C0 SEEDING FIX ────────────────────────────────────────────────────────
  // today[0] = 9:15-9:30 candle = seeded in live bot (NOT in drishtiTodayCandles)
  // Live bot C0 = today[1] (9:30-9:45). Skip today[0] to match live exactly.
  const liveCandles = today.slice(1);
  if (liveCandles.length < 2) return { pnl: 0, trades: 0, wins: 0 };

  let state = {
    inTrade: false, dir: null, entry: 0, entryIdx: -1,
    trailStop: -SL_PTS, peakPts: 0,
    firstDone: false, reCount: 0,
    lastExitPts: 0, lastExitIdx: -1, lastExitDir: null,
  };

  let dayPnL = 0, trades = 0, wins = 0;

  for (let li = 0; li < liveCandles.length; li++) {
    const bc    = liveCandles[li];
    const isEOD = li >= liveCandles.length - 1;

    // Trail management
    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, bc, isEOD);
      if (trail.action !== 'HOLD') {
        const pts = trail.pts;
        dayPnL += pts;
        trades++;
        if (pts > 0) wins++;

        state.inTrade      = false;
        state.firstDone    = true;
        state.lastExitPts  = trail.peakPts;  // store PEAK (matches live bot)
        state.lastExitIdx  = li;             // index in liveCandles
        state.lastExitDir  = state.dir;
        state.dir          = null;
        state.entry        = 0;
        state.entryIdx     = -1;
        state.peakPts      = 0;
        state.trailStop    = -SL_PTS;
      }
      continue;
    }

    if (isEOD) continue;
    if (trades >= MAX_TRADES) continue;
    if (dayPnL <= -DAILY_LOSS_CAP) continue;  // daily loss cap (matches live bot user-settings)

    let sig = null;
    const sliceNow = liveCandles.slice(0, li + 1);  // live-aligned slice

    // Re-entry gate: lastExitPts >= 0 = OFF (5yr sweep: best setting, matches live bot)
    if (state.firstDone && state.reCount < MAX_RE
        && state.lastExitPts >= 0
        && state.lastExitIdx >= 0 && state.lastExitDir) {
      const allowReverse = state.lastExitPts >= 50;
      const re = findDrishtiReEntry(sliceNow, state.lastExitIdx, state.lastExitDir, allowReverse);
      if (re && re.idx === li) {
        sig = { idx: re.idx, side: re.side, ctx: 'INSIDE', reason: re.reason };
      }
    } else if (!state.firstDone) {
      sig = findDrishtiEntry(sliceNow, prev);
    }

    if (!sig) continue;

    state.inTrade   = true;
    state.dir       = sig.side;
    state.entry     = bc.close;
    state.entryIdx  = li;
    state.trailStop = -SL_PTS;
    state.peakPts   = 0;
    if (state.firstDone) state.reCount++;
  }

  return { pnl: dayPnL, trades, wins };
}

// ─── Fetch historical data in 60-day chunks ─────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchChunk(from, to) {
  const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, '15minute', from, to, false);
  return data.map(d => ({
    date:  d.date instanceof Date ? d.date : new Date(d.date),
    open:  d.open,
    high:  d.high,
    low:   d.low,
    close: d.close,
  }));
}

async function fetchAllCandles(startDate, endDate) {
  const all = [];
  let cur = new Date(startDate);

  while (cur < endDate) {
    const chunkEnd = new Date(cur);
    chunkEnd.setDate(chunkEnd.getDate() + 59);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const from = cur.toISOString().slice(0, 10);
    const to   = chunkEnd.toISOString().slice(0, 10);
    process.stdout.write(`  Fetching ${from} → ${to} ...`);

    try {
      const chunk = await fetchChunk(from, to);
      all.push(...chunk);
      process.stdout.write(` ${chunk.length} candles\n`);
    } catch (e) {
      process.stdout.write(` ERROR: ${e.message}\n`);
    }

    await sleep(350); // rate limit
    cur.setDate(cur.getDate() + 60);
  }
  return all;
}

// ─── Group candles by IST trading day ───────────────────────────────────────
function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    // convert to IST
    const ist  = new Date(c.date.getTime() + 5.5 * 3600 * 1000);
    const h    = ist.getUTCHours();
    const m    = ist.getUTCMinutes();

    // only 9:15 AM to 3:15 PM candles
    const totalMin = h * 60 + m;
    if (totalMin < 9 * 60 + 15 || totalMin > 15 * 60 + 15) continue;

    const dateKey = ist.toISOString().slice(0, 10);
    if (!days[dateKey]) days[dateKey] = [];
    days[dateKey].push({ open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return days;
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('DRISHTI V1 — 5-Year Backtest (Jan 2021 – May 2026)');
  console.log('Instrument: BANKNIFTY (260105) | 15-min | SL:150 Trail:LOCK20\n');

  const startDate = new Date('2021-01-01');
  const endDate   = new Date('2026-05-25');

  console.log('Fetching candle data...');
  const allCandles = await fetchAllCandles(startDate, endDate);
  console.log(`\nTotal candles fetched: ${allCandles.length}`);

  const dayMap = groupByDay(allCandles);
  const allDates = Object.keys(dayMap).sort();
  console.log(`Trading days: ${allDates.length}\n`);

  const dailyResults = [];
  const monthlyAgg   = {};
  const noTradeDays  = [];

  for (let di = 1; di < allDates.length; di++) {
    const date    = allDates[di];
    const today   = dayMap[date];
    const prevDay = dayMap[allDates[di - 1]];

    if (!today || today.length < 3) continue;  // skip incomplete days
    if (!prevDay || prevDay.length < 3) continue; // need prev day for PDH/PDL

    const { pnl, trades, wins } = runDay(today, prevDay);

    const rounded = Math.round(pnl * 10) / 10;
    dailyResults.push({ date, bbPnL: rounded });
    if (trades === 0) noTradeDays.push({ date, reason: 'no_signal' });

    const mk = date.slice(0, 7); // YYYY-MM
    if (!monthlyAgg[mk]) monthlyAgg[mk] = { bbTotal: 0, bbTrades: 0, bbWins: 0 };
    monthlyAgg[mk].bbTotal  += rounded;
    monthlyAgg[mk].bbTrades += trades;
    monthlyAgg[mk].bbWins   += wins;
  }

  // Round monthly totals
  for (const mk of Object.keys(monthlyAgg)) {
    monthlyAgg[mk].bbTotal = Math.round(monthlyAgg[mk].bbTotal * 10) / 10;
  }

  // Print summary
  const totalPnL   = dailyResults.reduce((s, d) => s + d.bbPnL, 0);
  const totalDays  = dailyResults.length;
  const greenDays  = dailyResults.filter(d => d.bbPnL > 0).length;
  const allTrades  = Object.values(monthlyAgg).reduce((s, m) => s + m.bbTrades, 0);
  const allWins    = Object.values(monthlyAgg).reduce((s, m) => s + m.bbWins, 0);
  const wr         = allTrades > 0 ? (allWins / allTrades * 100).toFixed(1) : 0;

  const result = {
    totals: { bodyBreakout: Math.round(totalPnL * 10) / 10 },
    tradingDays: allDates.length,
    tradedDays:  totalDays,
    winRate:     parseFloat(wr),
    period:      { from: startDate.toISOString().slice(0, 10), to: endDate.toISOString().slice(0, 10) },
    monthly:     monthlyAgg,
    daily:       dailyResults,
    noTradeDays: noTradeDays,
  };
  const outPath = path.join(__dirname, '5year-backtest-result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  console.log('═══════════════════════════════════════');
  console.log('DRISHTI V1 — 5yr Backtest Results');
  console.log('═══════════════════════════════════════');
  console.log(`Total P&L   : ${totalPnL.toFixed(0)} pts`);
  console.log(`Total P&L ₹ : ₹${(totalPnL * 15).toFixed(0)}  (×15 QTY_MULT)`);
  console.log(`Trading days: ${totalDays}  (green: ${greenDays}, red: ${totalDays - greenDays})`);
  console.log(`Total trades: ${allTrades}  |  Wins: ${allWins}  |  WR: ${wr}%`);
  console.log(`Avg pts/day : ${(totalPnL / totalDays).toFixed(1)}`);
  console.log(`Avg pts/trade: ${(totalPnL / allTrades).toFixed(1)}`);
  console.log(`\nSaved: ${outPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

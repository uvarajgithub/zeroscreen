// backtest_bb5yr.js — Body Breakout 5-Year Backtest
// Entry: 15-min candle close breaks above prev candle body high (CE) or below prev body low (PE)
// SL: 200 pts (candle-close only), Trail: LOCK40 (peak-40 once peak>=40)
// Max 5 trades/day, re-entries allowed after profitable exit (peak>=40)

'use strict';
const { KiteConnect } = require('kiteconnect');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const SL_PTS    = 200;
const TRAIL_GAP = 40;
const MAX_TRADES = 5;
const MAX_RE     = 3;
const RE_MIN_PTS = 40; // min peak to allow re-entry

// ─── Trail ───────────────────────────────────────────────────────────────────
function updateTrail(state, candle, isEOD) {
  const sign   = state.dir === 'CE' ? 1 : -1;
  const favPts = state.dir === 'CE' ? candle.high - state.entry : state.entry - candle.low;

  let { peakPts, trailStop } = state;
  if (favPts > peakPts) {
    peakPts   = favPts;
    trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
  }

  const closePts = sign * (candle.close - state.entry);
  if (isEOD || closePts <= trailStop) {
    const lockedPts = isEOD ? closePts : trailStop;
    const exitType  = isEOD ? 'EXIT_EOD' : trailStop <= 0 ? 'EXIT_SL' : 'EXIT_TRAIL';
    return { action: exitType, pts: lockedPts, peakPts };
  }
  state.peakPts   = peakPts;
  state.trailStop = trailStop;
  return { action: 'HOLD', pts: 0, peakPts };
}

// ─── Entry signal (Body Breakout) ────────────────────────────────────────────
function bbSignal(today, idx) {
  if (idx < 1) return null;
  const curr = today[idx];
  const prev = today[idx - 1];
  const prevBodyHigh = Math.max(prev.open, prev.close);
  const prevBodyLow  = Math.min(prev.open, prev.close);
  const bodySize     = prevBodyHigh - prevBodyLow;

  // Require meaningful body on prev candle (>= 20 pts)
  if (bodySize < 20) return null;

  if (curr.close > prevBodyHigh && curr.close > curr.open)
    return 'CE';
  if (curr.close < prevBodyLow && curr.close < curr.open)
    return 'PE';
  return null;
}

// Re-entry: first strong body after last exit
function reSignal(today, exitIdx, exitDir) {
  const last = today.length - 1;
  if (last <= exitIdx) return null;
  for (let i = exitIdx + 1; i <= last; i++) {
    const c = today[i];
    const bodyPct = (c.high - c.low) > 0 ? Math.abs(c.close - c.open) / (c.high - c.low) * 100 : 0;
    if (bodyPct < 40) continue; // weak candle
    if (exitDir === 'CE' && c.close > c.open && i === last) return 'CE';
    if (exitDir === 'PE' && c.close < c.open && i === last) return 'PE';
  }
  return null;
}

// ─── Run one day ─────────────────────────────────────────────────────────────
function runDay(today) {
  let state = {
    inTrade: false, dir: null, entry: 0,
    trailStop: -SL_PTS, peakPts: 0,
    firstDone: false, reCount: 0,
    lastExitPts: 0, lastExitIdx: -1, lastExitDir: null,
  };

  let dayPnL = 0, trades = 0, wins = 0;

  for (let ci = 0; ci < today.length; ci++) {
    const bc    = today[ci];
    const isEOD = ci >= today.length - 1;

    if (state.inTrade) {
      const trail = updateTrail(state, bc, isEOD);
      if (trail.action !== 'HOLD') {
        const pts = trail.pts;
        dayPnL += pts;
        trades++;
        if (pts > 0) wins++;
        state.inTrade      = false;
        state.firstDone    = true;
        state.lastExitPts  = trail.peakPts;
        state.lastExitIdx  = ci;
        state.lastExitDir  = state.dir;
        state.dir          = null;
        state.entry        = 0;
        state.peakPts      = 0;
        state.trailStop    = -SL_PTS;
      }
      continue;
    }

    if (isEOD || trades >= MAX_TRADES) continue;

    let sig = null;
    if (state.firstDone && state.reCount < MAX_RE && state.lastExitPts >= RE_MIN_PTS && state.lastExitDir) {
      sig = reSignal(today, state.lastExitIdx, state.lastExitDir);
    } else if (!state.firstDone) {
      sig = bbSignal(today, ci);
    }

    if (!sig) continue;

    state.inTrade   = true;
    state.dir       = sig;
    state.entry     = bc.close;
    state.trailStop = -SL_PTS;
    state.peakPts   = 0;
    if (state.firstDone) state.reCount++;
  }

  return { pnl: dayPnL, trades, wins };
}

// ─── Fetch + group ───────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
      const data = await kite.getHistoricalData(INSTRUMENT_TOKEN, '15minute', from, to, false);
      const chunk = data.map(d => ({
        date:  d.date instanceof Date ? d.date : new Date(d.date),
        open: d.open, high: d.high, low: d.low, close: d.close,
      }));
      all.push(...chunk);
      process.stdout.write(` ${chunk.length} candles\n`);
    } catch (e) { process.stdout.write(` ERROR: ${e.message}\n`); }
    await sleep(350);
    cur.setDate(cur.getDate() + 60);
  }
  return all;
}

function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    const ist  = new Date(c.date.getTime() + 5.5 * 3600 * 1000);
    const h = ist.getUTCHours(), m = ist.getUTCMinutes();
    const totalMin = h * 60 + m;
    if (totalMin < 9 * 60 + 15 || totalMin > 15 * 60 + 15) continue;
    const dk = ist.toISOString().slice(0, 10);
    if (!days[dk]) days[dk] = [];
    days[dk].push({ open: c.open, high: c.high, low: c.low, close: c.close });
  }
  return days;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Body Breakout — 5-Year Backtest (Jan 2021 – May 2026)');
  console.log('Instrument: BANKNIFTY (260105) | 15-min | SL:200 Trail:LOCK40\n');

  const startDate = new Date('2021-01-01');
  const endDate   = new Date('2026-05-25');

  console.log('Fetching candle data...');
  const allCandles = await fetchAllCandles(startDate, endDate);
  console.log(`\nTotal candles: ${allCandles.length}`);

  const dayMap    = groupByDay(allCandles);
  const allDates  = Object.keys(dayMap).sort();
  console.log(`Trading days: ${allDates.length}\n`);

  const dailyResults = [];
  const monthlyAgg   = {};

  for (let di = 0; di < allDates.length; di++) {
    const date  = allDates[di];
    const today = dayMap[date];
    if (!today || today.length < 3) continue;

    const { pnl, trades, wins } = runDay(today);
    const rounded = Math.round(pnl * 10) / 10;
    dailyResults.push({ date, bbPnL: rounded });

    const mk = date.slice(0, 7);
    if (!monthlyAgg[mk]) monthlyAgg[mk] = { bbTotal: 0, bbTrades: 0, bbWins: 0 };
    monthlyAgg[mk].bbTotal  += rounded;
    monthlyAgg[mk].bbTrades += trades;
    monthlyAgg[mk].bbWins   += wins;
  }

  for (const mk of Object.keys(monthlyAgg))
    monthlyAgg[mk].bbTotal = Math.round(monthlyAgg[mk].bbTotal * 10) / 10;

  const result  = { daily: dailyResults, monthly: monthlyAgg };
  const outPath = path.join(process.cwd(), '5year-backtest-result.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  // Summary
  const totalPts  = dailyResults.reduce((s, d) => s + d.bbPnL, 0);
  const allT      = Object.values(monthlyAgg).reduce((s, m) => s + m.bbTrades, 0);
  const allW      = Object.values(monthlyAgg).reduce((s, m) => s + m.bbWins, 0);
  const wr        = allT > 0 ? (allW / allT * 100).toFixed(1) : 0;
  const greenDays = dailyResults.filter(d => d.bbPnL > 0).length;

  // Max drawdown
  let peak = 0, cum = 0, maxDD = 0;
  for (const r of dailyResults) {
    cum += r.bbPnL;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDD) maxDD = dd;
  }

  console.log('═══════════════════════════════════════');
  console.log('Body Breakout — 5yr Results');
  console.log('═══════════════════════════════════════');
  console.log(`Total pts  : ${totalPts.toFixed(0)}`);
  console.log(`Total ₹    : ₹${(totalPts * 15).toFixed(0)}  (×15 QTY_MULT)`);
  console.log(`Days       : ${dailyResults.length}  (green:${greenDays} red:${dailyResults.length - greenDays})`);
  console.log(`Trades     : ${allT}  Wins:${allW}  WR:${wr}%`);
  console.log(`Avg pts/tr : ${(totalPts / allT).toFixed(1)}`);
  console.log(`Avg ₹/trade: ₹${(totalPts * 15 / allT).toFixed(0)}`);
  console.log(`MaxDD pts  : ${maxDD.toFixed(0)}  MaxDD ₹: ₹${Math.round(maxDD * 15)}`);
  console.log(`\nSaved → ${outPath}`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

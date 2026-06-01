'use strict';
// bt_struct_break.js — INSIDE entry: structural candle break (close < prev.low → PE, close > prev.high → CE)
// All other logic (ABOVE_PDH, BELOW_PDL, Strong C0, PDH/PDL late entries) identical to old logic
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const SL_PTS = 150, TRAIL_GAP = 10, MAX_TRADES = 5, MAX_RE = 5, DAILY_LOSS_CAP = 150;

const bp = c => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const firstBull = (cs, from, t = 30) => { for (let i = from; i < cs.length; i++) if (bp(cs[i]) > t) return i; return -1; };
const firstBear = (cs, from, t = 30) => { for (let i = from; i < cs.length; i++) if (bp(cs[i]) < -t) return i; return -1; };
const firstStrong = (cs, from, t = 55) => { for (let i = from; i < cs.length; i++) { const b = bp(cs[i]); if (Math.abs(b) > t) return { i, side: b > 0 ? 'CE' : 'PE' } } return null; };

function findEntry(today, prev) {
  if (!today || today.length < 1) return null;
  if (!prev || prev.length === 0) return null;

  const PH = Math.max(...prev.map(c => c.high));
  const PL = Math.min(...prev.map(c => c.low));
  const PC = prev[prev.length - 1].close;
  const C0 = today[0], gap = C0.open - PC, lastIdx = today.length - 1;
  const vsPDH = C0.open - PH, vsPDL = C0.open - PL;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0), C1bp = today[1] ? bp(today[1]) : 0;

  // Whipsaw guard
  const bps4 = today.slice(0, Math.min(4, today.length)).map(bp); let wipsaws = 0;
  for (let i = 1; i < bps4.length; i++) if (bps4[i] * bps4[i - 1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i - 1]) > 65) wipsaws++;
  if (wipsaws >= 2) return null;

  const at = (idx, side, reason) => idx === lastIdx ? { idx, side, ctx, reason } : null;

  // ── ABOVE PDH ──────────────────────────────────────────
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return at(0, 'CE', 'xgap_ce');
    if (C0bp > 85) return at(0, 'CE', 'trend_ce');
    if (C0bp < -20) return at(0, 'PE', 'rev_pe');
    const bi = firstBear(today, 1, 35); if (bi > 0 && bi <= 7) return at(bi, 'PE', 'delayed_pe');
    const ci = firstStrong(today, 2, 55); if (ci) return at(ci.i, ci.side, 'cont');
    return null;
  }

  // ── BELOW PDL ──────────────────────────────────────────
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -80) return at(0, 'PE', 'trend_pe');
    if (C0bp < -65) return null;
    if (C0bp > 65) { const i = firstBear(today, 1, 30); if (i > 0) return at(i, 'PE', 'bounce_pe'); }
    if (C0.high < PL) {
      if (today.length >= 2 && C1bp > 20) return at(1, 'CE', 'c1_bull');
      if (C1bp < -20) return at(0, 'PE', 'no_rec');
      const s = firstStrong(today, 2, 40); if (s && s.i <= 5) return at(s.i, s.side, 'c2_sig');
      return null;
    }
    if (C0bp > 20) { const i = firstBear(today, 1, 30); if (i > 0 && i <= 6) return at(i, 'PE', 'part_bounce'); }
    if (C0bp < -10) {
      for (let i = 2; i <= Math.min(7, today.length - 2); i++)
        if (bp(today[i]) < -45 && today[i - 1].close < PL) return at(i, 'PE', 'fail_bounce');
    }
    return null;
  }

  // ── INSIDE ─────────────────────────────────────────────
  if (C0.close < PL && lastIdx === 0) return at(0, 'PE', 'breaks_below');
  if (C0.close > PH && lastIdx === 0) return at(0, 'CE', 'breaks_above');

  const gapUp = gap > 50, gapDown = gap < -50;

  // Strong C0 (>55%) — unchanged
  if (Math.abs(C0bp) > 55) {
    const c0isBull = C0bp > 0, aligned = (c0isBull && !gapDown) || (!c0isBull && !gapUp);
    if (aligned) {
      if (today.length >= 2 && C1bp * C0bp < 0 && Math.abs(C1bp) > 72) { const s = at(1, C1bp > 0 ? 'CE' : 'PE', 'trap'); if (s) return s; }
      { const s = at(0, c0isBull ? 'CE' : 'PE', 'momentum'); if (s) return s; }
    } else {
      const gs = gapUp ? 'CE' : 'PE', rc = gapUp ? firstBull(today, 1, 35) : firstBear(today, 1, 35);
      if (rc > 0 && rc <= 5) { const s = at(rc, gs, 'counter_gap'); if (s) return s; }
      { const s = at(0, c0isBull ? 'CE' : 'PE', 'momentum_no_rev'); if (s) return s; }
    }
  }

  // ── NEW: Structural candle break (replaces body% loop) ──
  // Each candle from C1 (i=1) onward: close breaks previous candle's range
  // Gap filter: skip if signal opposes both gap AND C0 direction (fake counter-gap)
  for (let i = 1; i < today.length; i++) {
    const prevC = today[i - 1];
    const curr  = today[i];
    if (curr.close < prevC.low) {
      // Bearish structural break → PE
      const oppGap   = gapUp;                 // signal is PE but gap was up
      const c0ModOpp = C0bp > 20;             // C0 was bullish
      if (oppGap && c0ModOpp) continue;       // gap up + C0 bull + PE signal = fake, skip
      const s = at(i, 'PE', `struct_c${i + 1}_pe`); if (s) return s;
    }
    if (curr.close > prevC.high) {
      // Bullish structural break → CE
      const oppGap   = gapDown;               // signal is CE but gap was down
      const c0ModOpp = C0bp < -20;            // C0 was bearish
      if (oppGap && c0ModOpp) continue;       // gap down + C0 bear + CE signal = fake, skip
      const s = at(i, 'CE', `struct_c${i + 1}_ce`); if (s) return s;
    }
  }

  // Late entries C5-C20: PDL/PDH test (unchanged)
  for (let i = 5; i < Math.min(today.length, 21); i++) {
    const pc = today[i - 1].close;
    if (today[i].low <= PL && pc > PL && bp(today[i]) > 35) return at(i, 'CE', 'pdl_test');
    if (today[i].high >= PH && pc < PH && bp(today[i]) < -35) return at(i, 'PE', 'pdh_test');
  }

  return null;
}

function findReEntry(today, exitIdx, side, allowReverse) {
  const lastIdx = today.length - 1; if (lastIdx <= exitIdx) return null;
  const rev = side === 'CE' ? 'PE' : 'CE'; let sd = null, rd = null;
  for (let i = exitIdx + 1; i <= lastIdx; i++) {
    const b = bp(today[i]);
    if (!sd) { if (side === 'CE' && b > 40) sd = { idx: i, side }; if (side === 'PE' && b < -40) sd = { idx: i, side }; }
    if (!rd && allowReverse) { if (rev === 'CE' && b > 40) rd = { idx: i, side: rev }; if (rev === 'PE' && b < -40) rd = { idx: i, side: rev }; }
    if (sd && (!allowReverse || rd)) break;
  }
  if (sd && rd) return sd.idx <= rd.idx ? sd : rd; return sd || rd || null;
}

function trailUpdate(state, candle, isEOD) {
  const sign = state.dir === 'CE' ? 1 : -1;
  const fav = state.dir === 'CE' ? candle.high - state.entry : state.entry - candle.low;
  let pk = state.peakPts, ts = state.trailStop;
  if (fav > pk) { pk = fav; ts = pk >= TRAIL_GAP ? pk - TRAIL_GAP : -SL_PTS; }
  const cp = sign * (candle.close - state.entry);
  if (isEOD || cp <= ts) { const et = isEOD ? 'EOD' : ts <= 0 ? 'SL' : 'TRAIL'; return { action: et, pts: isEOD ? cp : ts, peakPts: pk }; }
  state.peakPts = pk; state.trailStop = ts; return { action: 'HOLD', pts: 0 };
}

function runDay(today, prev) {
  const lc = today.slice(1); if (lc.length < 2) return { pnl: 0, trades: 0, wins: 0 };
  let st = { inTrade: false, dir: null, entry: 0, trailStop: -SL_PTS, peakPts: 0, firstDone: false, reCount: 0, lastExitPts: 0, lastExitIdx: -1, lastExitDir: null };
  let dayPnL = 0, trades = 0, wins = 0;
  for (let li = 0; li < lc.length; li++) {
    const bc = lc[li], isEOD = li >= lc.length - 1;
    if (st.inTrade) {
      const tr = trailUpdate(st, bc, isEOD);
      if (tr.action !== 'HOLD') { const pts = tr.pts; dayPnL += pts; trades++; if (pts > 0) wins++; st.inTrade = false; st.firstDone = true; st.lastExitPts = tr.peakPts; st.lastExitIdx = li; st.lastExitDir = st.dir; st.dir = null; st.entry = 0; st.peakPts = 0; st.trailStop = -SL_PTS; }
      continue;
    }
    if (isEOD || trades >= MAX_TRADES || dayPnL <= -DAILY_LOSS_CAP) continue;
    let sig = null; const sl = lc.slice(0, li + 1);
    if (st.firstDone && st.reCount < MAX_RE && st.lastExitPts >= 0 && st.lastExitIdx >= 0 && st.lastExitDir) {
      const re = findReEntry(sl, st.lastExitIdx, st.lastExitDir, true);
      if (re && re.idx === li) sig = re;
    } else if (!st.firstDone) { sig = findEntry(sl, prev); }
    if (!sig) continue;
    st.inTrade = true; st.dir = sig.side; st.entry = bc.close; st.trailStop = -SL_PTS; st.peakPts = 0;
    if (st.firstDone) st.reCount++;
  }
  return { pnl: dayPnL, trades, wins };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchChunk(from, to) {
  const d = await kite.getHistoricalData(260105, '15minute', from, to, false);
  return d.map(x => ({ date: x.date instanceof Date ? x.date : new Date(x.date), open: x.open, high: x.high, low: x.low, close: x.close }));
}

async function main() {
  console.log('STRUCTURAL BREAK backtest (Jan 2021 – May 2026)...');
  const startDate = new Date('2021-01-01'), endDate = new Date('2026-05-25');
  const all = []; let cur = new Date(startDate);
  while (cur < endDate) {
    const ce = new Date(cur); ce.setDate(ce.getDate() + 59); if (ce > endDate) ce.setTime(endDate.getTime());
    try { const chunk = await fetchChunk(cur.toISOString().slice(0, 10), ce.toISOString().slice(0, 10)); all.push(...chunk); process.stdout.write('.'); }
    catch (e) { process.stdout.write('E'); }
    await sleep(350); cur.setDate(cur.getDate() + 60);
  }
  console.log('\nTotal candles: ' + all.length);

  const days = {};
  for (const c of all) {
    const ist = new Date(c.date.getTime() + 5.5 * 3600 * 1000);
    const h = ist.getUTCHours(), m = ist.getUTCMinutes(), tm = h * 60 + m;
    if (tm < 9 * 60 + 15 || tm > 15 * 60 + 15) continue;
    const dk = ist.toISOString().slice(0, 10);
    if (!days[dk]) days[dk] = [];
    days[dk].push({ open: c.open, high: c.high, low: c.low, close: c.close });
  }

  const dates = Object.keys(days).sort();
  let totalPnL = 0, totalTrades = 0, totalWins = 0, greenDays = 0;
  for (let di = 1; di < dates.length; di++) {
    const today = days[dates[di]], prev = days[dates[di - 1]];
    if (!today || today.length < 3 || !prev || prev.length < 3) continue;
    const { pnl, trades, wins } = runDay(today, prev);
    totalPnL += pnl; totalTrades += trades; totalWins += wins; if (pnl > 0) greenDays++;
  }

  const wr = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : 0;
  const days_ = dates.length - 1;
  console.log('\n════════════════════════════════════');
  console.log('STRUCTURAL BREAK Results');
  console.log('════════════════════════════════════');
  console.log('Total P&L   : ' + Math.round(totalPnL) + ' pts  (₹' + (Math.round(totalPnL) * 15).toLocaleString() + ')');
  console.log('Trading days: ' + days_ + '  (green: ' + greenDays + ', red: ' + (days_ - greenDays) + ')');
  console.log('Total trades: ' + totalTrades + '  |  Wins: ' + totalWins + '  |  WR: ' + wr + '%');
  console.log('Avg pts/day : ' + (totalPnL / days_).toFixed(1));
  console.log('Avg pts/trade: ' + (totalTrades > 0 ? (totalPnL / totalTrades).toFixed(1) : 'N/A'));
  console.log('────────────────────────────────────');
  console.log('Compare: OLD complex = 259,404 pts | Simplified body% = 247,902 pts');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

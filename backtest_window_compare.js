#!/usr/bin/env node
// backtest_window_compare.js — compare entry windows: 4, 8, 12, 16, 20 candles
// Usage: node backtest_window_compare.js [cache/banknifty_5yr.json]
'use strict';

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(__dirname, 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;
const TRAIL_GAP  = 20;

// ─── helpers (same as backtest_bhav.js) ──────────────────────────────────────
const bp   = c => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const firstBull = (cs, from, thresh = 30, max = 99) => {
  for (let i = from; i <= Math.min(max, cs.length - 1); i++) if (bp(cs[i]) > thresh) return i;
  return -1;
};
const firstBear = (cs, from, thresh = 30, max = 99) => {
  for (let i = from; i <= Math.min(max, cs.length - 1); i++) if (bp(cs[i]) < -thresh) return i;
  return -1;
};
const firstStrong = (cs, from, thresh = 55, max = 99) => {
  for (let i = from; i <= Math.min(max, cs.length - 1); i++) {
    const b = bp(cs[i]);
    if (Math.abs(b) > thresh) return { i, side: b > 0 ? 'CE' : 'PE' };
  }
  return null;
};

// ─── entry window cap wrapper ──────────────────────────────────────────────
// After findEntry returns, if entry.idx > maxWindow → treat as no entry
// This simulates a bot that stops looking for entries after maxWindow candles

// Simplified entry finder (mirrors backtest_bhav.js logic)
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const getPrev = date => { const i = ALL.indexOf(date); return i > 0 ? raw[ALL[i - 1]] : null; };

// ─── P&L calculator (LOCK20 trail, candle-close) ──────────────────────────
function calcPL(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peak = 0;
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const hi  = sign * (candles[i].high  - entryPrice);
    const lo  = sign * (candles[i].low   - entryPrice);
    const cls = sign * (candles[i].close - entryPrice);
    if (hi > peak) peak = hi;
    const newTrail = peak - TRAIL_GAP;
    if (newTrail > trailStop) trailStop = newTrail;
    if (cls <= trailStop) {
      const exitPrice = entryPrice + sign * trailStop;
      const pl = trailStop * PTS_PER_RS;
      return { pl, exitIdx: i, exitType: trailStop <= -SL_PTS + 1 ? 'SL' : 'TRAIL', entryPrice, exitPrice, peakPts: peak };
    }
  }
  const exitPrice = candles[candles.length - 1].close;
  const pl = sign * (exitPrice - entryPrice) * PTS_PER_RS;
  return { pl, exitIdx: candles.length - 1, exitType: 'EOD', entryPrice, exitPrice, peakPts: peak };
}

// ─── findEntry (full logic, respects maxW cap) ─────────────────────────────
function findEntry(cs, prev, maxW) {
  if (!prev || cs.length < 3) return { entry: null, ctx: 'NONE', reason: 'no_prev' };

  const PH = Math.max(...prev.map(c => c.high));
  const PL = Math.min(...prev.map(c => c.low));

  const C0 = cs[0], C1 = cs[1] || C0;
  const C0bp = bp(C0), C1bp = bp(C1);

  let ctx = 'INSIDE';
  if (C0.open > PH && C0.close > PH) ctx = 'ABOVE_PDH';
  else if (C0.open < PL && C0.close < PL) ctx = 'BELOW_PDL';

  const cap = maxW; // max candle index for entry

  if (ctx === 'ABOVE_PDH') {
    if (C0bp < -50) { const i = firstBull(cs, 1, 30, cap); if (i > 0) return { entry: { idx: i, side: 'CE' }, ctx, reason: 'above_pdh_delayed_pe' }; }
    if (C0bp > 65)  return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'above_pdh_trend_ce' };
    if (C1bp < -50) return { entry: { idx: 1, side: 'PE' }, ctx, reason: 'above_pdh_c0_reversal_pe' };
    const s = firstStrong(cs, 2, 55, cap);
    if (s) return { entry: { idx: s.i, side: s.side }, ctx, reason: 'above_pdh_continuation' };
    return { entry: null, ctx, reason: 'above_pdh_no_signal' };
  }

  if (ctx === 'BELOW_PDL') {
    if (C0bp < -65) return { entry: null, ctx, reason: 'selling_climax_skip' };
    if (C0bp > 65)  { const i = firstBear(cs, 1, 30, cap); if (i > 0) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'recovery_bounce_pe' }; }
    if (C0.high < PL) {
      if (C1bp > 20) return { entry: { idx: 1, side: 'CE' }, ctx, reason: 'below_pdl_c1_bull_ce' };
      if (C1bp < -20) return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'below_pdl_no_recovery_pe' };
      const s = firstStrong(cs, 2, 40, cap);
      if (s && s.i <= Math.min(5, cap)) return { entry: { idx: s.i, side: s.side }, ctx, reason: 'below_pdl_c2_signal' };
      return { entry: null, ctx, reason: 'below_pdl_no_c1_signal' };
    }
    if (C0bp > 20)  { const i = firstBear(cs, 1, 30, cap); if (i > 0 && i <= Math.min(6, cap)) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'below_pdl_partial_bounce_pe' }; }
    if (C0bp < -10) {
      for (let i = 2; i <= Math.min(7, cap, cs.length - 2); i++) {
        if (bp(cs[i]) < -45 && cs[i-1].close < PL) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'below_pdl_failed_bounce_pe' };
      }
    }
    return { entry: null, ctx, reason: 'below_pdl_ambiguous_avoid' };
  }

  // INSIDE
  if (Math.abs(C0bp) > 50) {
    if (C0bp > 50) return { entry: { idx: 0, side: 'CE' }, ctx, reason: 'inside_c0_momentum' };
    return { entry: { idx: 0, side: 'PE' }, ctx, reason: 'inside_c0_momentum' };
  }
  if (Math.abs(C1bp) > 50) {
    if (C1bp > 50) return { entry: { idx: 1, side: 'CE' }, ctx, reason: 'inside_c1_signal' };
    return { entry: { idx: 1, side: 'PE' }, ctx, reason: 'inside_c1_signal' };
  }
  for (let i = 2; i <= Math.min(4, cap); i++) {
    if (!cs[i]) break;
    const b = bp(cs[i]);
    if (Math.abs(b) > 55) return { entry: { idx: i, side: b > 0 ? 'CE' : 'PE' }, ctx, reason: `inside_c${i}_strong` };
  }
  // PDL/PDH test (candles 5–cap)
  for (let i = 5; i < Math.min(cs.length, cap + 1); i++) {
    const prevClose = cs[i-1].close;
    if (cs[i].low  <= PL && prevClose > PL && bp(cs[i]) > 35) return { entry: { idx: i, side: 'CE' }, ctx, reason: 'inside_pdl_test_ce' };
    if (cs[i].high >= PH && prevClose < PH && bp(cs[i]) < -35) return { entry: { idx: i, side: 'PE' }, ctx, reason: 'inside_pdh_test_pe' };
  }
  return { entry: null, ctx, reason: 'inside_no_signal' };
}

// ─── re-entry helper ─────────────────────────────────────────────────────
function findReEntry(candles, exitIdx, side) {
  const max = candles.length - 3;
  for (let i = exitIdx + 1; i <= max; i++) {
    const b = bp(candles[i]);
    if (side === 'CE' && b > 35) return i;
    if (side === 'PE' && b < -35) return i;
  }
  return -1;
}

// ─── run one backtest with given entry window ──────────────────────────────
function runBacktest(maxW) {
  let totalPL = 0, wins = 0, losses = 0, traded = 0, total = 0;
  let peakPL = 0, maxDD = 0;
  const monthly = {};
  const yearly  = {};
  const byMkt   = { TRENDING: {pl:0,w:0,l:0,t:0}, CHOPPY: {pl:0,w:0,l:0,t:0}, RANGING: {pl:0,w:0,l:0,t:0}, MIXED: {pl:0,w:0,l:0,t:0}, FLAT: {pl:0,w:0,l:0,t:0} };

  for (const date of ALL) {
    const cs   = raw[date];
    const prev = getPrev(date);
    if (!prev) continue;
    total++;

    const { entry, ctx } = findEntry(cs, prev, maxW);
    if (!entry) continue;

    traded++;
    const { pl, exitIdx, exitType, peakPts } = calcPL(cs, entry.idx, entry.side);

    // re-entries
    let rePL = 0, curExit = exitIdx, curSide = entry.side, curPL = pl;
    for (let r = 0; r < 3; r++) {
      if (curPL > 0 && exitType !== 'EOD') {
        const ri = findReEntry(cs, curExit, curSide);
        if (ri > 0) {
          const re = calcPL(cs, ri, curSide);
          rePL += re.pl;
          curExit = re.exitIdx;
          curSide = re.exitType === 'SL' && re.peakPts >= 100 ? (curSide === 'CE' ? 'PE' : 'CE') : curSide;
          curPL = re.pl;
        } else break;
      } else break;
    }

    const dayPL = pl + rePL;
    totalPL += dayPL;
    if (dayPL > 0) wins++; else losses++;

    if (totalPL > peakPL) peakPL = totalPL;
    const dd = peakPL - totalPL;
    if (dd > maxDD) maxDD = dd;

    const ym = date.slice(0,7), y = date.slice(0,4);
    monthly[ym] = (monthly[ym] || 0) + dayPL;
    yearly[y]   = (yearly[y]   || 0) + dayPL;

    // market type (simple)
    const o = cs[0].open, c = cs[cs.length-1].close;
    const dH = Math.max(...cs.map(x=>x.high)), dL = Math.min(...cs.map(x=>x.low));
    const rng = dH - dL;
    let mkt = 'FLAT';
    if (rng >= 100) {
      const net = Math.abs(c-o)/rng;
      const rev = (() => { let r=0, pd=0; cs.forEach(c=>{ const d=bp(c)>25?1:bp(c)<-25?-1:0; if(d&&d===-pd){r++;pd=d;} }); return r; })();
      mkt = net > 0.6 ? 'TRENDING' : rev >= 4 ? 'CHOPPY' : net < 0.25 ? 'RANGING' : 'MIXED';
    }
    if (byMkt[mkt]) { byMkt[mkt].pl += dayPL; byMkt[mkt].t++; if (dayPL>0) byMkt[mkt].w++; else byMkt[mkt].l++; }
  }

  const wr = traded > 0 ? (wins/(wins+losses)*100).toFixed(1) : '0';
  return { totalPL, traded, wins, losses, wr, maxDD, monthly, yearly, byMkt };
}

// ─── RUN ALL WINDOWS ──────────────────────────────────────────────────────
const WINDOWS = [4, 8, 12, 16, 20];

console.log('\n════════════════════════════════════════════════════════════');
console.log('     ENTRY WINDOW COMPARISON — BHAV Strategy');
console.log('════════════════════════════════════════════════════════════');
console.log(`Cache: ${CACHE_FILE}`);
console.log('');
console.log(`${'Window'.padEnd(8)} ${'Traded'.padEnd(8)} ${'WR%'.padEnd(7)} ${'Total P&L'.padEnd(16)} ${'MaxDD'.padEnd(12)} ${'Avg/Year'.padEnd(12)} TREND days P&L`);
console.log('─'.repeat(90));

const results = {};
for (const w of WINDOWS) {
  const r = runBacktest(w);
  results[w] = r;
  const avgYear = (r.totalPL / 5.37).toFixed(0);
  const trendPL = r.byMkt.TRENDING ? r.byMkt.TRENDING.pl.toFixed(0) : '0';
  const trendDays = r.byMkt.TRENDING ? r.byMkt.TRENDING.t : 0;
  const label = w === 8 ? ' ← CURRENT LIVE' : '';
  console.log(
    `C0-C${String(w).padEnd(3)}  ${String(r.traded).padEnd(8)} ${String(r.wr+'%').padEnd(7)} ₹${(r.totalPL/100000).toFixed(2)}L${' '.repeat(5)} ₹${(r.maxDD/100000).toFixed(2)}L${' '.repeat(4)} ₹${(Number(avgYear)/100000).toFixed(2)}L/yr   ₹${(Number(trendPL)/1000).toFixed(0)}K (${trendDays}d)${label}`
  );
}

console.log('─'.repeat(90));

// ─── DETAILED YEARLY BREAKDOWN ─────────────────────────────────────────
console.log('\n════ YEARLY P&L BY WINDOW ════════════════════════════════════');
const years = ['2021','2022','2023','2024','2025','2026'];
console.log(`${'Year'.padEnd(7)} ${WINDOWS.map(w=>`W${w}`.padEnd(13)).join('')}`);
console.log('─'.repeat(80));
for (const y of years) {
  const row = `${y.padEnd(7)} ${WINDOWS.map(w=>{
    const v = results[w].yearly[y] || 0;
    return ('₹'+(v/100000).toFixed(2)+'L').padEnd(13);
  }).join('')}`;
  console.log(row);
}
const totRow = `${'TOTAL'.padEnd(7)} ${WINDOWS.map(w=>{
  const v = results[w].totalPL;
  return ('₹'+(v/100000).toFixed(2)+'L').padEnd(13);
}).join('')}`;
console.log('─'.repeat(80));
console.log(totRow);

// ─── MARKET TYPE BREAKDOWN FOR EACH WINDOW ────────────────────────────
console.log('\n════ TRENDING DAYS CAPTURE ════════════════════════════════════');
console.log(`${'Window'.padEnd(8)} ${'Days'.padEnd(7)} ${'WR'.padEnd(7)} ${'P&L'.padEnd(12)} ${'P&L/day'}`);
console.log('─'.repeat(50));
for (const w of WINDOWS) {
  const t = results[w].byMkt.TRENDING;
  const wr = t.t > 0 ? (t.w/(t.w+t.l)*100).toFixed(0)+'%' : '-';
  const ppd = t.t > 0 ? '₹'+(t.pl/t.t/1000).toFixed(1)+'K' : '-';
  const label = w === 8 ? ' ← live' : '';
  console.log(`C0-C${String(w).padEnd(3)}  ${String(t.t).padEnd(7)} ${wr.padEnd(7)} ₹${(t.pl/100000).toFixed(2)}L${' '.repeat(5)} ${ppd}${label}`);
}

console.log('\n════ CHOPPY DAYS CAPTURE ════════════════════════════════════');
console.log(`${'Window'.padEnd(8)} ${'Days'.padEnd(7)} ${'WR'.padEnd(7)} ${'P&L'.padEnd(12)} ${'P&L/day'}`);
console.log('─'.repeat(50));
for (const w of WINDOWS) {
  const t = results[w].byMkt.CHOPPY;
  const wr = t.t > 0 ? (t.w/(t.w+t.l)*100).toFixed(0)+'%' : '-';
  const ppd = t.t > 0 ? '₹'+(t.pl/t.t/1000).toFixed(1)+'K' : '-';
  const label = w === 8 ? ' ← live' : '';
  console.log(`C0-C${String(w).padEnd(3)}  ${String(t.t).padEnd(7)} ${wr.padEnd(7)} ₹${(t.pl/100000).toFixed(2)}L${' '.repeat(5)} ${ppd}${label}`);
}

console.log('\nDone.\n');

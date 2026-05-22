/**
 * backtest_new_strategy.js
 * Full detailed backtest of AMINA 100 with TICK-LEVEL SL
 * (equivalent to exit@SL-price — the closest proxy to tick-level exits)
 * Dataset: Apr 2021 → Apr 2026  (30,882 candles)
 */
'use strict';
const fs = require('fs');

const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS_PER_PT   = 15;
const TRAIL_GAP   = 100;
const SL_INITIAL  = 60;
const QTY         = 30;

const raw     = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
  return { date, h: ist.getHours(), m: ist.getMinutes(),
           open: c.open, high: c.high, low: c.low, close: c.close };
}).filter(c => c.close > 0);

const byDay = {};
for (const c of candles) {
  if (!byDay[c.date]) byDay[c.date] = [];
  byDay[c.date].push(c);
}
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log(`Candles: ${candles.length}  |  Trading days: ${allDates.length}  (${allDates[0]} → ${allDates[allDates.length-1]})\n`);

function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = enrich(cs[i]), cb = enrich(cs[i + 1]);
    let sig = null, c2level = 0;
    if (ca.bull === cb.bull) {
      sig     = ca.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.high : ca.low;
    } else if (cb.body_size > ca.body_size) {
      sig     = cb.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.body_high : ca.body_low;
    } else { continue; }
    if (sig === 'CE' && cb.close > c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, px: cb.close, entryIdx: i + 1 };
    for (let j = i + 2; j < cs.length; j++) {
      const cj = cs[j];
      if (sig === 'CE' && cj.close > c2level) return { sig, px: cj.close, entryIdx: j };
      if (sig === 'PE' && cj.close < c2level) return { sig, px: cj.close, entryIdx: j };
    }
    break;
  }
  return null;
}

// ── Run backtest ────────────────────────────────────────────────────────────
let totalPts = 0, wins = 0, losses = 0, flat = 0;
let equity = 0, peak = 0, maxDD = 0;
const yearly  = {}, monthly = {};
const byMonth = {};   // for monthly table
let t1SLCount = 0, reSLCount = 0, eodCount = 0;
let totalT1Pts = 0, totalRePts = 0;
let t1Wins = 0, t1Losses = 0, reWins = 0, reLosses = 0;

for (const date of allDates) {
  const dc    = byDay[date];
  const entry = rollingEntryScan(dc);
  const yr    = date.slice(0, 4);
  const mo    = date.slice(0, 7);

  if (!entry) { flat++; continue; }

  const { sig: t1Dir, px: t1Entry, entryIdx } = entry;
  let   t1Peak = 0;

  // ── T1 phase: scan remaining candles for SL hit ──────────────────────────
  let t1ExitPts = null, t1ExitType = null;
  for (let i = entryIdx + 1; i < dc.length; i++) {
    const c = dc[i];
    const bestPts  = t1Dir === 'CE' ? c.high  - t1Entry : t1Entry - c.low;
    const worstPts = t1Dir === 'CE' ? c.low   - t1Entry : t1Entry - c.high;
    if (bestPts  > t1Peak) t1Peak = bestPts;
    const sl     = t1Peak >= SL_INITIAL ? Math.max(0, t1Peak - TRAIL_GAP) : -SL_INITIAL;
    if (worstPts <= sl) { t1ExitPts = sl; t1ExitType = 'SL'; break; }
    t1ExitPts = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
    t1Peak    = Math.max(t1Peak, t1ExitPts);
  }
  if (t1ExitPts === null) { flat++; continue; }
  if (t1ExitType !== 'SL') { t1ExitType = 'EOD'; }

  totalT1Pts += t1ExitPts;
  if (t1ExitPts > 0) t1Wins++; else t1Losses++;

  // ── RE phase (only if T1 hit SL) ─────────────────────────────────────────
  let dayPts = t1ExitPts;
  let rePts  = 0;

  if (t1ExitType === 'SL') {
    t1SLCount++;
    const reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
    const reEntry = t1Entry + t1ExitPts; // approx: entry + SL offset
    let   rePeak  = 0;
    let   reExitType = null;

    // Find which candle the T1 SL fired on
    let   reStartIdx = entryIdx + 1;
    for (let i = entryIdx + 1; i < dc.length; i++) {
      const c = dc[i];
      const worstPts = t1Dir === 'CE' ? c.low - t1Entry : t1Entry - c.high;
      const sl = t1Peak >= SL_INITIAL ? Math.max(0, t1Peak - TRAIL_GAP) : -SL_INITIAL;
      if (worstPts <= sl) { reStartIdx = i; break; }
    }

    for (let i = reStartIdx; i < dc.length; i++) {
      const c = dc[i];
      const bestPts  = reDir === 'CE' ? c.high  - reEntry : reEntry - c.low;
      const worstPts = reDir === 'CE' ? c.low   - reEntry : reEntry - c.high;
      if (bestPts  > rePeak) rePeak = bestPts;
      const sl = rePeak >= SL_INITIAL ? Math.max(0, rePeak - TRAIL_GAP) : -SL_INITIAL;
      if (worstPts <= sl) { rePts = sl; reExitType = 'SL'; break; }
      rePts = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      rePeak = Math.max(rePeak, rePts);
    }
    if (reExitType === 'SL') reSLCount++; else eodCount++;
    dayPts += rePts;
    totalRePts += rePts;
    if (rePts > 0) reWins++; else reLosses++;
  } else {
    eodCount++;
  }

  // ── Accumulate ───────────────────────────────────────────────────────────
  totalPts += dayPts;
  equity   += dayPts;
  if (equity > peak) peak = equity;
  if (peak - equity > maxDD) maxDD = peak - equity;

  yearly[yr]  = (yearly[yr]  || 0) + dayPts;
  monthly[mo] = (monthly[mo] || 0) + dayPts;
  if (!byMonth[mo]) byMonth[mo] = { wins: 0, losses: 0, pts: 0 };
  if (dayPts > 0) { wins++; byMonth[mo].wins++;  }
  else if (dayPts < 0) { losses++; byMonth[mo].losses++; }
  else flat++;
  byMonth[mo].pts += dayPts;
}

const tradeDays = wins + losses;
const netRs     = Math.round(totalPts * RS_PER_PT);
const maxDDRs   = Math.round(maxDD * RS_PER_PT);
const avgDayRs  = tradeDays ? Math.round(netRs / tradeDays) : 0;
const winPct    = tradeDays ? ((wins / tradeDays) * 100).toFixed(1) : '0';

const fmt  = n => (n >= 0 ? '+' : '') + '₹' + n.toLocaleString('en-IN');
const fmtL = n => (n >= 0 ? '+' : '') + (n / 100000).toFixed(2) + 'L';

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('═'.repeat(62));
console.log(' AMINA 100 — TICK-LEVEL SL BACKTEST (New Strategy)');
console.log(' SL=60 pts  |  Trail 100 pts behind peak  |  Qty=30');
console.log('═'.repeat(62));
console.log(` Net P&L      : ${fmt(netRs).padStart(14)}  (${fmtL(netRs)})`);
console.log(` Trade days   : ${String(tradeDays).padStart(14)}  of ${allDates.length} total days`);
console.log(` Win Rate     : ${(winPct + '%').padStart(14)}`);
console.log(` Avg/Trade Day: ${fmt(avgDayRs).padStart(14)}`);
console.log(` Max Drawdown : ${fmt(-maxDDRs).padStart(14)}`);
console.log(` T1 SL exits  : ${String(t1SLCount).padStart(14)}`);
console.log(` RE SL exits  : ${String(reSLCount).padStart(14)}`);
console.log('─'.repeat(62));

// ── Year by year ─────────────────────────────────────────────────────────────
console.log('\n  YEAR-BY-YEAR');
console.log('  ' + '─'.repeat(42));
console.log('  Year    Net Rs         Net ₹L    Win% (est)');
console.log('  ' + '─'.repeat(42));
for (const yr of Object.keys(yearly).sort()) {
  const pts = yearly[yr];
  const rs  = Math.round(pts * RS_PER_PT);
  console.log(`  ${yr}   ${fmt(rs).padStart(12)}   ${fmtL(rs).padStart(8)}`);
}
console.log('  ' + '─'.repeat(42));
console.log(`  TOTAL  ${fmt(netRs).padStart(12)}   ${fmtL(netRs).padStart(8)}`);

// ── Monthly breakdown ────────────────────────────────────────────────────────
console.log('\n  MONTHLY P&L (₹)');
console.log('  ' + '─'.repeat(50));
console.log('  Month       Net ₹       W   L   Win%');
console.log('  ' + '─'.repeat(50));
let runningRs = 0;
for (const mo of Object.keys(byMonth).sort()) {
  const d = byMonth[mo];
  const rs = Math.round(d.pts * RS_PER_PT);
  runningRs += rs;
  const tot = d.wins + d.losses;
  const wp  = tot ? ((d.wins / tot) * 100).toFixed(0) : '—';
  const bar = rs >= 0 ? '█'.repeat(Math.min(Math.round(rs/5000), 10)) : '▒'.repeat(Math.min(Math.round(-rs/5000), 10));
  console.log(`  ${mo}   ${fmt(rs).padStart(10)}  ${String(d.wins).padStart(2)}  ${String(d.losses).padStart(2)}  ${(wp+'%').padStart(5)}  ${bar}`);
}
console.log('  ' + '─'.repeat(50));
console.log(`\n  Cumulative end: ${fmt(runningRs)}`);
console.log(`\n  NOTE: Tick-level SL proxy = exits at SL price (±60 pts exactly)`);
console.log(`        Live bot now exits within 30s of SL breach (~same result)\n`);

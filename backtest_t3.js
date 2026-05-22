'use strict';
/**
 * AMINA 100 Variant B — T3 Recovery Backtest
 * Compares: No T3  vs  T3 with cooldown = 3, 6, 9 candles
 *
 * Strategy:  SL=60, TrailGap=100, Buf=25
 *   T1: first candle-pair signal of day
 *   RE: immediate reverse entry after T1 SL
 *   T3: after RE SL, wait N candles, scan last-2 pair for signal
 *
 * SL check: tick (intrabar high/low) for candle + candle-close check
 */
const fs       = require('fs');
const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS_PER_PT   = 15;   // 30 qty × 0.5 delta
const SL_INITIAL  = 60;
const TRAIL_GAP   = 100;
const BUFFER      = 25;

// ── Load candles ──────────────────────────────────────────────────────────────
console.log('Loading candles...');
const raw = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist  = new Date(utc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`;
  return { date, h: ist.getHours(), m: ist.getMinutes(),
           open: c.open, high: c.high, low: c.low, close: c.close };
}).filter(c => c.close > 0);

const byDay  = {};
for (const c of candles) { if (!byDay[c.date]) byDay[c.date]=[]; byDay[c.date].push(c); }
const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
console.log(`Candles: ${candles.length}  |  Days: ${allDates.length}  (${allDates[0]} → ${allDates[allDates.length-1]})\n`);

// ── Candle enrichment ─────────────────────────────────────────────────────────
function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// ── Signal scan: finds FIRST valid pair, entry on candle that breaks the level ─
// Returns { sig, entryIdx } or null
function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i+1];
    let sig = null, bl = 0;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? ca.high : ca.low;          // C2 entry level
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? ca.body_high : ca.body_low; // C2 entry level
    } else continue;

    // C2 early entry: does cb itself break the level?
    if (sig === 'CE' && cb.close > bl) return { sig, entryIdx: i+1 };
    if (sig === 'PE' && cb.close < bl) return { sig, entryIdx: i+1 };
    // C3+ fallback
    const c3bl = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    for (let j = i+2; j < cs.length; j++) {
      if (sig === 'CE' && cs[j].close > c3bl) return { sig, entryIdx: j };
      if (sig === 'PE' && cs[j].close < c3bl) return { sig, entryIdx: j };
    }
  }
  return null;
}

// ── T3 scan: ONLY last-2 candle pair, C2 entry only ──────────────────────────
function t3EntryScan(cs) {
  if (cs.length < 2) return null;
  const ca = cs[cs.length-2], cb = cs[cs.length-1];
  let sig = null, bl = 0;
  if (ca.bull === cb.bull) {
    sig = ca.bull ? 'CE' : 'PE';
    bl  = sig === 'CE' ? ca.high : ca.low;
  } else if (cb.body_size > ca.body_size) {
    sig = cb.bull ? 'CE' : 'PE';
    bl  = sig === 'CE' ? ca.body_high : ca.body_low;
  }
  if (!sig) return null;
  if (sig === 'CE' && cb.close > bl) return { sig };
  if (sig === 'PE' && cb.close < bl) return { sig };
  return null;
}

// ── Trail SL helper ───────────────────────────────────────────────────────────
// Returns updated sl_px (level at which price hits SL)
// For CE: sl_px is BELOW entry (slDir = +1 means CE)
// For PE: sl_px is ABOVE entry
function trailSL(entry, dir, peak) {
  const effSL = peak >= SL_INITIAL ? Math.max(0, peak - TRAIL_GAP) : -SL_INITIAL;
  return dir === 'CE' ? entry + effSL : entry - effSL;
}

// ── Simulate one trade leg from entry candle (idx) onward ────────────────────
// Returns { pts, exitIdx } — uses intrabar tick SL + candle-close SL
function simLeg(cs, startIdx, dir, entryPx) {
  let peak = 0;
  for (let i = startIdx + 1; i < cs.length; i++) {
    const c    = cs[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 14);

    // SL based on PREVIOUS peak
    const sl = trailSL(entryPx, dir, peak);

    // Tick SL (intrabar): no buffer
    const tickHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
    if (tickHit) {
      const pts = dir === 'CE' ? sl - entryPx : entryPx - sl;
      return { pts, exitIdx: i };
    }

    // Update peak with close
    const cur = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
    if (cur > peak) peak = cur;

    // Candle-close SL (with buffer)
    const slClose = trailSL(entryPx, dir, peak);
    const closeSLHit = dir === 'CE' ? c.close <= slClose - BUFFER : c.close >= slClose + BUFFER;
    if (closeSLHit) {
      const pts = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
      return { pts, exitIdx: i };
    }

    if (isEOD) {
      const pts = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
      return { pts, exitIdx: i };
    }
  }
  // End of day candles array
  const last = cs[cs.length-1];
  return { pts: dir === 'CE' ? last.close - entryPx : entryPx - last.close, exitIdx: cs.length-1 };
}

// ── Simulate one day ──────────────────────────────────────────────────────────
// t3Cooldown: number of DONE candles to wait before T3 (0 = no T3)
function simDay(rawCandles, t3Cooldown) {
  const cs    = rawCandles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let t1Pts = 0, rePts = 0, t3Pts = 0;
  let t3Used = false, t1Done = false;

  // ── T1: find first entry ──────────────────────────────────────────────────
  let t1EntryIdx = -1, t1Dir = null, t1Entry = 0;
  for (let i = 1; i < cs.length; i++) {
    if (isEOD(cs[i])) break;
    const slice = cs.slice(0, i+1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== i) continue;
    t1Dir = res.sig; t1Entry = cs[i].close; t1EntryIdx = i;
    break;
  }
  if (t1EntryIdx < 0) return { dayPts: 0, t1Pts: 0, rePts: 0, t3Pts: 0, traded: false };

  // ── T1 leg ────────────────────────────────────────────────────────────────
  const t1Leg = simLeg(cs, t1EntryIdx, t1Dir, t1Entry);
  t1Pts = t1Leg.pts;

  // Did T1 SL or EOD?
  const t1ExitC = cs[t1Leg.exitIdx];
  if (isEOD(t1ExitC) || t1Leg.exitIdx === cs.length-1) {
    // T1 ran to EOD — no RE/T3
    return { dayPts: t1Pts, t1Pts, rePts: 0, t3Pts: 0, traded: true, t3Used: false };
  }

  // T1 SL hit → determine if SL exit or trail exit
  // If T1 was profitable (trail exit), no RE
  if (t1Pts > 0) {
    return { dayPts: t1Pts, t1Pts, rePts: 0, t3Pts: 0, traded: true, t3Used: false };
  }

  // T1 SL with loss → RE entry
  const reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
  const reEntry = t1ExitC.close;  // exit price = RE entry
  const reEntryIdx = t1Leg.exitIdx;

  const reLeg = simLeg(cs, reEntryIdx, reDir, reEntry);
  rePts = reLeg.pts;

  const reExitC = cs[reLeg.exitIdx];
  if (isEOD(reExitC) || reLeg.exitIdx === cs.length-1 || rePts > 0) {
    // RE ran to EOD or was profitable — no T3
    return { dayPts: t1Pts + rePts, t1Pts, rePts, t3Pts: 0, traded: true, t3Used: false };
  }

  // RE SL with loss → DONE. Now count cooldown candles then T3
  if (t3Cooldown === 0) {
    return { dayPts: t1Pts + rePts, t1Pts, rePts, t3Pts: 0, traded: true, t3Used: false };
  }

  let doneCount = 0;
  for (let i = reLeg.exitIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (isEOD(c)) break;
    doneCount++;
    if (doneCount < t3Cooldown) continue;

    // Scan last-2 pair for T3 signal
    const slice = cs.slice(0, i+1);
    const res   = t3EntryScan(slice);
    if (!res) continue;

    // T3 entry
    const t3Dir   = res.sig;
    const t3Entry = c.close;
    const t3Leg   = simLeg(cs, i, t3Dir, t3Entry);
    t3Pts = t3Leg.pts;

    return { dayPts: t1Pts + rePts + t3Pts, t1Pts, rePts, t3Pts, traded: true, t3Used: true, t3Candle: doneCount };
  }

  return { dayPts: t1Pts + rePts, t1Pts, rePts, t3Pts: 0, traded: true, t3Used: false };
}

// ── Run full backtest for a given T3 cooldown ─────────────────────────────────
function runBacktest(t3Cooldown) {
  let totalPts = 0, winDays = 0, lossDays = 0, flatDays = 0, noTradeDays = 0;
  let equity = 0, peak = 0, maxDD = 0;
  let t3Fires = 0, t3Wins = 0, t3Losses = 0;
  const yearly = {}, monthly = {};
  const t3DayPnL = [];

  for (const date of allDates) {
    const r = simDay(byDay[date], t3Cooldown);
    if (!r.traded) { noTradeDays++; continue; }

    totalPts += r.dayPts;
    const yr = date.slice(0,4), mo = date.slice(0,7);
    if (!yearly[yr]) yearly[yr] = 0;
    if (!monthly[mo]) monthly[mo] = 0;
    yearly[yr] += r.dayPts; monthly[mo] += r.dayPts;

    if (r.dayPts > 0)      winDays++;
    else if (r.dayPts < 0) lossDays++;
    else                   flatDays++;

    equity += r.dayPts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    if (r.t3Used) {
      t3Fires++;
      t3DayPnL.push(r.t3Pts);
      if (r.t3Pts > 0) t3Wins++; else t3Losses++;
    }
  }

  const tradingDays = winDays + lossDays + flatDays;
  return {
    totalPts, totalRs: Math.round(totalPts * RS_PER_PT),
    winDays, lossDays, flatDays, noTradeDays, tradingDays,
    winPct: ((winDays / tradingDays) * 100).toFixed(1),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    t3Fires, t3Wins, t3Losses,
    t3WinPct: t3Fires > 0 ? ((t3Wins/t3Fires)*100).toFixed(0) : '-',
    t3AvgPts: t3Fires > 0 ? (t3DayPnL.reduce((a,b)=>a+b,0)/t3Fires).toFixed(0) : 0,
    yearly, monthly
  };
}

// ── Run all variants ──────────────────────────────────────────────────────────
const variants = [
  { cooldown: 0, label: 'No T3 (base)'           },
  { cooldown: 3, label: 'T3 cooldown = 3 (45 min)' },
  { cooldown: 6, label: 'T3 cooldown = 6 (90 min)' },
  { cooldown: 9, label: 'T3 cooldown = 9 (2h 15m)' },
];

console.log('Running backtests...\n');
const results = [];
for (const v of variants) {
  process.stdout.write(`  ${v.label.padEnd(28)}... `);
  const r = runBacktest(v.cooldown);
  results.push({ ...v, ...r });
  console.log(`done  ₹${r.totalRs.toLocaleString('en-IN')}  (Win: ${r.winPct}%)`);
}

// ── Print table ───────────────────────────────────────────────────────────────
const fmt  = n => (n >= 0 ? '+' : '') + '₹' + Math.abs(n).toLocaleString('en-IN');
const fmtP = n => (n >= 0 ? '+' : '') + Math.round(n) + ' pts';
const LINE = '='.repeat(105);
const SEP  = '-'.repeat(100);

console.log('\n' + LINE);
console.log('  AMINA 100 Variant B — T3 RECOVERY BACKTEST  |  SL=60  Trail=100  Buf=25  |  5 years');
console.log(LINE);
console.log(`  ${'Variant'.padEnd(28)} ${'Total ₹'.padStart(14)} ${'Total Pts'.padStart(11)} ${'Win%'.padStart(6)} ${'W/L Days'.padStart(10)} ${'MaxDD'.padStart(11)} ${'vs NoT3'.padStart(11)}`);
console.log('  ' + SEP);
const base = results[0];
for (const r of results) {
  const diff = r.totalRs - base.totalRs;
  const diffStr = r === base ? '—' : fmt(diff);
  console.log(`  ${r.label.padEnd(28)} ${fmt(r.totalRs).padStart(14)} ${fmtP(r.totalPts).padStart(11)} ${(r.winPct+'%').padStart(6)} ${(r.winDays+'/'+r.lossDays).padStart(10)} ${fmt(-r.maxDDRs).padStart(11)} ${diffStr.padStart(11)}`);
}
console.log(LINE);

// ── T3 stats ──────────────────────────────────────────────────────────────────
console.log('\n  T3 TRADE STATS:');
console.log(`  ${'Variant'.padEnd(28)} ${'T3 Fires'.padStart(10)} ${'T3 Wins'.padStart(9)} ${'T3 Losses'.padStart(11)} ${'T3 Win%'.padStart(9)} ${'Avg T3 Pts'.padStart(12)}`);
console.log('  ' + SEP);
for (const r of results.filter(r => r.cooldown > 0)) {
  console.log(`  ${r.label.padEnd(28)} ${String(r.t3Fires).padStart(10)} ${String(r.t3Wins).padStart(9)} ${String(r.t3Losses).padStart(11)} ${(r.t3WinPct+'%').padStart(9)} ${String(r.t3AvgPts).padStart(12)}`);
}
console.log(LINE);

// ── Year-by-year ──────────────────────────────────────────────────────────────
const allYears = [...new Set(results.flatMap(r => Object.keys(r.yearly)))].sort();
console.log('\n  YEAR-BY-YEAR (₹):');
console.log(`  ${'Year'.padEnd(6)} ${results.map(r => r.label.slice(0,12)).map(h => h.padStart(14)).join('')}`);
console.log('  ' + '-'.repeat(70));
for (const yr of allYears) {
  const vals = results.map(r => r.yearly[yr] != null ? fmt(Math.round(r.yearly[yr]*RS_PER_PT)) : '—');
  console.log(`  ${yr.padEnd(6)} ${vals.map(v => v.padStart(14)).join('')}`);
}
console.log(LINE);

// ── Monthly best/worst ────────────────────────────────────────────────────────
console.log('\n  MONTHLY BREAKDOWN (No T3 vs Best T3):');
const best = results.slice(1).reduce((a,b) => b.totalRs > a.totalRs ? b : a);
const allMonths = [...new Set(Object.keys(base.monthly).concat(Object.keys(best.monthly)))].sort();
let t3MonthlyBetter = 0, t3MonthlyWorse = 0;
for (const mo of allMonths) {
  const bPts = base.monthly[mo] || 0;
  const tPts = best.monthly[mo] || 0;
  if (tPts > bPts) t3MonthlyBetter++; else if (tPts < bPts) t3MonthlyWorse++;
}
console.log(`  Best T3 variant: "${best.label}"`);
console.log(`  Months T3 improved: ${t3MonthlyBetter}  |  Months T3 made worse: ${t3MonthlyWorse}`);
console.log(LINE);
console.log();

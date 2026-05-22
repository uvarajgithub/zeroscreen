'use strict';
/**
 * AMINA 100 Variant B — Structure SL vs Fixed SL
 * Uses EXACT same entry/day logic as backtest_5yr_clean.js
 * but runs against local research-candles-cache.json (no API needed)
 *
 * Variants:
 *   A. Fixed SL=50  (exact current backtest baseline — should match ₹24,15,000)
 *   B. Structure SL = C1 candle extreme (high for PE, low for CE) — no cap
 *   C. Structure SL — capped at 80 pts max
 *   D. Structure SL — capped at 100 pts max
 */
const fs = require('fs');

const CANDLE_FILE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const RS_PER_PT   = 15;
const SL_T1_FIXED = 50;
const SL_RE       = 100;

const raw  = JSON.parse(fs.readFileSync(CANDLE_FILE, 'utf8'));
// Group by date
const byDate = {};
for (const c of raw) {
  const date = c.date.slice(0, 10);
  if (!byDate[date]) byDate[date] = [];
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  const body_size = body_high - body_low;
  byDate[date].push({ ...c, date, bull, body_high, body_low, body_size });
}
const tradingDays = Object.entries(byDate).filter(([, cs]) => cs.length >= 20).sort();
console.log(`Days: ${tradingDays.length}  (${tradingDays[0][0]} → ${tradingDays[tradingDays.length-1][0]})\n`);

// --- Entry scan (exact same as backtest_5yr_clean.js) ---
// Returns { sig, px, idx, structSL } where structSL = C1 extreme
function findEntry(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = null, structSL = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      structSL = sig === 'CE' ? ca.low : ca.high;   // C1 opposite extreme
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
      structSL = sig === 'CE' ? ca.body_low : ca.body_high;
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, idx: j, structSL };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, idx: j, structSL };
    }
  }
  return null;
}

const mv  = (s, e, p) => s === 'CE' ? p - e : e - p;
const opp = s => s === 'CE' ? 'PE' : 'CE';

// Run one day with a given T1 SL distance
function runDay(cs, t1SlDist) {
  if (cs.length < 5) return { pts: 0, noEntry: true };
  const e = findEntry(cs);
  if (!e) return { pts: 0, noEntry: true };

  const last = cs[cs.length - 1].close;

  // T1: SL on candle close
  let slHit = false, sIdx = null, sPx = null;
  let t1Pts = mv(e.sig, e.px, last);
  for (let i = e.idx + 1; i < cs.length; i++) {
    if (mv(e.sig, e.px, cs[i].close) <= -t1SlDist) {
      slHit = true; sIdx = i; sPx = cs[i].close; t1Pts = -t1SlDist; break;
    }
  }

  // RE: opposite, filter by day open, SL=100 on candle close
  let rePts = 0;
  if (slHit) {
    const dayOpen = cs[0].open;
    const rs  = opp(e.sig);
    const mar = rs === 'CE' ? (sPx - dayOpen) : -(sPx - dayOpen);
    if (mar < 0) {
      rePts = mv(rs, sPx, last);
      for (let i = sIdx + 1; i < cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePts = -SL_RE; break; }
      }
    }
  }
  return { pts: t1Pts + rePts, t1Pts, rePts, slHit, noEntry: false };
}

// Run one day with structure SL (with optional cap)
function runDayStructure(cs, cap) {
  if (cs.length < 5) return { pts: 0, noEntry: true };
  const e = findEntry(cs);
  if (!e) return { pts: 0, noEntry: true };

  const rawDist = Math.abs(e.structSL - e.px);
  const t1SlDist = cap ? Math.min(rawDist, cap) : rawDist;
  return runDay(cs, t1SlDist);
}

function backtest(label, fn) {
  let totalPts = 0, profitDays = 0, lossDays = 0, noEntry = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {};
  let structDistSum = 0, structDistCnt = 0;

  for (const [date, cs] of tradingDays) {
    const r = fn(cs);
    totalPts += r.pts;
    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = 0;
    yearly[yr] += r.pts;

    if (r.noEntry)    noEntry++;
    else if (r.pts > 0) profitDays++;
    else if (r.pts < 0) lossDays++;

    equity += r.pts;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;
  }

  const traded = profitDays + lossDays;
  const winPct = ((profitDays / traded) * 100).toFixed(1);
  const totalRs = Math.round(totalPts * RS_PER_PT);
  const maxDDRs = Math.round(maxDD * RS_PER_PT);
  return { label, totalRs, winPct, profitDays, lossDays, maxDDRs, yearly, noEntry };
}

console.log('Running variants...\n');

const results = [
  backtest('A. Fixed SL=50  (baseline — should ≈ ₹24,15,000)',  cs => runDay(cs, SL_T1_FIXED)),
  backtest('B. Structure SL  no cap                          ',  cs => runDayStructure(cs, 0)),
  backtest('C. Structure SL  cap=80pts                       ',  cs => runDayStructure(cs, 80)),
  backtest('D. Structure SL  cap=100pts                      ',  cs => runDayStructure(cs, 100)),
  backtest('E. Structure SL  cap=60pts                       ',  cs => runDayStructure(cs, 60)),
];

const base = results[0];
const fmt  = n => (n >= 0 ? '+' : '') + '₹' + Math.abs(n).toLocaleString('en-IN');
const LINE = '='.repeat(100);
const SEP  = '-'.repeat(95);

console.log(LINE);
console.log('  AMINA 100 Variant B — Structure SL vs Fixed SL  |  5 years');
console.log(LINE);
console.log(`  ${'Variant'.padEnd(48)} ${'Total ₹'.padStart(13)} ${'Win%'.padStart(6)} ${'W/L'.padStart(9)} ${'MaxDD'.padStart(11)} ${'vs A'.padStart(11)}`);
console.log('  ' + SEP);
for (const r of results) {
  const diff = r === base ? '—' : fmt(r.totalRs - base.totalRs);
  const diffMark = r !== base && r.totalRs > base.totalRs ? ' ✅' : r !== base ? ' ❌' : '';
  console.log(`  ${r.label.padEnd(48)} ${fmt(r.totalRs).padStart(13)} ${(r.winPct+'%').padStart(6)} ${(r.profitDays+'/'+r.lossDays).padStart(9)} ${fmt(-r.maxDDRs).padStart(11)} ${(diff+diffMark).padStart(14)}`);
}
console.log(LINE);

const allYears = [...new Set(results.flatMap(r => Object.keys(r.yearly)))].sort();
console.log('\n  YEAR-BY-YEAR (₹):');
const headers = results.map((r, i) => String.fromCharCode(65+i)).map(h => h.padStart(12));
console.log(`  ${'Year'.padEnd(6)} ${headers.join('')}`);
console.log('  ' + '-'.repeat(68));
for (const yr of allYears) {
  const vals = results.map(r => (fmt(Math.round((r.yearly[yr] || 0) * RS_PER_PT))).padStart(12));
  console.log(`  ${yr.padEnd(6)} ${vals.join('')}`);
}
console.log(LINE);
console.log();

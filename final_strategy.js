'use strict';
// ============================================================
// FINAL STRATEGY BACKTEST — BankNifty Options
// Entry: Rolling scan (Rules A/B), stop at 11:30 AM
// T1 SL: 50pt fixed | T1 Target: hold to close
// Re-entry: Opposite, filter(price vs day open), 100pt SL, hold to close
// ============================================================
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

// ---- CONFIG ----
const LOT_SIZE   = 30;    // qty per lot
const DELTA      = 0.5;   // ATM option delta
const PREMIUM    = 500;   // approx option premium paid
const LOTS       = 1;     // number of lots traded
const RS_PER_PT  = LOT_SIZE * DELTA * LOTS; // = 15 Rs per underlying point
const CAPITAL    = LOT_SIZE * PREMIUM * LOTS; // = Rs 15,000 per trade

const SL_T1   = 50;
const SL_RE   = 100;

// ---- ENTRY SCAN ----
function findEntry(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    if (ca.h > 11 || (ca.h === 11 && ca.m >= 30)) break;
    let sig = null, bl = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (c.h > 15 || (c.h === 15 && c.m >= 15)) break;
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, t: c.time, idx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, t: c.time, idx: j };
    }
  }
  return null;
}

const mv  = (s, e, p) => s === 'CE' ? p - e : e - p;
const opp = s => s === 'CE' ? 'PE' : 'CE';
const fmt = (v) => (v >= 0 ? '+' : '') + v.toFixed(0);

// ---- SIMULATION ----
let totalPts = 0, totalRs = 0;
let t1Wins = 0, t1Loss = 0, t1Hold = 0;
let reWins = 0, reLoss = 0, reSkip = 0, noRe = 0;
let dayResults = [];

console.log('\n' + '═'.repeat(110));
console.log('  FINAL STRATEGY BACKTEST — BankNifty Options');
console.log(`  Lot:${LOT_SIZE}qty | Delta:${DELTA} | Premium:~${PREMIUM} | Rs/pt:${RS_PER_PT} | Capital/trade:Rs${CAPITAL}`);
console.log('═'.repeat(110));
console.log('\nDate         Sig  Entry@T      T1-PnL    T1-Rs   Re?  ReDir  Re-PnL   Re-Rs   DayPts  Day-Rs   Cumul-Rs');
console.log('─'.repeat(110));

let cumulRs = 0;

for (const [date, cs] of days) {
  const e = findEntry(cs);
  if (!e) { console.log(`${date}  -- NO ENTRY`); continue; }

  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  // ---- TRADE 1 ----
  let slHit = false, sIdx = null, sPx = null, sT = null;
  let t1Pts = mv(e.sig, e.px, last);

  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL_T1) {
      slHit = true; sIdx = i; sPx = c.close; sT = c.time;
      t1Pts = -SL_T1; break;
    }
  }

  const t1Rs = t1Pts * RS_PER_PT;
  if (slHit) t1Loss++; else if (t1Pts > 0) t1Wins++; else t1Hold++;

  // ---- RE-ENTRY ----
  let rePts = 0, reRs = 0, reLabel = 'NO-SL';

  if (slHit) {
    const rs = opp(e.sig);
    const moveFromOpen  = sPx - dayOpen;
    const moveAgainstRe = rs === 'CE' ? moveFromOpen : -moveFromOpen;

    if (moveAgainstRe >= 0) {
      reLabel = 'SKIP'; reSkip++;
    } else {
      reLabel = rs;
      rePts = mv(rs, sPx, last);
      for (let i = sIdx + 1; i < cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePts = -SL_RE; break; }
      }
      reRs = rePts * RS_PER_PT;
      if (rePts > 0) reWins++; else reLoss++;
    }
  } else {
    noRe++;
  }

  const dayPts = t1Pts + rePts;
  const dayRs  = dayPts * RS_PER_PT;
  totalPts += dayPts;
  totalRs  += dayRs;
  cumulRs  += dayRs;

  dayResults.push({ date, dayPts, dayRs });

  console.log(
    `${date}  ${e.sig}  ${e.px.toFixed(0)}@${e.t}  ` +
    `${fmt(t1Pts).padStart(6)} ${fmt(t1Rs).padStart(7)}  ` +
    `${reLabel.padEnd(5)} ` +
    `${reLabel !== 'NO-SL' && reLabel !== 'SKIP' ? fmt(rePts).padStart(6) : '  --  '}  ` +
    `${reLabel !== 'NO-SL' && reLabel !== 'SKIP' ? fmt(reRs).padStart(7) : '     -- '}  ` +
    `${fmt(dayPts).padStart(6)}  ${fmt(dayRs).padStart(7)}  Rs${cumulRs.toFixed(0).padStart(7)}`
  );
}

console.log('─'.repeat(110));

// ---- SUMMARY ----
const profitDays = dayResults.filter(d => d.dayRs > 0).length;
const lossDays   = dayResults.filter(d => d.dayRs < 0).length;
const flatDays   = dayResults.filter(d => d.dayRs === 0).length;

console.log('\n' + '═'.repeat(60));
console.log('  FINAL P&L SUMMARY');
console.log('═'.repeat(60));
console.log(`  Total days traded        : ${dayResults.length}`);
console.log(`  Profitable days          : ${profitDays}`);
console.log(`  Loss days                : ${lossDays}`);
console.log(`  Flat days                : ${flatDays}`);
console.log('');
console.log(`  T1: SL hit(${t1Loss})  Profit(${t1Wins})  Held-flat/loss(${t1Hold})`);
console.log(`  Re: Taken(${reWins + reLoss}) Wins(${reWins}) Loss(${reLoss}) Skipped(${reSkip}) NoSL(${noRe})`);
console.log('');
console.log(`  Total Points             : ${fmt(totalPts)} pts`);
console.log(`  Rs per point             : Rs ${RS_PER_PT}`);
console.log(`  TOTAL PROFIT             : Rs ${totalRs.toFixed(0)}`);
console.log('');
console.log(`  Capital per trade (T1)   : Rs ${CAPITAL.toFixed(0)}`);
console.log(`  Capital per trade (Re)   : Rs ${CAPITAL.toFixed(0)}`);
console.log(`  Max capital at risk/day  : Rs ${(CAPITAL * 2).toFixed(0)} (T1 + Re)`);
console.log('');
console.log(`  ROI on max capital/day   : ${(totalRs / (CAPITAL * 2) * 100).toFixed(1)}%`);
console.log(`  Avg profit per day       : Rs ${(totalRs / dayResults.length).toFixed(0)}`);
console.log(`  Period                   : Apr 01 – May 13 2026 (28 days)`);
console.log('═'.repeat(60));

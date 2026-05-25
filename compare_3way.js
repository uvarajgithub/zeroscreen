'use strict';
// 3-way comparison: User's manual trades vs BHAV vs Amina
// For March, April, May 2026

const fs = require('fs');
const path = require('path');

// ── Load data ─────────────────────────────────────────────
const CACHE_FILE = path.join(__dirname, 'cache', 'banknifty_2026.json');
// Use VPS path if local not found
const cacheFile = fs.existsSync(CACHE_FILE)
  ? CACHE_FILE
  : './cache/banknifty_2026.json';
const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

// ── User's known manual trades (side only — P&L from Amina validation) ───────
// Points are from the validated Amina exact backtest which matches real outcomes
const USER_TRADES = [
  // [date, side, actual_pts] — pts from backtest_5yr_clean validation
  ['2026-03-02','PE', 154], ['2026-03-06','PE', 78],  ['2026-03-09','CE', null],
  ['2026-03-10','CE', null], ['2026-03-11','PE', null], ['2026-03-13','PE', null],
  ['2026-03-16','CE', null], ['2026-03-17','CE', 331], ['2026-03-18','CE', null],
  ['2026-03-19','PE', null], ['2026-03-20','PE', null], ['2026-03-23','PE', null],
  ['2026-03-24','CE', null], ['2026-03-25','CE', null], ['2026-03-27','PE', null],
  ['2026-04-01','CE', 104],  ['2026-04-02','CE', 1314], ['2026-04-06','CE', 924],
  ['2026-04-07','CE', -50],  ['2026-04-08','CE', 433],  ['2026-04-09','PE', -150],
  ['2026-04-10','CE', -150], ['2026-04-13','CE', 819],  ['2026-04-15','PE', -16],
  ['2026-04-16','PE', -150], ['2026-04-17','CE', 331],  ['2026-04-20','CE', -150],
  ['2026-04-21','CE', -150], ['2026-04-23','PE', 316],  ['2026-04-28','PE', -50],
  ['2026-04-29','CE', 284],  ['2026-04-30','CE', 376],
  ['2026-05-04','PE', -50],  ['2026-05-05','CE', 155],  ['2026-05-06','PE', -50],
  ['2026-05-07','CE', 61],   ['2026-05-08','PE', 178],  ['2026-05-11','CE', -45],
  ['2026-05-12','PE', 359],  ['2026-05-13','CE', -50],  ['2026-05-14','CE', null],
  ['2026-05-15','PE', null], ['2026-05-18','CE', null], ['2026-05-20','CE', null],
  ['2026-05-21','PE', null], ['2026-05-22','CE', null],
];

// ── Helpers ───────────────────────────────────────────────
const PTS_PER_RS = 15;
const SL_PTS = 150;
const TRAIL_GAP = 20;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c)/rng(c)*100 : 0;

function calcPL(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peakPts = 0;
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      return { pts: trailStop, pl: trailStop * PTS_PER_RS, exit: trailStop <= 0 ? 'SL' : 'TRAIL' };
    }
  }
  const exitPrice = candles[candles.length-1].close;
  const pts = sign * (exitPrice - entryPrice);
  return { pts, pl: pts * PTS_PER_RS, exit: 'EOD' };
}

// ── Amina simple (SMMA7 crossover — no RE) for comparison ────────────────────
// Amina enters at SMMA7 cross, exits at trail or EOD
// For simplicity we use the known pts from validation above
// (actual Amina logic is in backtest_5yr_clean.js)

const getPrev = date => { const i = ALL.indexOf(date); return i > 0 ? raw[ALL[i-1]] : null; };

// ── BHAV entry finder (simplified for this comparison) ────────────────────────
// Re-uses same rules as backtest_bhav.js findEntry
function findEntry(cs, prev) {
  if (!cs || cs.length < 2 || !prev || prev.length === 0) return null;
  const PH = Math.max(...prev.map(c=>c.high));
  const PL = Math.min(...prev.map(c=>c.low));
  const PC = prev[prev.length-1].close;
  const C0 = cs[0];
  const gap = C0.open - PC;
  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const ctx = vsPDH > 0 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0);
  const C1bp = cs[1] ? bp(cs[1]) : 0;
  const gapUp = gap > 50, gapDown = gap < -50;

  const firstBull = (from, th=30) => { for(let i=from;i<cs.length;i++) if(bp(cs[i])>th) return i; return -1; };
  const firstBear = (from, th=30) => { for(let i=from;i<cs.length;i++) if(bp(cs[i])<-th) return i; return -1; };

  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return { idx:0, side:'CE' };
    if (vsPDH < 120) return null;
    if (C0bp < -20) return { idx:0, side:'PE' };
    const b = firstBear(1,35); if(b>0&&b<=7) return {idx:b,side:'PE'};
    return null;
  }
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -65) return null;
    if (C0bp > 65) { const i=firstBear(1,30); if(i>0) return {idx:i,side:'PE'}; }
    if (C0.high < PL) {
      if (C1bp > 20) return {idx:1,side:'CE'};
      if (C1bp < -20) return {idx:0,side:'PE'};
      return null;
    }
    if (C0bp > 20) { const i=firstBear(1,30); if(i>0&&i<=6) return {idx:i,side:'PE'}; }
    return null;
  }
  // INSIDE
  if (Math.abs(C0bp) > 55) {
    const c0bull = C0bp > 0;
    const aligned = (c0bull && !gapDown) || (!c0bull && !gapUp);
    if (aligned) {
      if (C1bp * C0bp < 0 && Math.abs(C1bp) > 65) return {idx:1,side:C1bp>0?'CE':'PE'};
      return {idx:0,side:c0bull?'CE':'PE'};
    } else {
      const gapSide = gapUp?'CE':'PE';
      const rev = gapUp ? firstBull(1,35) : firstBear(1,35);
      if (rev>0&&rev<=5) return {idx:rev,side:gapSide};
      return {idx:0,side:c0bull?'CE':'PE'};
    }
  }
  if (Math.abs(C0bp) > 30) {
    if (C1bp * C0bp > 0) return {idx:0,side:C0bp>0?'CE':'PE'};
  }
  for (let i=2;i<=4;i++) {
    if (i>=cs.length) break;
    const cbp = bp(cs[i]);
    if (Math.abs(cbp)>55) return {idx:i,side:cbp>0?'CE':'PE'};
  }
  return null;
}

// ── RE ────────────────────────────────────────────────────
function findReEntry(cs, exitIdx, side) {
  const max = cs.length - 3;
  for (let i=exitIdx+1;i<=max;i++) {
    const b=bp(cs[i]);
    if (side==='CE'&&b>35) return i;
    if (side==='PE'&&b<-35) return i;
  }
  return -1;
}

function calcDayPL(cs, entry) {
  const res = calcPL(cs, entry.idx, entry.side);
  let rePL = 0, curExit = res, cur = res;
  for (let re=0;re<3;re++) {
    if (cur.exit !== 'EOD' && cur.pts > 0) {
      const reIdx = findReEntry(cs, curExit.exit === 'EOD' ? cs.length-1 : findExitIdx(cs, entry.idx, entry.side, curExit.pts), entry.side);
      if (reIdx > 0) {
        const r = calcPL(cs, reIdx, entry.side);
        rePL += r.pl;
        cur = r;
      } else break;
    } else break;
  }
  return res.pl + rePL;
}

// Need exit idx for RE
function calcPLFull(cs, entryIdx, side) {
  const entryPrice = cs[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS, peakPts = 0;
  for (let i=entryIdx+1;i<cs.length;i++) {
    const c = cs[i];
    const favPts = side==='CE'?(c.high-entryPrice):(entryPrice-c.low);
    if (favPts>peakPts) { peakPts=favPts; trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS; }
    const closePts = sign*(c.close-entryPrice);
    if (closePts<=trailStop) return {pts:trailStop,pl:trailStop*PTS_PER_RS,exit:trailStop<=0?'SL':'TRAIL',exitIdx:i};
  }
  const ep=cs[cs.length-1].close; const pts=sign*(ep-entryPrice);
  return {pts,pl:pts*PTS_PER_RS,exit:'EOD',exitIdx:cs.length-1};
}

function calcFullDayPL(cs, entry) {
  const r1 = calcPLFull(cs, entry.idx, entry.side);
  let total = r1.pl, cur = r1;
  for (let re=0;re<3;re++) {
    if (cur.exit!=='EOD' && cur.pts>0) {
      const reIdx = findReEntry(cs, cur.exitIdx, entry.side);
      if (reIdx>0) { const r=calcPLFull(cs,reIdx,entry.side); total+=r.pl; cur=r; } else break;
    } else break;
  }
  return total;
}

// ── Print comparison ──────────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log('  3-WAY COMPARISON: YOUR TRADES vs BHAV vs AMINA  (Mar–May 2026)');
console.log('═'.repeat(80));
console.log('Date        | Your Side | Your P&L  | BHAV Side | BHAV P&L  | Match?');
console.log('─'.repeat(80));

let userTotal = 0, bhavTotal = 0;
let userKnown = 0, bhavWins = 0;
let curMonth = '';

for (const [date, userSide, userPts] of USER_TRADES) {
  const month = date.slice(0,7);
  if (month !== curMonth) {
    if (curMonth) console.log('─'.repeat(80));
    curMonth = month;
  }

  const cs = raw[date];
  const prev = getPrev(date);
  if (!cs || !prev) {
    console.log(`${date} | ${userSide.padEnd(9)} | NO DATA   | ---       | ---       | ---`);
    continue;
  }

  // BHAV
  const entry = findEntry(cs, prev);
  let bhavSide = '---', bhavPL = 0, bhavStr = '---';
  if (entry) {
    bhavSide = entry.side;
    bhavPL = calcFullDayPL(cs, entry);
    bhavStr = (bhavPL>=0?'+':'')+'\u20b9'+Math.abs(bhavPL).toLocaleString('en-IN');
    bhavTotal += bhavPL;
  } else {
    bhavStr = 'NO SIGNAL';
  }

  // User P&L (from Amina validation — in rupees at 15/pt)
  let userStr = '?';
  if (userPts !== null) {
    const userPL = userPts * PTS_PER_RS;
    userTotal += userPL;
    userKnown++;
    userStr = (userPL>=0?'+':'')+'\u20b9'+Math.abs(userPL).toLocaleString('en-IN');
  }

  const sideMatch = bhavSide === userSide ? '✓ SAME' : bhavSide === '---' ? '⚠ MISS' : '✗ OPP';

  console.log(
    `${date} | ${userSide.padEnd(9)} | ${userStr.padStart(9)} | ${bhavSide.padEnd(9)} | ${bhavStr.padStart(9)} | ${sideMatch}`
  );
}

console.log('═'.repeat(80));
console.log(`User total (known days only): ₹${userTotal.toLocaleString('en-IN')}`);
console.log(`BHAV total (all above days) : ₹${bhavTotal.toLocaleString('en-IN')}`);
console.log('═'.repeat(80));

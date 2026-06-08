'use strict';
// get_5cap_stats.js — Get exact stats for 5-trade-cap V15
const fs   = require('fs');
const path = require('path');
const raw  = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'),'utf8'));
const ALL  = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const PTS_PER_RS = 15, SL_PTS = 150;

const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

function calcPL(candles, entryIdx, side, tGap) {
  const TGAP = tGap || 20;
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS, peakPts = 0;
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) { peakPts = favPts; trailStop = peakPts >= TGAP ? peakPts - TGAP : -SL_PTS; }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      if (trailStop > 0) return { pl: trailStop * PTS_PER_RS, exitType:'TRAIL', exitIdx: i, peakPts };
      else return { pl: closePts * PTS_PER_RS, exitType:'SL', exitIdx: i, peakPts };
    }
  }
  return { pl: sign*(candles[candles.length-1].close - entryPrice)*PTS_PER_RS, exitType:'EOD', exitIdx: candles.length-1, peakPts };
}

function findReEntry(cs, fromIdx, side, thresh) {
  const THRESH = thresh || 55;
  const maxIdx = Math.min(cs.length - 2, 22);
  for (let i = fromIdx; i <= maxIdx; i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp > THRESH) return i;
    if (side === 'PE' && cbp < -THRESH) return i;
  }
  return -1;
}

function findEntry(cs, prevCS) {
  const PH = pdh(prevCS), PL = pdl(prevCS), PDR = PH - PL, C0 = cs[0];
  if (PDR < 150) return null;
  const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
  let whip = 0;
  for (let i = 1; i < bps.length; i++)
    if (bps[i]*bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
  if (whip >= 2) return null;
  const vsPDH = C0.open - PH, vsPDL = C0.open - PL;
  const isAbove = vsPDH > 0, isBelow = vsPDL < 0;
  if (isAbove) {
    if (vsPDH < 120) return findIE(cs, PH, PL, 0);
    if (vsPDH > 1000) return { idx:0, side:'CE' };
    return bp(C0) > 85 ? { idx:0, side:'CE' } : { idx:0, side:'PE' };
  }
  if (isBelow) {
    const c0bp = bp(C0);
    if (c0bp < -80) return { idx:0, side:'PE' };
    if (c0bp < -65) return null;
    if (c0bp > 65) return { idx:0, side:'PE' };
    if (C0.high > PL) return findIE(cs, PH, PL, 0);
    return { idx:0, side:'PE' };
  }
  return findIE(cs, PH, PL, 0);
}

function findIE(cs, PH, PL, from) {
  const mx = Math.min(cs.length-2, 20);
  const C0 = cs[0]; const C0bp = bp(C0);
  const hwick = C0.high - Math.max(C0.open, C0.close);
  if (hwick > 0.55*(C0.high-C0.low) && C0bp < -20) return { idx:0, side:'PE' };
  if (Math.abs(C0bp) > 55) return { idx:0, side: C0bp>0?'CE':'PE' };
  for (let i=1; i<=Math.min(4,mx); i++) { const cbp=bp(cs[i]); if (Math.abs(cbp)>55) return {idx:i, side:cbp>0?'CE':'PE'}; }
  for (let i=5; i<=Math.min(20,mx); i++) {
    const cbp=bp(cs[i]);
    if (cbp > 55 && cs[i].close > PH) return {idx:i, side:'CE'};
    if (cbp < -55 && cs[i].close < PL) return {idx:i, side:'PE'};
  }
  return null;
}

// Run V15 with 5-cap, collecting full per-trade stats
let totalPL=0, wins=0, losses=0;
let grossWin=0, grossLoss=0;
let peakPL=0, maxDD=0;
const yearly = {};
const monthly = {};
const daily = [];
const tradeLog = [];

for (let di=1; di<ALL.length; di++) {
  const date = ALL[di];
  const cs = raw[date], prev = raw[ALL[di-1]];
  if (!cs || !prev || cs.length < 2) continue;
  const entry = findEntry(cs, prev);
  if (!entry) continue;

  let dayPL=0, trades=0;
  const r1 = calcPL(cs, entry.idx, entry.side, 10);
  dayPL += r1.pl; trades++;
  tradeLog.push({date, pl:r1.pl, type:r1.exitType});

  let curExit=r1, curSide=entry.side;
  for (let re=0; re<5; re++) {
    if (trades >= 5) break;
    if (curExit.exitType!=='TRAIL' || curExit.pl<=0) break;
      const reIdx = findReEntry(cs, (curExit.exitIdx||0) + 1, curSide, 40);
    if (reIdx<0) break;
    const rr = calcPL(cs, reIdx, curSide, 10);
    dayPL += rr.pl; trades++;
    tradeLog.push({date, pl:rr.pl, type:rr.exitType});
    curExit = rr;
  }
  if (trades < 5 && curExit.exitType==='TRAIL' && (curExit.peakPts||0)>=100 && curExit.pl>0) {
    const revSide = curSide==='CE'?'PE':'CE';
    const revIdx = findReEntry(cs, (curExit.exitIdx||0) + 1, revSide, 40);
    if (revIdx>=0) {
      const rr2 = calcPL(cs, revIdx, revSide, 10);
      dayPL += rr2.pl; trades++;
      tradeLog.push({date, pl:rr2.pl, type:rr2.exitType});
      if (trades < 5 && rr2.exitType==='TRAIL' && rr2.pl>0) {
        const ri2 = findReEntry(cs, (rr2.exitIdx||0) + 1, revSide, 40);
        if (ri2>=0) {
          const rr3 = calcPL(cs, ri2, revSide, 10);
          dayPL += rr3.pl; trades++;
          tradeLog.push({date, pl:rr3.pl, type:rr3.exitType});
        }
      }
    }
  }

  totalPL += dayPL;
  const yr = date.slice(0,4), mo = date.slice(0,7);
  if (!yearly[yr]) yearly[yr]=0; yearly[yr]+=dayPL;
  if (!monthly[mo]) monthly[mo]=0; monthly[mo]+=dayPL;
  daily.push({date, pnl:dayPL});

  if (dayPL > 0) { wins++; grossWin+=dayPL; }
  else { losses++; grossLoss+=Math.abs(dayPL); }
  if (totalPL > peakPL) peakPL=totalPL;
  const dd = peakPL-totalPL; if (dd>maxDD) maxDD=dd;
}

const tradedDays = wins+losses;
const pf = grossLoss > 0 ? (grossWin/grossLoss).toFixed(2) : 'inf';
const tradeWins = tradeLog.filter(t=>t.pl>0).length;
const tradeLosses = tradeLog.filter(t=>t.pl<=0).length;

console.log('=== V15 5-TRADE-CAP EXACT STATS ===');
console.log('totalPnlRs:   ' + Math.round(totalPL));
console.log('wins:         ' + wins);
console.log('losses:       ' + losses);
console.log('winRate:      ' + (wins/tradedDays*100).toFixed(1));
console.log('maxDDRs:      ' + Math.round(maxDD));
console.log('profitFactor: ' + pf);
console.log('totalTrades:  ' + tradeLog.length);
console.log('tradeWinRate: ' + (tradeWins/tradeLog.length*100).toFixed(1));
console.log('');
console.log('yearly:');
for (const yr of ['2021','2022','2023','2024','2025','2026']) {
  console.log('  ' + yr + ': Rs ' + Math.round(yearly[yr]||0).toLocaleString('en-IN'));
}

// Also compute uncapped PF

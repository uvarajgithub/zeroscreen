// backtest_bhav_v4.js
// BHAV V3 strategy: HONEST trail logic
// Trail SET only at candle CLOSE (no same-candle intrabar peak noise)
// Trail CHECKED intrabar (catches real exits without same-candle ghost peaks)
// Tests multiple TRAIL_GAP values, includes re-entries
// RE-ENTRIES also use honest trail (same fix applied)

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const SL_PTS    = 150;
const PTS_PER_RS = 15;

// ─── helpers ─────────────────────────────────────────────────────────────────
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const firstBull = (cs, from, thresh=30) => { for(let i=from;i<cs.length;i++) if(bp(cs[i])>thresh) return i; return -1; };
const firstBear = (cs, from, thresh=30) => { for(let i=from;i<cs.length;i++) if(bp(cs[i])<-thresh) return i; return -1; };
const firstStrong = (cs, from, thresh=55) => { for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>thresh)return{i,side:b>0?'CE':'PE'};}return null; };

// ─── findEntry — exact BHAV V3 logic ─────────────────────────────────────────
function findEntry(candles, prevCandles) {
  if(!candles||candles.length<2||!prevCandles||prevCandles.length===0) return null;
  const PH=pdh(prevCandles),PL_=pdl(prevCandles),PC=pdc(prevCandles);
  const C0=candles[0],gap=C0.open-PC;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL_;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=candles[1]?bp(candles[1]):0;
  const bps4=candles.slice(0,Math.min(4,candles.length)).map(bp);
  let wipsaws=0;
  for(let i=1;i<bps4.length;i++) if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65) wipsaws++;
  if(wipsaws>=2) return null;

  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000) return {idx:0,side:'CE'};
    if(C0bp>85)    return {idx:0,side:'CE'};
    if(C0bp<-20)   return {idx:0,side:'PE'};
    const bearIdx=firstBear(candles,1,35);
    if(bearIdx>0&&bearIdx<=7) return {idx:bearIdx,side:'PE'};
    const contIdx=firstStrong(candles,2,55);
    if(contIdx) return {idx:contIdx.i,side:contIdx.side};
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return {idx:0,side:'PE'};
    if(C0bp<-65) return null;
    if(C0bp>65){const i=firstBear(candles,1,30);if(i>0)return{idx:i,side:'PE'};}
    if(C0.high<PL_){
      if(C1bp>20) return {idx:1,side:'CE'};
      if(C1bp<-20) return {idx:0,side:'PE'};
      const s=firstStrong(candles,2,40);
      if(s&&s.i<=5) return {idx:s.i,side:s.side};
      return null;
    }
    if(C0bp>20){const i=firstBear(candles,1,30);if(i>0&&i<=6)return{idx:i,side:'PE'};}
    if(C0bp<-10){
      for(let i=2;i<=Math.min(7,candles.length-2);i++)
        if(bp(candles[i])<-45&&candles[i-1].close<PL_) return {idx:i,side:'PE'};
    }
    return null;
  }
  // INSIDE
  if(C0.close<PL_) return {idx:0,side:'PE'};
  if(C0.close>PH)  return {idx:0,side:'CE'};
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0,aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if(aligned){
      if(C1bp*C0bp<0&&Math.abs(C1bp)>72) return {idx:1,side:C1bp>0?'CE':'PE'};
      return {idx:0,side:c0isBull?'CE':'PE'};
    } else {
      const gapSide=gapUp?'CE':'PE';
      const rev=gapUp?firstBull(candles,1,35):firstBear(candles,1,35);
      if(rev>0&&rev<=5) return {idx:rev,side:gapSide};
      return {idx:0,side:c0isBull?'CE':'PE'};
    }
  }
  if(Math.abs(C0bp)>30){
    if(C1bp*C0bp>0) return {idx:0,side:C0bp>0?'CE':'PE'};
    if(Math.abs(C1bp)>65&&C1bp*C0bp<0&&candles.length>2){
      const C2bp=bp(candles[2]);
      if(C2bp*C0bp>0&&Math.abs(C2bp)>20) return {idx:0,side:C0bp>0?'CE':'PE'};
    }
  }
  for(let i=2;i<=8;i++){
    if(i>=candles.length) break;
    const cbp=bp(candles[i]);
    if(Math.abs(cbp)>55){
      const signalBull=cbp>0;
      const oppGap=(signalBull&&gapDown)||(!signalBull&&gapUp);
      const c0ModOpp=(signalBull&&C0bp<-20)||(!signalBull&&C0bp>20);
      if(oppGap&&c0ModOpp) continue;
      const prev=bp(candles[i-1]);
      if(Math.abs(prev)>60&&prev*cbp<0){
        if(i+1<candles.length&&bp(candles[i+1])*cbp<0&&Math.abs(bp(candles[i+1]))>60) return null;
      }
      return {idx:i,side:cbp>0?'CE':'PE'};
    }
  }
  for(let i=5;i<Math.min(candles.length,21);i++){
    const prevClose=candles[i-1].close;
    if(candles[i].low<=PL_&&prevClose>PL_&&bp(candles[i])>35) return {idx:i,side:'CE'};
    if(candles[i].high>=PH&&prevClose<PH&&bp(candles[i])<-35) return {idx:i,side:'PE'};
  }
  return null;
}

// ─── findReEntry ──────────────────────────────────────────────────────────────
function findReEntry(cs, fromIdx, side) {
  const thresh = side === 'CE' ? 55 : -55;
  for (let i = fromIdx + 1; i < cs.length - 2; i++) {
    const b = bp(cs[i]);
    if (side === 'CE' && b > thresh) return i;
    if (side === 'PE' && b < thresh) return i;
  }
  return -1;
}

// ─── HONEST calcPL: trail SET at close, CHECKED intrabar ─────────────────────
function calcPL(candles, entryIdx, side, TRAIL_GAP) {
  const entryPrice = candles[entryIdx].close;
  const sign       = side === 'CE' ? 1 : -1;
  let trailStop    = -SL_PTS;   // in favorable pts (negative = no trail yet)
  let peakPts      = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];

    // 1. Gap-through check at open (vs trail from PREVIOUS candle close)
    const openPts = sign * (c.open - entryPrice);
    if (trailStop > 0 && openPts < trailStop) {
      return { pl: openPts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL_GAP', entryPrice, exitPrice: c.open };
    }
    if (trailStop <= 0 && openPts < -SL_PTS) {
      return { pl: -SL_PTS * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL_GAP', entryPrice, exitPrice: c.open };
    }

    // 2. Intrabar adverse check vs trail from PREVIOUS candle close (no same-candle noise)
    const adversePts = side === 'CE' ? (c.low - entryPrice) : (entryPrice - c.high);
    if (trailStop > 0 && adversePts <= trailStop) {
      return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL', entryPrice, exitPrice: entryPrice + sign * trailStop };
    }
    if (trailStop <= 0 && adversePts <= -SL_PTS) {
      return { pl: -SL_PTS * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL', entryPrice, exitPrice: side === 'CE' ? entryPrice - SL_PTS : entryPrice + SL_PTS };
    }

    // 3. Update trail from CLOSE only (confirmed candle close, not intrabar high)
    const closePts = sign * (c.close - entryPrice);
    if (closePts > peakPts) {
      peakPts   = closePts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
  }

  const exitPrice = candles[candles.length - 1].close;
  const pl = sign * (exitPrice - entryPrice) * PTS_PER_RS;
  return { pl, peakPts, exitIdx: candles.length - 1, exitType: 'EOD', entryPrice, exitPrice };
}

// ─── prev day ─────────────────────────────────────────────────────────────────
function getPrev(date) {
  const idx = ALL.indexOf(date);
  return idx > 0 ? raw[ALL[idx - 1]] : null;
}

// ─── RUN ONE TRAIL_GAP CONFIG ─────────────────────────────────────────────────
function runConfig(TRAIL_GAP) {
  let totalPL = 0, equity = 0, peak = 0, maxDD = 0;
  let trades  = 0, wins   = 0, reEntries = 0;
  let trailExits = 0, slExits = 0;
  const yearly = {};

  for (const date of ALL) {
    const cs   = raw[date];
    const prev = getPrev(date);
    if (!prev) continue;

    const entry = findEntry(cs, prev);
    if (!entry) continue;

    const res1 = calcPL(cs, entry.idx, entry.side, TRAIL_GAP);
    const { pl, exitIdx, exitType, peakPts } = res1;

    trades++;
    if (pl > 0) wins++;
    if (exitType === 'TRAIL' || exitType === 'TRAIL_GAP') trailExits++;
    if (exitType === 'SL' || exitType === 'SL_GAP') slExits++;

    let rePL = 0;
    let curExitIdx  = exitIdx;
    let curExitType = exitType;
    let curPL       = pl;
    let curSide     = entry.side;

    // Reverse RE after big move (peakPts >= 100)
    if (peakPts >= 100 && exitType !== 'EOD' && pl > 0) {
      const revSide = entry.side === 'CE' ? 'PE' : 'CE';
      let revIdx = -1;
      for (let i = exitIdx + 1; i <= cs.length - 3; i++) {
        const b = bp(cs[i]);
        if ((revSide === 'CE' && b > 65) || (revSide === 'PE' && b < -65)) { revIdx = i; break; }
      }
      const sameReFirst = findReEntry(cs, exitIdx, entry.side);
      if (revIdx > 0 && (sameReFirst < 0 || revIdx < sameReFirst)) {
        reEntries++;
        const resRev = calcPL(cs, revIdx, revSide, TRAIL_GAP);
        rePL       += resRev.pl;
        curExitIdx  = resRev.exitIdx;
        curExitType = resRev.exitType;
        curPL       = resRev.pl;
        curSide     = revSide;
      }
    }

    for (let re = 0; re < 3; re++) {
      if (curExitType !== 'EOD' && curPL > 0) {
        const reIdx = findReEntry(cs, curExitIdx, curSide);
        if (reIdx > 0) {
          reEntries++;
          const resRE = calcPL(cs, reIdx, curSide, TRAIL_GAP);
          rePL       += resRE.pl;
          curExitIdx  = resRE.exitIdx;
          curExitType = resRE.exitType;
          curPL       = resRE.pl;
        }
      } else break;
    }

    const dayPL = pl + rePL;
    totalPL    += dayPL;
    equity     += dayPL;
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDD) maxDD = dd;
    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayPL;
  }

  const allPos = Object.values(yearly).every(v => v >= 0);
  return { TRAIL_GAP, totalPL, trades, wr: (wins/trades*100).toFixed(1), maxDD, reEntries, trailExits, slExits, yearly, allPos };
}

// ─── GRID over TRAIL_GAP values ──────────────────────────────────────────────
const TRAIL_GAPS = [20, 30, 50, 75, 100, 125, 150, 175, 200];

console.log('\n  BHAV V3 — HONEST TRAIL (close-set, intrabar-check) + RE-ENTRIES');
console.log('  ══════════════════════════════════════════════════════════════════');
console.log('  Gap   5yr P&L      WR%   Trades  RE    Trail  SL   MaxDD        AllPos');
console.log('  ──────────────────────────────────────────────────────────────────────────');

const results = [];
for (const tg of TRAIL_GAPS) {
  const r = runConfig(tg);
  results.push(r);
  const pos = r.allPos ? '✓' : ' ';
  console.log(`   ${String(tg).padStart(3)}  ₹${r.totalPL.toLocaleString('en-IN').padStart(13)}  ${r.wr}%  ${r.trades}  ${r.reEntries}  ${r.trailExits}  ${r.slExits}  ₹${r.maxDD.toLocaleString('en-IN').padStart(9)}  ${pos}`);
}

// Best result breakdown
const best = results.sort((a,b) => b.totalPL - a.totalPL)[0];
console.log(`\n  BEST: TRAIL_GAP=${best.TRAIL_GAP}`);
console.log(`  5yr P&L : ₹${best.totalPL.toLocaleString('en-IN')}`);
console.log(`  Win Rate: ${best.wr}%  Trades: ${best.trades}  Re-entries: ${best.reEntries}  MaxDD: ₹${best.maxDD.toLocaleString('en-IN')}`);
console.log(`  Trail exits: ${best.trailExits}  SL exits: ${best.slExits}`);
console.log('\n  YEARLY:');
for (const [yr, pl] of Object.entries(best.yearly).sort())
  console.log(`    ${yr}: ₹${pl.toLocaleString('en-IN').padStart(13)}  ${pl >= 0 ? '+' : '-'}`);

// Best all-years-positive
const bestAP = results.find(r => r.allPos);
if (bestAP && bestAP !== best) {
  console.log(`\n  BEST (all years positive): TRAIL_GAP=${bestAP.TRAIL_GAP}`);
  console.log(`  5yr P&L : ₹${bestAP.totalPL.toLocaleString('en-IN')}  WR=${bestAP.wr}%  MaxDD ₹${bestAP.maxDD.toLocaleString('en-IN')}`);
  for (const [yr, pl] of Object.entries(bestAP.yearly).sort())
    console.log(`    ${yr}: ₹${pl.toLocaleString('en-IN').padStart(13)}  ${pl >= 0 ? '+' : '-'}`);
}

// Lots needed
console.log(`\n  Lots needed for ₹20L: ${Math.ceil(20000000/best.totalPL)}`);
console.log(`  Lots needed for ₹40L: ${Math.ceil(40000000/best.totalPL)}`);

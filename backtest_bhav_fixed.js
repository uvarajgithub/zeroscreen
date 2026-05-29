// backtest_bhav_fixed.js
// BHAV V3 entry logic (unchanged) + HONEST fixed target/SL exit
// Grid search over Target × SL to find best honest result
// No trailing — no same-candle problem — pure limit/stop orders

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const PTS = 15;   // Rs per index point per lot

// ─── helpers (copied from backtest_bhav.js) ──────────────────────────────────
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const uwp  = c => c.high - c.open;
const lwp  = c => c.open - c.low;
const firstBull = (cs, from, thresh = 30) => { for (let i=from;i<cs.length;i++) if(bp(cs[i])>thresh) return i; return -1; };
const firstBear = (cs, from, thresh = 30) => { for (let i=from;i<cs.length;i++) if(bp(cs[i])<-thresh) return i; return -1; };
const firstStrong = (cs, from, thresh = 55) => { for (let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>thresh)return{i,side:b>0?'CE':'PE'};} return null; };

// ─── ENTRY DETECTION (exact copy of BHAV V3 findEntry) ───────────────────────
function findEntry(candles, prevCandles) {
  if (!candles||candles.length<2||!prevCandles||prevCandles.length===0) return null;
  const PH=pdh(prevCandles), PL_=pdl(prevCandles), PC=pdc(prevCandles);
  const C0=candles[0], gap=C0.open-PC;
  const vsPDH=C0.open-PH, vsPDL=C0.open-PL_;
  const ctx = vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0), C1bp=candles[1]?bp(candles[1]):0;

  // Whipsaw guard
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
    if(contIdx)    return {idx:contIdx.i,side:contIdx.side};
    return null;
  }

  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return {idx:0,side:'PE'};
    if(C0bp<-65) return null;
    if(C0bp>65){const i=firstBear(candles,1,30);if(i>0)return{idx:i,side:'PE'};}
    if(C0.high<PL_){
      if(C1bp>20)  return {idx:1,side:'CE'};
      if(C1bp<-20) return {idx:0,side:'PE'};
      const s=firstStrong(candles,2,40);
      if(s&&s.i<=5) return {idx:s.i,side:s.side};
      return null;
    }
    if(C0bp>20){const i=firstBear(candles,1,30);if(i>0&&i<=6)return{idx:i,side:'PE'};}
    if(C0bp<-10){
      for(let i=2;i<=Math.min(7,candles.length-2);i++){
        if(bp(candles[i])<-45&&candles[i-1].close<PL_) return {idx:i,side:'PE'};
      }
    }
    return null;
  }

  // INSIDE
  if(C0.close<PL_) return {idx:0,side:'PE'};
  if(C0.close>PH)  return {idx:0,side:'CE'};
  const gapUp=gap>50, gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0, aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
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
    if(candles[i].high>=PH&&prevClose<PH&&bp(candles[i])<-35)  return {idx:i,side:'PE'};
  }
  return null;
}

// ─── FIXED EXIT: honest limit/stop orders ────────────────────────────────────
function calcFixed(candles, entryIdx, side, target, slPts) {
  const ep   = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    if (sign === 1) {
      if (c.open >= ep + target) return  target;
      if (c.open <= ep - slPts)  return -slPts;
      if (c.high >= ep + target) return  target;
      if (c.low  <= ep - slPts)  return -slPts;
    } else {
      if (c.open <= ep - target) return  target;
      if (c.open >= ep + slPts)  return -slPts;
      if (c.low  <= ep - target) return  target;
      if (c.high >= ep + slPts)  return -slPts;
    }
  }
  return sign * (candles[candles.length - 1].close - ep); // EOD
}

// ─── PREV DAY HELPER ─────────────────────────────────────────────────────────
function getPrev(date) {
  const idx = ALL.indexOf(date);
  return idx > 0 ? raw[ALL[idx - 1]] : null;
}

// ─── GRID SEARCH ─────────────────────────────────────────────────────────────
const TARGETS = [125, 150, 175, 200, 225, 250, 300, 400, 500];
const SLS     = [10, 15, 20, 30, 50, 100, 150];

const results = [];

for (const T of TARGETS) {
  for (const SL of SLS) {
    let totalPL = 0, equity = 0, peak = 0, maxDD = 0;
    let trades  = 0, wins  = 0;
    const yearly = {};

    for (const date of ALL) {
      const cs   = raw[date];
      const prev = getPrev(date);
      if (!prev) continue;

      const entry = findEntry(cs, prev);
      if (!entry) continue;

      const pts = calcFixed(cs, entry.idx, entry.side, T, SL);
      const pl  = pts * PTS;
      totalPL  += pl;
      equity   += pl;
      trades++;
      if (pts > 0) wins++;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
      const yr = date.slice(0, 4);
      yearly[yr] = (yearly[yr] || 0) + pl;
    }

    const allPos = Object.values(yearly).every(v => v >= 0);
    results.push({ T, SL, rr: (T/SL).toFixed(1), totalPL, trades, wr: (wins/trades*100).toFixed(1), maxDD, yearly, allPos });
  }
}

// Sort by P&L descending
results.sort((a, b) => b.totalPL - a.totalPL);

console.log('\n  BHAV V3 ENTRIES + HONEST FIXED EXIT  (no trailing, no re-entries)');
console.log('  ══════════════════════════════════════════════════════════════════');
console.log('   T    SL   R:R       5yr P&L    WR%  Trades     MaxDD  AllPos');
console.log('  ──────────────────────────────────────────────────────────────────');
for (const r of results.slice(0, 15)) {
  const pos = r.allPos ? '✓' : ' ';
  console.log(`  ${String(r.T).padStart(3)}  ${String(r.SL).padStart(3)}  ${String(r.rr).padStart(5)}  ₹${r.totalPL.toLocaleString('en-IN').padStart(12)}  ${r.wr}%  ${r.trades}  ₹${r.maxDD.toLocaleString('en-IN').padStart(8)}  ${pos}`);
}

// Best result yearly breakdown
const best = results[0];
console.log(`\n  BEST: T=${best.T}  SL=${best.SL}  R:R=${best.rr}`);
console.log(`  5yr P&L : ₹${best.totalPL.toLocaleString('en-IN')}`);
console.log(`  Win Rate: ${best.wr}%  Trades: ${best.trades}  MaxDD: ₹${best.maxDD.toLocaleString('en-IN')}`);
console.log('\n  YEARLY:');
for (const [yr, pl] of Object.entries(best.yearly).sort()) {
  console.log(`    ${yr}: ₹${pl.toLocaleString('en-IN').padStart(12)}  ${pl >= 0 ? '+' : '-'}`);
}

// Show lots needed for targets
const lots25 = best.totalPL > 0 ? Math.ceil(2500000 / best.totalPL) : '∞';
const lots40 = best.totalPL > 0 ? Math.ceil(4000000 / best.totalPL) : '∞';
console.log(`\n  Lots for ₹25L : ${lots25}`);
console.log(`  Lots for ₹40L : ${lots40}`);

// Also show best "all years positive" result
const bestAllPos = results.find(r => r.allPos);
if (bestAllPos && bestAllPos !== best) {
  console.log('\n  BEST (all years positive):');
  console.log(`  T=${bestAllPos.T}  SL=${bestAllPos.SL}  R:R=${bestAllPos.rr}  ₹${bestAllPos.totalPL.toLocaleString('en-IN')}  WR=${bestAllPos.wr}%  MaxDD ₹${bestAllPos.maxDD.toLocaleString('en-IN')}`);
  for (const [yr, pl] of Object.entries(bestAllPos.yearly).sort()) {
    console.log(`    ${yr}: ₹${pl.toLocaleString('en-IN').padStart(12)}  ${pl >= 0 ? '+' : '-'}`);
  }
}

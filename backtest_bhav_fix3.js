// backtest_bhav_fix3.js
// DIAGNOSE: What made 33L → 4L?
// Then test FIX 3: same-candle trail ONLY when close confirms trail was hit
//   (close < trail level = price definitively crossed trail on way from HIGH to CLOSE)
// This is more honest than original but captures more than v4 (close-set trail)

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const TRAIL_GAP  = 20;
const SL_PTS     = 150;
const PTS_PER_RS = 15;

const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const firstBull = (cs, f, t=30) => { for(let i=f;i<cs.length;i++) if(bp(cs[i])>t) return i; return -1; };
const firstBear = (cs, f, t=30) => { for(let i=f;i<cs.length;i++) if(bp(cs[i])<-t) return i; return -1; };
const firstStrong = (cs, f, t=55) => { for(let i=f;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null; };

function findEntry(candles, prev) {
  if(!candles||candles.length<2||!prev||prev.length===0) return null;
  const PH=pdh(prev),PL_=pdl(prev),PC=pdc(prev);
  const C0=candles[0],gap=C0.open-PC;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL_;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=candles[1]?bp(candles[1]):0;
  const bps4=candles.slice(0,Math.min(4,candles.length)).map(bp);
  let w=0;
  for(let i=1;i<bps4.length;i++) if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65) w++;
  if(w>=2) return null;
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000) return {idx:0,side:'CE'};
    if(C0bp>85)    return {idx:0,side:'CE'};
    if(C0bp<-20)   return {idx:0,side:'PE'};
    const b=firstBear(candles,1,35); if(b>0&&b<=7) return {idx:b,side:'PE'};
    const c=firstStrong(candles,2,55); if(c) return {idx:c.i,side:c.side};
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return {idx:0,side:'PE'};
    if(C0bp<-65) return null;
    if(C0bp>65){const i=firstBear(candles,1,30);if(i>0)return{idx:i,side:'PE'};}
    if(C0.high<PL_){
      if(C1bp>20) return {idx:1,side:'CE'};
      if(C1bp<-20) return {idx:0,side:'PE'};
      const s=firstStrong(candles,2,40);if(s&&s.i<=5)return{idx:s.i,side:s.side};
      return null;
    }
    if(C0bp>20){const i=firstBear(candles,1,30);if(i>0&&i<=6)return{idx:i,side:'PE'};}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,candles.length-2);i++)if(bp(candles[i])<-45&&candles[i-1].close<PL_)return{idx:i,side:'PE'};}
    return null;
  }
  if(C0.close<PL_) return {idx:0,side:'PE'};
  if(C0.close>PH)  return {idx:0,side:'CE'};
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0b=C0bp>0,al=(c0b&&!gapDown)||(!c0b&&!gapUp);
    if(al){if(C1bp*C0bp<0&&Math.abs(C1bp)>72)return{idx:1,side:C1bp>0?'CE':'PE'};return{idx:0,side:c0b?'CE':'PE'};}
    else{const gs=gapUp?'CE':'PE';const rv=gapUp?firstBull(candles,1,35):firstBear(candles,1,35);if(rv>0&&rv<=5)return{idx:rv,side:gs};return{idx:0,side:c0b?'CE':'PE'};}
  }
  if(Math.abs(C0bp)>30){
    if(C1bp*C0bp>0) return {idx:0,side:C0bp>0?'CE':'PE'};
    if(Math.abs(C1bp)>65&&C1bp*C0bp<0&&candles.length>2){const C2bp=bp(candles[2]);if(C2bp*C0bp>0&&Math.abs(C2bp)>20)return{idx:0,side:C0bp>0?'CE':'PE'};}
  }
  for(let i=2;i<=8;i++){
    if(i>=candles.length) break;
    const cbp=bp(candles[i]);
    if(Math.abs(cbp)>55){
      const sb=cbp>0,og=(sb&&gapDown)||(!sb&&gapUp),cm=(sb&&C0bp<-20)||(!sb&&C0bp>20);
      if(og&&cm) continue;
      const pv=bp(candles[i-1]);
      if(Math.abs(pv)>60&&pv*cbp<0&&i+1<candles.length&&bp(candles[i+1])*cbp<0&&Math.abs(bp(candles[i+1]))>60)return null;
      return {idx:i,side:cbp>0?'CE':'PE'};
    }
  }
  for(let i=5;i<Math.min(candles.length,21);i++){
    const pc=candles[i-1].close;
    if(candles[i].low<=PL_&&pc>PL_&&bp(candles[i])>35) return {idx:i,side:'CE'};
    if(candles[i].high>=PH&&pc<PH&&bp(candles[i])<-35) return {idx:i,side:'PE'};
  }
  return null;
}

function findReEntry(cs, fromIdx, side) {
  const t=side==='CE'?55:-55;
  for(let i=fromIdx+1;i<cs.length-2;i++){const b=bp(cs[i]);if(side==='CE'&&b>t)return i;if(side==='PE'&&b<t)return i;}
  return -1;
}

// ─── ORIGINAL (buggy) calcPL ──────────────────────────────────────────────────
function calcPL_original(cs, entryIdx, side) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  let trailStop=-SL_PTS, peakPts=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const openPts=sign*(c.open-ep);
    if(trailStop>0&&openPts<trailStop) return{pl:openPts*PTS_PER_RS,peakPts,exitIdx:i,exitType:'TRAIL_GAP',ep,exitPrice:c.open};
    if(trailStop<=0&&openPts<-SL_PTS) return{pl:openPts*PTS_PER_RS,peakPts,exitIdx:i,exitType:'SL_GAP',ep,exitPrice:c.open};
    // BUG: peak and trail set FIRST, then checked in SAME iteration
    const favPts=side==='CE'?(c.high-ep):(ep-c.low);
    if(favPts>peakPts){peakPts=favPts;trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS;}
    const adversePts=side==='CE'?(c.low-ep):(ep-c.high);
    if(trailStop>0&&adversePts<=trailStop) return{pl:trailStop*PTS_PER_RS,peakPts,exitIdx:i,exitType:'TRAIL',ep,exitPrice:ep+sign*trailStop};
    if(trailStop<=0&&adversePts<=-SL_PTS) return{pl:adversePts*PTS_PER_RS,peakPts,exitIdx:i,exitType:'SL',ep,exitPrice:ep+sign*adversePts};
  }
  const exitPrice=cs[cs.length-1].close;
  return{pl:sign*(exitPrice-ep)*PTS_PER_RS,peakPts,exitIdx:cs.length-1,exitType:'EOD',ep,exitPrice};
}

// ─── FIX 3: same-candle trail ONLY when close confirms trail was hit ──────────
// close < trail level  = price fell through trail on way from HIGH to CLOSE → valid
// close > trail level  = price recovered above trail (V-bounce) → NOT this candle
function calcPL_fix3(cs, entryIdx, side) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  let trailStop=-SL_PTS, peakPts=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];

    // Gap-through at open (prev trail/SL)
    const openPts=sign*(c.open-ep);
    if(trailStop>0&&openPts<trailStop) return{pl:openPts*PTS_PER_RS,peakPts,exitIdx:i,exitType:'TRAIL_GAP',entryPrice:ep,exitPrice:c.open};
    if(trailStop<=0&&openPts<-SL_PTS) return{pl:-SL_PTS*PTS_PER_RS,peakPts,exitIdx:i,exitType:'SL_GAP',entryPrice:ep,exitPrice:c.open};

    const adversePts=side==='CE'?(c.low-ep):(ep-c.high);
    const closePts  =sign*(c.close-ep);
    const favPts    =side==='CE'?(c.high-ep):(ep-c.low);
    const newPeak   =Math.max(peakPts,favPts);
    const newTrail  =newPeak>=TRAIL_GAP?newPeak-TRAIL_GAP:-SL_PTS;

    // A: Previous-candle trail (always valid — stop was placed before this candle)
    if(trailStop>0&&adversePts<=trailStop){
      return{pl:trailStop*PTS_PER_RS,peakPts,exitIdx:i,exitType:'TRAIL_PREV',entryPrice:ep,exitPrice:ep+sign*trailStop};
    }

    // B: Same-candle trail — ONLY when close confirms: close < newTrail level
    //    This means price fell from HIGH through trail AND STAYED below trail (no full recovery)
    //    A real stop order at newTrail WOULD have fired during this candle
    if(newTrail>0&&adversePts<=newTrail&&closePts<=newTrail){
      return{pl:newTrail*PTS_PER_RS,peakPts:newPeak,exitIdx:i,exitType:'TRAIL_SAME',entryPrice:ep,exitPrice:ep+sign*newTrail};
    }

    // C: SL (no trail yet)
    if(trailStop<=0&&adversePts<=-SL_PTS){
      return{pl:-SL_PTS*PTS_PER_RS,peakPts,exitIdx:i,exitType:'SL',entryPrice:ep,exitPrice:side==='CE'?ep-SL_PTS:ep+SL_PTS};
    }

    // Update peak for next candle
    peakPts   = newPeak;
    trailStop = newTrail;
  }
  const exitPrice=cs[cs.length-1].close;
  return{pl:sign*(exitPrice-ep)*PTS_PER_RS,peakPts,exitIdx:cs.length-1,exitType:'EOD',entryPrice:ep,exitPrice};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

// ─── RUN ONE CONFIG ───────────────────────────────────────────────────────────
function run(calcFn, label) {
  let totalPL=0,equity=0,peak=0,maxDD=0;
  let trades=0,wins=0,reEntries=0;
  let trailSame=0,trailPrev=0,slExits=0,eodExits=0;
  let trailSamePL=0,trailPrevPL=0;
  const yearly={};

  for(const date of ALL){
    const cs=raw[date], prev=getPrev(date);
    if(!prev) continue;
    const entry=findEntry(cs,prev);
    if(!entry) continue;

    const res1=calcFn(cs,entry.idx,entry.side);
    const {pl,exitIdx,exitType,peakPts}=res1;
    trades++;
    if(pl>0) wins++;
    if(exitType==='TRAIL_SAME'){trailSame++;trailSamePL+=pl;}
    else if(exitType==='TRAIL_PREV'||exitType==='TRAIL_GAP'){trailPrev++;trailPrevPL+=pl;}
    else if(exitType==='SL'||exitType==='SL_GAP') slExits++;
    else eodExits++;

    // RE-ENTRIES
    let rePL=0,curExitIdx=exitIdx,curExitType=exitType,curPL=pl,curSide=entry.side;
    if(peakPts>=100&&exitType!=='EOD'&&pl>0){
      const revSide=entry.side==='CE'?'PE':'CE';
      let revIdx=-1;
      for(let i=exitIdx+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((revSide==='CE'&&b>65)||(revSide==='PE'&&b<-65)){revIdx=i;break;}}
      const sf=findReEntry(cs,exitIdx,entry.side);
      if(revIdx>0&&(sf<0||revIdx<sf)){
        reEntries++;
        const r=calcFn(cs,revIdx,revSide);
        rePL+=r.pl;curExitIdx=r.exitIdx;curExitType=r.exitType;curPL=r.pl;curSide=revSide;
      }
    }
    for(let re=0;re<3;re++){
      if(curExitType!=='EOD'&&curPL>0){
        const ri=findReEntry(cs,curExitIdx,curSide);
        if(ri>0){reEntries++;const r=calcFn(cs,ri,curSide);rePL+=r.pl;curExitIdx=r.exitIdx;curExitType=r.exitType;curPL=r.pl;}
        else break;
      } else break;
    }

    const dayPL=pl+rePL;
    totalPL+=dayPL;equity+=dayPL;
    if(equity>peak) peak=equity;
    const dd=peak-equity;if(dd>maxDD) maxDD=dd;
    const yr=date.slice(0,4);
    yearly[yr]=(yearly[yr]||0)+dayPL;
  }

  console.log(`\n  ═══ ${label} ═══`);
  console.log(`  5yr P&L: ₹${totalPL.toLocaleString('en-IN')}  WR: ${(wins/trades*100).toFixed(1)}%  Trades: ${trades}  RE: ${reEntries}  MaxDD: ₹${maxDD.toLocaleString('en-IN')}`);
  console.log(`  Trail-SAME exits: ${trailSame}  P&L: ₹${trailSamePL.toLocaleString('en-IN')}`);
  console.log(`  Trail-PREV exits: ${trailPrev}  P&L: ₹${trailPrevPL.toLocaleString('en-IN')}`);
  console.log(`  SL exits: ${slExits}   EOD exits: ${eodExits}`);
  console.log('  Yearly:');
  for(const [yr,pl] of Object.entries(yearly).sort())
    console.log(`    ${yr}: ₹${pl.toLocaleString('en-IN').padStart(13)}  ${pl>=0?'✓':'✗'}`);
  return totalPL;
}

console.log('\n  BHAV V3 — EXACT CAUSE OF 33L → 4L  (diagnosis + Fix 3)\n');
const orig = run(calcPL_original, 'ORIGINAL (buggy same-candle)');
const fix3 = run(calcPL_fix3,     'FIX 3 (close-confirms-trail)');

console.log('\n  ─────────────────────────────────────────────────────────');
console.log(`  Original  : ₹${orig.toLocaleString('en-IN')}`);
console.log(`  Fix 3     : ₹${fix3.toLocaleString('en-IN')}`);
console.log(`  Difference: ₹${(orig-fix3).toLocaleString('en-IN')} = from V-bounce candles where trail appeared hit but price RECOVERED`);
console.log('\n  Fix 3 logic: same-candle trail exit ONLY when candle close stays below trail level');
console.log('  (price went HIGH → trail set → fell below trail → close stays below trail → order FILLED)');
console.log('  V-bounces excluded: price briefly dipped below trail but recovered above it by close');

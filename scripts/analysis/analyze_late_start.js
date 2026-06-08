// analyze_late_start.js — If bot misses C0, what do we still earn on those days?
'use strict';
const fs = require('fs');
require('dotenv').config({ path: require('path').join(process.cwd(), '.env') });

function bp(c) { return (c.high-c.low)>0 ? (c.close-c.open)/(c.high-c.low)*100 : 0; }
function pdh(cs){ return Math.max(...cs.map(c=>c.high)); }
function pdl(cs){ return Math.min(...cs.map(c=>c.low)); }
function pdc(cs){ return cs[cs.length-1].close; }
function firstBull(cs,from,t=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])>t)return i;return -1;}
function firstBear(cs,from,t=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])<-t)return i;return -1;}
function firstStrong(cs,from,t=55){for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null;}

function findBhavEntry(today,prev){
  if(!today||today.length<1||!prev||prev.length===0)return null;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev),C0=today[0];
  const gap=C0.open-PC,lastIdx=today.length-1;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=today[1]?bp(today[1]):0;
  const bps4=today.slice(0,Math.min(4,today.length)).map(bp);
  let wipsaws=0;
  for(let i=1;i<bps4.length;i++)if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65)wipsaws++;
  if(wipsaws>=2)return null;
  const at=(idx,side,reason)=>idx===lastIdx?{idx,side,ctx,reason}:null;
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)return at(0,'CE','extraordinary_gap_ce');
    if(C0bp<-20)return at(0,'PE','above_pdh_c0_reversal_pe');
    const bearIdx=firstBear(today,1,35);
    if(bearIdx>0&&bearIdx<=7)return at(bearIdx,'PE','above_pdh_delayed_pe');
    const contIdx=firstStrong(today,2,55);
    if(contIdx)return at(contIdx.i,contIdx.side,'above_pdh_continuation');
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-65)return null;
    if(C0bp>65){const i=firstBear(today,1,30);if(i>0)return at(i,'PE','recovery_bounce_pe');}
    if(C0.high<PL){
      if(today.length>=2&&C1bp>20)return at(1,'CE','below_pdl_c1_bull_ce');
      if(today.length>=1&&C1bp<-20)return at(0,'PE','below_pdl_no_recovery_pe');
      const s=firstStrong(today,2,40);if(s&&s.i<=5)return at(s.i,s.side,'below_pdl_c2_signal');
      return null;
    }
    if(C0bp>20){const i=firstBear(today,1,30);if(i>0&&i<=6)return at(i,'PE','below_pdl_partial_bounce_pe');}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,today.length-2);i++)if(bp(today[i])<-45&&today[i-1].close<PL)return at(i,'PE','below_pdl_failed_bounce_pe');}
    return null;
  }
  if(C0.close<PL)return at(0,'PE','inside_c0_breaks_below_pdl');
  if(C0.close>PH)return at(0,'CE','inside_c0_breaks_above_pdh');
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0,aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if(aligned){
      if(today.length>=2&&C1bp*C0bp<0&&Math.abs(C1bp)>65)return at(1,C1bp>0?'CE':'PE','inside_c0_trap_c1_signal');
      return at(0,c0isBull?'CE':'PE','inside_c0_momentum');
    }else{
      const gapSide=gapUp?'CE':'PE';
      const revCandle=gapUp?firstBull(today,1,35):firstBear(today,1,35);
      if(revCandle>0&&revCandle<=5)return at(revCandle,gapSide,'inside_counter_gap_reversal');
      return at(0,c0isBull?'CE':'PE','inside_c0_momentum_no_reversal');
    }
  }
  if(Math.abs(C0bp)>30){
    if(today.length>=2&&C1bp*C0bp>0)return at(0,C0bp>0?'CE':'PE','inside_c0_moderate_c1_confirmed');
    if(today.length>=3&&Math.abs(C1bp)>65&&C1bp*C0bp<0){const C2bp=bp(today[2]);if(C2bp*C0bp>0&&Math.abs(C2bp)>20)return at(0,C0bp>0?'CE':'PE','inside_c0_c1_fake_c2_confirms');}
  }
  for(let i=2;i<=4;i++){
    if(i>=today.length)break;
    const cbp=bp(today[i]);
    if(Math.abs(cbp)>55){
      const signalBull=cbp>0,oppGap=(signalBull&&gapDown)||(!signalBull&&gapUp),c0ModOpp=(signalBull&&C0bp<-20)||(!signalBull&&C0bp>20);
      if(oppGap&&c0ModOpp)continue;
      const prev2=bp(today[i-1]);
      if(Math.abs(prev2)>60&&prev2*cbp<0){if(i+1<today.length&&bp(today[i+1])*cbp<0&&Math.abs(bp(today[i+1]))>60)return null;}
      return at(i,cbp>0?'CE':'PE',`inside_c${i}_strong`);
    }
  }
  for(let i=5;i<Math.min(today.length,21);i++){
    const prevClose=today[i-1].close;
    if(today[i].low<=PL&&prevClose>PL&&bp(today[i])>35)return at(i,'CE','inside_pdl_test_ce');
    if(today[i].high>=PH&&prevClose<PH&&bp(today[i])<-35)return at(i,'PE','inside_pdh_test_pe');
  }
  return null;
}

function findBhavReEntry(today,exitIdx,side,allowReverse){
  const lastIdx=today.length-1;if(lastIdx<=exitIdx)return null;
  for(let i=exitIdx+1;i<=lastIdx;i++){const b=bp(today[i]);if(side==='CE'&&b>35)return{idx:i,side,reason:'re_same_dir'};if(side==='PE'&&b<-35)return{idx:i,side,reason:'re_same_dir'};}
  if(allowReverse){const revSide=side==='CE'?'PE':'CE';for(let i=exitIdx+1;i<=lastIdx;i++){const b=bp(today[i]);if(revSide==='CE'&&b>65)return{idx:i,side:revSide,reason:'re_reverse'};if(revSide==='PE'&&b<-65)return{idx:i,side:revSide,reason:'re_reverse'};}}
  return null;
}

const SL_PTS=100,TRAIL_GAP=50,MAX_TRADES=5,MAX_RE=3;
function updateBhavTrail(state,candle,isEOD){
  const sign=state.dir==='CE'?1:-1;
  const favPts=state.dir==='CE'?candle.high-state.entry:state.entry-candle.low;
  let peakPts=state.peakPts,trailStop=state.trailStop;
  if(favPts>peakPts){peakPts=favPts;trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS;}
  const closePts=sign*(candle.close-state.entry);
  if(isEOD||closePts<=trailStop){
    return{action:isEOD?'EXIT_EOD':trailStop<=0?'EXIT_SL':'EXIT_TRAIL',pts:isEOD?closePts:trailStop,peakPts};
  }
  state.peakPts=peakPts;state.trailStop=trailStop;
  return{action:'HOLD',pts:0,peakPts};
}

function runDay(today,prev){
  let state={inTrade:false,dir:null,entry:0,trailStop:-SL_PTS,peakPts:0,firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0;const trades=[];
  for(let ci=0;ci<today.length;ci++){
    const bc=today[ci],isEOD=ci>=today.length-1;
    if(state.inTrade){
      const trail=updateBhavTrail(state,bc,isEOD);
      if(trail.action!=='HOLD'){
        dayPnL+=trail.pts;
        trades[trades.length-1].pnl=trail.pts;
        state.inTrade=false;state.firstDone=true;state.lastExitPts=trail.peakPts;
        state.lastExitIdx=ci;state.lastExitDir=state.dir;state.dir=null;state.entry=0;state.peakPts=0;state.trailStop=-SL_PTS;
      }
      continue;
    }
    if(isEOD||trades.length>=MAX_TRADES)continue;
    let sig=null;
    const sliceNow=today.slice(0,ci+1);
    if(state.firstDone&&state.reCount<MAX_RE&&state.lastExitIdx>=0&&state.lastExitDir){
      const re=findBhavReEntry(sliceNow,state.lastExitIdx,state.lastExitDir,state.lastExitPts>=100);
      if(re&&re.idx===ci)sig={idx:re.idx,side:re.side,reason:re.reason};
    }else if(!state.firstDone){sig=findBhavEntry(sliceNow,prev);}
    if(!sig)continue;
    state.inTrade=true;state.dir=sig.side;state.entry=bc.close;state.trailStop=-SL_PTS;state.peakPts=0;
    if(state.firstDone)state.reCount++;
    trades.push({entryIdx:ci,reason:sig.reason,pnl:0});
  }
  return{pnl:dayPnL,trades};
}

const C0_ONLY=['inside_c0_breaks_above_pdh','inside_c0_breaks_below_pdl','inside_c0_momentum',
  'inside_c0_moderate_c1_confirmed','inside_c0_momentum_no_reversal','above_pdh_c0_reversal_pe',
  'below_pdl_no_recovery_pe','extraordinary_gap_ce','inside_c0_c1_fake_c2_confirms'];

const raw=JSON.parse(fs.readFileSync('cache/banknifty_5yr.json','utf-8'));
const sortedDays=Object.keys(raw).sort();

let totalNormal=0,totalLate=0;
let c0DaysNormal=0,c0DaysLate=0,c0DaysCount=0;
let c1DaysNormal=0,c1DaysLate=0,noDayNormal=0;

for(let i=1;i<sortedDays.length;i++){
  const today=raw[sortedDays[i]],prev=raw[sortedDays[i-1]];
  if(!today||!prev||today.length<2)continue;
  const{pnl:normal,trades}=runDay(today,prev);
  const{pnl:late}=runDay(today.slice(1),prev); // skip C0 = late start
  totalNormal+=normal;totalLate+=late;
  if(trades.length===0){noDayNormal+=normal;continue;}
  const firstReason=trades[0].reason;
  if(C0_ONLY.includes(firstReason)){
    c0DaysNormal+=normal;c0DaysLate+=late;c0DaysCount++;
  }else{
    c1DaysNormal+=normal;c1DaysLate+=late;
  }
}

console.log('=== LATE START IMPACT: If bot misses C0 ===\n');
console.log('Days where FIRST entry was C0 (' + c0DaysCount + ' days):');
console.log('  Normal P&L  :', c0DaysNormal.toFixed(0), 'pts');
console.log('  Late P&L    :', c0DaysLate.toFixed(0), 'pts  ← what you still earn with late start');
console.log('  Lost        :', (c0DaysNormal-c0DaysLate).toFixed(0), 'pts');
console.log('  Recovery %  :', (c0DaysLate/c0DaysNormal*100).toFixed(1)+'% of those days still earned\n');
console.log('Days where first entry was C1+ (unaffected):');
console.log('  Normal P&L  :', c1DaysNormal.toFixed(0), 'pts');
console.log('  Late P&L    :', c1DaysLate.toFixed(0), 'pts  (should be same)\n');
console.log('Overall:');
console.log('  Total normal:', totalNormal.toFixed(0), 'pts');
console.log('  Total late  :', totalLate.toFixed(0), 'pts');
console.log('  % retained  :', (totalLate/totalNormal*100).toFixed(1)+'% of total P&L even with late start');

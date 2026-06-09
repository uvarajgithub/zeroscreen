'use strict';
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('./banknifty_fut_minute_vps.json','utf8'));

const SL_PTS=150, TRAIL_GAP=10, MAX_TRADES=5, RS=30;

function bp(c){return (c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0;}
function _pdh(cs){return Math.max(...cs.map(c=>c.high));}
function _pdl(cs){return Math.min(...cs.map(c=>c.low));}
function _pdc(cs){return cs[cs.length-1].close;}

function build15Min(minuteData){
  const w={};
  for(const m of minuteData){
    const tm=m.h*60+m.m;
    if(tm<9*60+15||tm>=15*60+30) continue;
    const off=tm-(9*60+15),wS=9*60+15+Math.floor(off/15)*15;
    const wh=Math.floor(wS/60),wm=wS%60;
    const k=String(wh).padStart(2,'0')+':'+String(wm).padStart(2,'0');
    if(!w[k]) w[k]={open:m.open,high:m.high,low:m.low,close:m.close};
    else{w[k].high=Math.max(w[k].high,m.high);w[k].low=Math.min(w[k].low,m.low);w[k].close=m.close;}
  }
  return Object.entries(w).sort().map(([t,c])=>({time:t,...c}));
}

function firstBull(cs,from,thresh){thresh=thresh||30;for(let i=from;i<cs.length;i++)if(bp(cs[i])>thresh)return i;return -1;}
function firstBear(cs,from,thresh){thresh=thresh||30;for(let i=from;i<cs.length;i++)if(bp(cs[i])<-thresh)return i;return -1;}
function firstStrong(cs,from,thresh){thresh=thresh||55;for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>thresh)return{i,side:b>0?'CE':'PE'};}return null;}

function findEntry(today,prevCandles){
  if(!today||today.length<1||!prevCandles||!prevCandles.length) return null;
  const PH=_pdh(prevCandles),PL=_pdl(prevCandles),PC=_pdc(prevCandles);
  const C0=today[0];
  const gap=C0.open-PC;
  const lastIdx=today.length-1;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=today[1]?bp(today[1]):0;
  const bps4=today.slice(0,Math.min(4,today.length)).map(bp);
  let wipsaws=0;
  for(let i=1;i<bps4.length;i++)if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65)wipsaws++;
  if(wipsaws>=2) return null;
  const at=function(idx,side,reason){return idx===lastIdx?{idx,side,ctx,reason}:null;};
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000) return at(0,'CE','extraordinary_gap_ce');
    if(C0bp>85) return at(0,'CE','above_pdh_trend_day_ce');
    if(C0bp<-20) return at(0,'PE','above_pdh_c0_reversal_pe');
    const bearIdx=firstBear(today,1,35);
    if(bearIdx>0&&bearIdx<=7) return at(bearIdx,'PE','above_pdh_delayed_pe');
    const contIdx=firstStrong(today,2,55);
    if(contIdx) return at(contIdx.i,contIdx.side,'above_pdh_continuation');
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return at(0,'PE','below_pdl_trend_day_pe');
    if(C0bp<-65) return null;
    if(C0bp>65){const i=firstBear(today,1,30);if(i>0)return at(i,'PE','recovery_bounce_pe');}
    if(C0.high<PL){
      if(today.length>=2&&C1bp>20) return at(1,'CE','below_pdl_c1_bull_ce');
      if(today.length>=1&&C1bp<-20) return at(0,'PE','below_pdl_no_recovery_pe');
      const s=firstStrong(today,2,40);if(s&&s.i<=5)return at(s.i,s.side,'below_pdl_c2_signal');
      return null;
    }
    if(C0bp>20){const i=firstBear(today,1,30);if(i>0&&i<=6)return at(i,'PE','below_pdl_partial_bounce_pe');}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,today.length-2);i++)if(bp(today[i])<-45&&today[i-1].close<PL)return at(i,'PE','below_pdl_failed_bounce_pe');}
    return null;
  }
  if(C0.close<PL&&lastIdx===0)return at(0,'PE','inside_c0_breaks_below_pdl');
  if(C0.close>PH&&lastIdx===0)return at(0,'CE','inside_c0_breaks_above_pdh');
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0;
    const aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if(aligned){
      if(today.length>=2&&C1bp*C0bp<0&&Math.abs(C1bp)>72){const s=at(1,C1bp>0?'CE':'PE','inside_c0_trap_c1_signal');if(s)return s;}
      {const s=at(0,c0isBull?'CE':'PE','inside_c0_momentum');if(s)return s;}
    } else {
      const gapSide=gapUp?'CE':'PE';
      const revCandle=gapUp?firstBull(today,1,35):firstBear(today,1,35);
      if(revCandle>0&&revCandle<=5){const s=at(revCandle,gapSide,'inside_counter_gap_reversal');if(s)return s;}
      {const s=at(0,c0isBull?'CE':'PE','inside_c0_momentum_no_reversal');if(s)return s;}
    }
  }
  for(let i=1;i<today.length;i++){
    const prevC=today[i-1],curr=today[i];
    if(curr.close<prevC.low){if(gapUp&&C0bp>20)continue;const s=at(i,'PE','struct_c'+(i+1)+'_pe');if(s)return s;}
    if(curr.close>prevC.high){if(gapDown&&C0bp<-20)continue;const s=at(i,'CE','struct_c'+(i+1)+'_ce');if(s)return s;}
  }
  for(let i=5;i<Math.min(today.length,21);i++){
    const prevClose=today[i-1].close;
    if(today[i].low<=PL&&prevClose>PL&&bp(today[i])>35)return at(i,'CE','inside_pdl_test_ce');
    if(today[i].high>=PH&&prevClose<PH&&bp(today[i])<-35)return at(i,'PE','inside_pdh_test_pe');
  }
  return null;
}

function runTrade(dir,entryPrice,entryIdx,today){
  let peak=0,trailStop=-SL_PTS;
  const sign=dir==='CE'?1:-1;
  for(let i=entryIdx+1;i<today.length;i++){
    const c=today[i];
    const fav=dir==='CE'?c.high-entryPrice:entryPrice-c.low;
    if(fav>peak){peak=fav;trailStop=peak>=TRAIL_GAP?peak-TRAIL_GAP:-SL_PTS;}
    const exitLevel=entryPrice+sign*trailStop;
    const hitSL=dir==='CE'?c.low<=exitLevel:c.high>=exitLevel;
    if(hitSL||c.time==='15:15'){
      const exitPrice=c.time==='15:15'?c.close:exitLevel;
      const pts=sign*(exitPrice-entryPrice);
      return{pts,rs:pts*RS,exitIdx:i,exitPrice,exitTime:c.time,peak};
    }
  }
  const last=today[today.length-1];
  const pts=sign*(last.close-entryPrice);
  return{pts,rs:pts*RS,exitIdx:today.length-1,exitPrice:last.close,exitTime:last.time,peak};
}

function findReEntry(today,exitIdx,lastDir){
  const lastIdx=today.length-1;
  if(lastIdx<=exitIdx) return null;
  let sdIdx=-1,rvIdx=-1;
  for(let i=exitIdx+1;i<=lastIdx;i++){
    const b=bp(today[i]);
    if(sdIdx<0&&((lastDir==='CE'&&b>40)||(lastDir==='PE'&&b<-40))) sdIdx=i;
    if(rvIdx<0&&((lastDir==='CE'&&b<-40)||(lastDir==='PE'&&b>40))) rvIdx=i;
    if(sdIdx>=0&&rvIdx>=0) break;
  }
  if(sdIdx<0&&rvIdx<0) return null;
  let reIdx,reDir,reason;
  if(sdIdx<0){reIdx=rvIdx;reDir=lastDir==='CE'?'PE':'CE';reason='re_reverse';}
  else if(rvIdx<0){reIdx=sdIdx;reDir=lastDir;reason='re_same_dir';}
  else if(sdIdx<=rvIdx){reIdx=sdIdx;reDir=lastDir;reason='re_same_dir';}
  else{reIdx=rvIdx;reDir=lastDir==='CE'?'PE':'CE';reason='re_reverse';}
  return{idx:reIdx,dir:reDir,reason};
}

const allDays=Object.keys(data).sort();
const dayCandles={};
for(const d of allDays){
  const jun=data[d].filter(function(c){return c.sym==='BANKNIFTY26JUNFUT';});
  dayCandles[d]=build15Min(jun);
}

console.log('=== FUTURES-BASED BACKTEST — JUNE 2026 ===');
console.log('(Same DRISHTI_V1 logic, LOCK10 trail, MAX_TRADES=5, SL=150pts)');
console.log('');

let grandTotal=0,grandTrades=0,grandWins=0,tradedDays=0,noTradeDays=0;
let prevCandles=null;

for(let di=0;di<allDays.length;di++){
  const d=allDays[di];
  const allC=dayCandles[d];
  const today=allC.slice(1); // skip 09:15 seed

  if(!prevCandles){
    prevCandles=allC;
    console.log(d+' | SKIPPED — no prev-day futures available (first day in dataset)');
    console.log('');
    continue;
  }

  const PH=_pdh(prevCandles),PL=_pdl(prevCandles);
  const ctx=today.length>0&&(today[0].open-PH)>120?'ABOVE_PDH':(today[0].open-PL)<0?'BELOW_PDL':'INSIDE';

  let dayRs=0,tradeCount=0,wins=0;
  const tradeLog=[];
  let firstDone=false,lastExitIdx=-1,lastExitDir=null;

  for(let ci=0;ci<today.length&&tradeCount<MAX_TRADES;ci++){
    const subset=today.slice(0,ci+1);
    let entryResult=null,dir=null,reason=null;
    if(!firstDone){
      const sig=findEntry(subset,prevCandles);
      if(!sig) continue;
      dir=sig.side;reason=sig.reason;
      const r=runTrade(dir,today[ci].close,ci,today);
      tradeLog.push({n:tradeCount+1,dir,reason,entryTime:today[ci].time,entry:today[ci].close,exitTime:r.exitTime,exit:r.exitPrice,pts:r.pts,rs:r.rs,peak:r.peak});
      dayRs+=r.rs;if(r.pts>0)wins++;
      firstDone=true;lastExitIdx=r.exitIdx;lastExitDir=dir;tradeCount++;
      ci=r.exitIdx;
    } else {
      const re=findReEntry(today,lastExitIdx,lastExitDir);
      if(!re) break;
      const r=runTrade(re.dir,today[re.idx].close,re.idx,today);
      tradeLog.push({n:tradeCount+1,dir:re.dir,reason:re.reason,entryTime:today[re.idx].time,entry:today[re.idx].close,exitTime:r.exitTime,exit:r.exitPrice,pts:r.pts,rs:r.rs,peak:r.peak});
      dayRs+=r.rs;if(r.pts>0)wins++;
      lastExitIdx=r.exitIdx;lastExitDir=re.dir;tradeCount++;
      ci=r.exitIdx;
    }
  }

  grandTotal+=dayRs;grandTrades+=tradeCount;grandWins+=wins;
  if(tradeCount>0) tradedDays++; else noTradeDays++;

  const sign=dayRs>=0?'+':'';
  console.log(d+' | '+ctx.padEnd(10)+' | PDH:'+PH.toFixed(0)+' PDL:'+PL.toFixed(0)+' | trades:'+tradeCount+' wins:'+wins+'/'+tradeCount+' | Rs: '+sign+Math.round(dayRs));
  tradeLog.forEach(function(t){
    const ps=t.pts>=0?'+':'';
    console.log('  T'+t.n+' '+t.dir+' ['+t.reason+'] entry:'+t.entryTime+'@'+t.entry.toFixed(0)+' exit:'+t.exitTime+'@'+t.exit.toFixed(0)+' peak:'+t.peak.toFixed(0)+'pts  '+ps+t.pts.toFixed(1)+'pts = Rs '+Math.round(t.rs));
  });
  console.log('');

  prevCandles=allC;
}

console.log('══════════════════════════════════════════════════════════');
console.log('JUNE 2026 — FUTURES-BASED BACKTEST SUMMARY');
console.log('Traded days: '+tradedDays+' | No-signal days: '+noTradeDays+' | Skipped: 1');
console.log('Total trades: '+grandTrades+' | Wins: '+grandWins+' | Trade WR: '+(grandWins/Math.max(grandTrades,1)*100).toFixed(1)+'%');
console.log('Gross Rs:     '+Math.round(grandTotal));
console.log('Costs ('+grandTrades+' x Rs50): -Rs '+(grandTrades*50));
console.log('NET Rs:       '+Math.round(grandTotal-grandTrades*50));
console.log('');
console.log('── vs ACTUAL LIVE (spot signals, same 7 days) ──');
console.log('Actual gross: Rs 2,337  |  Actual net: ~Rs 1,987');
console.log('Futures BT gross: Rs '+Math.round(grandTotal)+'  |  EXTRA: Rs '+(Math.round(grandTotal)-2337));

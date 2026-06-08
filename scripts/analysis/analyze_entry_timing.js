// analyze_entry_timing.js — What % of P&L comes from C0 vs C1+ entries?
'use strict';
const { KiteConnect } = require('kiteconnect');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const SL_PTS = 100, TRAIL_GAP = 50, MAX_TRADES = 5, MAX_RE = 3;

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

function updateBhavTrail(state,candle,isEOD){
  const sign=state.dir==='CE'?1:-1;
  const favPts=state.dir==='CE'?candle.high-state.entry:state.entry-candle.low;
  let peakPts=state.peakPts,trailStop=state.trailStop;
  if(favPts>peakPts){peakPts=favPts;trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS;}
  const closePts=sign*(candle.close-state.entry);
  if(isEOD||closePts<=trailStop){
    const exitType=isEOD?'EXIT_EOD':trailStop<=0?'EXIT_SL':'EXIT_TRAIL';
    return{action:exitType,pts:isEOD?closePts:trailStop,exitPrice:0,trailStop,peakPts};
  }
  state.peakPts=peakPts;state.trailStop=trailStop;
  return{action:'HOLD',pts:0,exitPrice:0,trailStop,peakPts};
}

function runDay(today, prev) {
  let state={inTrade:false,dir:null,entry:0,entryIdx:-1,trailStop:-SL_PTS,peakPts:0,firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0,trades=[];
  for(let ci=0;ci<today.length;ci++){
    const bc=today[ci],isEOD=ci>=today.length-1;
    if(state.inTrade){
      const trail=updateBhavTrail(state,bc,isEOD);
      if(trail.action!=='HOLD'){
        const pts=trail.pts;
        dayPnL+=pts;
        trades[trades.length-1].pnl=pts;
        trades[trades.length-1].exitIdx=ci;
        state.inTrade=false;state.firstDone=true;state.lastExitPts=trail.peakPts;
        state.lastExitIdx=ci;state.lastExitDir=state.dir;state.dir=null;state.entry=0;state.entryIdx=-1;state.peakPts=0;state.trailStop=-SL_PTS;
      }
      continue;
    }
    if(isEOD)continue;
    if(trades.length>=MAX_TRADES)continue;
    let sig=null;
    const sliceNow=today.slice(0,ci+1);
    if(state.firstDone&&state.reCount<MAX_RE&&state.lastExitIdx>=0&&state.lastExitDir){
      const re=findBhavReEntry(sliceNow,state.lastExitIdx,state.lastExitDir,state.lastExitPts>=100);
      if(re&&re.idx===ci)sig={idx:re.idx,side:re.side,ctx:'RE',reason:re.reason};
    }else if(!state.firstDone){sig=findBhavEntry(sliceNow,prev);}
    if(!sig)continue;
    state.inTrade=true;state.dir=sig.side;state.entry=bc.close;state.entryIdx=ci;state.trailStop=-SL_PTS;state.peakPts=0;
    if(state.firstDone)state.reCount++;
    trades.push({entryIdx:ci,reason:sig.reason,side:sig.side,pnl:0,exitIdx:-1});
  }
  return{pnl:dayPnL,trades};
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}

async function main(){
  // Use cached data (keyed by date)
  const cacheFile = 'cache/banknifty_5yr.json';
  if(!fs.existsSync(cacheFile)){ console.log('No cache found'); process.exit(1); }
  console.log('Using cached data...');
  const raw = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
  // raw is { 'YYYY-MM-DD': [{open,high,low,close,h,m}, ...], ... }
  const days = raw;
  const sortedDays = Object.keys(days).sort();
  const C0_ONLY=['inside_c0_breaks_above_pdh','inside_c0_breaks_below_pdl','inside_c0_momentum',
    'inside_c0_moderate_c1_confirmed','inside_c0_momentum_no_reversal','above_pdh_c0_reversal_pe',
    'below_pdl_no_recovery_pe','extraordinary_gap_ce','inside_c0_c1_fake_c2_confirms'];

  let totalPnL=0,c0Pnl=0,c1plusPnl=0,c0Count=0,c1plusCount=0;
  const reasonStats={};

  for(let i=1;i<sortedDays.length;i++){
    const dateKey=sortedDays[i];
    const today=days[dateKey];
    const prev=days[sortedDays[i-1]];
    if(!today||!prev)continue;
    const{pnl,trades}=runDay(today,prev);
    totalPnL+=pnl;
    for(const t of trades){
      if(!reasonStats[t.reason])reasonStats[t.reason]={count:0,pnl:0,wins:0};
      reasonStats[t.reason].count++;
      reasonStats[t.reason].pnl+=t.pnl;
      if(t.pnl>0)reasonStats[t.reason].wins++;
      if(C0_ONLY.includes(t.reason)){c0Count++;c0Pnl+=t.pnl;}
      else{c1plusCount++;c1plusPnl+=t.pnl;}
    }
  }

  console.log('\n=== ENTRY TIMING ANALYSIS ===');
  console.log(`Total P&L: ${totalPnL.toFixed(0)} pts`);
  console.log(`\nC0-ONLY entries (missed if bot starts late):`);
  console.log(`  Trades: ${c0Count} | P&L: ${c0Pnl.toFixed(0)} pts`);
  console.log(`\nC1+ entries (still catchable on late restart):`);
  console.log(`  Trades: ${c1plusCount} | P&L: ${c1plusPnl.toFixed(0)} pts`);
  console.log(`\nC0 share of total P&L: ${(c0Pnl/totalPnL*100).toFixed(1)}%`);
  console.log(`\n--- By reason (sorted by P&L) ---`);
  Object.entries(reasonStats).sort((a,b)=>b[1].pnl-a[1].pnl).forEach(([r,s])=>{
    const tag=C0_ONLY.includes(r)?'[C0]':'[C1+]';
    console.log(`  ${tag} ${r}: ${s.count} trades, P&L ${s.pnl.toFixed(0)}, WR ${(s.wins/s.count*100).toFixed(0)}%`);
  });
}

main().catch(e=>{console.error(e.message);process.exit(1);});

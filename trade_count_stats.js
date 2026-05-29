'use strict';
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const SL_PTS=150,TRAIL_GAP=10,MAX_TRADES=5,MAX_RE=5,DAILY_LOSS_CAP=150;

function bp(c){return(c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0;}
function pdh(cs){return Math.max(...cs.map(c=>c.high));}
function pdl(cs){return Math.min(...cs.map(c=>c.low));}
function pdc(cs){return cs[cs.length-1].close;}
function firstBull(cs,from,thresh=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])>thresh)return i;return -1;}
function firstBear(cs,from,thresh=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])<-thresh)return i;return -1;}
function firstStrong(cs,from,thresh=55){for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>thresh)return{i,side:b>0?'CE':'PE'};}return null;}

function findDrishtiEntry(today,prev){
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
    if(C0bp>85)return at(0,'CE','above_pdh_trend_day_ce');
    if(C0bp<-20)return at(0,'PE','above_pdh_c0_reversal_pe');
    const bearIdx=firstBear(today,1,35);
    if(bearIdx>0&&bearIdx<=7)return at(bearIdx,'PE','above_pdh_delayed_pe');
    const contIdx=firstStrong(today,2,55);
    if(contIdx)return at(contIdx.i,contIdx.side,'above_pdh_continuation');
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80)return at(0,'PE','below_pdl_trend_day_pe');
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
  if(C0.close<PL&&lastIdx===0)return at(0,'PE','inside_c0_breaks_below_pdl');
  if(C0.close>PH&&lastIdx===0)return at(0,'CE','inside_c0_breaks_above_pdh');
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0,aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if(aligned){
      if(today.length>=2&&C1bp*C0bp<0&&Math.abs(C1bp)>72){const s=at(1,C1bp>0?'CE':'PE','inside_c0_trap_c1_signal');if(s)return s;}
      {const s=at(0,c0isBull?'CE':'PE','inside_c0_momentum');if(s)return s;}
    }else{
      const gapSide=gapUp?'CE':'PE',revCandle=gapUp?firstBull(today,1,35):firstBear(today,1,35);
      if(revCandle>0&&revCandle<=5){const s=at(revCandle,gapSide,'inside_counter_gap_reversal');if(s)return s;}
      {const s=at(0,c0isBull?'CE':'PE','inside_c0_momentum_no_reversal');if(s)return s;}
    }
  }
  if(Math.abs(C0bp)>30){
    if(today.length>=2&&C1bp*C0bp>0){const s=at(0,C0bp>0?'CE':'PE','inside_c0_moderate_c1_confirmed');if(s)return s;}
    if(today.length>=3&&Math.abs(C1bp)>65&&C1bp*C0bp<0){const C2bp=bp(today[2]);if(C2bp*C0bp>0&&Math.abs(C2bp)>20){const s=at(0,C0bp>0?'CE':'PE','inside_c0_c1_fake_c2_confirms');if(s)return s;}}
  }
  for(let i=2;i<=8;i++){
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

function findDrishtiReEntry(today,exitIdx,side,allowReverse){
  const lastIdx=today.length-1;if(lastIdx<=exitIdx)return null;
  for(let i=exitIdx+1;i<=lastIdx;i++){const b=bp(today[i]);if(side==='CE'&&b>40)return{idx:i,side,reason:'re_same_dir'};if(side==='PE'&&b<-40)return{idx:i,side,reason:'re_same_dir'};}
  if(allowReverse){const revSide=side==='CE'?'PE':'CE';for(let i=exitIdx+1;i<=lastIdx;i++){const b=bp(today[i]);if(revSide==='CE'&&b>40)return{idx:i,side:revSide,reason:'re_reverse'};if(revSide==='PE'&&b<-40)return{idx:i,side:revSide,reason:'re_reverse'};}}
  return null;
}

function updateDrishtiTrail(state,candle,isEOD){
  const sign=state.dir==='CE'?1:-1;
  const favPts=state.dir==='CE'?candle.high-state.entry:state.entry-candle.low;
  let peakPts=state.peakPts,trailStop=state.trailStop;
  if(favPts>peakPts){peakPts=favPts;trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS;}
  const closePts=sign*(candle.close-state.entry);
  if(isEOD||closePts<=trailStop){
    const exitType=isEOD?'EXIT_EOD':trailStop<=0?'EXIT_SL':'EXIT_TRAIL';
    const lockedPts=isEOD?closePts:trailStop;
    const exitPrice=isEOD?candle.close:state.entry+sign*trailStop;
    return{action:exitType,pts:lockedPts,exitPrice,trailStop,peakPts};
  }
  state.peakPts=peakPts;state.trailStop=trailStop;
  return{action:'HOLD',pts:0,exitPrice:0,trailStop,peakPts};
}

function runDay(today,prev){
  const liveCandles=today.slice(1);
  if(liveCandles.length<2)return{pnl:0,trades:0,wins:0};
  let state={inTrade:false,dir:null,entry:0,entryIdx:-1,trailStop:-SL_PTS,peakPts:0,firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0,trades=0,wins=0;
  for(let li=0;li<liveCandles.length;li++){
    const bc=liveCandles[li],isEOD=li>=liveCandles.length-1;
    if(state.inTrade){
      const trail=updateDrishtiTrail(state,bc,isEOD);
      if(trail.action!=='HOLD'){
        const pts=trail.pts;dayPnL+=pts;trades++;if(pts>0)wins++;
        state={...state,inTrade:false,firstDone:true,lastExitPts:trail.peakPts,lastExitIdx:li,lastExitDir:state.dir,dir:null,entry:0,entryIdx:-1,peakPts:0,trailStop:-SL_PTS};
      }
      continue;
    }
    if(isEOD||trades>=MAX_TRADES||dayPnL<=-DAILY_LOSS_CAP)continue;
    const sliceNow=liveCandles.slice(0,li+1);
    let sig=null;
    if(state.firstDone&&state.reCount<MAX_RE&&state.lastExitPts>=0&&state.lastExitIdx>=0&&state.lastExitDir){
      const re=findDrishtiReEntry(sliceNow,state.lastExitIdx,state.lastExitDir,state.lastExitPts>=50);
      if(re&&re.idx===li)sig={idx:re.idx,side:re.side,ctx:'RE',reason:re.reason};
    }else if(!state.firstDone){
      sig=findDrishtiEntry(sliceNow,prev);
    }
    if(!sig)continue;
    state={...state,inTrade:true,dir:sig.side,entry:bc.close,entryIdx:li,trailStop:-SL_PTS,peakPts:0};
    if(state.firstDone)state.reCount++;
  }
  return{pnl:dayPnL,trades,wins};
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function fetchChunk(from,to){
  const data=await kite.getHistoricalData(INSTRUMENT_TOKEN,'15minute',from,to,false);
  return data.map(d=>({date:d.date instanceof Date?d.date:new Date(d.date),open:d.open,high:d.high,low:d.low,close:d.close}));
}
function groupByDay(candles){
  const days={};
  for(const c of candles){
    const ist=new Date(c.date.getTime()+5.5*3600*1000);
    const h=ist.getUTCHours(),m=ist.getUTCMinutes(),totalMin=h*60+m;
    if(totalMin<9*60+15||totalMin>15*60+15)continue;
    const dk=ist.toISOString().slice(0,10);
    if(!days[dk])days[dk]=[];
    days[dk].push({open:c.open,high:c.high,low:c.low,close:c.close});
  }
  return days;
}

async function main(){
  console.log('Fetching 5yr data...');
  const startDate=new Date('2021-01-01'),endDate=new Date('2026-05-25');
  const all=[];let cur=new Date(startDate);
  while(cur<endDate){
    const ce=new Date(cur);ce.setDate(ce.getDate()+59);if(ce>endDate)ce.setTime(endDate.getTime());
    const from=cur.toISOString().slice(0,10),to=ce.toISOString().slice(0,10);
    process.stdout.write(`  ${from}→${to} `);
    try{const chunk=await fetchChunk(from,to);all.push(...chunk);process.stdout.write(`${chunk.length}\n`);}
    catch(e){process.stdout.write(`ERR\n`);}
    await sleep(350);cur.setDate(cur.getDate()+60);
  }
  const dayMap=groupByDay(all);
  const allDates=Object.keys(dayMap).sort();

  // Trade count distribution
  const tradeCounts={0:0,1:0,2:0,3:0,4:0,5:0};
  const maxTradeDays=[];  // days with 5 trades

  for(let di=1;di<allDates.length;di++){
    const date=allDates[di],today=dayMap[date],prev=dayMap[allDates[di-1]];
    if(!today||today.length<3||!prev||prev.length<3)continue;
    const{pnl,trades,wins}=runDay(today,prev);
    tradeCounts[trades]=(tradeCounts[trades]||0)+1;
    if(trades===5)maxTradeDays.push({date,pnl:Math.round(pnl*10)/10,wins});
  }

  const total=Object.values(tradeCounts).reduce((a,b)=>a+b,0);
  console.log('\n=== TRADES PER DAY DISTRIBUTION (5yr) ===\n');
  for(const [t,cnt] of Object.entries(tradeCounts).sort((a,b)=>a[0]-b[0])){
    const pct=(cnt/total*100).toFixed(1);
    const bar='█'.repeat(Math.round(cnt/total*40));
    console.log(`${t} trades/day  ${String(cnt).padStart(4)} days  ${pct.padStart(5)}%  ${bar}`);
  }

  console.log(`\n=== DAYS WITH 5 TRADES (MAX) — ${maxTradeDays.length} days ===`);
  console.log(`Date           P&L (pts)  Wins        Rs`);
  maxTradeDays.sort((a,b)=>b.pnl-a.pnl).forEach(d=>{
    const rs=Math.round(d.pnl*15);
    const sign=d.pnl>=0?'+':'-';
    console.log(`${d.date}  ${(d.pnl>=0?'+':'')+d.pnl.toFixed(1).padStart(9)} pts  ${d.wins}/5 wins  Rs${sign}${Math.abs(rs).toLocaleString()}`);
  });
}

main().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});

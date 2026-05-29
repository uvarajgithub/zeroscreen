'use strict';
// backtest_bhav_sweep.js
// Sweep PDR threshold + Whipsaw body threshold to find best combo for May 2026

const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const SL_PTS    = 150;
const TRAIL_GAP = 10;
const MAX_TRADES = 5;
const MAX_RE     = 5;
const RE_BODY    = 40;
const RE_GATE    = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function bp(c){ return (c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0; }
function pdh(cs){ return Math.max(...cs.map(c=>c.high)); }
function pdl(cs){ return Math.min(...cs.map(c=>c.low)); }
function pdc(cs){ return cs[cs.length-1].close; }
function firstBull(cs,from,t=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])>t)return i;return -1;}
function firstBear(cs,from,t=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])<-t)return i;return -1;}
function firstStrong(cs,from,t=55){for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null;}

function findBhavEntry(today, prev, WHIP_THRESH) {
  if(!today||today.length<1)return null;
  if(!prev||prev.length===0)return null;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const C0=today[0],gap=C0.open-PC,lastIdx=today.length-1;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=today[1]?bp(today[1]):0;

  // Whipsaw guard — parameterized threshold
  const bps4=today.slice(0,Math.min(4,today.length)).map(bp);
  let wipsaws=0;
  for(let i=1;i<bps4.length;i++)
    if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>WHIP_THRESH&&Math.abs(bps4[i-1])>WHIP_THRESH)
      wipsaws++;
  if(wipsaws>=2)return null;

  const at=(idx,side,reason)=>idx===lastIdx?{idx,side,ctx,reason}:null;

  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)return at(0,'CE','extraordinary_gap_ce');
    if(C0bp>85)return at(0,'CE','above_pdh_trend_day_ce');
    if(C0bp<-20)return at(0,'PE','above_pdh_c0_reversal_pe');
    const bi=firstBear(today,1,35);if(bi>0&&bi<=7)return at(bi,'PE','above_pdh_delayed_pe');
    const ci=firstStrong(today,2,55);if(ci)return at(ci.i,ci.side,'above_pdh_continuation');
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
    if(C0bp<-10){for(let i=2;i<=Math.min(7,today.length-2);i++){if(bp(today[i])<-45&&today[i-1].close<PL)return at(i,'PE','below_pdl_failed_bounce_pe');}}
    return null;
  }
  if(C0.close<PL&&lastIdx===0)return at(0,'PE','inside_c0_breaks_below_pdl');
  if(C0.close>PH&&lastIdx===0)return at(0,'CE','inside_c0_breaks_above_pdh');
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const bull=C0bp>0,aligned=(bull&&!gapDown)||(!bull&&!gapUp);
    if(aligned){
      if(today.length>=2&&C1bp*C0bp<0&&Math.abs(C1bp)>72){const s=at(1,C1bp>0?'CE':'PE','trap');if(s)return s;}
      {const s=at(0,bull?'CE':'PE','momentum');if(s)return s;}
    }else{
      const gs=gapUp?'CE':'PE',rc=gapUp?firstBull(today,1,35):firstBear(today,1,35);
      if(rc>0&&rc<=5){const s=at(rc,gs,'counter_gap');if(s)return s;}
      {const s=at(0,bull?'CE':'PE','momentum_no_rev');if(s)return s;}
    }
  }
  if(Math.abs(C0bp)>30){
    if(today.length>=2&&C1bp*C0bp>0){const s=at(0,C0bp>0?'CE':'PE','moderate_confirmed');if(s)return s;}
    if(today.length>=3&&Math.abs(C1bp)>65&&C1bp*C0bp<0){
      const c2=bp(today[2]);if(c2*C0bp>0&&Math.abs(c2)>20){const s=at(0,C0bp>0?'CE':'PE','c1_fake_c2');if(s)return s;}
    }
  }
  for(let i=2;i<=8;i++){
    if(i>=today.length)break;
    const cbp=bp(today[i]);
    if(Math.abs(cbp)>55){
      const sb=cbp>0,og=(sb&&gapDown)||(!sb&&gapUp),cm=(sb&&C0bp<-20)||(!sb&&C0bp>20);
      if(og&&cm)continue;
      const pv=bp(today[i-1]);
      if(Math.abs(pv)>60&&pv*cbp<0){if(i+1<today.length&&bp(today[i+1])*cbp<0&&Math.abs(bp(today[i+1]))>60)return null;}
      return at(i,cbp>0?'CE':'PE',`c${i}_strong`);
    }
  }
  for(let i=5;i<Math.min(today.length,21);i++){
    const pc=today[i-1].close;
    if(today[i].low<=PL&&pc>PL&&bp(today[i])>35)return at(i,'CE','pdl_test');
    if(today[i].high>=PH&&pc<PH&&bp(today[i])<-35)return at(i,'PE','pdh_test');
  }
  return null;
}

function findBhavReEntry(today,exitIdx,side,allowRev){
  const lastIdx=today.length-1;if(lastIdx<=exitIdx)return null;
  for(let i=exitIdx+1;i<=lastIdx;i++){
    const b=bp(today[i]);
    if(side==='CE'&&b>RE_BODY)return{idx:i,side,reason:'re_same'};
    if(side==='PE'&&b<-RE_BODY)return{idx:i,side,reason:'re_same'};
  }
  if(allowRev){
    const rv=side==='CE'?'PE':'CE';
    for(let i=exitIdx+1;i<=lastIdx;i++){
      const b=bp(today[i]);
      if(rv==='CE'&&b>RE_BODY)return{idx:i,side:rv,reason:'re_rev'};
      if(rv==='PE'&&b<-RE_BODY)return{idx:i,side:rv,reason:'re_rev'};
    }
  }
  return null;
}

function updateTrail(state,candle,isEOD){
  const sign=state.dir==='CE'?1:-1;
  const fav=state.dir==='CE'?candle.high-state.entry:state.entry-candle.low;
  let pk=state.peakPts,ts=state.trailStop;
  if(fav>pk){pk=fav;ts=pk>=TRAIL_GAP?pk-TRAIL_GAP:-SL_PTS;}
  const cp=sign*(candle.close-state.entry);
  if(isEOD||cp<=ts){
    return{action:isEOD?'EOD':ts<=0?'SL':'TRAIL',pts:isEOD?cp:ts,peakPts:pk};
  }
  state.peakPts=pk;state.trailStop=ts;
  return{action:'HOLD'};
}

function runDay(today, prev, PDR_THRESH, WHIP_THRESH){
  const ph=pdh(prev),pl=pdl(prev);
  if(ph-pl<PDR_THRESH)return{pnl:0,trades:0,wins:0,losses:0};
  let st={inTrade:false,dir:null,entry:0,trailStop:-SL_PTS,peakPts:0,
           firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0,trades=0,wins=0,losses=0;
  for(let ci=0;ci<today.length;ci++){
    const bc=today[ci],isEOD=ci>=today.length-1;
    if(st.inTrade){
      const tr=updateTrail(st,bc,isEOD);
      if(tr.action!=='HOLD'){
        dayPnL+=tr.pts;trades++;if(tr.pts>0)wins++;else losses++;
        st.inTrade=false;st.firstDone=true;
        st.lastExitPts=tr.peakPts;st.lastExitIdx=ci;st.lastExitDir=st.dir;
        st.dir=null;st.entry=0;st.peakPts=0;st.trailStop=-SL_PTS;
      }
      continue;
    }
    if(isEOD||trades>=MAX_TRADES)continue;
    let sig=null;
    const sl=today.slice(0,ci+1);
    if(st.firstDone&&st.reCount<MAX_RE&&st.lastExitPts>=RE_GATE&&st.lastExitIdx>=0&&st.lastExitDir){
      const ar=st.lastExitPts>=100;
      const re=findBhavReEntry(sl,st.lastExitIdx,st.lastExitDir,ar);
      if(re&&re.idx===ci)sig={idx:re.idx,side:re.side};
    }else if(!st.firstDone){
      sig=findBhavEntry(sl,prev,WHIP_THRESH);
    }
    if(!sig)continue;
    st.inTrade=true;st.dir=sig.side;st.entry=bc.close;
    st.trailStop=-SL_PTS;st.peakPts=0;
    if(st.firstDone)st.reCount++;
  }
  return{pnl:Math.round(dayPnL*10)/10,trades,wins,losses};
}

async function fetchChunk(from,to){
  const data=await kite.getHistoricalData(INSTRUMENT_TOKEN,'15minute',from,to,false);
  return data.map(d=>({date:d.date instanceof Date?d.date:new Date(d.date),open:d.open,high:d.high,low:d.low,close:d.close}));
}
function groupByDay(candles){
  const days={};
  for(const c of candles){
    const ist=new Date(c.date.getTime()+5.5*3600*1000);
    const tm=ist.getUTCHours()*60+ist.getUTCMinutes();
    if(tm<9*60+15||tm>15*60+15)continue;
    const dk=ist.toISOString().slice(0,10);
    if(!days[dk])days[dk]=[];
    days[dk].push({open:c.open,high:c.high,low:c.low,close:c.close});
  }
  return days;
}

async function main(){
  console.log('Fetching May 2026 data...');
  const candles=await fetchChunk('2026-04-29','2026-05-29');
  const dayMap=groupByDay(candles);
  const allDates=Object.keys(dayMap).sort();
  console.log(`${allDates.length} trading days\n`);

  // Parameter sweep ranges
  const PDR_VALS   = [0, 50, 75, 100, 125, 150, 175, 200, 250, 300];
  const WHIP_VALS  = [50, 55, 60, 65, 70, 75, 80, 999]; // 999 = effectively disabled

  const results = [];

  for(const PDR of PDR_VALS){
    for(const WHIP of WHIP_VALS){
      let totalPnL=0,totalTrades=0,totalWins=0,totalLosses=0,greenDays=0,redDays=0,tradingDays=0;
      for(let di=1;di<allDates.length;di++){
        const date=allDates[di];
        const today=dayMap[date],prev=dayMap[allDates[di-1]];
        if(!today||today.length<3||!prev||prev.length<3)continue;
        const r=runDay(today,prev,PDR,WHIP);
        totalPnL+=r.pnl;totalTrades+=r.trades;totalWins+=r.wins;totalLosses+=r.losses;
        tradingDays++;
        if(r.pnl>0)greenDays++;else if(r.pnl<0)redDays++;
      }
      const wr=totalTrades>0?((totalWins/totalTrades)*100).toFixed(1):0;
      const avg=tradingDays>0?(totalPnL/tradingDays).toFixed(1):0;
      results.push({PDR,WHIP:WHIP===999?'OFF':WHIP,pnl:Math.round(totalPnL*10)/10,trades:totalTrades,wins:totalWins,losses:totalLosses,wr,avg,green:greenDays,red:redDays});
    }
  }

  // Sort by total P&L descending
  results.sort((a,b)=>b.pnl-a.pnl);

  console.log('PDR   WHIP   Total P&L    Avg/Day   Trades  W/L       WinRate  Green Red');
  console.log('─'.repeat(78));
  for(const r of results){
    const pnlStr=(r.pnl>=0?'+':'')+r.pnl.toFixed(1);
    const avgStr=(r.avg>=0?'+':'')+r.avg;
    const pdrStr=String(r.PDR).padStart(3);
    const whipStr=String(r.WHIP).padStart(4);
    const flag = r.PDR===150&&r.WHIP===65 ? ' ← CURRENT' : '';
    console.log(`${pdrStr}  ${whipStr}  ${pnlStr.padStart(10)}  ${avgStr.padStart(8)}   ${String(r.trades).padStart(3)}   ${String(r.wins).padStart(2)}/${String(r.losses).padStart(2)}   ${String(r.wr).padStart(5)}%   ${r.green.toString().padStart(2)}   ${r.red}${flag}`);
  }

  // Show top 5 and bottom 5
  console.log('\n── TOP 5 ─────────────────────────────────────────────────────────────');
  for(const r of results.slice(0,5)){
    console.log(`PDR=${r.PDR}  Whipsaw=${r.WHIP}  →  +${r.pnl} pts  WR:${r.wr}%  ${r.green}G/${r.red}R`);
  }
  console.log('\n── WORST 5 ───────────────────────────────────────────────────────────');
  for(const r of results.slice(-5)){
    console.log(`PDR=${r.PDR}  Whipsaw=${r.WHIP}  →  ${r.pnl} pts  WR:${r.wr}%  ${r.green}G/${r.red}R`);
  }
  console.log('\nCurrent settings: PDR=150, Whipsaw=65');
}

main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});

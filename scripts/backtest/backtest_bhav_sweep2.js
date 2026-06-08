'use strict';
// backtest_bhav_sweep2.js
// Sweep: STRONG_BODY / MOD_BODY / WHIP_OPP / RE_GATE / REV_UNLOCK
// All combinations × May 2026 data

const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(process.cwd(), '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const SL_PTS    = 150;
const TRAIL_GAP = 10;
const MAX_TRADES = 5;
const MAX_RE     = 5;
const RE_BODY    = 40;   // re-entry candle body threshold (fixed)
const PDR_THRESH = 150;  // fixed

// ─── Helpers ──────────────────────────────────────────────────────────────────
function bp(c){ return (c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0; }
function pdh(cs){ return Math.max(...cs.map(c=>c.high)); }
function pdl(cs){ return Math.min(...cs.map(c=>c.low)); }
function pdc(cs){ return cs[cs.length-1].close; }
function firstBull(cs,from,t=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])>t)return i;return -1;}
function firstBear(cs,from,t=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])<-t)return i;return -1;}
function firstStrong(cs,from,t){for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null;}

// Parameterized entry function
function findBhavEntry(today, prev, STRONG, MOD, WHIP_OPP) {
  if(!today||today.length<1)return null;
  if(!prev||prev.length===0)return null;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const C0=today[0],gap=C0.open-PC,lastIdx=today.length-1;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=today[1]?bp(today[1]):0;

  // Whipsaw guard (65 is fixed — separate from WHIP_OPP)
  const bps4=today.slice(0,Math.min(4,today.length)).map(bp);
  let wipsaws=0;
  for(let i=1;i<bps4.length;i++)
    if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65)
      wipsaws++;
  if(wipsaws>=2)return null;

  const at=(idx,side,r)=>idx===lastIdx?{idx,side,ctx,r}:null;

  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)return at(0,'CE','xgap');
    if(C0bp>85)return at(0,'CE','trend_ce');
    if(C0bp<-20)return at(0,'PE','rev_pe');
    const bi=firstBear(today,1,35);if(bi>0&&bi<=7)return at(bi,'PE','delayed_pe');
    const ci=firstStrong(today,2,STRONG);if(ci)return at(ci.i,ci.side,'cont');
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80)return at(0,'PE','trend_pe');
    if(C0bp<-65)return null;
    if(C0bp>65){const i=firstBear(today,1,30);if(i>0)return at(i,'PE','bounce_pe');}
    if(C0.high<PL){
      if(today.length>=2&&C1bp>20)return at(1,'CE','c1_bull');
      if(today.length>=1&&C1bp<-20)return at(0,'PE','no_rec');
      const s=firstStrong(today,2,40);if(s&&s.i<=5)return at(s.i,s.side,'c2_sig');
      return null;
    }
    if(C0bp>20){const i=firstBear(today,1,30);if(i>0&&i<=6)return at(i,'PE','partial_pe');}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,today.length-2);i++){if(bp(today[i])<-45&&today[i-1].close<PL)return at(i,'PE','failed_bounce');}}
    return null;
  }

  // INSIDE
  if(C0.close<PL&&lastIdx===0)return at(0,'PE','c0_breaks_pdl');
  if(C0.close>PH&&lastIdx===0)return at(0,'CE','c0_breaks_pdh');
  const gapUp=gap>50,gapDown=gap<-50;

  if(Math.abs(C0bp)>STRONG){
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
  if(Math.abs(C0bp)>MOD){
    if(today.length>=2&&C1bp*C0bp>0){const s=at(0,C0bp>0?'CE':'PE','mod_confirmed');if(s)return s;}
    if(today.length>=3&&Math.abs(C1bp)>65&&C1bp*C0bp<0){
      const c2=bp(today[2]);if(c2*C0bp>0&&Math.abs(c2)>20){const s=at(0,C0bp>0?'CE':'PE','c1_fake');if(s)return s;}
    }
  }
  // Weak C0 loop — uses STRONG threshold
  for(let i=2;i<=8;i++){
    if(i>=today.length)break;
    const cbp=bp(today[i]);
    if(Math.abs(cbp)>STRONG){
      const sb=cbp>0,og=(sb&&gapDown)||(!sb&&gapUp),cm=(sb&&C0bp<-20)||(!sb&&C0bp>20);
      if(og&&cm)continue;
      // Whipsaw check at signal candle — parameterized WHIP_OPP
      const pv=bp(today[i-1]);
      if(Math.abs(pv)>WHIP_OPP&&pv*cbp<0){
        if(i+1<today.length&&bp(today[i+1])*cbp<0&&Math.abs(bp(today[i+1]))>WHIP_OPP)return null;
      }
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
    if(side==='CE'&&b>RE_BODY)return{idx:i,side};
    if(side==='PE'&&b<-RE_BODY)return{idx:i,side};
  }
  if(allowRev){
    const rv=side==='CE'?'PE':'CE';
    for(let i=exitIdx+1;i<=lastIdx;i++){
      const b=bp(today[i]);
      if(rv==='CE'&&b>RE_BODY)return{idx:i,side:rv};
      if(rv==='PE'&&b<-RE_BODY)return{idx:i,side:rv};
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
  if(isEOD||cp<=ts)return{action:isEOD?'EOD':ts<=0?'SL':'TRAIL',pts:isEOD?cp:ts,peakPts:pk};
  state.peakPts=pk;state.trailStop=ts;
  return{action:'HOLD'};
}

function runDay(today, prev, STRONG, MOD, WHIP_OPP, RE_GATE, REV_UNLOCK){
  const ph=pdh(prev),pl=pdl(prev);
  if(ph-pl<PDR_THRESH)return{pnl:0,trades:0,wins:0,losses:0};
  const liveCandles=today.slice(1); // skip 9:15 candle; live C0 = 9:30-9:45
  if(liveCandles.length<2)return{pnl:0,trades:0,wins:0,losses:0};
  let st={inTrade:false,dir:null,entry:0,trailStop:-SL_PTS,peakPts:0,
           firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0,trades=0,wins=0,losses=0;
  for(let li=0;li<liveCandles.length;li++){
    const bc=liveCandles[li],isEOD=li>=liveCandles.length-1;
    if(st.inTrade){
      const tr=updateTrail(st,bc,isEOD);
      if(tr.action!=='HOLD'){
        dayPnL+=tr.pts;trades++;if(tr.pts>0)wins++;else losses++;
        st.inTrade=false;st.firstDone=true;
        st.lastExitPts=tr.peakPts;st.lastExitIdx=li;st.lastExitDir=st.dir;
        st.dir=null;st.entry=0;st.peakPts=0;st.trailStop=-SL_PTS;
      }
      continue;
    }
    if(isEOD||trades>=MAX_TRADES)continue;
    let sig=null;
    const sl=liveCandles.slice(0,li+1);
    if(st.firstDone&&st.reCount<MAX_RE&&st.lastExitPts>=RE_GATE&&st.lastExitIdx>=0&&st.lastExitDir){
      const ar=st.lastExitPts>=REV_UNLOCK;
      const re=findBhavReEntry(sl,st.lastExitIdx,st.lastExitDir,ar);
      if(re&&re.idx===li)sig={idx:re.idx,side:re.side};
    }else if(!st.firstDone){
      sig=findBhavEntry(sl,prev,STRONG,MOD,WHIP_OPP);
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

  // Build day pairs once
  const pairs=[];
  for(let di=1;di<allDates.length;di++){
    const today=dayMap[allDates[di]],prev=dayMap[allDates[di-1]];
    if(!today||today.length<3||!prev||prev.length<3)continue;
    pairs.push({today,prev});
  }

  // ── Parameter ranges ──────────────────────────────────────────────────────
  const STRONG_VALS    = [40, 45, 50, 55, 60, 65, 70];   // signal body strong %
  const MOD_VALS       = [15, 20, 25, 30, 35, 40];        // signal body moderate %
  const WHIP_OPP_VALS  = [45, 50, 55, 60, 65, 70, 999];  // whipsaw opp check (999=off)
  const RE_GATE_VALS   = [0, 5, 10, 15, 20, 25, 30];      // re-entry peak gate pts
  const REV_UNLOCK_VALS= [50, 75, 100, 150, 999];         // reverse unlock pts

  const total = STRONG_VALS.length * MOD_VALS.length * WHIP_OPP_VALS.length * RE_GATE_VALS.length * REV_UNLOCK_VALS.length;
  console.log(`Running ${total} combinations...\n`);

  const results=[];

  for(const STRONG of STRONG_VALS){
    for(const MOD of MOD_VALS){
      if(MOD>=STRONG)continue; // MOD must be < STRONG
      for(const WHIP_OPP of WHIP_OPP_VALS){
        for(const RE_GATE of RE_GATE_VALS){
          for(const REV_UNLOCK of REV_UNLOCK_VALS){
            let totalPnL=0,totalTrades=0,totalWins=0,totalLosses=0,green=0,red=0,flat=0;
            for(const {today,prev} of pairs){
              const r=runDay(today,prev,STRONG,MOD,WHIP_OPP,RE_GATE,REV_UNLOCK);
              totalPnL+=r.pnl;totalTrades+=r.trades;totalWins+=r.wins;totalLosses+=r.losses;
              if(r.pnl>0)green++;else if(r.pnl<0)red++;else flat++;
            }
            const wr=totalTrades>0?((totalWins/totalTrades)*100).toFixed(1):0;
            const avg=pairs.length>0?(totalPnL/pairs.length).toFixed(1):0;
            results.push({STRONG,MOD,WHIP_OPP:WHIP_OPP===999?'OFF':WHIP_OPP,
              RE_GATE,REV_UNLOCK:REV_UNLOCK===999?'OFF':REV_UNLOCK,
              pnl:Math.round(totalPnL*10)/10,trades:totalTrades,wins:totalWins,
              losses:totalLosses,wr,avg,green,red,flat});
          }
        }
      }
    }
  }

  results.sort((a,b)=>b.pnl-a.pnl);

  // ── Print top 20 ─────────────────────────────────────────────────────────
  console.log('Rank  Strong  Mod  WhipOpp  ReGate  RevUnlock    P&L       Avg/Day  Trades  WR%    G/R');
  console.log('─'.repeat(95));

  const CURRENT = results.find(r=>r.STRONG===55&&r.MOD===30&&r.WHIP_OPP===60&&r.RE_GATE===10&&r.REV_UNLOCK===100);

  let rank=0;
  for(const r of results.slice(0,20)){
    rank++;
    const flag=(r.STRONG===55&&r.MOD===30&&r.WHIP_OPP===60&&r.RE_GATE===10&&r.REV_UNLOCK===100)?'← CURRENT':'';
    console.log(`#${String(rank).padStart(2)}   ${String(r.STRONG).padStart(3)}   ${String(r.MOD).padStart(3)}    ${String(r.WHIP_OPP).padStart(5)}    ${String(r.RE_GATE).padStart(4)}     ${String(r.REV_UNLOCK).padStart(5)}   ${(r.pnl>=0?'+':'')+r.pnl.toFixed(1)}  ${(r.avg>=0?'+':'')+r.avg}   ${String(r.trades).padStart(3)}  ${String(r.wr).padStart(5)}%  ${r.green}/${r.red}  ${flag}`);
  }

  console.log('\n── CURRENT SETTINGS ─────────────────────────────────────────────────────────');
  if(CURRENT){
    const curRank=results.indexOf(CURRENT)+1;
    console.log(`Rank #${curRank} of ${results.length}  →  Strong:55  Mod:30  WhipOpp:60  ReGate:10  RevUnlock:100`);
    console.log(`P&L: ${(CURRENT.pnl>=0?'+':'')+CURRENT.pnl} pts  WR:${CURRENT.wr}%  Trades:${CURRENT.trades}  ${CURRENT.green}G/${CURRENT.red}R`);
  }

  console.log('\n── BOTTOM 5 (worst combos) ───────────────────────────────────────────────────');
  for(const r of results.slice(-5)){
    console.log(`Strong:${r.STRONG} Mod:${r.MOD} WhipOpp:${r.WHIP_OPP} ReGate:${r.RE_GATE} RevUnlock:${r.REV_UNLOCK}  →  ${(r.pnl>=0?'+':'')+r.pnl} pts  WR:${r.wr}%  ${r.green}G/${r.red}R`);
  }

  console.log(`\nTotal combos tested: ${results.length}`);
}

main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});

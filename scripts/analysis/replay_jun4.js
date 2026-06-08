'use strict';
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: process.env.TRADING_BOT_ENV_PATH || path.join(process.cwd(), '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105;
const SL_PTS    = 150;
const TRAIL_GAP = 10;
const MAX_TRADES = 5;
const MAX_RE     = 5;
const DAILY_LOSS_CAP = 150;

function bp(c){ return (c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0; }
function pdh(cs){ return Math.max(...cs.map(c=>c.high)); }
function pdl(cs){ return Math.min(...cs.map(c=>c.low)); }
function pdc(cs){ return cs[cs.length-1].close; }
function firstBull(cs,from,thresh=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])>thresh)return i;return -1;}
function firstBear(cs,from,thresh=30){for(let i=from;i<cs.length;i++)if(bp(cs[i])<-thresh)return i;return -1;}
function firstStrong(cs,from,thresh=55){for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>thresh)return{i,side:b>0?'CE':'PE'};}return null;}

function findDrishtiEntry(today,prev){
  if(!today||today.length<1)return null;
  if(!prev||prev.length===0)return null;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev),C0=today[0];
  const gap=C0.open-PC;
  const lastIdx=today.length-1;
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
  const lastIdx=today.length-1;
  if(lastIdx<=exitIdx)return null;
  for(let i=exitIdx+1;i<=lastIdx;i++){
    const b=bp(today[i]);
    if(side==='CE'&&b>40)return{idx:i,side,reason:'re_same_dir'};
    if(side==='PE'&&b<-40)return{idx:i,side,reason:'re_same_dir'};
  }
  if(allowReverse){
    const revSide=side==='CE'?'PE':'CE';
    for(let i=exitIdx+1;i<=lastIdx;i++){
      const b=bp(today[i]);
      if(revSide==='CE'&&b>40)return{idx:i,side:revSide,reason:'re_reverse'};
      if(revSide==='PE'&&b<-40)return{idx:i,side:revSide,reason:'re_reverse'};
    }
  }
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

const CANDLE_TIMES = [
  '9:15','9:30','9:45','10:00','10:15','10:30','10:45',
  '11:00','11:15','11:30','11:45','12:00','12:15','12:30',
  '12:45','13:00','13:15','13:30','13:45','14:00','14:15',
  '14:30','14:45','15:00','15:15'
];

async function main(){
  console.log('=== JUNE 4, 2024 — DETAILED REPLAY ===\n');

  const data = await kite.getHistoricalData(INSTRUMENT_TOKEN,'15minute','2024-06-03','2024-06-04',false);
  const candles = data.map(d=>({
    date: d.date instanceof Date?d.date:new Date(d.date),
    open:d.open,high:d.high,low:d.low,close:d.close
  }));

  function dayCandles(dateStr){
    return candles.filter(c=>{
      const ist=new Date(c.date.getTime()+5.5*3600*1000);
      return ist.toISOString().slice(0,10)===dateStr;
    }).map(c=>({open:c.open,high:c.high,low:c.low,close:c.close}));
  }

  const prev = dayCandles('2024-06-03');
  const today = dayCandles('2024-06-04');

  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  console.log(`Previous Day (Jun 3): PDH=${PH.toFixed(0)}  PDL=${PL.toFixed(0)}  PDC=${PC.toFixed(0)}`);
  console.log(`Jun 4 Open: ${today[0]?.open.toFixed(0) || '?'}`);
  const gap = today[0] ? today[0].open - PC : 0;
  const vsPDH = today[0] ? today[0].open - PH : 0;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : (today[0]?.open - PL < 0 ? 'BELOW_PDL' : 'INSIDE');
  console.log(`Gap: ${gap.toFixed(0)} pts  vs PDH: ${vsPDH.toFixed(0)}  Context: ${ctx}`);
  console.log();

  // Print all today candles
  console.log('--- TODAY\'S CANDLES (Jun 4, 2024) ---');
  console.log(` #   Time     Open     High      Low    Close   Body%`);
  today.forEach((c,i)=>{
    const t=CANDLE_TIMES[i]||`C${i+1}`;
    const b=bp(c);
    const dir=b>0?'▲':'▼';
    console.log(`C${String(i+1).padStart(2,'0')} ${t.padEnd(6)} ${c.open.toFixed(0).padStart(8)} ${c.high.toFixed(0).padStart(8)} ${c.low.toFixed(0).padStart(8)} ${c.close.toFixed(0).padStart(8)} ${(b>=0?'+':'')+b.toFixed(1).padStart(6)}% ${dir}`);
  });
  console.log();

  // Now run with detailed trade log
  const liveCandles = today.slice(1); // C0 seeding fix
  let state={inTrade:false,dir:null,entry:0,entryIdx:-1,trailStop:-SL_PTS,peakPts:0,firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0,trades=0,wins=0;

  console.log('--- TRADE REPLAY (live candles = C0 skipped, C1 onwards) ---');
  for(let li=0;li<liveCandles.length;li++){
    const bc=liveCandles[li];
    const candleNum=li+2; // C1 = li+2 in full today array
    const timeLabel=CANDLE_TIMES[li+1]||`C${candleNum}`;
    const isEOD=li>=liveCandles.length-1;

    if(state.inTrade){
      const trail=updateDrishtiTrail(state,bc,isEOD);
      const b=bp(bc);
      if(trail.action!=='HOLD'){
        const pts=trail.pts;
        dayPnL+=pts;trades++;if(pts>0)wins++;
        const exitType=trail.action==='EXIT_SL'?'SL HIT':trail.action==='EXIT_TRAIL'?'TRAIL EXIT':'EOD EXIT';
        console.log(`  ${timeLabel.padEnd(6)} [${state.dir}] EXIT  → ${exitType}  locked=${pts>=0?'+':''}${pts.toFixed(1)} pts  exitPrice=${trail.exitPrice.toFixed(0)}  peak=${trail.peakPts.toFixed(0)}  cumPnL=${dayPnL>=0?'+':''}${dayPnL.toFixed(1)}`);
        state={...state,inTrade:false,firstDone:true,lastExitPts:trail.peakPts,lastExitIdx:li,lastExitDir:state.dir,dir:null,entry:0,entryIdx:-1,peakPts:0,trailStop:-SL_PTS};
      } else {
        const sign=state.dir==='CE'?1:-1;
        const unreal=sign*(bc.close-state.entry);
        console.log(`  ${timeLabel.padEnd(6)} [${state.dir}] HOLD   close=${bc.close.toFixed(0)}  body%=${(b>=0?'+':'')+b.toFixed(1)}%  unrealised=${unreal>=0?'+':''}${unreal.toFixed(0)}  peak=${trail.peakPts.toFixed(0)}  trail=${trail.trailStop.toFixed(0)}`);
      }
      continue;
    }

    if(isEOD){console.log(`  ${timeLabel.padEnd(6)} [FLAT]  EOD - no open position`);continue;}
    if(trades>=MAX_TRADES){console.log(`  ${timeLabel.padEnd(6)} [SKIP]  MAX_TRADES reached`);continue;}
    if(dayPnL<=-DAILY_LOSS_CAP){console.log(`  ${timeLabel.padEnd(6)} [SKIP]  DAILY_LOSS_CAP hit (${dayPnL.toFixed(1)})`);continue;}

    const sliceNow=liveCandles.slice(0,li+1);
    let sig=null;
    if(state.firstDone&&state.reCount<MAX_RE&&state.lastExitPts>=0&&state.lastExitIdx>=0&&state.lastExitDir){
      const allowReverse=state.lastExitPts>=50;
      const re=findDrishtiReEntry(sliceNow,state.lastExitIdx,state.lastExitDir,allowReverse);
      if(re&&re.idx===li)sig={idx:re.idx,side:re.side,ctx:'RE',reason:re.reason};
    }else if(!state.firstDone){
      sig=findDrishtiEntry(sliceNow,prev);
    }

    const b=bp(bc);
    if(sig&&sig.idx===li){
      state={...state,inTrade:true,dir:sig.side,entry:bc.close,entryIdx:li,trailStop:-SL_PTS,peakPts:0};
      if(state.firstDone)state.reCount++;
      console.log(`  ${timeLabel.padEnd(6)} [${sig.side}] ENTRY  @ ${bc.close.toFixed(0)}  body%=${(b>=0?'+':'')+b.toFixed(1)}%  reason=${sig.reason}  trade#${trades+1}`);
    }else{
      const reason=!state.firstDone?'no entry signal yet':`waiting re-entry (peak=${state.lastExitPts.toFixed(0)}, dir=${state.lastExitDir})`;
      console.log(`  ${timeLabel.padEnd(6)} [FLAT]  body%=${(b>=0?'+':'')+b.toFixed(1)}%  close=${bc.close.toFixed(0)}  — ${reason}`);
    }
  }

  console.log();
  console.log('=== RESULT ===');
  console.log(`Trades: ${trades}  Wins: ${wins}  Losses: ${trades-wins}`);
  console.log(`Total P&L: ${dayPnL>=0?'+':''}${dayPnL.toFixed(1)} pts  = Rs${(dayPnL*15).toFixed(0)}`);
}

main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});

'use strict';
// backtest_bhav_may2026.js (DRISHTI V1)
// DRISHTI V1 exact live params: SL=150, TRAIL_GAP=10 (LOCK10), re-entry gate lastExitPts>=0, body>40%, MAX_RE=5, REV_UNLOCK>=50
// Candle-close trail only (no intrabar LTP poll — so results may be slightly worse than live)

const { KiteConnect } = require('kiteconnect');
const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const INSTRUMENT_TOKEN = 260105; // BANKNIFTY
const SL_PTS    = 150;
const TRAIL_GAP = 10;   // LOCK10 (live bot)
const MAX_TRADES = 5;
const MAX_RE     = 5;
const RE_BODY_THRESH = 40;  // live bot uses >40%
const RE_GATE_PTS    = 0;   // lastExitPts >= 0 — no gate (5yr sweep result)
const DAILY_LOSS_CAP = 150; // live bot: user-settings.json dailyLossCap=150 (stops after net -150 in a day)

// ─── Slippage model (calibrated from live trades May 29, 2026) ───────────────
// Entry: bot enters at next runBot cycle (≤15s after candle close) → ~2 pts worse
// SL exit: LTP monitor polls every 60s → overshoots SL by ~8 pts on average
//          (T3 today: -159 actual vs -150 SL = 9 pts overshoot)
// Trail/EOD exits: minimal miss (<1 pt), not modelled
const ENTRY_SLIP   = 2;   // pts lost vs candle close on every entry
const SL_OVERSHOOT = 8;   // extra pts lost when SL is hit (60s poll lag)

// ─── Helpers ─────────────────────────────────────────────────────────────────
function bp(c) { return (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0; }
function pdh(cs){ return Math.max(...cs.map(c => c.high)); }
function pdl(cs){ return Math.min(...cs.map(c => c.low)); }
function pdc(cs){ return cs[cs.length - 1].close; }

function firstBull(cs, from, t=30){ for(let i=from;i<cs.length;i++) if(bp(cs[i])>t) return i; return -1; }
function firstBear(cs, from, t=30){ for(let i=from;i<cs.length;i++) if(bp(cs[i])<-t) return i; return -1; }
function firstStrong(cs, from, t=55){
  for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t) return {i,side:b>0?'CE':'PE'};}
  return null;
}

function findDrishtiEntry(today, prev) {
  if (!today || today.length < 1) return null;
  if (!prev  || prev.length  === 0) return null;

  const PH=pdh(prev), PL=pdl(prev), PC=pdc(prev);
  const C0=today[0], gap=C0.open-PC, lastIdx=today.length-1;
  const vsPDH=C0.open-PH, vsPDL=C0.open-PL;
  const ctx = vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0), C1bp=today[1]?bp(today[1]):0;

  const bps4=today.slice(0,Math.min(4,today.length)).map(bp);
  let wipsaws=0;
  for(let i=1;i<bps4.length;i++) if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65) wipsaws++;
  if(wipsaws>=2) return null;

  const at=(idx,side,reason)=>idx===lastIdx?{idx,side,ctx,reason}:null;

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
    if(C0bp>65){const i=firstBear(today,1,30);if(i>0) return at(i,'PE','recovery_bounce_pe');}
    if(C0.high<PL){
      if(today.length>=2&&C1bp>20) return at(1,'CE','below_pdl_c1_bull_ce');
      if(today.length>=1&&C1bp<-20) return at(0,'PE','below_pdl_no_recovery_pe');
      const s=firstStrong(today,2,40);if(s&&s.i<=5) return at(s.i,s.side,'below_pdl_c2_signal');
      return null;
    }
    if(C0bp>20){const i=firstBear(today,1,30);if(i>0&&i<=6) return at(i,'PE','below_pdl_partial_bounce_pe');}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,today.length-2);i++){if(bp(today[i])<-45&&today[i-1].close<PL) return at(i,'PE','below_pdl_failed_bounce_pe');}}
    return null;
  }

  // INSIDE
  if(C0.close<PL&&lastIdx===0) return at(0,'PE','inside_c0_breaks_below_pdl');
  if(C0.close>PH&&lastIdx===0) return at(0,'CE','inside_c0_breaks_above_pdh');
  const gapUp=gap>50, gapDown=gap<-50;

  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0, aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if(aligned){
      if(today.length>=2&&C1bp*C0bp<0&&Math.abs(C1bp)>72){const s=at(1,C1bp>0?'CE':'PE','inside_c0_trap_c1_signal');if(s) return s;}
      {const s=at(0,c0isBull?'CE':'PE','inside_c0_momentum');if(s) return s;}
    } else {
      const gapSide=gapUp?'CE':'PE', revCandle=gapUp?firstBull(today,1,35):firstBear(today,1,35);
      if(revCandle>0&&revCandle<=5){const s=at(revCandle,gapSide,'inside_counter_gap_reversal');if(s) return s;}
      {const s=at(0,c0isBull?'CE':'PE','inside_c0_momentum_no_reversal');if(s) return s;}
    }
  }
  if(Math.abs(C0bp)>30){
    if(today.length>=2&&C1bp*C0bp>0){const s=at(0,C0bp>0?'CE':'PE','inside_c0_moderate_c1_confirmed');if(s) return s;}
    if(today.length>=3&&Math.abs(C1bp)>65&&C1bp*C0bp<0){
      const C2bp=bp(today[2]);
      if(C2bp*C0bp>0&&Math.abs(C2bp)>20){const s=at(0,C0bp>0?'CE':'PE','inside_c0_c1_fake_c2_confirms');if(s) return s;}
    }
  }
  for(let i=2;i<=8;i++){
    if(i>=today.length) break;
    const cbp=bp(today[i]);
    if(Math.abs(cbp)>55){
      const signalBull=cbp>0, oppGap=(signalBull&&gapDown)||(!signalBull&&gapUp);
      const c0ModOpp=(signalBull&&C0bp<-20)||(!signalBull&&C0bp>20);
      if(oppGap&&c0ModOpp) continue;
      const prev2=bp(today[i-1]);
      if(Math.abs(prev2)>60&&prev2*cbp<0){
        if(i+1<today.length&&bp(today[i+1])*cbp<0&&Math.abs(bp(today[i+1]))>60) return null;
      }
      return at(i,cbp>0?'CE':'PE',`inside_c${i}_strong`);
    }
  }
  for(let i=5;i<Math.min(today.length,21);i++){
    const prevClose=today[i-1].close;
    if(today[i].low<=PL&&prevClose>PL&&bp(today[i])>35) return at(i,'CE','inside_pdl_test_ce');
    if(today[i].high>=PH&&prevClose<PH&&bp(today[i])<-35) return at(i,'PE','inside_pdh_test_pe');
  }
  return null;
}

function findDrishtiReEntry(today, exitIdx, side, allowReverse) {
  const lastIdx=today.length-1;
  if(lastIdx<=exitIdx) return null;
  for(let i=exitIdx+1;i<=lastIdx;i++){
    const b=bp(today[i]);
    if(side==='CE'&&b>RE_BODY_THRESH) return {idx:i,side,reason:'re_same_dir'};
    if(side==='PE'&&b<-RE_BODY_THRESH) return {idx:i,side,reason:'re_same_dir'};
  }
  if(allowReverse){
    const rev=side==='CE'?'PE':'CE';
    for(let i=exitIdx+1;i<=lastIdx;i++){
      const b=bp(today[i]);
      if(rev==='CE'&&b>RE_BODY_THRESH) return {idx:i,side:rev,reason:'re_reverse'};
      if(rev==='PE'&&b<-RE_BODY_THRESH) return {idx:i,side:rev,reason:'re_reverse'};
    }
  }
  return null;
}

function updateTrail(state, candle, isEOD) {
  const sign = state.dir==='CE'?1:-1;
  const favPts = state.dir==='CE' ? candle.high-state.entry : state.entry-candle.low;
  let peakPts=state.peakPts, trailStop=state.trailStop;
  if(favPts>peakPts){ peakPts=favPts; trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS; }
  const closePts=sign*(candle.close-state.entry);
  if(isEOD||closePts<=trailStop){
    const exitType=isEOD?'EOD':trailStop<=0?'SL':'TRAIL';
    const lockedPts=isEOD?closePts:trailStop;
    return {action:exitType, pts:lockedPts, peakPts};
  }
  state.peakPts=peakPts; state.trailStop=trailStop;
  return {action:'HOLD'};
}

// ─── Run one day ─────────────────────────────────────────────────────────────
function runDay(today, prev) {
  // PDR filter: skip low-volatility days (prev day range < 150)
  const _ph=pdh(prev), _pl=pdl(prev);
  if(_ph-_pl<150) return {pnl:0,trades:0,wins:0,losses:0,details:[]};

  // ── C0 SEEDING FIX ────────────────────────────────────────────────────────
  // today[0] = 9:15-9:30 candle = seeded in live bot (NOT in drishtiTodayCandles)
  // Live bot's C0 = today[1] (9:30-9:45). Skip today[0] to match live exactly.
  const liveCandles = today.slice(1);
  if(liveCandles.length < 2) return {pnl:0,trades:0,wins:0,losses:0,details:[]};

  let state={inTrade:false,dir:null,entry:0,trailStop:-SL_PTS,peakPts:0,
              firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0,dayRealisticPnL=0,trades=0,wins=0,losses=0,details=[];

  for(let li=0;li<liveCandles.length;li++){
    const bc=liveCandles[li], isEOD=li>=liveCandles.length-1;
    if(state.inTrade){
      const trail=updateTrail(state,bc,isEOD);
      if(trail.action!=='HOLD'){
        const pts=trail.pts;
        // Realistic P&L: entry slippage on every trade + SL overshoot when stopped
        const slipDeduct = ENTRY_SLIP + (trail.action==='SL' ? SL_OVERSHOOT : 0);
        const realisticPts = pts - slipDeduct;
        dayPnL+=pts; dayRealisticPnL+=realisticPts;
        trades++; if(pts>0) wins++; else losses++;
        details.push({ci:li+1,dir:state.dir,entry:state.entry,exit:bc.close,pts:Math.round(pts*10)/10,real:Math.round(realisticPts*10)/10,how:trail.action});
        state.inTrade=false; state.firstDone=true;
        state.lastExitPts=trail.peakPts;  // store PEAK (same as live bot)
        state.lastExitIdx=li; state.lastExitDir=state.dir;
        state.dir=null; state.entry=0; state.peakPts=0; state.trailStop=-SL_PTS;
      }
      continue;
    }
    if(isEOD||trades>=MAX_TRADES) continue;
    if(dayPnL <= -DAILY_LOSS_CAP) continue;  // live bot daily loss cap: stops after net -150 pts loss

    let sig=null;
    const slice=liveCandles.slice(0,li+1);  // liveCandles[0] = live C0 (9:30-9:45)

    if(state.firstDone && state.reCount<MAX_RE && state.lastExitPts>=0
        && state.lastExitIdx>=0 && state.lastExitDir){
      const allowRev=state.lastExitPts>=50;
      const re=findDrishtiReEntry(slice,state.lastExitIdx,state.lastExitDir,allowRev);
      if(re&&re.idx===li) sig={idx:re.idx,side:re.side,reason:re.reason};
    } else if(!state.firstDone){
      sig=findDrishtiEntry(slice,prev);
    }
    if(!sig) continue;

    state.inTrade=true; state.dir=sig.side; state.entry=bc.close;
    state.trailStop=-SL_PTS; state.peakPts=0;
    if(state.firstDone) state.reCount++;
  }
  return {pnl:Math.round(dayPnL*10)/10, realisticPnl:Math.round(dayRealisticPnL*10)/10, trades, wins, losses, details};
}

// ─── Fetch + group ────────────────────────────────────────────────────────────
async function fetchChunk(from,to){
  const data=await kite.getHistoricalData(INSTRUMENT_TOKEN,'15minute',from,to,false);
  return data.map(d=>({date:d.date instanceof Date?d.date:new Date(d.date),open:d.open,high:d.high,low:d.low,close:d.close}));
}
function groupByDay(candles){
  const days={};
  for(const c of candles){
    const ist=new Date(c.date.getTime()+5.5*3600*1000);
    const totalMin=ist.getUTCHours()*60+ist.getUTCMinutes();
    if(totalMin<9*60+15||totalMin>15*60+15) continue;
    const dk=ist.toISOString().slice(0,10);
    if(!days[dk]) days[dk]=[];
    days[dk].push({open:c.open,high:c.high,low:c.low,close:c.close});
  }
  return days;
}

async function main(){
  console.log('DRISHTI V1 — May 2026 Backtest');
  console.log('SL:150  LOCK10  Re-entry gate:OFF  RevUnlock:50pts  Body:>40%  MaxTrades:5  MaxRe:5  DailyLossCap:150\n');

  const start='2026-04-29', end='2026-05-29';  // include April 29 for prev-day of May 1
  console.log(`Fetching ${start} → ${end}...`);
  const candles=await fetchChunk(start,end);
  console.log(`  ${candles.length} candles fetched`);
  const dayMap=groupByDay(candles);
  const allDates=Object.keys(dayMap).sort();
  console.log(`  ${allDates.length} trading days\n`);

  let totalPnL=0,totalRealisticPnL=0,totalTrades=0,totalWins=0,totalLosses=0,tradingDays=0,greenDays=0,redDays=0,flatDays=0;
  const rows=[];

  for(let di=1;di<allDates.length;di++){
    const date=allDates[di];
    const today=dayMap[date], prev=dayMap[allDates[di-1]];
    if(!today||today.length<3||!prev||prev.length<3) continue;
    const r=runDay(today,prev);
    totalPnL+=r.pnl; totalRealisticPnL+=r.realisticPnl;
    totalTrades+=r.trades; totalWins+=r.wins; totalLosses+=r.losses;
    tradingDays++;
    if(r.pnl>0) greenDays++; else if(r.pnl<0) redDays++; else flatDays++;

    const pnlStr=(r.pnl>=0?'+':'')+r.pnl.toFixed(1);
    const realStr=(r.realisticPnl>=0?'+':'')+r.realisticPnl.toFixed(1);
    const dayStr=`${date}  ${pnlStr.padStart(8)} pts  (real:${realStr})  T:${r.trades}  W:${r.wins} L:${r.losses}`;
    const tradeDetail=r.details.map(d=>`    → C${d.ci+1} ${d.dir} @${d.entry.toFixed(0)} exit:${d.exit.toFixed(0)} ${(d.pts>=0?'+':'')+d.pts}pts [${d.how}] real:${(d.real>=0?'+':'')+d.real}`).join('\n');
    rows.push({date,pnl:r.pnl,trades:r.trades,summary:dayStr,detail:tradeDetail});
    console.log(dayStr);
    if(tradeDetail) console.log(tradeDetail);
  }

  const winRate=totalTrades>0?((totalWins/totalTrades)*100).toFixed(1):0;
  const avgPerDay=tradingDays>0?(totalPnL/tradingDays).toFixed(1):0;

  console.log('\n' + '═'.repeat(55));
  console.log('DRISHTI V1 — MAY 2026 SUMMARY');
  console.log('═'.repeat(55));
  console.log(`Trading days : ${tradingDays}  (🟢 ${greenDays} green | 🔴 ${redDays} red | ⬜ ${flatDays} flat)`);
  const realisticAvgPerDay=tradingDays>0?(totalRealisticPnL/tradingDays).toFixed(1):0;
  const slippageImpact=(totalPnL-totalRealisticPnL).toFixed(1);
  const avgSlipPerTrade=totalTrades>0?((totalPnL-totalRealisticPnL)/totalTrades).toFixed(1):0;
  console.log(`Total P&L    : ${totalPnL>=0?'+':''}${totalPnL.toFixed(1)} pts  (ideal, candle-close)`);
  console.log(`Realistic P&L: ${totalRealisticPnL>=0?'+':''}${totalRealisticPnL.toFixed(1)} pts  (entry slip ${ENTRY_SLIP}pt + SL overshoot ${SL_OVERSHOOT}pt)`);
  console.log(`Slippage cost: -${slippageImpact} pts  (avg ${avgSlipPerTrade} pts/trade)`);
  console.log(`Avg per day  : ideal ${avgPerDay>=0?'+':''}${avgPerDay}  |  realistic ${realisticAvgPerDay>=0?'+':''}${realisticAvgPerDay} pts`);
  console.log(`Total trades : ${totalTrades}  (W:${totalWins} L:${totalLosses})`);
  console.log(`Win rate     : ${winRate}%`);
  console.log('═'.repeat(55));
  console.log('Slippage model: entry_slip=2pts (15s LTP delay) + sl_overshoot=8pts (60s poll gap)');
  console.log('Calibrated from live trade data — May 29, 2026 (T1/T2/T3).');
}

main().catch(e=>{console.error('ERROR:',e.message);process.exit(1);});

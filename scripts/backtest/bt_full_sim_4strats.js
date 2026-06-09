'use strict';
/**
 * FULL SIMULATION — 4 STRATEGIES × 6 JUNE DAYS
 * Bug-fixed: futures signals (Bug1), candle-close trail (Bug2), no lag (Bug3)
 *
 * FUTURES P&L: Real futures OHLC × 30 qty — TRUE
 * OPTIONS P&L: Black-Scholes ATM approximation — APPROXIMATION (no real options data locally)
 *
 * Strategies:
 *  1. DRISHTI_V1   (bug-fixed) — original live strategy with all fixes
 *  2. REVERSAL_BLAST — Entry#21 BODY_BREAKOUT_BULL + Exit#42 EXIT_1430
 *  3. RANGE_SNIPER  — Entry#38 LOWER_LOW_LOWER_HIGH + Exit#89 EXIT_DUAL_CONDITION
 *  4. STRUCTURE_GRIND — Entry#38 LOWER_LOW_LOWER_HIGH + Exit#5 SL_FIXED_250
 */

const fs = require('fs');

// ── DATA ─────────────────────────────────────────────────────────────────
const futMinData = JSON.parse(fs.readFileSync('./banknifty_fut_minute_vps.json','utf8'));
const jun9Fresh  = JSON.parse(fs.readFileSync('./today_jun_minute_fresh_ohlc.json','utf8'));

// ── CONSTANTS ─────────────────────────────────────────────────────────────
const SL_PTS    = 150;
const TRAIL_GAP = 10;
const MAX_TRADES = 5;
const QTY       = 30;
const COST_FUT  = 362;  // round-trip futures brokerage+taxes
const COST_OPT  = 260;  // round-trip options brokerage+taxes
const IV        = 0.18; // BANKNIFTY typical implied volatility

// ── HELPERS ───────────────────────────────────────────────────────────────
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length-1].close;
const bodyPct = c => (c.high-c.low)>0 ? (c.close-c.open)/(c.high-c.low)*100 : 0;
const bodyHigh = c => Math.max(c.open,c.close);
const bodyLow  = c => Math.min(c.open,c.close);
const isBull = c => c.close > c.open;
const isBear = c => c.close < c.open;

function build15Min(minuteData) {
  const w={};
  for (const m of minuteData) {
    const tm=m.h*60+m.m;
    if (tm<9*60+15||tm>=15*60+30) continue;
    const off=tm-(9*60+15), wS=9*60+15+Math.floor(off/15)*15;
    const k=String(Math.floor(wS/60)).padStart(2,'0')+':'+String(wS%60).padStart(2,'0');
    if (!w[k]) w[k]={open:m.open,high:m.high,low:m.low,close:m.close,time:k};
    else{w[k].high=Math.max(w[k].high,m.high);w[k].low=Math.min(w[k].low,m.low);w[k].close=m.close;}
  }
  return Object.entries(w).sort().map(([t,c])=>({...c,time:t}));
}

function build15MinFromOHLC(data) {
  const w={};
  for (const m of data) {
    const [hh,mm]=m.time.split(':').map(Number);
    const tm=hh*60+mm;
    if (tm<9*60+15||tm>=15*60+30) continue;
    const off=tm-(9*60+15), wS=9*60+15+Math.floor(off/15)*15;
    const k=String(Math.floor(wS/60)).padStart(2,'0')+':'+String(wS%60).padStart(2,'0');
    if (!w[k]) w[k]={open:m.open,high:m.high,low:m.low,close:m.close,time:k};
    else{w[k].high=Math.max(w[k].high,m.high);w[k].low=Math.min(w[k].low,m.low);w[k].close=m.close;}
  }
  return Object.entries(w).sort().map(([t,c])=>({...c,time:t}));
}

// ── OPTIONS P&L via Black-Scholes (delta approx) ─────────────────────────
function normalCDF(x) {
  const t=1/(1+0.2316419*Math.abs(x));
  const d=0.3989423*Math.exp(-x*x/2);
  let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));
  return x>0?1-p:p;
}
function bsPremium(spot, strike, side, dte) {
  const T=Math.max(1/365, dte/365), r=0.06;
  const vT=IV*Math.sqrt(T);
  const d1=(Math.log(spot/strike)+(r+IV*IV/2)*T)/vT;
  const d2=d1-vT;
  const call=spot*normalCDF(d1)-strike*Math.exp(-r*T)*normalCDF(d2);
  const put=strike*Math.exp(-r*T)*normalCDF(-d2)-spot*normalCDF(-d1);
  return Math.max(2, side==='CE'?call:put);
}
function getDTE(dateStr) {
  const d=new Date(dateStr+'T00:00:00+05:30');
  const y=d.getFullYear(), mo=d.getMonth();
  let last=new Date(y,mo+1,0);
  last.setDate(last.getDate()-((last.getDay()>=4)?last.getDay()-4:last.getDay()+3));
  if (d>=last) {last=new Date(y,mo+2,0); last.setDate(last.getDate()-((last.getDay()>=4)?last.getDay()-4:last.getDay()+3));}
  return Math.max(1, Math.ceil((last-d)/86400000));
}
function optionPnl(dir, entryFut, exitFut, dateStr) {
  const dte=getDTE(dateStr);
  const atmStrike=Math.round(entryFut/100)*100;
  const entryPrem=bsPremium(entryFut, atmStrike, dir, dte);
  const exitPrem =bsPremium(exitFut, atmStrike, dir, dte);
  return (exitPrem-entryPrem)*QTY*(dir==='CE'?1:1);
  // For PE: buy put, exit when put premium changes
  // delta: CE +0.45 rise means +premium, PE +0.45 fall means +premium
}
function optionPnlDir(dir, entryFut, exitFut, dateStr) {
  const dte=getDTE(dateStr);
  const atmStrike=Math.round(entryFut/100)*100;
  const entryPrem=bsPremium(entryFut, atmStrike, dir, dte);
  const exitStrike=Math.round(exitFut/100)*100;
  const exitPrem=bsPremium(exitFut, exitStrike, dir, dte);
  return (exitPrem-entryPrem)*QTY;
}

// ── BUILD FUTURES CANDLES ─────────────────────────────────────────────────
const futDayCandles={};
for (const d of Object.keys(futMinData).sort()) {
  const junMins=futMinData[d].filter(c=>c.sym==='BANKNIFTY26JUNFUT');
  if (junMins.length>0) futDayCandles[d]=build15Min(junMins);
}
futDayCandles['2026-06-09']=build15MinFromOHLC(jun9Fresh);
const junDays=Object.keys(futDayCandles).sort();

// ═════════════════════════════════════════════════════════════════════════
// STRATEGY 1: DRISHTI_V1 (Bug-fixed)
// Signal: futures candles; Trail: candle-close LOCK10
// ═════════════════════════════════════════════════════════════════════════
function drishtiEntry(today, prevCandles) {
  if (!today||today.length<1||!prevCandles||!prevCandles.length) return null;
  const PH=pdh(prevCandles), PL=pdl(prevCandles), PC=pdc(prevCandles);
  const C0=today[0];
  const vsPDH=C0.open-PH, vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bodyPct(C0);
  const lastIdx=today.length-1;
  const at=(idx,side,reason)=>idx===lastIdx?{idx,side,ctx,reason}:null;

  if (ctx==='ABOVE_PDH') {
    if (vsPDH>1000) return at(0,'CE','extraordinary_gap_ce');
    if (C0bp>85) return at(0,'CE','above_pdh_trend_day_ce');
    if (C0bp<-20) return at(0,'PE','above_pdh_c0_reversal_pe');
    for (let i=1;i<=Math.min(7,lastIdx);i++) if (bodyPct(today[i])<-35) return at(i,'PE','above_pdh_delayed_pe');
    for (let i=2;i<=lastIdx;i++) {const b=bodyPct(today[i]);if (Math.abs(b)>55) return at(i,b>0?'CE':'PE','above_pdh_continuation');}
    return null;
  }
  if (ctx==='BELOW_PDL') {
    if (C0bp<-80) return at(0,'PE','below_pdl_trend_day_pe');
    if (C0bp<-65) return null;
    if (C0.high<PL) {
      if (lastIdx>=1&&bodyPct(today[1])>20) return at(1,'CE','below_pdl_c1_bull_ce');
      if (lastIdx>=1&&bodyPct(today[1])<-20) return at(0,'PE','below_pdl_no_recovery_pe');
      for (let i=2;i<=Math.min(5,lastIdx);i++) {const b=bodyPct(today[i]);if (Math.abs(b)>40) return at(i,b>0?'CE':'PE','below_pdl_c2_signal');}
      return null;
    }
    if (C0bp>20) {for (let i=1;i<=Math.min(6,lastIdx);i++) if (bodyPct(today[i])<-30) return at(i,'PE','below_pdl_partial_bounce_pe');}
    if (C0bp<-10) {for (let i=2;i<=Math.min(7,lastIdx-1);i++) if (bodyPct(today[i])<-45&&today[i-1].close<PL) return at(i,'PE','below_pdl_failed_bounce_pe');}
    return null;
  }
  // INSIDE
  if (C0.close<PL&&lastIdx===0) return at(0,'PE','inside_c0_breaks_below_pdl');
  if (C0.close>PH&&lastIdx===0) return at(0,'CE','inside_c0_breaks_above_pdh');
  const gap=C0.open-PC, gapUp=gap>50, gapDown=gap<-50;
  if (Math.abs(C0bp)>55) {
    const c0isBull=C0bp>0;
    const aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if (aligned) {
      if (lastIdx>=1&&bodyPct(today[1])*C0bp<0&&Math.abs(bodyPct(today[1]))>72) {const s=at(1,bodyPct(today[1])>0?'CE':'PE','inside_c0_trap_c1_signal');if(s)return s;}
      return at(0,c0isBull?'CE':'PE','inside_c0_momentum');
    } else {
      const gapSide=gapUp?'CE':'PE';
      const revSide=gapUp?'bull':'bear';
      for(let i=1;i<=Math.min(5,lastIdx);i++){const b=bodyPct(today[i]);if((revSide==='bull'&&b>35)||(revSide==='bear'&&b<-35)){const s=at(i,gapSide,'inside_counter_gap_reversal');if(s)return s;}}
      return at(0,c0isBull?'CE':'PE','inside_c0_momentum_no_reversal');
    }
  }
  for (let i=1;i<today.length;i++) {
    const prevC=today[i-1],curr=today[i];
    if (curr.close<prevC.low) {if(gapUp&&C0bp>20)continue;const s=at(i,'PE','struct_pe');if(s)return s;}
    if (curr.close>prevC.high) {if(gapDown&&C0bp<-20)continue;const s=at(i,'CE','struct_ce');if(s)return s;}
  }
  for (let i=5;i<Math.min(today.length,21);i++) {
    const prevClose=today[i-1].close;
    if (today[i].low<=PL&&prevClose>PL&&bodyPct(today[i])>35) return at(i,'CE','inside_pdl_test_ce');
    if (today[i].high>=PH&&prevClose<PH&&bodyPct(today[i])<-35) return at(i,'PE','inside_pdh_test_pe');
  }
  return null;
}

function drishtiReEntry(today, exitIdx, lastDir) {
  const lastIdx=today.length-1;
  if (lastIdx<=exitIdx) return null;
  let sdIdx=-1, rvIdx=-1;
  for (let i=exitIdx+1;i<=lastIdx;i++) {
    const b=bodyPct(today[i]);
    if (sdIdx<0&&((lastDir==='CE'&&b>40)||(lastDir==='PE'&&b<-40))) sdIdx=i;
    if (rvIdx<0&&((lastDir==='CE'&&b<-40)||(lastDir==='PE'&&b>40))) rvIdx=i;
    if (sdIdx>=0&&rvIdx>=0) break;
  }
  if (sdIdx<0&&rvIdx<0) return null;
  if (sdIdx<0) return {idx:rvIdx, dir:lastDir==='CE'?'PE':'CE', reason:'re_reverse'};
  if (rvIdx<0) return {idx:sdIdx, dir:lastDir, reason:'re_same_dir'};
  if (sdIdx<=rvIdx) return {idx:sdIdx, dir:lastDir, reason:'re_same_dir'};
  return {idx:rvIdx, dir:lastDir==='CE'?'PE':'CE', reason:'re_reverse'};
}

// Bug2 Fixed trail:
//   Hard SL (150pts): fires on candle HIGH/LOW (intracandle extreme = proxy for LTP guard)
//   Trail SL (after LOCK10): fires only on candle CLOSE (eliminates noisy LTP micro-exits)
function runDrishtiTrade(dir, entryPrice, entryIdx, today) {
  let peak=0, trailStop=-SL_PTS;
  const sign=dir==='CE'?1:-1;
  for (let i=entryIdx+1;i<today.length;i++) {
    const c=today[i];
    const fav=dir==='CE'?c.high-entryPrice:entryPrice-c.low;
    if (fav>peak) {peak=fav; trailStop=peak>=TRAIL_GAP?peak-TRAIL_GAP:-SL_PTS;}

    const locked=peak>=TRAIL_GAP; // LOCK10 has activated
    if (!locked) {
      // Hard SL phase: exit on intracandle extreme (like LTP guard)
      const extremeAdverse=dir==='CE'?c.low:c.high;
      const adversePts=sign*(extremeAdverse-entryPrice);
      if (adversePts<=-SL_PTS||c.time==='15:15') {
        const exitPrice=c.time==='15:15'?c.close:entryPrice+sign*(-SL_PTS);
        const pts=sign*(exitPrice-entryPrice);
        return{pts,exitIdx:i,exitPrice,exitTime:c.time,peak};
      }
    } else {
      // Trail phase: exit only on candle CLOSE (bug fix - not LTP)
      const closePts=sign*(c.close-entryPrice);
      if (closePts<=trailStop||c.time==='15:15') {
        const exitPrice=c.close;
        const pts=sign*(exitPrice-entryPrice);
        return{pts,exitIdx:i,exitPrice,exitTime:c.time,peak};
      }
    }
  }
  const last=today[today.length-1];
  const pts=sign*(last.close-entryPrice);
  return{pts,exitIdx:today.length-1,exitPrice:last.close,exitTime:last.time,peak};
}

function runDrishtiV1(date, today, prevCandles) {
  let dayRs=0, tradeCount=0, wins=0;
  const trades=[];
  let firstDone=false, lastExitIdx=-1, lastExitDir=null;

  for (let ci=0;ci<today.length&&tradeCount<MAX_TRADES;ci++) {
    let dir=null, reason=null;
    if (!firstDone) {
      const subset=today.slice(0,ci+1);
      const sig=drishtiEntry(subset, prevCandles);
      if (!sig) continue;
      dir=sig.side; reason=sig.reason;
    } else {
      if (ci<=lastExitIdx) continue;
      const re=drishtiReEntry(today, lastExitIdx, lastExitDir);
      if (!re||re.idx!==ci) continue;
      dir=re.dir; reason=re.reason;
    }

    const r=runDrishtiTrade(dir, today[ci].close, ci, today);
    const futRs=r.pts*QTY;
    const optRs=optionPnlDir(dir, today[ci].close, r.exitPrice, date);
    trades.push({n:tradeCount+1,dir,reason,entry:today[ci].close,exitPrice:r.exitPrice,
      entryTime:today[ci].time,exitTime:r.exitTime,pts:r.pts,futRs,optRs,peak:r.peak});
    dayRs+=futRs;
    if (r.pts>0) wins++;
    firstDone=true; lastExitIdx=r.exitIdx; lastExitDir=dir; tradeCount++;
    ci=r.exitIdx;
  }
  return{dayRs,tradeCount,wins,trades};
}

// ═════════════════════════════════════════════════════════════════════════
// STRATEGY 2: REVERSAL BLAST
// Entry#21 BODY_BREAKOUT_BULL (CE only) + Entry#22 BODY_BREAKOUT_BEAR (PE)
// Exit#42: hold to 14:30
// ═════════════════════════════════════════════════════════════════════════
function reversalBlastEntry(cs, i) {
  if (i<1) return null;
  const c=cs[i], prev=cs[i-1];
  const bp=bodyPct(c);
  // CE: close above prev body high with bullish body
  if (c.close>bodyHigh(prev)&&bp>40) return{signal:'CE',reason:'body_breakout_bull'};
  // PE: close below prev body low with bearish body
  if (c.close<bodyLow(prev)&&bp<-40) return{signal:'PE',reason:'body_breakout_bear'};
  return null;
}

function runExitAt1430(dir, entryPrice, entryIdx, today) {
  const sign=dir==='CE'?1:-1;
  for (let i=entryIdx+1;i<today.length;i++) {
    const c=today[i];
    // Hard SL at 250pts from entry
    const pts=sign*(c.close-entryPrice);
    if (pts<=-250) return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'sl_250'};
    if (c.time==='14:30') return{pts:sign*(c.close-entryPrice),exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'exit_1430'};
  }
  const last=today[today.length-1];
  return{pts:sign*(last.close-entryPrice),exitIdx:today.length-1,exitPrice:last.close,exitTime:last.time,reason:'eod'};
}

function runReversalBlast(date, today, prevCandles) {
  let dayRs=0, tradeCount=0, wins=0;
  const trades=[];
  let lastExitIdx=-1;

  for (let ci=0;ci<today.length&&tradeCount<MAX_TRADES;ci++) {
    if (ci<=lastExitIdx) continue;
    const sig=reversalBlastEntry(today, ci);
    if (!sig) continue;

    const r=runExitAt1430(sig.signal, today[ci].close, ci, today);
    const futRs=r.pts*QTY;
    const optRs=optionPnlDir(sig.signal, today[ci].close, r.exitPrice, date);
    trades.push({n:tradeCount+1,dir:sig.signal,reason:sig.reason,entry:today[ci].close,
      exitPrice:r.exitPrice,entryTime:today[ci].time,exitTime:r.exitTime,pts:r.pts,futRs,optRs});
    dayRs+=futRs;
    if (r.pts>0) wins++;
    lastExitIdx=r.exitIdx; tradeCount++;
    ci=r.exitIdx;
  }
  return{dayRs,tradeCount,wins,trades};
}

// ═════════════════════════════════════════════════════════════════════════
// STRATEGY 3: RANGE SNIPER
// Entry#38 LOWER_LOW_LOWER_HIGH + Exit#89 EXIT_DUAL_CONDITION (reversal candle after 12:30)
// ═════════════════════════════════════════════════════════════════════════
function rangeEntry(cs, i) {
  if (i<2) return null;
  const a=cs[i-2], b=cs[i-1], c=cs[i];
  // PE: lower lows + lower highs (bearish structure)
  if (b.low<a.low&&c.low<b.low&&b.high<a.high) return{signal:'PE',reason:'ll_lh_bear'};
  // CE: higher highs + higher lows (bullish structure)
  if (b.high>a.high&&c.high>b.high&&b.low>a.low) return{signal:'CE',reason:'hh_hl_bull'};
  return null;
}

function runExitDual(dir, entryPrice, entryIdx, today) {
  const sign=dir==='CE'?1:-1;
  for (let i=entryIdx+1;i<today.length;i++) {
    const c=today[i];
    const pts=sign*(c.close-entryPrice);
    // Hard SL at 150pts
    if (pts<=-150) return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'sl_150'};
    // Dual condition: reversal candle after 12:30
    if (c.time>='12:30') {
      const bp=bodyPct(c);
      if (dir==='CE'&&isBear(c)&&bp<-40) return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'exit_dual_rev'};
      if (dir==='PE'&&isBull(c)&&bp>40) return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'exit_dual_rev'};
    }
    if (c.time==='15:15') return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'eod'};
  }
  const last=today[today.length-1];
  return{pts:sign*(last.close-entryPrice),exitIdx:today.length-1,exitPrice:last.close,exitTime:last.time,reason:'eod'};
}

function runRangeSniper(date, today, prevCandles) {
  let dayRs=0, tradeCount=0, wins=0;
  const trades=[];
  let lastExitIdx=-1;

  for (let ci=0;ci<today.length&&tradeCount<MAX_TRADES;ci++) {
    if (ci<=lastExitIdx) continue;
    const sig=rangeEntry(today, ci);
    if (!sig) continue;

    const r=runExitDual(sig.signal, today[ci].close, ci, today);
    const futRs=r.pts*QTY;
    const optRs=optionPnlDir(sig.signal, today[ci].close, r.exitPrice, date);
    trades.push({n:tradeCount+1,dir:sig.signal,reason:sig.reason,entry:today[ci].close,
      exitPrice:r.exitPrice,entryTime:today[ci].time,exitTime:r.exitTime,pts:r.pts,futRs,optRs});
    dayRs+=futRs;
    if (r.pts>0) wins++;
    lastExitIdx=r.exitIdx; tradeCount++;
    ci=r.exitIdx;
  }
  return{dayRs,tradeCount,wins,trades};
}

// ═════════════════════════════════════════════════════════════════════════
// STRATEGY 4: STRUCTURE GRIND
// Entry#38 LOWER_LOW_LOWER_HIGH + Exit#5 SL_FIXED_250
// ═════════════════════════════════════════════════════════════════════════
function runExitSL250(dir, entryPrice, entryIdx, today) {
  const sign=dir==='CE'?1:-1;
  for (let i=entryIdx+1;i<today.length;i++) {
    const c=today[i];
    const pts=sign*(c.close-entryPrice);
    if (pts<=-250) return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'sl_250'};
    if (c.time==='15:15') return{pts,exitIdx:i,exitPrice:c.close,exitTime:c.time,reason:'eod'};
  }
  const last=today[today.length-1];
  return{pts:sign*(last.close-entryPrice),exitIdx:today.length-1,exitPrice:last.close,exitTime:last.time,reason:'eod'};
}

function runStructureGrind(date, today, prevCandles) {
  let dayRs=0, tradeCount=0, wins=0;
  const trades=[];
  let lastExitIdx=-1;

  for (let ci=0;ci<today.length&&tradeCount<MAX_TRADES;ci++) {
    if (ci<=lastExitIdx) continue;
    const sig=rangeEntry(today, ci); // same entry as Range Sniper
    if (!sig) continue;

    const r=runExitSL250(sig.signal, today[ci].close, ci, today);
    const futRs=r.pts*QTY;
    const optRs=optionPnlDir(sig.signal, today[ci].close, r.exitPrice, date);
    trades.push({n:tradeCount+1,dir:sig.signal,reason:sig.reason,entry:today[ci].close,
      exitPrice:r.exitPrice,entryTime:today[ci].time,exitTime:r.exitTime,pts:r.pts,futRs,optRs});
    dayRs+=futRs;
    if (r.pts>0) wins++;
    lastExitIdx=r.exitIdx; tradeCount++;
    ci=r.exitIdx;
  }
  return{dayRs,tradeCount,wins,trades};
}

// ═════════════════════════════════════════════════════════════════════════
// RUN ALL DAYS
// ═════════════════════════════════════════════════════════════════════════
const strategies=[
  {name:'DRISHTI_V1 (Bug-Fixed)', key:'DRISHTI', fn:runDrishtiV1},
  {name:'REVERSAL_BLAST',         key:'RBLAST',  fn:runReversalBlast},
  {name:'RANGE_SNIPER',           key:'RSNIPER', fn:runRangeSniper},
  {name:'STRUCTURE_GRIND',        key:'SGRIND',  fn:runStructureGrind},
];

const summary={};
for (const s of strategies) {
  summary[s.key]={futGross:0,futNet:0,optGross:0,optNet:0,trades:0,wins:0,days:[]};
}

let prevCandles=null;
const COST_APPROX=362;

console.log('═'.repeat(110));
console.log('FULL SIMULATION — 4 STRATEGIES × JUNE 2026 (Bug-Fixed, Futures Data)');
console.log('Futures P&L: REAL (actual futures OHLC × 30 qty)');
console.log('Options P&L: Black-Scholes ATM approximation (no real options data available locally)');
console.log('═'.repeat(110));
console.log('');

for (let di=0;di<junDays.length;di++) {
  const date=junDays[di];
  const allC=futDayCandles[date];
  const today=allC.slice(1);

  if (!prevCandles||today.length<3) {
    prevCandles=allC;
    console.log(date+' | SKIP (first day / insufficient data)');
    continue;
  }

  const PH=pdh(prevCandles), PL=pdl(prevCandles);
  const openPrice=today[0]?.open||0;
  const ctx=(openPrice-PH)>120?'ABOVE_PDH':(openPrice-PL)<0?'BELOW_PDL':'INSIDE';

  console.log('');
  console.log('━'.repeat(110));
  console.log(`${date} | ${ctx.padEnd(12)} | PDH:${Math.round(PH)} PDL:${Math.round(PL)} | Open:${Math.round(openPrice)} | Candles:${today.length}`);
  console.log('━'.repeat(110));
  console.log('Strategy'.padEnd(22)+'Trades'.padEnd(8)+'WR'.padEnd(8)+'Fut Gross'.padEnd(14)+'Fut Net'.padEnd(14)+'Opt Gross'.padEnd(14)+'Opt Net'.padEnd(14));
  console.log('─'.repeat(110));

  for (const s of strategies) {
    const res=s.fn(date, today, prevCandles);
    const futGross=res.dayRs;
    const futNet=futGross-res.tradeCount*COST_FUT;
    const optGross=res.trades.reduce((a,t)=>a+t.optRs, 0);
    const optNet=optGross-res.tradeCount*COST_OPT;
    const wr=res.tradeCount>0?(res.wins/res.tradeCount*100).toFixed(0)+'%':'—';

    summary[s.key].futGross+=futGross;
    summary[s.key].futNet+=futNet;
    summary[s.key].optGross+=optGross;
    summary[s.key].optNet+=optNet;
    summary[s.key].trades+=res.tradeCount;
    summary[s.key].wins+=res.wins;
    summary[s.key].days.push({date,futGross,futNet,optGross,optNet,trades:res.tradeCount,wins:res.wins});

    const sign=v=>v>=0?'+':'-';
    const fmt=v=>(v>=0?'+':'')+Math.round(v).toLocaleString();
    console.log(
      s.name.slice(0,21).padEnd(22)+
      String(res.tradeCount).padEnd(8)+
      wr.padEnd(8)+
      fmt(futGross).padEnd(14)+
      fmt(futNet).padEnd(14)+
      fmt(optGross).padEnd(14)+
      fmt(optNet).padEnd(14)
    );

    // Show individual trades for detail
    for (const t of res.trades) {
      const pSign=t.pts>=0?'+':'';
      console.log(`  T${t.n} ${t.dir} [${t.reason}] ${t.entryTime}@${Math.round(t.entry)} → ${t.exitTime}@${Math.round(t.exitPrice)}  ${pSign}${t.pts.toFixed(0)}pts | Fut:${pSign}Rs${Math.round(t.futRs)} | Opt:${t.optRs>=0?'+':''}Rs${Math.round(t.optRs)}`);
    }
  }

  prevCandles=allC;
}

// ═════════════════════════════════════════════════════════════════════════
// GRAND SUMMARY
// ═════════════════════════════════════════════════════════════════════════
console.log('');
console.log('');
console.log('═'.repeat(110));
console.log('JUNE 2026 SUMMARY — ALL 4 STRATEGIES (Bug-Fixed)');
console.log('═'.repeat(110));
console.log('Strategy'.padEnd(25)+'Trades'.padEnd(8)+'WR%'.padEnd(8)+'Fut Gross'.padEnd(14)+'Fut Net'.padEnd(14)+'Opt Gross'.padEnd(14)+'Opt Net'.padEnd(14));
console.log('─'.repeat(110));

for (const s of strategies) {
  const sm=summary[s.key];
  const wr=sm.trades>0?(sm.wins/sm.trades*100).toFixed(1)+'%':'—';
  const fmt=v=>(v>=0?'+':'')+Math.round(v).toLocaleString();
  console.log(
    s.name.slice(0,24).padEnd(25)+
    String(sm.trades).padEnd(8)+
    wr.padEnd(8)+
    fmt(sm.futGross).padEnd(14)+
    fmt(sm.futNet).padEnd(14)+
    fmt(sm.optGross).padEnd(14)+
    fmt(sm.optNet).padEnd(14)
  );
}

console.log('');
console.log('Notes:');
console.log('  • Futures P&L = actual BANKNIFTY26JUNFUT OHLC × 30 qty — TRUE simulation');
console.log('  • Options P&L = Black-Scholes ATM (IV=18%, nearest-expiry) — APPROXIMATION');
console.log('  • All DRISHTI_V1 bugs fixed: futures signal (Bug1), candle-close trail (Bug2)');
console.log('  • All strategies: no entry lag assumed (Bug3 fixed conceptually)');
console.log('  • Cost: Futures Rs362/trade | Options Rs260/trade (Zerodha brokerage+taxes)');
console.log('  • Data: Jun 2026 futures minute data, 6 tradeable days');
console.log('  • ACTUAL LIVE (Jun 2026): Rs 2,337 gross (spot signals, LTP trail = bugs active)');

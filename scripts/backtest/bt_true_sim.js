'use strict';
const fs = require('fs');

const futMinData = JSON.parse(fs.readFileSync('./banknifty_fut_minute_vps.json','utf8'));
const jun9Fresh  = JSON.parse(fs.readFileSync('./today_jun_minute_fresh_ohlc.json','utf8'));

const SL=150, TRAIL=10, MAX=5, QTY=30, IV=0.18;
const COST_FUT=362, COST_OPT=260;

function bp(c){return(c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0;}
function pdh(cs){return Math.max(...cs.map(c=>c.high));}
function pdl(cs){return Math.min(...cs.map(c=>c.low));}
function pdc(cs){return cs[cs.length-1].close;}
function bHigh(c){return Math.max(c.open,c.close);}
function bLow(c){return Math.min(c.open,c.close);}

function build15(mins){
  const w={};
  for(const m of mins){
    const tm=m.h*60+m.m;
    if(tm<9*60+15||tm>=15*60+30)continue;
    const k=String(Math.floor((9*60+15+Math.floor((tm-9*60-15)/15)*15)/60)).padStart(2,'0')+':'+String((9*60+15+Math.floor((tm-9*60-15)/15)*15)%60).padStart(2,'0');
    if(!w[k])w[k]={open:m.open,high:m.high,low:m.low,close:m.close,time:k};
    else{w[k].high=Math.max(w[k].high,m.high);w[k].low=Math.min(w[k].low,m.low);w[k].close=m.close;}
  }
  return Object.entries(w).sort().map(([t,c])=>({...c,time:t}));
}
function build15ohlc(data){
  const w={};
  for(const m of data){
    const [hh,mm]=m.time.split(':').map(Number),tm=hh*60+mm;
    if(tm<9*60+15||tm>=15*60+30)continue;
    const k=String(Math.floor((9*60+15+Math.floor((tm-9*60-15)/15)*15)/60)).padStart(2,'0')+':'+String((9*60+15+Math.floor((tm-9*60-15)/15)*15)%60).padStart(2,'0');
    if(!w[k])w[k]={open:m.open,high:m.high,low:m.low,close:m.close,time:k};
    else{w[k].high=Math.max(w[k].high,m.high);w[k].low=Math.min(w[k].low,m.low);w[k].close=m.close;}
  }
  return Object.entries(w).sort().map(([t,c])=>({...c,time:t}));
}

// Black-Scholes option premium
function ncdf(x){const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);let p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;}
function optPrem(fut,strike,side,dte){
  const T=Math.max(1/365,dte/365),vT=IV*Math.sqrt(T),r=0.06;
  const d1=(Math.log(fut/strike)+(r+IV*IV/2)*T)/vT,d2=d1-vT;
  const call=fut*ncdf(d1)-strike*Math.exp(-r*T)*ncdf(d2);
  const put=strike*Math.exp(-r*T)*ncdf(-d2)-fut*ncdf(-d1);
  return Math.max(1,side==='CE'?call:put);
}
function getDTE(dateStr){
  const d=new Date(dateStr+'T00:00:00+05:30'),y=d.getFullYear(),mo=d.getMonth();
  let last=new Date(y,mo+1,0);last.setDate(last.getDate()-((last.getDay()>=4)?last.getDay()-4:last.getDay()+3));
  if(d>=last){last=new Date(y,mo+2,0);last.setDate(last.getDate()-((last.getDay()>=4)?last.getDay()-4:last.getDay()+3));}
  return Math.max(1,Math.ceil((last-d)/86400000));
}

// Build futures candles
const days={};
for(const d of Object.keys(futMinData).sort()){
  const mins=futMinData[d].filter(c=>c.sym==='BANKNIFTY26JUNFUT');
  if(mins.length>0)days[d]=build15(mins);
}
days['2026-06-09']=build15ohlc(jun9Fresh);

// ── DRISHTI V1 (copied verbatim from bt_june_futures.js) ─────────────────
function findEntry(today,prev){
  if(!today||today.length<1||!prev||!prev.length)return null;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const C0=today[0];
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const bps4=today.slice(0,Math.min(4,today.length)).map(bp);
  let wips=0;for(let i=1;i<bps4.length;i++)if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65)wips++;
  if(wips>=2)return null;
  const lastIdx=today.length-1;
  const at=(idx,side,reason)=>idx===lastIdx?{idx,side,ctx,reason}:null;
  const firstBear=(from,th)=>{for(let i=from;i<today.length;i++)if(bp(today[i])<-(th||35))return i;return -1;};
  const firstBull=(from,th)=>{for(let i=from;i<today.length;i++)if(bp(today[i])>(th||35))return i;return -1;};
  const firstStrong=(from,th)=>{th=th||55;for(let i=from;i<today.length;i++){const b=bp(today[i]);if(Math.abs(b)>th)return{i,side:b>0?'CE':'PE'};}return null;};
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)return at(0,'CE','extraordinary_gap_ce');
    if(bp(C0)>85)return at(0,'CE','above_pdh_trend_day_ce');
    if(bp(C0)<-20)return at(0,'PE','above_pdh_c0_reversal_pe');
    const bi=firstBear(1,35);if(bi>0&&bi<=7)return at(bi,'PE','above_pdh_delayed_pe');
    const s=firstStrong(2,55);if(s)return at(s.i,s.side,'above_pdh_continuation');
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(bp(C0)<-80)return at(0,'PE','below_pdl_trend_day_pe');
    if(bp(C0)<-65)return null;
    if(bp(C0)>65){const i=firstBear(1,30);if(i>0)return at(i,'PE','recovery_bounce_pe');}
    if(C0.high<PL){
      if(today.length>=2&&bp(today[1])>20)return at(1,'CE','below_pdl_c1_bull_ce');
      if(today.length>=2&&bp(today[1])<-20)return at(0,'PE','below_pdl_no_recovery_pe');
      const s=firstStrong(2,40);if(s&&s.i<=5)return at(s.i,s.side,'below_pdl_c2_signal');
      return null;
    }
    if(bp(C0)>20){const i=firstBear(1,30);if(i>0&&i<=6)return at(i,'PE','below_pdl_partial_bounce_pe');}
    if(bp(C0)<-10){for(let i=2;i<=Math.min(7,today.length-2);i++)if(bp(today[i])<-45&&today[i-1].close<PL)return at(i,'PE','below_pdl_failed_bounce_pe');}
    return null;
  }
  // INSIDE
  if(C0.close<PL&&lastIdx===0)return at(0,'PE','inside_c0_breaks_below_pdl');
  if(C0.close>PH&&lastIdx===0)return at(0,'CE','inside_c0_breaks_above_pdh');
  const gap=C0.open-PC,gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(bp(C0))>55){
    const bull=bp(C0)>0;
    const aligned=(bull&&!gapDown)||(!bull&&!gapUp);
    if(aligned){
      if(today.length>=2&&bp(today[1])*bp(C0)<0&&Math.abs(bp(today[1]))>72){const s=at(1,bp(today[1])>0?'CE':'PE','inside_c0_trap_c1_signal');if(s)return s;}
      return at(0,bull?'CE':'PE','inside_c0_momentum');
    } else {
      const gapSide=gapUp?'CE':'PE';
      const rev=gapUp?firstBull(1,35):firstBear(1,35);
      if(rev>0&&rev<=5)return at(rev,gapSide,'inside_counter_gap_reversal');
      return at(0,bull?'CE':'PE','inside_c0_momentum_no_reversal');
    }
  }
  for(let i=1;i<today.length;i++){
    const p=today[i-1],c=today[i];
    if(c.close<p.low){if(gapUp&&bp(C0)>20)continue;const s=at(i,'PE','struct_pe');if(s)return s;}
    if(c.close>p.high){if(gapDown&&bp(C0)<-20)continue;const s=at(i,'CE','struct_ce');if(s)return s;}
  }
  for(let i=5;i<Math.min(today.length,21);i++){
    const pc=today[i-1].close;
    if(today[i].low<=PL&&pc>PL&&bp(today[i])>35)return at(i,'CE','inside_pdl_test_ce');
    if(today[i].high>=PH&&pc<PH&&bp(today[i])<-35)return at(i,'PE','inside_pdh_test_pe');
  }
  return null;
}
function findReEntry(today,exitIdx,lastDir){
  const lastIdx=today.length-1;if(lastIdx<=exitIdx)return null;
  let sd=-1,rv=-1;
  for(let i=exitIdx+1;i<=lastIdx;i++){
    const b=bp(today[i]);
    if(sd<0&&((lastDir==='CE'&&b>40)||(lastDir==='PE'&&b<-40)))sd=i;
    if(rv<0&&((lastDir==='CE'&&b<-40)||(lastDir==='PE'&&b>40)))rv=i;
    if(sd>=0&&rv>=0)break;
  }
  if(sd<0&&rv<0)return null;
  if(sd<0)return{idx:rv,dir:lastDir==='CE'?'PE':'CE',reason:'re_reverse'};
  if(rv<0)return{idx:sd,dir:lastDir,reason:'re_same_dir'};
  if(sd<=rv)return{idx:sd,dir:lastDir,reason:'re_same_dir'};
  return{idx:rv,dir:lastDir==='CE'?'PE':'CE',reason:'re_reverse'};
}
function runTrade(dir,entryFut,entryIdx,today,date){
  const sign=dir==='CE'?1:-1;
  const dte=getDTE(date);
  const strike=Math.round(entryFut/100)*100;
  const premEntry=optPrem(entryFut,strike,dir,dte);
  let peak=0,trailStop=-SL;
  for(let i=entryIdx+1;i<today.length;i++){
    const c=today[i];
    const fav=dir==='CE'?c.high-entryFut:entryFut-c.low;
    if(fav>peak){peak=fav;trailStop=peak>=TRAIL?peak-TRAIL:-SL;}
    const exitLevel=entryFut+sign*trailStop;
    const hit=dir==='CE'?c.low<=exitLevel:c.high>=exitLevel;
    if(hit||c.time==='15:15'){
      const exitFut=c.time==='15:15'?c.close:exitLevel;
      const premExit=optPrem(exitFut,strike,dir,dte);
      const futPts=sign*(exitFut-entryFut);
      return{futPts,futRs:futPts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut,exitTime:c.time,peak,strike,exitIdx:i};
    }
  }
  const last=today[today.length-1];
  const exitFut=last.close;
  const premExit=optPrem(exitFut,strike,dir,dte);
  const futPts=sign*(exitFut-entryFut);
  return{futPts,futRs:futPts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut,exitTime:last.time,peak,strike,exitIdx:today.length-1};
}

// ── REVERSAL BLAST (Entry#21+22, Exit at 14:30 or SL250) ─────────────────
function rbEntry(cs,i){
  if(i<1)return null;
  const c=cs[i],p=cs[i-1],b=bp(c);
  if(c.close>bHigh(p)&&b>40)return{signal:'CE',reason:'body_breakout_bull'};
  if(c.close<bLow(p)&&b<-40)return{signal:'PE',reason:'body_breakout_bear'};
  return null;
}
function rbTrade(dir,entryFut,entryIdx,today,date){
  const sign=dir==='CE'?1:-1;
  const dte=getDTE(date);
  const strike=Math.round(entryFut/100)*100;
  const premEntry=optPrem(entryFut,strike,dir,dte);
  for(let i=entryIdx+1;i<today.length;i++){
    const c=today[i];
    const pts=sign*(c.close-entryFut);
    if(pts<=-250||c.time==='14:30'){
      const exitFut=c.close;
      const premExit=optPrem(exitFut,strike,dir,dte);
      return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut,exitTime:c.time,strike};
    }
  }
  const last=today[today.length-1];
  const pts=sign*(last.close-entryFut);
  const premExit=optPrem(last.close,strike,dir,dte);
  return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:last.close,exitTime:last.time,strike};
}

// ── RANGE SNIPER (Entry#38 LL-LH, Exit#89 dual after 12:30) ──────────────
function rsEntry(cs,i){
  if(i<2)return null;
  const a=cs[i-2],b=cs[i-1],c=cs[i];
  if(b.low<a.low&&c.low<b.low&&b.high<a.high)return{signal:'PE',reason:'ll_lh_bear'};
  if(b.high>a.high&&c.high>b.high&&b.low>a.low)return{signal:'CE',reason:'hh_hl_bull'};
  return null;
}
function rsTrade(dir,entryFut,entryIdx,today,date){
  const sign=dir==='CE'?1:-1;
  const dte=getDTE(date);
  const strike=Math.round(entryFut/100)*100;
  const premEntry=optPrem(entryFut,strike,dir,dte);
  for(let i=entryIdx+1;i<today.length;i++){
    const c=today[i];
    const pts=sign*(c.close-entryFut);
    if(pts<=-150){
      const premExit=optPrem(c.close,strike,dir,dte);
      return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:c.close,exitTime:c.time,strike};
    }
    if(c.time>='12:30'){
      const b=bp(c);
      const rev=(dir==='CE'&&b<-40)||(dir==='PE'&&b>40);
      if(rev){
        const premExit=optPrem(c.close,strike,dir,dte);
        return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:c.close,exitTime:c.time,strike};
      }
    }
    if(c.time==='15:15'){
      const premExit=optPrem(c.close,strike,dir,dte);
      return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:c.close,exitTime:c.time,strike};
    }
  }
  const last=today[today.length-1];
  const pts=sign*(last.close-entryFut);
  const premExit=optPrem(last.close,strike,dir,dte);
  return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:last.close,exitTime:last.time,strike};
}

// ── STRUCTURE GRIND (Entry#38 LL-LH, Exit#5 SL250 or EOD) ────────────────
function sgTrade(dir,entryFut,entryIdx,today,date){
  const sign=dir==='CE'?1:-1;
  const dte=getDTE(date);
  const strike=Math.round(entryFut/100)*100;
  const premEntry=optPrem(entryFut,strike,dir,dte);
  for(let i=entryIdx+1;i<today.length;i++){
    const c=today[i];
    const pts=sign*(c.close-entryFut);
    if(pts<=-250||c.time==='15:15'){
      const premExit=optPrem(c.close,strike,dir,dte);
      return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:c.close,exitTime:c.time,strike};
    }
  }
  const last=today[today.length-1];
  const pts=sign*(last.close-entryFut);
  const premExit=optPrem(last.close,strike,dir,dte);
  return{futPts:pts,futRs:pts*QTY,premEntry,premExit,optRs:(premExit-premEntry)*QTY,exitFut:last.close,exitTime:last.time,strike};
}

// ── RUN ALL DAYS ──────────────────────────────────────────────────────────
const allDays=Object.keys(days).sort();
const totals={DRISHTI:{fG:0,fN:0,oG:0,oN:0,t:0,w:0},RBLAST:{fG:0,fN:0,oG:0,oN:0,t:0,w:0},RSNIPER:{fG:0,fN:0,oG:0,oN:0,t:0,w:0},SGRIND:{fG:0,fN:0,oG:0,oN:0,t:0,w:0}};

let prev=null;
for(let di=0;di<allDays.length;di++){
  const date=allDays[di];
  const allC=days[date];
  const today=allC.slice(1);
  if(!prev||today.length<3){prev=allC;continue;}

  const PH=pdh(prev),PL=pdl(prev);
  const ctx=(today[0].open-PH)>120?'ABOVE_PDH':(today[0].open-PL)<0?'BELOW_PDL':'INSIDE';

  console.log('\n'+'═'.repeat(120));
  console.log(`${date}  ${ctx}  PDH:${Math.round(PH)}  PDL:${Math.round(PL)}  Open(Fut):${Math.round(today[0].open)}  Close(Fut):${Math.round(today[today.length-1].close)}`);
  console.log('═'.repeat(120));

  // Header
  console.log('Strat       T# DIR  Entry@FutPx  Strike  OptPremEntry  ExitTime  Exit@FutPx  OptPremExit  FutPts  FutRs     OptRs     FutNet    OptNet');
  console.log('─'.repeat(120));

  // DRISHTI
  {
    let firstDone=false,lastExitIdx=-1,lastDir=null,tc=0,wins=0,dayFG=0,dayOG=0;
    for(let ci=0;ci<today.length&&tc<MAX;ci++){
      let sig=null;
      if(!firstDone){
        const sub=today.slice(0,ci+1);
        sig=findEntry(sub,prev);
        if(!sig)continue;
      } else {
        if(ci<=lastExitIdx)continue;
        const re=findReEntry(today,lastExitIdx,lastDir);
        if(!re||re.idx!==ci)continue;
        sig={side:re.dir,reason:re.reason};
      }
      const dir=sig.side||sig.signal;
      const r=runTrade(dir,today[ci].close,ci,today,date);
      const fNet=r.futRs-COST_FUT, oNet=r.optRs-COST_OPT;
      dayFG+=r.futRs; dayOG+=r.optRs; tc++; if(r.futPts>0)wins++;
      firstDone=true;lastExitIdx=r.exitIdx;lastDir=dir;
      const ps=r.futPts>=0?'+':'';
      console.log(
        'DRISHTI    '.padEnd(12)+
        String(tc).padEnd(3)+
        dir.padEnd(5)+
        String(Math.round(today[ci].close)).padStart(5)+'@FUT   '+
        String(r.strike).padStart(6)+'  '+
        String(r.premEntry.toFixed(1)).padStart(12)+'  '+
        r.exitTime.padEnd(10)+
        String(Math.round(r.exitFut)).padStart(5)+'@FUT   '+
        String(r.premExit.toFixed(1)).padStart(11)+'  '+
        (ps+r.futPts.toFixed(0)).padStart(6)+'pts '+
        (r.futRs>=0?'+':'')+String(Math.round(r.futRs)).padStart(7)+'   '+
        (r.optRs>=0?'+':'')+String(Math.round(r.optRs)).padStart(7)+'   '+
        (fNet>=0?'+':'')+String(Math.round(fNet)).padStart(7)+'   '+
        (oNet>=0?'+':'')+String(Math.round(oNet)).padStart(7)
      );
      ci=r.exitIdx;
    }
    console.log('  DRISHTI DAY TOTAL: Fut Gross='+(dayFG>=0?'+':'')+Math.round(dayFG)+'  Opt Gross='+(dayOG>=0?'+':'')+Math.round(dayOG)+'  Trades='+tc+'  WR='+(tc>0?(wins/tc*100).toFixed(0)+'%':'—'));
    totals.DRISHTI.fG+=dayFG;totals.DRISHTI.fN+=dayFG-tc*COST_FUT;totals.DRISHTI.oG+=dayOG;totals.DRISHTI.oN+=dayOG-tc*COST_OPT;totals.DRISHTI.t+=tc;totals.DRISHTI.w+=wins;
  }

  console.log('─'.repeat(120));

  // REVERSAL BLAST
  {
    let lastExit=-1,tc=0,wins=0,dayFG=0,dayOG=0;
    for(let ci=0;ci<today.length&&tc<MAX;ci++){
      if(ci<=lastExit)continue;
      const sig=rbEntry(today,ci);
      if(!sig)continue;
      const r=rbTrade(sig.signal,today[ci].close,ci,today,date);
      const fNet=r.futRs-COST_FUT, oNet=r.optRs-COST_OPT;
      dayFG+=r.futRs;dayOG+=r.optRs;tc++;if(r.futPts>0)wins++;lastExit=r.exitIdx||ci+1;
      const ps=r.futPts>=0?'+':'';
      console.log(
        'RBLAST     '.padEnd(12)+
        String(tc).padEnd(3)+
        sig.signal.padEnd(5)+
        String(Math.round(today[ci].close)).padStart(5)+'@FUT   '+
        String(r.strike).padStart(6)+'  '+
        String(r.premEntry.toFixed(1)).padStart(12)+'  '+
        r.exitTime.padEnd(10)+
        String(Math.round(r.exitFut)).padStart(5)+'@FUT   '+
        String(r.premExit.toFixed(1)).padStart(11)+'  '+
        (ps+r.futPts.toFixed(0)).padStart(6)+'pts '+
        (r.futRs>=0?'+':'')+String(Math.round(r.futRs)).padStart(7)+'   '+
        (r.optRs>=0?'+':'')+String(Math.round(r.optRs)).padStart(7)+'   '+
        (fNet>=0?'+':'')+String(Math.round(fNet)).padStart(7)+'   '+
        (oNet>=0?'+':'')+String(Math.round(oNet)).padStart(7)
      );
      ci=r.exitIdx||ci;
    }
    if(tc===0)console.log('RBLAST     — no signal today');
    else console.log('  RBLAST DAY TOTAL: Fut Gross='+(dayFG>=0?'+':'')+Math.round(dayFG)+'  Opt Gross='+(dayOG>=0?'+':'')+Math.round(dayOG)+'  Trades='+tc+'  WR='+(wins/tc*100).toFixed(0)+'%');
    totals.RBLAST.fG+=dayFG;totals.RBLAST.fN+=dayFG-tc*COST_FUT;totals.RBLAST.oG+=dayOG;totals.RBLAST.oN+=dayOG-tc*COST_OPT;totals.RBLAST.t+=tc;totals.RBLAST.w+=wins;
  }

  console.log('─'.repeat(120));

  // RANGE SNIPER
  {
    let lastExit=-1,tc=0,wins=0,dayFG=0,dayOG=0;
    for(let ci=0;ci<today.length&&tc<MAX;ci++){
      if(ci<=lastExit)continue;
      const sig=rsEntry(today,ci);
      if(!sig)continue;
      const r=rsTrade(sig.signal,today[ci].close,ci,today,date);
      const fNet=r.futRs-COST_FUT, oNet=r.optRs-COST_OPT;
      dayFG+=r.futRs;dayOG+=r.optRs;tc++;if(r.futPts>0)wins++;lastExit=r.exitIdx||ci+1;
      const ps=r.futPts>=0?'+':'';
      console.log(
        'RSNIPER    '.padEnd(12)+
        String(tc).padEnd(3)+
        sig.signal.padEnd(5)+
        String(Math.round(today[ci].close)).padStart(5)+'@FUT   '+
        String(r.strike).padStart(6)+'  '+
        String(r.premEntry.toFixed(1)).padStart(12)+'  '+
        r.exitTime.padEnd(10)+
        String(Math.round(r.exitFut)).padStart(5)+'@FUT   '+
        String(r.premExit.toFixed(1)).padStart(11)+'  '+
        (ps+r.futPts.toFixed(0)).padStart(6)+'pts '+
        (r.futRs>=0?'+':'')+String(Math.round(r.futRs)).padStart(7)+'   '+
        (r.optRs>=0?'+':'')+String(Math.round(r.optRs)).padStart(7)+'   '+
        (fNet>=0?'+':'')+String(Math.round(fNet)).padStart(7)+'   '+
        (oNet>=0?'+':'')+String(Math.round(oNet)).padStart(7)
      );
      ci=r.exitIdx||ci;
    }
    if(tc===0)console.log('RSNIPER    — no signal today');
    else console.log('  RSNIPER DAY TOTAL: Fut Gross='+(dayFG>=0?'+':'')+Math.round(dayFG)+'  Opt Gross='+(dayOG>=0?'+':'')+Math.round(dayOG)+'  Trades='+tc+'  WR='+(wins/tc*100).toFixed(0)+'%');
    totals.RSNIPER.fG+=dayFG;totals.RSNIPER.fN+=dayFG-tc*COST_FUT;totals.RSNIPER.oG+=dayOG;totals.RSNIPER.oN+=dayOG-tc*COST_OPT;totals.RSNIPER.t+=tc;totals.RSNIPER.w+=wins;
  }

  console.log('─'.repeat(120));

  // STRUCTURE GRIND
  {
    let lastExit=-1,tc=0,wins=0,dayFG=0,dayOG=0;
    for(let ci=0;ci<today.length&&tc<MAX;ci++){
      if(ci<=lastExit)continue;
      const sig=rsEntry(today,ci); // same entry
      if(!sig)continue;
      const r=sgTrade(sig.signal,today[ci].close,ci,today,date);
      const fNet=r.futRs-COST_FUT, oNet=r.optRs-COST_OPT;
      dayFG+=r.futRs;dayOG+=r.optRs;tc++;if(r.futPts>0)wins++;lastExit=r.exitIdx||ci+1;
      const ps=r.futPts>=0?'+':'';
      console.log(
        'SGRIND     '.padEnd(12)+
        String(tc).padEnd(3)+
        sig.signal.padEnd(5)+
        String(Math.round(today[ci].close)).padStart(5)+'@FUT   '+
        String(r.strike).padStart(6)+'  '+
        String(r.premEntry.toFixed(1)).padStart(12)+'  '+
        r.exitTime.padEnd(10)+
        String(Math.round(r.exitFut)).padStart(5)+'@FUT   '+
        String(r.premExit.toFixed(1)).padStart(11)+'  '+
        (ps+r.futPts.toFixed(0)).padStart(6)+'pts '+
        (r.futRs>=0?'+':'')+String(Math.round(r.futRs)).padStart(7)+'   '+
        (r.optRs>=0?'+':'')+String(Math.round(r.optRs)).padStart(7)+'   '+
        (fNet>=0?'+':'')+String(Math.round(fNet)).padStart(7)+'   '+
        (oNet>=0?'+':'')+String(Math.round(oNet)).padStart(7)
      );
      ci=r.exitIdx||ci;
    }
    if(tc===0)console.log('SGRIND     — no signal today');
    else console.log('  SGRIND DAY TOTAL: Fut Gross='+(dayFG>=0?'+':'')+Math.round(dayFG)+'  Opt Gross='+(dayOG>=0?'+':'')+Math.round(dayOG)+'  Trades='+tc+'  WR='+(wins/tc*100).toFixed(0)+'%');
    totals.SGRIND.fG+=dayFG;totals.SGRIND.fN+=dayFG-tc*COST_FUT;totals.SGRIND.oG+=dayOG;totals.SGRIND.oN+=dayOG-tc*COST_OPT;totals.SGRIND.t+=tc;totals.SGRIND.w+=wins;
  }

  prev=allC;
}

// GRAND SUMMARY
console.log('\n\n'+'═'.repeat(120));
console.log('JUNE 2026 — GRAND SUMMARY (All bug-fixed, Futures=REAL OHLC, Options=Black-Scholes approx)');
console.log('Actual live (bugs active): Rs 2,337 gross');
console.log('═'.repeat(120));
console.log('Strategy     Trades  WR%    FutGross    FutNet      OptGross    OptNet');
console.log('─'.repeat(80));
const names={DRISHTI:'DRISHTI_V1',RBLAST:'REVERSAL_BLAST',RSNIPER:'RANGE_SNIPER',SGRIND:'STRUCTURE_GRIND'};
for(const [k,sm] of Object.entries(totals)){
  const wr=sm.t>0?(sm.w/sm.t*100).toFixed(1)+'%':'—';
  const f=v=>(v>=0?'+':'')+Math.round(v).toLocaleString();
  console.log(names[k].padEnd(15)+String(sm.t).padEnd(8)+wr.padEnd(7)+f(sm.fG).padEnd(12)+f(sm.fN).padEnd(12)+f(sm.oG).padEnd(12)+f(sm.oN));
}
console.log('\nOptions premium = Black-Scholes ATM. Real options cache empty on this machine.');
console.log('To get real options data: run fetch_premium_data.js from VPS then pull cache/banknifty_options_recent.json');

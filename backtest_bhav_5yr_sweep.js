'use strict';
// backtest_bhav_5yr_sweep.js
// 5-year sweep (2021-2026) — each param maps 1:1 to exact live code threshold
//
// STRONG  → INSIDE C0 strong gate  +  weak loop C2-C8  +  ABOVE_PDH continuation
// MOD     → INSIDE C0 moderate gate  (constraint: MOD < STRONG)
// RE_GATE → min peak pts required before re-entry
// REV_UNLOCK → min peak pts to allow reverse re-entry
//
// All other thresholds hardcoded to live values:
//   whipsaw guard: 65  |  firstBear ABOVE_PDH: 35  |  BELOW_PDL c2 signal: 40
//   trap C1: 72  |  whipsaw check in weak loop: 60  |  PDL/PDH test body: 35
//   RE_BODY: 40  |  SL: 150  |  TRAIL_GAP: 10  |  MAX_TRADES: 5  |  MAX_RE: 5
// C0 seeding: today[0]=9:15 seeded, liveCandles=today.slice(1) matches live bot

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
const RE_BODY    = 40;   // re-entry body threshold — fixed
const PDR_THRESH = 150;  // min prev-day range — fixed

// ─── Helpers ──────────────────────────────────────────────────────────────────
function bp(c){ return (c.high-c.low)>0?(c.close-c.open)/(c.high-c.low)*100:0; }
function pdh(cs){ let m=cs[0].high; for(let i=1;i<cs.length;i++) if(cs[i].high>m) m=cs[i].high; return m; }
function pdl(cs){ let m=cs[0].low;  for(let i=1;i<cs.length;i++) if(cs[i].low<m)  m=cs[i].low;  return m; }
function pdc(cs){ return cs[cs.length-1].close; }
function firstBear(cs,from,t){ for(let i=from;i<cs.length;i++) if(bp(cs[i])<-t) return i; return -1; }
function firstBull(cs,from,t){ for(let i=from;i<cs.length;i++) if(bp(cs[i])>t)  return i; return -1; }
function firstStrong(cs,from,t){
  for(let i=from;i<cs.length;i++){
    const b=bp(cs[i]); if(Math.abs(b)>t) return{i,side:b>0?'CE':'PE'};
  }
  return null;
}

// ─── Entry logic — exact live code, STRONG and MOD swept ─────────────────────
function findDrishtiEntry(today, PH, PL, PC, STRONG, MOD) {
  if(!today||today.length<1) return null;
  const C0=today[0], gap=C0.open-PC, lastIdx=today.length-1;
  const vsPDH=C0.open-PH, vsPDL=C0.open-PL;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0), C1bp=today[1]?bp(today[1]):0;

  // Whipsaw guard — hardcoded 65 (matches live)
  const n=Math.min(4,today.length);
  let wipsaws=0;
  for(let i=1;i<n;i++){
    const a=bp(today[i]),b2=bp(today[i-1]);
    if(a*b2<0&&Math.abs(a)>65&&Math.abs(b2)>65) wipsaws++;
  }
  if(wipsaws>=2) return null;

  const at=(idx,side,r)=>idx===lastIdx?{idx,side,ctx,r}:null;

  // ABOVE_PDH
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)      return at(0,'CE','xgap');
    if(C0bp>85)         return at(0,'CE','trend_ce');
    if(C0bp<-20)        return at(0,'PE','rev_pe');
    const bi=firstBear(today,1,35); if(bi>0&&bi<=7) return at(bi,'PE','delayed_pe');
    const ci=firstStrong(today,2,STRONG); if(ci) return at(ci.i,ci.side,'cont'); // SWEPT
    return null;
  }

  // BELOW_PDL
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return at(0,'PE','trend_pe');
    if(C0bp<-65) return null;
    if(C0bp>65){ const i=firstBear(today,1,30); if(i>0) return at(i,'PE','bounce_pe'); }
    if(C0.high<PL){
      if(today.length>=2&&C1bp>20)  return at(1,'CE','c1_bull');
      if(today.length>=1&&C1bp<-20) return at(0,'PE','no_rec');
      const s=firstStrong(today,2,40); if(s&&s.i<=5) return at(s.i,s.side,'c2_sig'); // hardcoded 40
      return null;
    }
    if(C0bp>20){ const i=firstBear(today,1,30); if(i>0&&i<=6) return at(i,'PE','partial_pe'); }
    if(C0bp<-10){
      for(let i=2;i<=Math.min(7,today.length-2);i++)
        if(bp(today[i])<-45&&today[i-1].close<PL) return at(i,'PE','failed_bounce');
    }
    return null;
  }

  // INSIDE
  if(C0.close<PL&&lastIdx===0) return at(0,'PE','c0_breaks_pdl');
  if(C0.close>PH&&lastIdx===0) return at(0,'CE','c0_breaks_pdh');
  const gapUp=gap>50, gapDown=gap<-50;

  if(Math.abs(C0bp)>STRONG){  // SWEPT: strong C0 gate
    const bull=C0bp>0, aligned=(bull&&!gapDown)||(!bull&&!gapUp);
    if(aligned){
      if(today.length>=2&&C1bp*C0bp<0&&Math.abs(C1bp)>72){ // trap: hardcoded 72
        const s=at(1,C1bp>0?'CE':'PE','trap'); if(s) return s;
      }
      { const s=at(0,bull?'CE':'PE','momentum'); if(s) return s; }
    } else {
      const gs=gapUp?'CE':'PE', rc=gapUp?firstBull(today,1,35):firstBear(today,1,35);
      if(rc>0&&rc<=5){ const s=at(rc,gs,'counter_gap'); if(s) return s; }
      { const s=at(0,bull?'CE':'PE','momentum_no_rev'); if(s) return s; }
    }
  }

  if(Math.abs(C0bp)>MOD){  // SWEPT: moderate C0 gate (MOD < STRONG enforced)
    if(today.length>=2&&C1bp*C0bp>0){ const s=at(0,C0bp>0?'CE':'PE','mod_conf'); if(s) return s; }
    if(today.length>=3&&Math.abs(C1bp)>65&&C1bp*C0bp<0){
      const c2=bp(today[2]);
      if(c2*C0bp>0&&Math.abs(c2)>20){ const s=at(0,C0bp>0?'CE':'PE','c1_fake'); if(s) return s; }
    }
  }

  // Weak C0 loop C2-C8 — SWEPT signal threshold, whipsaw check hardcoded 60 (matches live)
  for(let i=2;i<=8;i++){
    if(i>=today.length) break;
    const cbp=bp(today[i]);
    if(Math.abs(cbp)>STRONG){  // SWEPT
      const sb=cbp>0, og=(sb&&gapDown)||(!sb&&gapUp), cm=(sb&&C0bp<-20)||(!sb&&C0bp>20);
      if(og&&cm) continue;
      const pv=bp(today[i-1]);
      if(Math.abs(pv)>60&&pv*cbp<0){  // hardcoded 60 — matches live
        if(i+1<today.length&&bp(today[i+1])*cbp<0&&Math.abs(bp(today[i+1]))>60) return null;
      }
      return at(i,cbp>0?'CE':'PE',`c${i}_strong`);
    }
  }

  // Late entries C5-C20 — hardcoded 35 (matches live)
  for(let i=5;i<Math.min(today.length,21);i++){
    const pc=today[i-1].close;
    if(today[i].low<=PL&&pc>PL&&bp(today[i])>35) return at(i,'CE','pdl_test');
    if(today[i].high>=PH&&pc<PH&&bp(today[i])<-35) return at(i,'PE','pdh_test');
  }
  return null;
}

// ─── Re-entry ─────────────────────────────────────────────────────────────────
function findDrishtiReEntry(today, exitIdx, side, allowRev) {
  const lastIdx=today.length-1; if(lastIdx<=exitIdx) return null;
  for(let i=exitIdx+1;i<=lastIdx;i++){
    const b=bp(today[i]);
    if(side==='CE'&&b>RE_BODY) return{idx:i,side};
    if(side==='PE'&&b<-RE_BODY) return{idx:i,side};
  }
  if(allowRev){
    const rv=side==='CE'?'PE':'CE';
    for(let i=exitIdx+1;i<=lastIdx;i++){
      const b=bp(today[i]);
      if(rv==='CE'&&b>RE_BODY) return{idx:i,side:rv};
      if(rv==='PE'&&b<-RE_BODY) return{idx:i,side:rv};
    }
  }
  return null;
}

// ─── Trail ────────────────────────────────────────────────────────────────────
function updateTrail(state, candle, isEOD) {
  const sign=state.dir==='CE'?1:-1;
  const fav=state.dir==='CE'?candle.high-state.entry:state.entry-candle.low;
  let pk=state.peakPts, ts=state.trailStop;
  if(fav>pk){ pk=fav; ts=pk>=TRAIL_GAP?pk-TRAIL_GAP:-SL_PTS; }
  const cp=sign*(candle.close-state.entry);
  if(isEOD||cp<=ts)
    return{action:isEOD?'EOD':ts<=0?'SL':'TRAIL', pts:isEOD?cp:ts, peakPts:pk};
  state.peakPts=pk; state.trailStop=ts;
  return{action:'HOLD'};
}

// ─── Run one day ──────────────────────────────────────────────────────────────
function runDay(liveCandles, PH, PL, PC, STRONG, MOD, RE_GATE, REV_UNLOCK) {
  if(PH-PL<PDR_THRESH) return{pnl:0,trades:0,wins:0,losses:0};
  let st={inTrade:false,dir:null,entry:0,trailStop:-SL_PTS,peakPts:0,
          firstDone:false,reCount:0,lastExitPts:0,lastExitIdx:-1,lastExitDir:null};
  let dayPnL=0, trades=0, wins=0, losses=0;
  for(let li=0;li<liveCandles.length;li++){
    const bc=liveCandles[li], isEOD=li>=liveCandles.length-1;
    if(st.inTrade){
      const tr=updateTrail(st,bc,isEOD);
      if(tr.action!=='HOLD'){
        dayPnL+=tr.pts; trades++; if(tr.pts>0) wins++; else losses++;
        st.inTrade=false; st.firstDone=true;
        st.lastExitPts=tr.peakPts; st.lastExitIdx=li; st.lastExitDir=st.dir;
        st.dir=null; st.entry=0; st.peakPts=0; st.trailStop=-SL_PTS;
      }
      continue;
    }
    if(isEOD||trades>=MAX_TRADES) continue;
    let sig=null;
    const sl=liveCandles.slice(0,li+1);
    if(st.firstDone&&st.reCount<MAX_RE&&st.lastExitPts>=RE_GATE&&st.lastExitIdx>=0&&st.lastExitDir){
      const ar=st.lastExitPts>=REV_UNLOCK;
      const re=findDrishtiReEntry(sl,st.lastExitIdx,st.lastExitDir,ar);
      if(re&&re.idx===li) sig={idx:re.idx,side:re.side};
    } else if(!st.firstDone){
      sig=findDrishtiEntry(sl,PH,PL,PC,STRONG,MOD);
    }
    if(!sig) continue;
    st.inTrade=true; st.dir=sig.side; st.entry=bc.close;
    st.trailStop=-SL_PTS; st.peakPts=0;
    if(st.firstDone) st.reCount++;
  }
  return{pnl:Math.round(dayPnL*10)/10, trades, wins, losses};
}

// ─── Data fetch ───────────────────────────────────────────────────────────────
async function fetchChunk(from, to) {
  const data=await kite.getHistoricalData(INSTRUMENT_TOKEN,'15minute',from,to,false);
  return data.map(d=>({date:new Date(d.date),open:d.open,high:d.high,low:d.low,close:d.close}));
}

function groupByDay(candles) {
  const days={};
  for(const c of candles){
    const ist=new Date(c.date.getTime()+5.5*3600*1000);
    const tm=ist.getUTCHours()*60+ist.getUTCMinutes();
    if(tm<9*60+15||tm>15*60+15) continue;
    const dk=ist.toISOString().slice(0,10);
    if(!days[dk]) days[dk]=[];
    days[dk].push({open:c.open,high:c.high,low:c.low,close:c.close});
  }
  return days;
}

async function fetchAll() {
  const chunks=[
    ['2021-01-01','2021-03-31'],['2021-04-01','2021-06-30'],
    ['2021-07-01','2021-09-30'],['2021-10-01','2021-12-31'],
    ['2022-01-01','2022-03-31'],['2022-04-01','2022-06-30'],
    ['2022-07-01','2022-09-30'],['2022-10-01','2022-12-31'],
    ['2023-01-01','2023-03-31'],['2023-04-01','2023-06-30'],
    ['2023-07-01','2023-09-30'],['2023-10-01','2023-12-31'],
    ['2024-01-01','2024-03-31'],['2024-04-01','2024-06-30'],
    ['2024-07-01','2024-09-30'],['2024-10-01','2024-12-31'],
    ['2025-01-01','2025-03-31'],['2025-04-01','2025-06-30'],
    ['2025-07-01','2025-09-30'],['2025-10-01','2025-12-31'],
    ['2026-01-01','2026-03-31'],['2026-04-01','2026-05-29'],
  ];
  let all=[];
  for(const [from,to] of chunks){
    process.stdout.write('.');
    const d=await fetchChunk(from,to);
    all=all.concat(d);
    await new Promise(r=>setTimeout(r,350));
  }
  console.log(' done');
  return all;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching 5-year data (2021–2026)...');
  const raw=await fetchAll();
  const dayMap=groupByDay(raw);
  const allDates=Object.keys(dayMap).sort();
  console.log(`${allDates.length} trading days loaded\n`);

  // Pre-build pairs with C0 seeding fix
  const pairs=[];
  for(let di=1;di<allDates.length;di++){
    const today=dayMap[allDates[di]], prev=dayMap[allDates[di-1]];
    if(!today||today.length<3||!prev||prev.length<3) continue;
    const liveCandles=today.slice(1); // skip 9:15 candle — C0 seeding fix
    if(liveCandles.length<2) continue;
    const PH=pdh(prev), PL=pdl(prev), PC=pdc(prev);
    const yr=parseInt(allDates[di].slice(0,4));
    pairs.push({liveCandles,PH,PL,PC,yr});
  }
  console.log(`${pairs.length} valid day pairs\n`);

  // Parameter ranges — each maps 1:1 to live threshold
  const STRONG_VALS    = [45, 50, 55, 60, 65, 70];
  const MOD_VALS       = [15, 20, 25, 30, 35, 40];
  const RE_GATE_VALS   = [0, 5, 10, 15, 20];
  const REV_UNLOCK_VALS= [50, 75, 100, 150, 999];

  // Build combos — enforce MOD < STRONG
  const combos=[];
  for(const S of STRONG_VALS)
    for(const M of MOD_VALS)
      for(const G of RE_GATE_VALS)
        for(const R of REV_UNLOCK_VALS)
          if(M<S) combos.push([S,M,G,R]);

  console.log(`Running ${combos.length} combinations over ${pairs.length} days...\n`);

  const YEARS=[2021,2022,2023,2024,2025,2026];
  const dayCount={};
  for(const yr of YEARS) dayCount[yr]=0;
  for(const {yr} of pairs) dayCount[yr]++;

  // Run all combos
  const results=combos.map(([S,M,G,R])=>{
    let total=0, trades=0, wins=0, losses=0;
    const byYear={};
    for(const yr of YEARS) byYear[yr]={pnl:0};
    for(const {liveCandles,PH,PL,PC,yr} of pairs){
      const d=runDay(liveCandles,PH,PL,PC,S,M,G,R);
      total+=d.pnl; trades+=d.trades; wins+=d.wins; losses+=d.losses;
      byYear[yr].pnl+=d.pnl;
    }
    const allPositive=YEARS.every(y=>byYear[y].pnl>=0);
    return{S,M,G,R,total:Math.round(total*10)/10,trades,wins,losses,byYear,allPositive};
  });

  results.sort((a,b)=>b.total-a.total);

  const fmtPnl=(v)=>(v>=0?'+':'')+Math.round(v).toString().padStart(6);
  const wr=(r)=>r.wins+r.losses>0?Math.round(r.wins/(r.wins+r.losses)*1000)/10:0;

  const hdr='Rank  Str  Mod  Gate  RevUnlk    Total      Avg/Day  Trd  WR%     '+YEARS.map(y=>String(y).slice(2).padStart(6)).join(' ');
  console.log(hdr);
  console.log('─'.repeat(hdr.length));

  for(let i=0;i<Math.min(20,results.length);i++){
    const r=results[i];
    const flag=r.allPositive?' ✓ALL+':'';
    const avgDay=(r.total/pairs.length).toFixed(1);
    const yrs=YEARS.map(y=>fmtPnl(r.byYear[y].pnl)).join(' ');
    console.log(`#${String(i+1).padStart(3)}   ${String(r.S).padStart(3)}  ${String(r.M).padStart(3)}     ${String(r.G).padStart(2)}      ${String(r.R).padStart(3)}  ${fmtPnl(r.total).padStart(8)}   ${(r.total>=0?'+':'')+avgDay.padStart(7)}  ${String(r.trades).padStart(4)}  ${wr(r).toFixed(1).padStart(5)}%  ${yrs}${flag}`);
  }

  // Consistent-only top 10 (positive every year)
  const consistent=results.filter(r=>r.allPositive);
  console.log(`\n── CONSISTENT (positive all 6 years): ${consistent.length} combos ──────────────────────`);
  for(let i=0;i<Math.min(10,consistent.length);i++){
    const r=consistent[i];
    const yrs=YEARS.map(y=>fmtPnl(r.byYear[y].pnl)).join(' ');
    console.log(`#${String(i+1).padStart(3)}   Str:${r.S} Mod:${r.M} Gate:${r.G} RevUnlk:${r.R}  →  ${fmtPnl(r.total)} pts  WR:${wr(r).toFixed(1)}%   ${yrs}`);
  }

  // Current live settings
  const cur=results.find(r=>r.S===55&&r.M===30&&r.G===10&&r.R===100);
  if(cur){
    const rank=results.indexOf(cur)+1;
    const avgDay=(cur.total/pairs.length).toFixed(1);
    const yrs=YEARS.map(y=>`${y}:${fmtPnl(cur.byYear[y].pnl)}`).join('  ');
    console.log('\n── CURRENT LIVE SETTINGS ─────────────────────────────────────────────');
    console.log(`Rank #${rank} of ${results.length}  →  Strong:55  Mod:30  ReGate:10  RevUnlock:100`);
    console.log(`Total: ${fmtPnl(cur.total)} pts  WR:${wr(cur).toFixed(1)}%  Trades:${cur.trades}  Avg/Day:${(cur.total>=0?'+':'')+avgDay}  AllPositive:${cur.allPositive}`);
    console.log(yrs);
  }

  // Bottom 5
  console.log('\n── BOTTOM 5 ──────────────────────────────────────────────────────────');
  for(let i=results.length-1;i>=Math.max(0,results.length-5);i--){
    const r=results[i];
    console.log(`  Str:${r.S} Mod:${r.M} Gate:${r.G} Rev:${r.R}  →  ${fmtPnl(r.total)} pts  WR:${wr(r).toFixed(1)}%`);
  }

  console.log(`\nTotal combos: ${results.length}`);
  console.log(`Days per year: ${YEARS.map(y=>`${y}:${dayCount[y]}`).join('  ')}`);
}

main().catch(e=>console.error(e.message));

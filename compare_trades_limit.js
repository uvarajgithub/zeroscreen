// Compare HYBRID_REVERSE (trailLock50, buf=25) with max 5 trades vs unlimited
require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QM = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname:'api.kite.trade', path, headers:{'X-Kite-Version':'3','Authorization':`token ${API_KEY}:${ACCESS_TOKEN}`}, timeout:20000 }, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} });
    }); req.on('error',reject); req.on('timeout',()=>{req.destroy();reject(new Error('timeout'))}); req.end();
  });
}

async function fetchChunk(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`).catch(()=>null);
  if (!r||!r.data||!r.data.candles) return [];
  return r.data.candles.map(c => {
    const ist = new Date(new Date(c[0]).toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`, h:ist.getHours(), m:ist.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4] };
  });
}

async function fetchAll(start, end) {
  const all=[], endD=new Date(end); let cur=new Date(start);
  process.stdout.write(`Fetching ${start}→${end} `);
  while(cur<=endD){
    const ce=new Date(cur); ce.setDate(cur.getDate()+90); if(ce>endD)ce.setTime(endD.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate()+91);
    await new Promise(r=>setTimeout(r,300));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(c) { const m={}; for(const x of c){if(!m[x.date])m[x.date]=[];m[x.date].push(x);} return m; }

function trailLock50(sl, entry, dir, peak) {
  if(peak<=100)return sl;
  return dir==='CE'?Math.max(sl,entry+(peak-50)):Math.min(sl,entry-(peak-50));
}

function createState() {
  return {inTrade:false,dir:null,entry:0,sl:0,refHigh:0,firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0};
}

function processHybrid(state, prev, curr, isEOD) {
  const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
  const BUF=25, SL=100, EE=3;
  if(state.inTrade){
    if(state.isC1){
      state.isC1=false;
      const p=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;
      if(p<-EE){state.inTrade=false;state.firstDone=false;state.waitReEntry=false;state.reUsed=false;return{action:'EXIT_EARLY',pts:-EE};}
    }
    const slHit=state.dir==='CE'?curr.low<=state.sl:curr.high>=state.sl;
    if(slHit){
      const pts=state.dir==='CE'?state.sl-state.entry:state.entry-state.sl;
      const past=state.dir==='CE'?curr.close<state.sl:curr.close>state.sl;
      if(past&&!state.reUsed){
        const rd=state.dir==='CE'?'PE':'CE',re=curr.close,rs=rd==='CE'?re-SL:re+SL;
        state.dir=rd;state.entry=re;state.sl=rs;state.refHigh=rd==='CE'?curr.high:curr.low;
        state.reUsed=true;state.isC1=true;state.peakProfit=0;
        return{action:'REVERSE_ENTER',prevPts:pts};
      }
      state.inTrade=false;
      if(!state.reUsed)state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0;
      return{action:'EXIT_SL',pts};
    }
    const hp=state.dir==='CE'?curr.high-state.entry:state.entry-curr.low;
    if(hp>state.peakProfit){state.peakProfit=hp;state.sl=trailLock50(state.sl,state.entry,state.dir,state.peakProfit);}
    if(isEOD){const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;state.inTrade=false;return{action:'EXIT_EOD',pts};}
    return{action:'NONE'};
  }
  if(state.waitReEntry){
    const rt=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if(rt){const e=curr.close,sl=state.dir==='CE'?e-SL:e+SL;state.entry=e;state.sl=sl;state.inTrade=true;state.waitReEntry=false;state.reUsed=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER',dir:state.dir};}
    const da=state.dir==='CE'?state.refHigh-curr.close:curr.close-state.refHigh;
    if(da>150){
      state.waitReEntry=false;
      if(curr.close>bH+BUF){const e=curr.close;Object.assign(state,{dir:'CE',entry:e,sl:e-SL,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'CE'};}
      if(curr.close<bL-BUF){const e=curr.close;Object.assign(state,{dir:'PE',entry:e,sl:e+SL,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'PE'};}
      state.firstDone=false;state.reUsed=true;
    }
    return{action:'NONE'};
  }
  if(state.firstDone||isEOD)return{action:'NONE'};
  if(curr.close>bH+BUF){const e=curr.close;Object.assign(state,{dir:'CE',entry:e,sl:e-SL,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'CE'};}
  if(curr.close<bL-BUF){const e=curr.close;Object.assign(state,{dir:'PE',entry:e,sl:e+SL,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'PE'};}
  return{action:'NONE'};
}

function simDay(candles, maxTrades) {
  const state=createState();
  let pnl=0,wins=0,losses=0,trades=0;
  for(let i=1;i<candles.length;i++){
    const prev=candles[i-1],curr=candles[i];
    const isEOD=curr.h>15||(curr.h===15&&curr.m>=15);
    if(trades>=maxTrades&&!state.inTrade) break;
    const sig=processHybrid(state,prev,curr,isEOD);
    if(sig.action==='ENTER'){trades++;}
    else if(sig.action==='REVERSE_ENTER'){trades++;pnl+=sig.prevPts;if(sig.prevPts>0)wins++;else losses++;}
    else if(['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)){pnl+=sig.pts;if(sig.pts>0)wins++;else losses++;}
  }
  return{pnl,wins,losses,trades};
}

async function main() {
  const months = [
    {label:'JAN 2024', from:'2024-01-01', to:'2024-01-31'},
    {label:'FEB 2024', from:'2024-02-01', to:'2024-02-29'},
    {label:'MAR 2024', from:'2024-03-01', to:'2024-03-31'},
    {label:'APR 2024', from:'2024-04-01', to:'2024-04-30'},
    {label:'MAY 2024', from:'2024-05-01', to:'2024-05-31'},
    {label:'JUN 2024', from:'2024-06-01', to:'2024-06-30'},
    {label:'JUL 2024', from:'2024-07-01', to:'2024-07-31'},
    {label:'AUG 2024', from:'2024-08-01', to:'2024-08-31'},
    {label:'SEP 2024', from:'2024-09-01', to:'2024-09-30'},
    {label:'OCT 2024', from:'2024-10-01', to:'2024-10-31'},
    {label:'NOV 2024', from:'2024-11-01', to:'2024-11-30'},
    {label:'DEC 2024', from:'2024-12-01', to:'2024-12-31'},
    {label:'JAN 2025', from:'2025-01-01', to:'2025-01-31'},
    {label:'FEB 2025', from:'2025-02-01', to:'2025-02-28'},
    {label:'MAR 2025', from:'2025-03-01', to:'2025-03-31'},
    {label:'APR 2025', from:'2025-04-01', to:'2025-04-30'},
    {label:'MAY 2025', from:'2025-05-01', to:'2025-05-31'},
    {label:'JUN 2025', from:'2025-06-01', to:'2025-06-30'},
    {label:'JUL 2025', from:'2025-07-01', to:'2025-07-31'},
    {label:'AUG 2025', from:'2025-08-01', to:'2025-08-31'},
    {label:'SEP 2025', from:'2025-09-01', to:'2025-09-30'},
    {label:'OCT 2025', from:'2025-10-01', to:'2025-10-31'},
    {label:'NOV 2025', from:'2025-11-01', to:'2025-11-30'},
    {label:'DEC 2025', from:'2025-12-01', to:'2025-12-31'},
    {label:'JAN 2026', from:'2026-01-01', to:'2026-01-31'},
    {label:'FEB 2026', from:'2026-02-01', to:'2026-02-28'},
    {label:'MAR 2026', from:'2026-03-01', to:'2026-03-31'},
    {label:'APR 2026', from:'2026-04-01', to:'2026-04-30'},
    {label:'MAY 2026', from:'2026-05-01', to:'2026-05-13'},
  ];

  const SEP='─'.repeat(82);
  console.log('\n=== HYBRID_REVERSE  |  trailLock50  |  buf=25  |  1 lot = 30 qty ===');
  console.log(`  Strategy: same engine both columns. Only difference = max trades/day`);
  console.log(SEP);
  console.log(`  ${'Month'.padEnd(10)} │  MAX 5 trades/day (LIVE NOW)       │  UNLIMITED trades/day              │  Diff`);
  console.log(SEP);

  let tot5=0, totU=0, wd5=0, wdU=0, ld5=0, ldU=0;

  for(const {label,from,to} of months){
    const candles = await fetchAll(from, to);
    const byDay = groupByDay(candles);
    const dates = Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
    let m5=0, mU=0, mw5=0, mwU=0, ml5=0, mlU=0;
    for(const d of dates){
      const c=byDay[d];
      const r5=simDay(c,5);
      const rU=simDay(c,999);
      m5+=r5.pnl; mU+=rU.pnl;
      if(r5.pnl>0)mw5++; else if(r5.pnl<0)ml5++;
      if(rU.pnl>0)mwU++; else if(rU.pnl<0)mlU++;
    }
    tot5+=m5; totU+=mU; wd5+=mw5; wdU+=mwU; ld5+=ml5; ldU+=mlU;
    const d=dates.length;
    const s5=Math.round(m5), sU=Math.round(mU);
    const diff=sU-s5, diffR=(diff*QM);
    const sign5=s5>=0?'+':'', signU=sU>=0?'+':'', signD=diff>=0?'+':'';
    console.log(`  ${label.padEnd(10)} │  ${(sign5+s5+'pts').padEnd(8)}  ₹${(sign5+(s5*QM).toLocaleString('en-IN')).padEnd(10)}  ${mw5}W/${d}d  │  ${(signU+sU+'pts').padEnd(8)}  ₹${(signU+(sU*QM).toLocaleString('en-IN')).padEnd(10)}  ${mwU}W/${d}d  │  ${signD+diff}pts  ₹${signD+(diffR).toLocaleString('en-IN')}`);
  }

  console.log(SEP);
  const tS5=Math.round(tot5), tSU=Math.round(totU), tDiff=tSU-tS5;
  const s5=tot5>=0?'+':'', sU=totU>=0?'+':'', sD=tDiff>=0?'+':'';
  console.log(`  ${'TOTAL'.padEnd(10)} │  ${(s5+tS5+'pts').padEnd(8)}  ₹${(s5+(tS5*QM).toLocaleString('en-IN')).padEnd(10)}  ${wd5}W/${wd5+ld5}WL  │  ${(sU+tSU+'pts').padEnd(8)}  ₹${(sU+(tSU*QM).toLocaleString('en-IN')).padEnd(10)}  ${wdU}W/${wdU+ldU}WL  │  ${sD+tDiff}pts  ₹${sD+(tDiff*QM).toLocaleString('en-IN')}`);
  console.log(SEP);
  console.log(`\n  QM=₹${QM}/pt (30 qty × 0.5 delta)   Win days shown as W/total_trading_days`);
}

main().catch(console.error);

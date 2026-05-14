// Exact live bot backtest: buf=50, trailLock50, processHybridCandle, MAX_TRADES=1 (no re-entry, no reverse)
// vs TRAIL shadow: buf=25, trailDefault, processHybridCandle (same as live shadow)
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
  const url = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const r = await kiteGet(url);
    if (!r.data||!r.data.candles) return [];
    return r.data.candles.map(c => {
      const ist = new Date(new Date(c[0]).toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
      return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`, h:ist.getHours(), m:ist.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4] };
    });
  } catch(e) { process.stderr.write(`\nChunk err: ${e.message}\n`); return []; }
}

async function fetchAll(start, end) {
  const all = [], endD = new Date(end), startD = new Date(start);
  let cur = new Date(startD);
  process.stdout.write(`Fetching ${start} to ${end} `);
  while (cur <= endD) {
    const ce = new Date(cur); ce.setDate(cur.getDate()+90); if(ce>endD) ce.setTime(endD.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate()+91);
    await new Promise(r=>setTimeout(r,300));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m={};
  for(const c of candles){if(!m[c.date])m[c.date]=[];m[c.date].push(c);}
  return m;
}

// Trail functions
function trailDefault(sl, entry, dir, peak) {
  let lock=0;
  if(peak>=200)lock=100; else if(peak>=100)lock=20;
  if(lock===0)return sl;
  return dir==='CE'?Math.max(sl,entry+lock):Math.min(sl,entry-lock);
}
function trailLock50(sl, entry, dir, peak) {
  if(peak<=100)return sl;
  const lock=peak-50;
  return dir==='CE'?Math.max(sl,entry+lock):Math.min(sl,entry-lock);
}

// processHybridCandle — exact copy from strategy.js
function createState() {
  return {inTrade:false,dir:null,entry:0,sl:0,refHigh:0,firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0};
}
const HR_EARLY_EXIT=3, HR_SL_PTS=100;
function processHybridCandle(state, prev, curr, isEOD, trailFn, entryBuf) {
  const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
  if(state.inTrade){
    if(state.isC1){
      state.isC1=false;
      const p=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;
      if(p<-HR_EARLY_EXIT){state.inTrade=false;state.firstDone=false;state.waitReEntry=false;state.reUsed=false;return{action:'EXIT_EARLY',pts:-HR_EARLY_EXIT};}
    }
    const slHit=state.dir==='CE'?curr.low<=state.sl:curr.high>=state.sl;
    if(slHit){
      const pts=state.dir==='CE'?state.sl-state.entry:state.entry-state.sl;
      const past=state.dir==='CE'?curr.close<state.sl:curr.close>state.sl;
      if(past&&!state.reUsed){
        const rd=state.dir==='CE'?'PE':'CE',re=curr.close,rs=rd==='CE'?re-HR_SL_PTS:re+HR_SL_PTS;
        state.dir=rd;state.entry=re;state.sl=rs;state.refHigh=rd==='CE'?curr.high:curr.low;
        state.reUsed=true;state.isC1=true;state.peakProfit=0;
        return{action:'REVERSE_ENTER',dir:rd,prevPts:pts};
      }
      state.inTrade=false;
      if(!state.reUsed)state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0;
      return{action:'EXIT_SL',pts};
    }
    const hp=state.dir==='CE'?curr.high-state.entry:state.entry-curr.low;
    if(hp>state.peakProfit){state.peakProfit=hp;state.sl=trailFn(state.sl,state.entry,state.dir,state.peakProfit);}
    if(isEOD){const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;state.inTrade=false;return{action:'EXIT_EOD',pts};}
    return{action:'NONE'};
  }
  if(state.waitReEntry){
    const rt=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if(rt){const e=curr.close,sl=state.dir==='CE'?e-HR_SL_PTS:e+HR_SL_PTS;state.entry=e;state.sl=sl;state.inTrade=true;state.waitReEntry=false;state.reUsed=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER',dir:state.dir,price:e};}
    const da=state.dir==='CE'?state.refHigh-curr.close:curr.close-state.refHigh;
    if(da>150){
      state.waitReEntry=false;
      if(curr.close>bH+entryBuf){const e=curr.close;Object.assign(state,{dir:'CE',entry:e,sl:e-HR_SL_PTS,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'CE',price:e};}
      if(curr.close<bL-entryBuf){const e=curr.close;Object.assign(state,{dir:'PE',entry:e,sl:e+HR_SL_PTS,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'PE',price:e};}
      state.firstDone=false;state.reUsed=true;
    }
    return{action:'NONE'};
  }
  if(state.firstDone||isEOD)return{action:'NONE'};
  if(curr.close>bH+entryBuf){const e=curr.close;Object.assign(state,{dir:'CE',entry:e,sl:e-HR_SL_PTS,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'CE',price:e};}
  if(curr.close<bL-entryBuf){const e=curr.close;Object.assign(state,{dir:'PE',entry:e,sl:e+HR_SL_PTS,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0});return{action:'ENTER',dir:'PE',price:e};}
  return{action:'NONE'};
}

function simDay(candles, trailFn, entryBuf, maxTrades) {
  const state=createState();
  let pnl=0,wins=0,losses=0,trades=0;
  for(let i=1;i<candles.length;i++){
    const prev=candles[i-1],curr=candles[i];
    const isEOD=curr.h>15||(curr.h===15&&curr.m>=15);
    if(trades>=maxTrades&&!state.inTrade)break; // max trades reached
    const sig=processHybridCandle(state,prev,curr,isEOD,trailFn,entryBuf);
    if(sig.action==='ENTER'){trades++;}
    else if(sig.action==='REVERSE_ENTER'){trades++;pnl+=sig.prevPts;if(sig.prevPts>0)wins++;else losses++;}
    else if(['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)){pnl+=sig.pts;if(sig.pts>0)wins++;else losses++;}
  }
  return{pnl,wins,losses,trades};
}

async function runMonths(label1, label2, label3, months) {
  let t1=0,t2=0,t3=0,w1=0,w2=0,w3=0,ld1=0,ld2=0,ld3=0;
  const sep='─'.repeat(100);
  console.log(sep);
  console.log(`  ${'Month'.padEnd(12)} │  ${label1.padEnd(28)} │  ${label2.padEnd(28)} │  ${label3.padEnd(28)}`);
  console.log(sep);
  for(const {label,from,to} of months){
    const candles=await fetchAll(from,to);
    const byDay=groupByDay(candles);
    const dates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
    let m1=0,m2=0,m3=0,mw1=0,mw2=0,mw3=0,mld1=0,mld2=0,mld3=0;
    for(const d of dates){
      const c=byDay[d];
      const r1=simDay(c,trailLock50,50,1);  // LIVE BOT exact: buf=50, trailLock50, max=1
      const r2=simDay(c,trailDefault,25,5); // TRAIL shadow exact: buf=25, trailDefault, max=5
      const r3=simDay(c,trailLock50,25,5);  // trailLock50 buf=25 max=5 (prev backtest)
      m1+=r1.pnl;m2+=r2.pnl;m3+=r3.pnl;
      if(r1.pnl>0)mw1++;else if(r1.pnl<0)mld1++;
      if(r2.pnl>0)mw2++;else if(r2.pnl<0)mld2++;
      if(r3.pnl>0)mw3++;else if(r3.pnl<0)mld3++;
    }
    t1+=m1;t2+=m2;t3+=m3;w1+=mw1;w2+=mw2;w3+=mw3;ld1+=mld1;ld2+=mld2;ld3+=mld3;
    const fmt=(v,d)=>`${Math.round(v)>=0?'+':''}${Math.round(v)}pts  +₹${Math.abs(Math.round(v)*QM).toLocaleString('en-IN')}  W${mw1||mw2||mw3?((v===m1?mw1:v===m2?mw2:mw3)):0}/${dates.length}`;
    const f=(v,w,n)=>`${Math.round(v)>=0?'+':'' }${Math.round(v)}pts  ₹${(Math.round(v)*QM>=0?'+':'-')+'₹'+Math.abs(Math.round(v)*QM).toLocaleString('en-IN')}  ${w}W/${n}d`;
    console.log(`  ${label.padEnd(12)} │  ${f(m1,mw1,dates.length).padEnd(28)} │  ${f(m2,mw2,dates.length).padEnd(28)} │  ${f(m3,mw3,dates.length).padEnd(28)}`);
  }
  console.log(sep);
  // grand total
  const allDays = months.reduce((a,_)=>a,0); // placeholder
  console.log(`  ${'TOTAL'.padEnd(12)} │  ${(t1>=0?'+':'')+Math.round(t1)}pts  ₹${(t1*QM>=0?'+':'-')+'₹'+Math.abs(Math.round(t1)*QM).toLocaleString('en-IN')}  ${w1}W/${w1+ld1}WL  │  ${(t2>=0?'+':'')+Math.round(t2)}pts  ₹${(t2*QM>=0?'+':'-')+'₹'+Math.abs(Math.round(t2)*QM).toLocaleString('en-IN')}  ${w2}W/${w2+ld2}WL  │  ${(t3>=0?'+':'')+Math.round(t3)}pts  ₹${(t3*QM>=0?'+':'-')+'₹'+Math.abs(Math.round(t3)*QM).toLocaleString('en-IN')}  ${w3}W/${w3+ld3}WL`);
  console.log(sep);
}

async function main() {
  console.log('\n=== CORRECTED BACKTEST: Exact live bot vs shadows ===');
  console.log('  TICK TRAIL (live) = buf=50, trailLock50, max 1 trade/day');
  console.log('  TRAIL shadow      = buf=25, trailDefault, max 5 trades/day');
  console.log('  L50 buf25         = buf=25, trailLock50,  max 5 trades/day (prev backtest)\n');

  const months = [
    {label:'FEB 2026', from:'2026-02-01', to:'2026-02-28'},
    {label:'MAR 2026', from:'2026-03-01', to:'2026-03-31'},
    {label:'APR 2026', from:'2026-04-01', to:'2026-04-30'},
    {label:'MAY 2026', from:'2026-05-01', to:'2026-05-13'},
  ];

  await runMonths('TICK TRAIL (live exact)', 'TRAIL shadow (exact)', 'L50 buf25 (prev backtest)', months);
}

main().catch(console.error);

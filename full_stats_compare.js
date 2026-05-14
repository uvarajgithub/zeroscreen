// Full stats comparison: Rank | Strategy | TotalPts | TotalRs | PremPts | WinDay% | MaxDD | Avg/day
require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QM = 15, DELTA = 0.5;

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

function trailDefault(sl, entry, dir, peak) {
  let lock=0; if(peak>=200)lock=100; else if(peak>=100)lock=20; if(lock===0)return sl;
  return dir==='CE'?Math.max(sl,entry+lock):Math.min(sl,entry-lock);
}
function trailLock50(sl, entry, dir, peak) {
  if(peak<=100)return sl; return dir==='CE'?Math.max(sl,entry+(peak-50)):Math.min(sl,entry-(peak-50));
}

function createState() {
  return {inTrade:false,dir:null,entry:0,sl:0,refHigh:0,firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0};
}

function processHybrid(state, prev, curr, isEOD, trailFn, BUF) {
  const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
  const SL=100, EE=3;
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
      state.peakProfit=0; return{action:'EXIT_SL',pts};
    }
    const hp=state.dir==='CE'?curr.high-state.entry:state.entry-curr.low;
    if(hp>state.peakProfit){state.peakProfit=hp;state.sl=trailFn(state.sl,state.entry,state.dir,state.peakProfit);}
    if(isEOD){const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;state.inTrade=false;return{action:'EXIT_EOD',pts};}
    return{action:'NONE'};
  }
  if(state.waitReEntry){
    const rt=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if(rt){const e=curr.close,sl=state.dir==='CE'?e-SL:e+SL;state.entry=e;state.sl=sl;state.inTrade=true;state.waitReEntry=false;state.reUsed=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER'};}
    const da=state.dir==='CE'?state.refHigh-curr.close:curr.close-state.refHigh;
    if(da>150){
      state.waitReEntry=false;
      if(curr.close>bH+BUF){const e=curr.close;Object.assign(state,{dir:'CE',entry:e,sl:e-SL,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0});return{action:'ENTER'};}
      if(curr.close<bL-BUF){const e=curr.close;Object.assign(state,{dir:'PE',entry:e,sl:e+SL,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0});return{action:'ENTER'};}
      state.firstDone=false;state.reUsed=true;
    }
    return{action:'NONE'};
  }
  if(state.firstDone||isEOD)return{action:'NONE'};
  if(curr.close>bH+BUF){const e=curr.close;Object.assign(state,{dir:'CE',entry:e,sl:e-SL,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0});return{action:'ENTER'};}
  if(curr.close<bL-BUF){const e=curr.close;Object.assign(state,{dir:'PE',entry:e,sl:e+SL,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0});return{action:'ENTER'};}
  return{action:'NONE'};
}

function runStrategy(allDates, byDay, trailFn, buf, maxT) {
  let totalPts=0, winDays=0, lossDays=0, equity=0, peak=0, maxDD=0;
  let totalTrades=0, winTrades=0;
  const eq=[];
  for(const date of allDates){
    const candles=byDay[date];
    const state=createState();
    let dayPnl=0, trades=0;
    for(let i=1;i<candles.length;i++){
      const prev=candles[i-1],curr=candles[i];
      const isEOD=curr.h>15||(curr.h===15&&curr.m>=15);
      if(trades>=maxT&&!state.inTrade)break;
      const sig=processHybrid(state,prev,curr,isEOD,trailFn,buf);
      if(sig.action==='ENTER'){trades++;}
      else if(sig.action==='REVERSE_ENTER'){trades++;dayPnl+=sig.prevPts;if(sig.prevPts>0)winTrades++;totalTrades++;}
      else if(['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)){
        dayPnl+=sig.pts; totalTrades++;
        if(sig.pts>0)winTrades++;
      }
    }
    totalPts+=dayPnl;
    if(dayPnl>0)winDays++; else if(dayPnl<0)lossDays++;
    equity+=dayPnl;
    if(equity>peak)peak=equity;
    if(peak-equity>maxDD)maxDD=peak-equity;
    eq.push(equity);
  }
  const days=allDates.length;
  return {
    totalPts: Math.round(totalPts),
    totalRs: Math.round(totalPts*QM),
    premPts: Math.round(totalPts*DELTA),
    winDayPct: ((winDays/days)*100).toFixed(1),
    winDays, lossDays, days,
    maxDD: Math.round(maxDD),
    maxDDRs: Math.round(maxDD*QM),
    avgPerDay: (totalPts/days).toFixed(1),
    totalTrades, winTrades,
    tradeWinPct: totalTrades>0?((winTrades/totalTrades)*100).toFixed(1):'0'
  };
}

async function main() {
  const allCandles = await fetchAll('2021-01-01','2026-05-13');
  const byDay = groupByDay(allCandles);
  const allDates = Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 13 2026)\n`);

  const strategies = [
    { name:'TICK TRAIL Unlimited (LIVE)', trailFn:trailLock50,  buf:25, maxT:999 },
    { name:'TICK TRAIL Max5 (prev live)', trailFn:trailLock50,  buf:25, maxT:5   },
    { name:'TRAIL Unlimited',             trailFn:trailDefault, buf:25, maxT:999 },
    { name:'TRAIL Max5 (shadow)',         trailFn:trailDefault, buf:25, maxT:5   },
    { name:'TICK TRAIL buf50 Unlimited',  trailFn:trailLock50,  buf:50, maxT:999 },
  ];

  const results = strategies.map(s => ({ ...s, ...runStrategy(allDates, byDay, s.trailFn, s.buf, s.maxT) }));
  results.sort((a,b)=>b.totalPts-a.totalPts);

  const SEP='─'.repeat(118);
  console.log(SEP);
  console.log(`  ${'#'.padEnd(2)}  ${'Strategy'.padEnd(28)}  ${'TotalPts'.padStart(9)}  ${'Total ₹'.padStart(12)}  ${'PremPts'.padStart(8)}  ${'WinDay%'.padStart(8)}  ${'MaxDD pts'.padStart(10)}  ${'MaxDD ₹'.padStart(10)}  ${'Avg/day'.padStart(8)}`);
  console.log(SEP);

  results.forEach((r,i) => {
    const s = r.totalPts>=0?'+':'';
    const dd = r.maxDD>0?'-'+r.maxDD:r.maxDD;
    const ddR = r.maxDDRs>0?'-₹'+r.maxDDRs.toLocaleString('en-IN'):r.maxDDRs;
    const avg = Number(r.avgPerDay)>=0?'+'+r.avgPerDay:r.avgPerDay;
    console.log(
      `  ${String(i+1).padEnd(2)}  ${r.name.padEnd(28)}  ${(s+r.totalPts.toLocaleString('en-IN')).padStart(9)}  ${(s+'₹'+Math.abs(r.totalRs).toLocaleString('en-IN')).padStart(12)}  ${(s+r.premPts.toLocaleString('en-IN')).padStart(8)}  ${(r.winDayPct+'%').padStart(8)}  ${String(dd).padStart(10)}  ${ddR.padStart(10)}  ${avg.padStart(8)}`
    );
  });

  console.log(SEP);
  console.log(`\n  Trade-level stats:`);
  console.log(`  ${'Strategy'.padEnd(28)}  ${'Total Trades'.padStart(13)}  ${'Win Trades'.padStart(11)}  ${'Trade Win%'.padStart(11)}  ${'Win Days'.padStart(9)}  ${'Loss Days'.padStart(10)}`);
  console.log(SEP);
  results.forEach(r => {
    console.log(`  ${r.name.padEnd(28)}  ${String(r.totalTrades).padStart(13)}  ${String(r.winTrades).padStart(11)}  ${(r.tradeWinPct+'%').padStart(11)}  ${String(r.winDays).padStart(9)}  ${String(r.lossDays).padStart(10)}`);
  });
  console.log(SEP);
  console.log(`\n  QM=₹${QM}/pt  |  PremPts = IdxPts×${DELTA}  |  1 lot = 30 qty  |  ${allDates.length} trading days`);
}

main().catch(console.error);

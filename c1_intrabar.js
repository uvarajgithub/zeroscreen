// C1 intrabar simulation:
// Compares 3 scenarios using 5-year 15-min data:
//   A) No C1 at all
//   B) C1=3pts on 15-min CLOSE (current backtest / live bot behavior)
//   C) C1=3pts INTRABAR  — exit if candle LOW/HIGH crosses entry±3 (simulates 1-min monitoring)
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

// c1Mode: 'none' | 'close' | 'intrabar'
function processHybrid(state, prev, curr, isEOD, c1Mode) {
  const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
  const SL=100, BUF=25, C1=3;

  if(state.inTrade){
    // C1 check
    if(state.isC1){
      state.isC1=false;
      if(c1Mode!=='none'){
        let triggered=false;
        if(c1Mode==='close'){
          const p=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;
          triggered = p < -C1;
        } else if(c1Mode==='intrabar'){
          // fires if price touched entry-3 at ANY point (low/high)
          const worst=state.dir==='CE'?curr.low-state.entry:state.entry-curr.high;
          triggered = worst < -C1;
        }
        if(triggered){
          state.inTrade=false;state.firstDone=false;state.waitReEntry=false;state.reUsed=false;
          return{action:'EXIT_EARLY',pts:-C1};
        }
      }
    }
    // SL check
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
    // Trail
    const hp=state.dir==='CE'?curr.high-state.entry:state.entry-curr.low;
    if(hp>state.peakProfit){state.peakProfit=hp;state.sl=trailLock50(state.sl,state.entry,state.dir,state.peakProfit);}
    if(isEOD){const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;state.inTrade=false;return{action:'EXIT_EOD',pts};}
    return{action:'NONE'};
  }

  if(state.waitReEntry){
    const rt=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if(rt){
      const e=curr.close,sl=state.dir==='CE'?e-SL:e+SL;
      state.entry=e;state.sl=sl;state.inTrade=true;state.waitReEntry=false;
      state.reUsed=true;state.isC1=true;state.peakProfit=0;
      return{action:'ENTER'};
    }
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

function runStrategy(allDates, byDay, c1Mode) {
  let totalPts=0, winDays=0, lossDays=0, equity=0, peak=0, maxDD=0, totalTrades=0, winTrades=0, c1Exits=0;
  for(const date of allDates){
    const candles=byDay[date];
    const state={inTrade:false,dir:null,entry:0,sl:0,refHigh:0,firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0};
    let dayPnl=0;
    for(let i=1;i<candles.length;i++){
      const prev=candles[i-1],curr=candles[i];
      const isEOD=curr.h>15||(curr.h===15&&curr.m>=15);
      const sig=processHybrid(state,prev,curr,isEOD,c1Mode);
      if(sig.action==='ENTER'){totalTrades++;}
      else if(sig.action==='REVERSE_ENTER'){totalTrades++;dayPnl+=sig.prevPts;if(sig.prevPts>0)winTrades++;}
      else if(sig.action==='EXIT_EARLY'){dayPnl+=sig.pts;totalTrades++;c1Exits++;} // EXIT_EARLY counted as loss
      else if(sig.action==='EXIT_SL'||sig.action==='EXIT_EOD'){dayPnl+=sig.pts;totalTrades++;if(sig.pts>0)winTrades++;}
    }
    totalPts+=dayPnl;
    if(dayPnl>0)winDays++; else if(dayPnl<0)lossDays++;
    equity+=dayPnl; if(equity>peak)peak=equity;
    if(peak-equity>maxDD)maxDD=peak-equity;
  }
  const days=allDates.length;
  return { totalPts:Math.round(totalPts), totalRs:Math.round(totalPts*QM), winDayPct:((winDays/days)*100).toFixed(1),
    winDays, lossDays, maxDD:Math.round(maxDD), maxDDRs:Math.round(maxDD*QM),
    avgPerDay:(totalPts/days).toFixed(1), totalTrades, winTrades, c1Exits,
    tradeWinPct:totalTrades>0?((winTrades/totalTrades)*100).toFixed(1):'0' };
}

async function main() {
  const allCandles = await fetchAll('2021-01-01','2026-05-13');
  const byDay = groupByDay(allCandles);
  const allDates = Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 13 2026)\n`);

  const strategies = [
    { name:'C1=3pts on 15-min CLOSE  (backtest match)', c1Mode:'close'    },
    { name:'C1=3pts INTRABAR  (1-min sim, live-like)',  c1Mode:'intrabar' },
    { name:'No C1 at all',                              c1Mode:'none'     },
  ];

  const results = strategies.map(s => ({ ...s, ...runStrategy(allDates, byDay, s.c1Mode) }));

  const SEP='─'.repeat(118);
  console.log(SEP);
  console.log(`  ${'Strategy'.padEnd(42)}  ${'TotalPts'.padStart(9)}  ${'Total ₹'.padStart(12)}  ${'WinDay%'.padStart(8)}  ${'MaxDD pts'.padStart(10)}  ${'Avg/day'.padStart(8)}  ${'C1 Exits'.padStart(9)}`);
  console.log(SEP);
  results.forEach((r,i) => {
    const s=r.totalPts>=0?'+':'';
    const avg=Number(r.avgPerDay)>=0?'+'+r.avgPerDay:r.avgPerDay;
    console.log(`  ${String(i+1).padEnd(2)}  ${r.name.padEnd(40)}  ${(s+r.totalPts.toLocaleString('en-IN')).padStart(9)}  ${(s+'₹'+Math.abs(r.totalRs).toLocaleString('en-IN')).padStart(12)}  ${(r.winDayPct+'%').padStart(8)}  ${('-'+r.maxDD).padStart(10)}  ${avg.padStart(8)}  ${String(r.c1Exits).padStart(9)}`);
  });
  console.log(SEP);

  // Show May 14 simulation
  const may14=['2026-05-14'];
  console.log(`\n  May 14 simulation (single day):`);
  console.log(SEP);
  strategies.forEach(s => {
    const r = runStrategy(may14.filter(d=>byDay[d]), byDay, s.c1Mode);
    console.log(`  ${s.name.padEnd(42)}  ${(r.totalPts>=0?'+':'')+r.totalPts} pts  |  ${r.totalTrades} trades  |  ${r.c1Exits} C1 exits`);
  });
  console.log(SEP);
  console.log(`  Actual bot May 14: +430 pts  |  6 trades  |  3 C1 exits`);
  console.log(SEP);
}

main().catch(console.error);

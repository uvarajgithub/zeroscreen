// trending_capture.js — find one-sided/trending days, measure how much move we capture
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

// ── Classify day as trending/one-sided
function classifyDay(cs) {
  const open  = cs[0].open;
  const close = cs[cs.length-1].close;
  const high  = Math.max(...cs.map(c=>c.high));
  const low   = Math.min(...cs.map(c=>c.low));
  const range = high - low;
  const move  = close - open;
  const absMv = Math.abs(move);
  // How close is close to the extreme?
  const closePctFromHigh = (high-close)/range;
  const closePctFromLow  = (close-low)/range;
  // Trending: moved >300 pts AND close within 25% of the extreme
  if(move> 300 && closePctFromHigh<0.25) return {type:'TREND_UP', move, range};
  if(move<-300 && closePctFromLow <0.25) return {type:'TREND_DN', move, range};
  // Strong one-sided: move > 40% of range
  if(absMv/range > 0.55) return {type:'ONE_SIDE', move, range};
  return {type:'MIXED', move, range};
}

// Get signal days
const signals=[];
for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  let signal=null, rule=null;
  if(c1.bull===c2.bull){ signal=c1.bull?'CE':'PE'; rule='SAME'; }
  else if(c2.body_size>c1.body_size){ signal=c2.bull?'CE':'PE'; rule='C2BIG'; }
  else { signal=null; rule='SKIP'; }
  const dayInfo = classifyDay(cs);
  signals.push({date,signal,rule,c1,c2,cs,dayInfo});
}

// ── All days classified
console.log('\n══ ALL 28 DAYS — CLASSIFICATION');
console.log('Date         Type       Move   Range  Signal  Rule');
console.log('─'.repeat(60));
for(const {date,signal,rule,dayInfo} of signals.concat(
  // also show skipped days
  Object.entries(data.days).filter(([d])=>!signals.find(s=>s.date===d)).map(([date,cs])=>({
    date,signal:null,rule:'SKIP',cs,dayInfo:classifyDay(cs)
  }))
).sort((a,b)=>a.date<b.date?-1:1)){
  const d=dayInfo;
  console.log(
    `${date}  ${d.type.padEnd(10)} ${((d.move>=0?'+':'')+d.move.toFixed(0)).padStart(7)}  ${d.range.toFixed(0).padStart(6)}  ${(signal||'-').padEnd(6)}  ${rule}`
  );
}

// ── Focus: TREND + ONE_SIDE days only, with signal
console.log('\n══ TRENDING/ONE-SIDED DAYS WITH SIGNAL — Point Capture Analysis');
console.log('(How much of the total day move did we capture?)');
console.log('');
console.log('Date         Type      TotalMove  C2Entry  BBEntry   C2Capture%  BBCapture%  BB_EOD_Pts');
console.log('─'.repeat(95));

let c2TotalPts=0, bbTotalPts=0, trendDays=0;
const trendTrades=[];

for(const t of signals){
  const {date,signal,rule,c1,c2,cs,dayInfo} = t;
  if(!signal) continue;
  if(dayInfo.type==='MIXED') continue; // skip mixed days

  trendDays++;
  const totalMove = Math.abs(dayInfo.move);
  const eodClose  = cs[cs.length-1].close;

  // C2 entry P&L
  const c2Pnl = signal==='CE' ? eodClose-c2.close : c2.close-eodClose;

  // Body breakout entry
  const bodyBreakHigh = Math.max(c1.body_high, c2.body_high);
  const bodyBreakLow  = Math.min(c1.body_low,  c2.body_low);
  let bbEntry=null, bbTime=null;
  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(signal==='CE'&&c.close>bodyBreakHigh){bbEntry=c.close;bbTime=c.time;break;}
    if(signal==='PE'&&c.close<bodyBreakLow ){bbEntry=c.close;bbTime=c.time;break;}
  }
  const bbPnl = bbEntry ? (signal==='CE'?eodClose-bbEntry:bbEntry-eodClose) : null;

  c2TotalPts += c2Pnl;
  if(bbPnl!==null) bbTotalPts += bbPnl;

  const c2Pct = totalMove>0 ? Math.round(c2Pnl/totalMove*100) : 0;
  const bbPct = (bbPnl!==null&&totalMove>0) ? Math.round(bbPnl/totalMove*100) : null;

  trendTrades.push({date,signal,rule,dayInfo,c2Pnl,bbPnl,bbEntry,bbTime,totalMove,eodClose});

  console.log(
    `${date}  ${dayInfo.type.padEnd(9)} ` +
    `move=${String(totalMove.toFixed(0)).padStart(6)}` +
    `  c2=${c2.close.toFixed(0).padStart(7)}  bb=${bbEntry?bbEntry.toFixed(0).padStart(7):'  NONE '}` +
    `  c2cap=${String(c2Pct+'%').padStart(5)}` +
    `  bbcap=${bbPct!==null?String(bbPct+'%').padStart(5):'  N/A'}` +
    `  bbPnl=${bbPnl!==null?(bbPnl>=0?'+':'')+bbPnl.toFixed(0):'N/A'}`
  );
}

console.log(`\nTrending/one-sided signal days: ${trendDays}`);
console.log(`C2-close total pts : ${c2TotalPts>=0?'+':''}${c2TotalPts.toFixed(0)}  Rs ${(c2TotalPts*15>=0?'+':'-')+Math.abs(Math.round(c2TotalPts*15)).toLocaleString('en-IN')}`);
console.log(`BB-entry  total pts: ${bbTotalPts>=0?'+':''}${bbTotalPts.toFixed(0)}  Rs ${(bbTotalPts*15>=0?'+':'-')+Math.abs(Math.round(bbTotalPts*15)).toLocaleString('en-IN')}`);

// ── Now show: what was the MAXIMUM possible capture on each trend day (from any entry)?
console.log('\n══ MAXIMUM POSSIBLE vs ACTUAL CAPTURE on Trend Days');
console.log('Date         Sig  TotalMove  MaxPossible  C2Got    BBGot    C2%    BB%');
console.log('─'.repeat(78));
for(const t of trendTrades){
  const {date,signal,dayInfo,c2Pnl,bbPnl,c2,bbEntry} = t;
  const cs = data.days[date];
  const high=Math.max(...cs.map(c=>c.high));
  const low =Math.min(...cs.map(c=>c.low));
  // Realistic max = from C2 close to day extreme
  const realisticMax = signal==='CE' ? high-c2.close : c2.close-low;
  const c2Pct = realisticMax>0?Math.round(c2Pnl/realisticMax*100):0;
  const bbPct = (bbPnl!==null&&realisticMax>0)?Math.round(bbPnl/realisticMax*100):null;
  console.log(
    `${date}  ${signal}  move=${dayInfo.move.toFixed(0).padStart(7)}` +
    `  max=${realisticMax.toFixed(0).padStart(7)}` +
    `  c2=${((c2Pnl>=0?'+':'')+c2Pnl.toFixed(0)).padStart(7)}` +
    `  bb=${bbPnl!==null?(bbPnl>=0?'+':'')+bbPnl.toFixed(0):'N/A'.padStart(6)}` +
    `  c2%=${String(c2Pct+'%').padStart(5)}` +
    `  bb%=${bbPct!==null?bbPct+'%':'N/A'}`
  );
}

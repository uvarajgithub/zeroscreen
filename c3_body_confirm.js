// c3_body_confirm.js — C1>C2 opposite: enter only if C3 body > C2 body (momentum building)
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ REVISED C3 RULE: C1>C2 opposite → enter only if C3 body > C2 body');
console.log('Entry: body breakout of C2+C3 range (confirms momentum building in C2 direction)');
console.log('');
console.log('Date         Rule              Signal  Entry@  EntryPx  DayMove  EOD_Pnl  Result');
console.log('─'.repeat(85));

let wins=0,losses=0,noEntry=0,totalPts=0;
const allTrades=[];

for(const [date,cs] of days){
  if(cs.length<4) continue;
  const c1=cs[0], c2=cs[1], c3=cs[2];
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const eodClose = cs[cs.length-1].close;

  let signal=null, rule=null, breakHigh=null, breakLow=null, startIdx=2;

  if(c1.bull === c2.bull){
    // Rule 1: same color → body breakout of C1+C2
    signal    = c1.bull ? 'CE' : 'PE';
    rule      = 'C1C2_SAME';
    breakHigh = Math.max(c1.body_high, c2.body_high);
    breakLow  = Math.min(c1.body_low,  c2.body_low);
    startIdx  = 2;

  } else if(c2.body_size > c1.body_size){
    // Rule 2: opposite but C2 bigger → body breakout of C1+C2
    signal    = c2.bull ? 'CE' : 'PE';
    rule      = 'C2>C1_BODY';
    breakHigh = Math.max(c1.body_high, c2.body_high);
    breakLow  = Math.min(c1.body_low,  c2.body_low);
    startIdx  = 2;

  } else {
    // C1 > C2 body, opposite — check C3
    // NEW: only enter if C3 same direction as C2 AND C3 body > C2 body
    if(c3.bull === c2.bull && c3.body_size > c2.body_size){
      signal    = c2.bull ? 'CE' : 'PE';
      rule      = 'C3>C2_BODY';
      breakHigh = Math.max(c2.body_high, c3.body_high);
      breakLow  = Math.min(c2.body_low,  c3.body_low);
      startIdx  = 3; // scan from C4
    } else if(c3.bull === c2.bull && c3.body_size <= c2.body_size){
      rule = 'SKIP(C3<=C2)';
    } else {
      rule = 'SKIP(C3!=C2)';
    }
  }

  if(!signal){
    noEntry++;
    console.log(`${date}  ${rule.padEnd(16)}  -       -       -        ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  -        -`);
    continue;
  }

  // Find body breakout
  let entryPx=null, entryTime=null;
  for(let i=startIdx; i<cs.length; i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(signal==='CE' && c.close > breakHigh){ entryPx=c.close; entryTime=c.time; break; }
    if(signal==='PE' && c.close < breakLow ){ entryPx=c.close; entryTime=c.time; break; }
  }

  if(!entryPx){
    noEntry++;
    console.log(`${date}  ${rule.padEnd(16)}  ${signal}  NO_BREAK         ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  -        SKIP`);
    continue;
  }

  const eodPnl = signal==='CE' ? eodClose-entryPx : entryPx-eodClose;
  totalPts += eodPnl;
  if(eodPnl>0) wins++; else losses++;
  allTrades.push({date,signal,rule,entryPx,entryTime,dayMove,eodPnl,c1,c2,c3});

  console.log(
    `${date}  ${rule.padEnd(16)}  ${signal}  @${entryTime}  ${entryPx.toFixed(0).padStart(7)}` +
    `  ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}` +
    `  ${(eodPnl>=0?'+':'')+eodPnl.toFixed(0).padStart(7)}` +
    `  ${eodPnl>0?'✓ WIN':'✗ LOSS'}`
  );
}

console.log(`\nEntries : ${wins+losses}  |  Wins: ${wins}  Losses: ${losses}  |  Win%: ${Math.round(wins/(wins+losses)*100)}%`);
console.log(`Skipped : ${noEntry} days`);
console.log(`EOD P&L : ${totalPts>=0?'+':''}${totalPts.toFixed(0)} pts  =  Rs ${(totalPts*15>=0?'+':'-')+Math.abs(Math.round(totalPts*15)).toLocaleString('en-IN')} (no SL, hold EOD)`);

// Breakdown by rule
console.log('\n══ BREAKDOWN BY RULE');
const rules={};
for(const t of allTrades){
  if(!rules[t.rule]) rules[t.rule]={w:0,l:0,pts:0};
  if(t.eodPnl>0) rules[t.rule].w++; else rules[t.rule].l++;
  rules[t.rule].pts+=t.eodPnl;
}
for(const [r,s] of Object.entries(rules)){
  const tot=s.w+s.l;
  console.log(`  ${r.padEnd(16)}  ${s.w}W ${s.l}L  ${Math.round(s.w/tot*100)}%  pts=${s.pts>=0?'+':''}${s.pts.toFixed(0)}  Rs${(s.pts*15>=0?'+':'-')+Math.abs(Math.round(s.pts*15)).toLocaleString('en-IN')}`);
}

// Show C3>C2 trades detail
console.log('\n══ C3>C2_BODY trades detail:');
console.log('Date         C1body  C2body  C3body  C3>C2?  Signal  EOD_Pnl');
console.log('─'.repeat(62));
for(const [date,cs] of days){
  if(cs.length<4) continue;
  const c1=cs[0],c2=cs[1],c3=cs[2];
  if(c1.bull===c2.bull) continue;          // only opposite
  if(c2.body_size>=c1.body_size) continue; // only C1>C2
  const c3bigger = c3.bull===c2.bull && c3.body_size>c2.body_size;
  const t = allTrades.find(t=>t.date===date&&t.rule==='C3>C2_BODY');
  console.log(
    `${date}  C1=${String(c1.body_size.toFixed(0)).padStart(5)}` +
    `  C2=${String(c2.body_size.toFixed(0)).padStart(5)}` +
    `  C3=${String(c3.body_size.toFixed(0)).padStart(5)}` +
    `  C3>C2=${c3bigger?'YES':'NO '}` +
    `  ${c3bigger?(c2.bull?'CE':'PE'):'-     '}` +
    `  ${t?(t.eodPnl>=0?'+':'')+t.eodPnl.toFixed(0):'skipped'}`
  );
}

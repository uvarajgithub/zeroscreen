// c3_confirm.js — when C1>C2 body (opposite), wait for C3 to confirm C2 direction
// Logic:
//   Normal: C1+C2 same → body breakout of C1+C2 range
//   OR    : C2>C1 body (opposite) → body breakout of C1+C2 range
//   NEW   : C1>C2 body (opposite) → wait for C3
//             if C3 same as C2 → body breakout of C2+C3 range → enter
//             if C3 same as C1 → skip
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ FULL ENTRY LOGIC with C3 confirmation for C1>C2 opposite days');
console.log('');
console.log('Date         Rule          Signal  Entry@  EntryPx  DayMove  EOD_Pnl  Result');
console.log('─'.repeat(82));

let wins=0,losses=0,noEntry=0,totalPts=0;
const allTrades=[];

for(const [date,cs] of days){
  if(cs.length<4) continue;
  const c1=cs[0], c2=cs[1], c3=cs[2];
  const dayMove = cs[cs.length-1].close - cs[0].open;
  const eodClose = cs[cs.length-1].close;
  const dayHigh  = Math.max(...cs.map(c=>c.high));
  const dayLow   = Math.min(...cs.map(c=>c.low));

  let signal=null, rule=null, breakHigh=null, breakLow=null;

  if(c1.bull === c2.bull){
    // Rule 1: same color → body breakout of C1+C2
    signal    = c1.bull ? 'CE' : 'PE';
    rule      = 'C1C2_SAME';
    breakHigh = Math.max(c1.body_high, c2.body_high);
    breakLow  = Math.min(c1.body_low,  c2.body_low);

  } else if(c2.body_size > c1.body_size){
    // Rule 2: opposite but C2 bigger → body breakout of C1+C2
    signal    = c2.bull ? 'CE' : 'PE';
    rule      = 'C2>C1_BODY';
    breakHigh = Math.max(c1.body_high, c2.body_high);
    breakLow  = Math.min(c1.body_low,  c2.body_low);

  } else {
    // Rule 3 (NEW): C1>C2 opposite → check C3
    if(c3.bull === c2.bull){
      // C3 confirms C2 direction → body breakout of C2+C3 range
      signal    = c2.bull ? 'CE' : 'PE';
      rule      = 'C3_CONFIRMS_C2';
      breakHigh = Math.max(c2.body_high, c3.body_high);
      breakLow  = Math.min(c2.body_low,  c3.body_low);
    } else {
      // C3 confirms C1 → skip
      rule = 'SKIP(C3=C1)';
    }
  }

  if(!signal){
    noEntry++;
    console.log(`${date}  ${rule.padEnd(14)}  -       -       -        ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  -        -`);
    continue;
  }

  // Find body breakout from C4 onwards (or C3+ for SAME/C2BIG rules)
  const startIdx = rule === 'C3_CONFIRMS_C2' ? 3 : 2;
  let entryPx=null, entryTime=null;

  for(let i=startIdx; i<cs.length; i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(signal==='CE' && c.close > breakHigh){ entryPx=c.close; entryTime=c.time; break; }
    if(signal==='PE' && c.close < breakLow ){ entryPx=c.close; entryTime=c.time; break; }
  }

  if(!entryPx){
    noEntry++;
    console.log(`${date}  ${rule.padEnd(14)}  ${signal}  NO_BREAKOUT      ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  -        SKIP`);
    continue;
  }

  const eodPnl = signal==='CE' ? eodClose-entryPx : entryPx-eodClose;
  totalPts += eodPnl;
  if(eodPnl>0) wins++; else losses++;
  allTrades.push({date,signal,rule,entryPx,entryTime,dayMove,eodPnl,dayHigh,dayLow,c1,c2,c3,cs});

  console.log(
    `${date}  ${rule.padEnd(14)}  ${signal}  @${entryTime}  ${entryPx.toFixed(0).padStart(7)}` +
    `  ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}` +
    `  ${(eodPnl>=0?'+':'')+eodPnl.toFixed(0).padStart(7)}` +
    `  ${eodPnl>0?'✓ WIN':'✗ LOSS'}`
  );
}

console.log(`\nEntries : ${wins+losses}  |  Wins: ${wins}  Losses: ${losses}  |  Win%: ${Math.round(wins/(wins+losses)*100)}%`);
console.log(`No entry: ${noEntry} days skipped`);
console.log(`EOD P&L : ${totalPts>=0?'+':''}${totalPts.toFixed(0)} pts  =  Rs ${(totalPts*15>=0?'+':'-')+Math.abs(Math.round(totalPts*15)).toLocaleString('en-IN')} (no SL, hold to EOD)`);

// Breakdown by rule
console.log('\n══ BREAKDOWN BY RULE');
const rules={};
for(const t of allTrades){
  if(!rules[t.rule]) rules[t.rule]={w:0,l:0,pts:0};
  if(t.eodPnl>0) rules[t.rule].w++; else rules[t.rule].l++;
  rules[t.rule].pts+=t.eodPnl;
}
for(const [r,s] of Object.entries(rules)){
  const total=s.w+s.l;
  console.log(`  ${r.padEnd(16)} ${s.w}W ${s.l}L  ${Math.round(s.w/total*100)}%  pts=${s.pts>=0?'+':''}${s.pts.toFixed(0)}  Rs${(s.pts*15>=0?'+':'-')+Math.abs(Math.round(s.pts*15)).toLocaleString('en-IN')}`);
}

// Show the previously-missed big trend days
console.log('\n══ PREVIOUSLY SKIPPED BIG TREND DAYS — NOW WITH C3 RULE:');
for(const t of allTrades.filter(t=>t.rule==='C3_CONFIRMS_C2')){
  const maxFor = t.signal==='CE' ? t.dayHigh-t.entryPx : t.entryPx-t.dayLow;
  console.log(`  ${t.date}  ${t.signal}  entry=${t.entryPx.toFixed(0)}  dayMove=${t.dayMove>=0?'+':''}${t.dayMove.toFixed(0)}  eodPnl=${t.eodPnl>=0?'+':''}${t.eodPnl.toFixed(0)}  maxPossible=${maxFor.toFixed(0)}`);
}

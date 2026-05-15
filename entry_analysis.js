// entry_analysis.js — analyse entry signals from candle data
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

// ── 1. Does C1 (9:15 candle) predict the day direction?
console.log('\n══ SIGNAL 1: Does first candle (9:15) body predict day direction?');
console.log('Date         C1    BodySz  Range  Body%   DayMove  Match?');
console.log('─'.repeat(62));
let m1=0,t1=0;
for(const [date,cs] of days){
  const c1=cs[0];
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const bodyPct=Math.round(c1.body_size/c1.total_range*100)||0;
  const matched=(c1.bull&&dayMove>0)||(!c1.bull&&dayMove<0);
  if(matched)m1++;t1++;
  console.log(`${date}  ${c1.bull?'BUL':'BEA'}  ${String(c1.body_size.toFixed(0)).padStart(6)}  ${String(c1.total_range.toFixed(0)).padStart(5)}  ${String(bodyPct).padStart(4)}%  ${(dayMove>=0?'+':'')+(dayMove.toFixed(0)).padStart(6)}  ${matched?'✓':'✗'}`);
}
console.log(`→ C1 predicts day: ${m1}/${t1} = ${Math.round(m1/t1*100)}%\n`);

// ── 2. Strong C1 (body > 60% of range) — does it predict better?
console.log('══ SIGNAL 2: Strong C1 only (body >= 60% of range)?');
let m2=0,t2=0;
for(const [date,cs] of days){
  const c1=cs[0];
  const bodyPct=c1.total_range>0?c1.body_size/c1.total_range:0;
  if(bodyPct<0.60) continue;
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const matched=(c1.bull&&dayMove>0)||(!c1.bull&&dayMove<0);
  if(matched)m2++;t2++;
  console.log(`  ${date}  ${c1.bull?'BUL':'BEA'}  body=${c1.body_size.toFixed(0)}/${c1.total_range.toFixed(0)} (${Math.round(bodyPct*100)}%)  DayMove=${(dayMove>=0?'+':'')+dayMove.toFixed(0)}  ${matched?'✓':'✗'}`);
}
console.log(`→ Strong C1 predicts day: ${m2}/${t2} = ${t2>0?Math.round(m2/t2*100):0}%\n`);

// ── 3. C1 + C2 same direction (confirmation) — predicts day?
console.log('══ SIGNAL 3: C1 + C2 same direction (both bull or both bear)?');
let m3=0,t3=0;
for(const [date,cs] of days){
  if(cs.length<2)continue;
  const c1=cs[0],c2=cs[1];
  if(c1.bull!==c2.bull) continue; // skip if opposite
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const matched=(c1.bull&&dayMove>0)||(!c1.bull&&dayMove<0);
  if(matched)m3++;t3++;
  console.log(`  ${date}  ${c1.bull?'BUL+BUL':'BEA+BEA'}  DayMove=${(dayMove>=0?'+':'')+dayMove.toFixed(0)}  ${matched?'✓':'✗'}`);
}
console.log(`→ C1+C2 same dir predicts day: ${m3}/${t3} = ${t3>0?Math.round(m3/t3*100):0}%\n`);

// ── 4. Where does the actual high/low of the day form (which candle)?
console.log('══ SIGNAL 4: What TIME does the day HIGH and LOW form?');
console.log('Date         Day HIGH at   Day LOW at    DayMove');
console.log('─'.repeat(55));
const highTimes={}, lowTimes={};
for(const [date,cs] of days){
  const dayHigh=Math.max(...cs.map(c=>c.high));
  const dayLow =Math.min(...cs.map(c=>c.low));
  const highC = cs.find(c=>c.high===dayHigh);
  const lowC  = cs.find(c=>c.low===dayLow);
  const dayMove=cs[cs.length-1].close-cs[0].open;
  if(highC) highTimes[highC.time]=(highTimes[highC.time]||0)+1;
  if(lowC)  lowTimes[lowC.time] =(lowTimes[lowC.time]||0)+1;
  console.log(`${date}  HIGH@${highC?highC.time:'?'}     LOW@${lowC?lowC.time:'?'}    ${(dayMove>=0?'+':'')+dayMove.toFixed(0)}`);
}
console.log('\nHigh formed most often at:');
Object.entries(highTimes).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([t,n])=>console.log(`  ${t} → ${n} days`));
console.log('Low formed most often at:');
Object.entries(lowTimes).sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([t,n])=>console.log(`  ${t} → ${n} days`));

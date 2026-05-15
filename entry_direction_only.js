// entry_direction_only.js — ONLY checking direction accuracy, no P&L
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ ENTRY DIRECTION ACCURACY ONLY (no SL, no target, no P&L)');
console.log('');

// ── Case 1: C1+C2 same color
console.log('── CASE 1: C1+C2 same color → follow that direction');
console.log('Date         C1    C2    Signal  DayMove  Correct?');
console.log('─'.repeat(55));
let s1c=0,s1t=0;
for(const [date,cs] of days){
  const c1=cs[0],c2=cs[1];
  if(c1.bull!==c2.bull) continue;
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const signal=c1.bull?'CE':'PE';
  const correct=(signal==='CE'&&dayMove>0)||(signal==='PE'&&dayMove<0);
  if(correct)s1c++;s1t++;
  console.log(`${date}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}   ${signal}     ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  ${correct?'✓':'✗'}`);
}
console.log(`→ ${s1c}/${s1t} = ${Math.round(s1c/s1t*100)}% correct\n`);

// ── Case 2: C2 body > C1 body, opposite → follow C2
console.log('── CASE 2: C2 body > C1 body (opposite) → follow C2 direction');
console.log('Date         C1    C2    C1body  C2body  Signal  DayMove  Correct?');
console.log('─'.repeat(65));
let s2c=0,s2t=0;
for(const [date,cs] of days){
  const c1=cs[0],c2=cs[1];
  if(c1.bull===c2.bull) continue;
  if(c2.body_size<=c1.body_size) continue;
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const signal=c2.bull?'CE':'PE';
  const correct=(signal==='CE'&&dayMove>0)||(signal==='PE'&&dayMove<0);
  if(correct)s2c++;s2t++;
  console.log(`${date}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}   ${String(c1.body_size.toFixed(0)).padStart(5)}   ${String(c2.body_size.toFixed(0)).padStart(5)}   ${signal}     ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  ${correct?'✓':'✗'}`);
}
console.log(`→ ${s2c}/${s2t} = ${Math.round(s2c/s2t*100)}% correct\n`);

// ── Case 3: C1 body > C2 body, opposite
// Check both sub-options: follow C1 vs follow C2
console.log('── CASE 3: C1 body > C2 body (opposite)');
console.log('Date         C1    C2    C1body  C2body  FollowC1  FollowC2  DayMove  C1correct?  C2correct?');
console.log('─'.repeat(90));
let c1c=0,c1t=0,c2c=0,c2t=0;
for(const [date,cs] of days){
  const c1=cs[0],c2=cs[1];
  if(c1.bull===c2.bull) continue;
  if(c1.body_size<=c2.body_size) continue;
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const followC1=c1.bull?'CE':'PE';
  const followC2=c2.bull?'CE':'PE';
  const c1corr=(followC1==='CE'&&dayMove>0)||(followC1==='PE'&&dayMove<0);
  const c2corr=(followC2==='CE'&&dayMove>0)||(followC2==='PE'&&dayMove<0);
  if(c1corr)c1c++;c1t++;
  if(c2corr)c2c++;c2t++;
  console.log(
    `${date}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}   ${String(c1.body_size.toFixed(0)).padStart(5)}   ${String(c2.body_size.toFixed(0)).padStart(5)}   ${followC1}       ${followC2}       ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  C1=${c1corr?'✓':'✗'}           C2=${c2corr?'✓':'✗'}`
  );
}
console.log(`→ Follow C1: ${c1c}/${c1t} = ${Math.round(c1c/c1t*100)}%`);
console.log(`→ Follow C2: ${c2c}/${c2t} = ${Math.round(c2c/c2t*100)}%\n`);

// ── Summary
console.log('══ SUMMARY — DIRECTION ACCURACY ONLY');
console.log(`Case 1 (C1+C2 same)     : ${s1c}/${s1t} = ${Math.round(s1c/s1t*100)}%`);
console.log(`Case 2 (C2>C1, opp)     : ${s2c}/${s2t} = ${Math.round(s2c/s2t*100)}%`);
console.log(`Case 3 follow C1 (C1>C2): ${c1c}/${c1t} = ${Math.round(c1c/c1t*100)}%`);
console.log(`Case 3 follow C2 (C1>C2): ${c2c}/${c2t} = ${Math.round(c2c/c2t*100)}%`);
console.log(`\nBest combined (Case1 + Case2 + best Case3):`);
const best3 = c1c>c2c ? {n:'C1',c:c1c,t:c1t} : {n:'C2',c:c2c,t:c2t};
const totalC=s1c+s2c+best3.c, totalT=s1t+s2t+best3.t;
console.log(`  = ${totalC}/${totalT} = ${Math.round(totalC/totalT*100)}% direction accuracy`);

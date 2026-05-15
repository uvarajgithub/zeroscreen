// c1c2_opposite.js — what happens when C1 and C2 go opposite directions?
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ C1 GREEN + C2 RED (or C1 RED + C2 GREEN) — what does day do?');
console.log('Date         C1    C2    C1Body  C2Body  DayMove  DayRange  Day');
console.log('─'.repeat(72));

let same=0, opp=0;
const oppDays=[], sameDays=[];

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  const dayMove = cs[cs.length-1].close - cs[0].open;
  const dayHigh = Math.max(...cs.map(c=>c.high));
  const dayLow  = Math.min(...cs.map(c=>c.low));
  const dayRange= dayHigh-dayLow;

  if(c1.bull === c2.bull){
    sameDays.push({date,c1,c2,dayMove,dayRange});
    same++;
    continue;
  }

  // Opposite — who won? Which candle's direction did the day follow?
  const dayDir = dayMove > 0 ? 'UP' : 'DN';
  const c1dir  = c1.bull ? 'UP' : 'DN';
  const c2dir  = c2.bull ? 'UP' : 'DN';
  const whoWon = dayDir===c1dir ? 'C1_WON' : dayDir===c2dir ? 'C2_WON' : '??';

  // After C2 closes, which direction is stronger — C1 body or C2 body?
  const biggerBody = c1.body_size >= c2.body_size ? 'C1_BIGGER' : 'C2_BIGGER';

  opp++;
  oppDays.push({date,c1,c2,dayMove,dayRange,whoWon,biggerBody});

  console.log(
    `${date}  ${c1.bull?'GRN':'RED'}→${c2.bull?'GRN':'RED'}` +
    `  C1=${String(c1.body_size.toFixed(0)).padStart(5)}` +
    `  C2=${String(c2.body_size.toFixed(0)).padStart(5)}` +
    `  Move=${((dayMove>=0?'+':'')+dayMove.toFixed(0)).padStart(7)}` +
    `  Range=${String(dayRange.toFixed(0)).padStart(6)}` +
    `  ${whoWon} / ${biggerBody}`
  );
}

console.log(`\nOpposite C1C2: ${opp} days`);

// Who wins when C1>C2 body vs C2>C1 body
const c1BigWins  = oppDays.filter(d=>d.biggerBody==='C1_BIGGER'&&d.whoWon==='C1_WON').length;
const c1BigTotal = oppDays.filter(d=>d.biggerBody==='C1_BIGGER').length;
const c2BigWins  = oppDays.filter(d=>d.biggerBody==='C2_BIGGER'&&d.whoWon==='C2_WON').length;
const c2BigTotal = oppDays.filter(d=>d.biggerBody==='C2_BIGGER').length;

console.log(`\nWhen C1 body > C2 body: C1 direction wins ${c1BigWins}/${c1BigTotal} = ${c1BigTotal?Math.round(c1BigWins/c1BigTotal*100):0}%`);
console.log(`When C2 body > C1 body: C2 direction wins ${c2BigWins}/${c2BigTotal} = ${c2BigTotal?Math.round(c2BigWins/c2BigTotal*100):0}%`);

// What is C3 (9:45) direction in these cases?
console.log('\n══ In opposite C1C2 days — what does C3 (9:45) do and does it predict day?');
console.log('Date         C3    C3Body  DayMove  C3Match?');
console.log('─'.repeat(50));
let c3match=0, c3total=0;
for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1], c3=cs[2];
  if(c1.bull===c2.bull) continue; // only opposite days
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const dayDir=dayMove>0?'UP':'DN';
  const c3dir=c3.bull?'UP':'DN';
  const matched=c3dir===dayDir;
  if(matched)c3match++;
  c3total++;
  console.log(`${date}  ${c3.bull?'GRN':'RED'}  ${String(c3.body_size.toFixed(0)).padStart(6)}  ${((dayMove>=0?'+':'')+dayMove.toFixed(0)).padStart(8)}  ${matched?'✓':'✗'}`);
}
console.log(`→ C3 predicts day on opposite-C1C2 days: ${c3match}/${c3total} = ${c3total?Math.round(c3match/c3total*100):0}%`);

// Summary rule
console.log('\n══ SUMMARY');
console.log(`Same C1+C2 direction: ${same} days → 75% day follows (from previous analysis)`);
console.log(`Opposite C1+C2: ${opp} days → use C3 or bigger body to decide`);

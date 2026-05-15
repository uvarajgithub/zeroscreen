// sl_vs_profit.js — on correct direction days, does price HIT SL first before going our way?
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const trades=[];
for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  let signal=null, rule=null;
  if(c1.bull===c2.bull){
    signal=c1.bull?'CE':'PE'; rule='SAME';
  } else if(c2.body_size>c1.body_size){
    signal=c2.bull?'CE':'PE'; rule='C2BIG';
  } else continue;
  trades.push({date,signal,rule,c1,c2,cs});
}

console.log('\n══ CORRECT DIRECTION DAYS — how far did price go AGAINST us before going FOR us?');
console.log('(entry = C2 close price)\n');
console.log('Date         Signal  Entry   MaxAgainst  MaxFor   SLHit?  FinalPnL  Correct?');
console.log('─'.repeat(80));

let correctSLHit=0, correctNOSLHit=0, wrongSLHit=0, wrongNOSLHit=0;
const SL=100;

for(const t of trades){
  const cs=t.cs, entry=t.c2.close, dir=t.signal;
  const dayMove=cs[cs.length-1].close-cs[0].open;
  const dayDir=dayMove>0?'UP':'DN';
  const sigDir=dir==='CE'?'UP':'DN';
  const correct=sigDir===dayDir;

  let maxAgainst=0, maxFor=0, slHit=false, finalPnl=0;

  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    const forUs    = dir==='CE' ? c.high-entry : entry-c.low;
    const againstUs= dir==='CE' ? entry-c.low  : c.high-entry;
    if(forUs    > maxFor)    maxFor    = forUs;
    if(againstUs> maxAgainst) maxAgainst = againstUs;
    if(againstUs >= SL){ slHit=true; }
  }
  // Final P&L at EOD (last candle close)
  finalPnl = dir==='CE'
    ? cs[cs.length-1].close - entry
    : entry - cs[cs.length-1].close;

  if(correct && slHit)    correctSLHit++;
  if(correct && !slHit)   correctNOSLHit++;
  if(!correct && slHit)   wrongSLHit++;
  if(!correct && !slHit)  wrongNOSLHit++;

  console.log(
    `${t.date}  ${dir}     ${entry.toFixed(0).padStart(7)}` +
    `   against=${String(maxAgainst.toFixed(0)).padStart(6)}` +
    `  for=${String(maxFor.toFixed(0)).padStart(6)}` +
    `   SL=${slHit?'YES':'NO '}` +
    `   eod=${((finalPnl>=0?'+':'')+finalPnl.toFixed(0)).padStart(7)}` +
    `   ${correct?'✓':'✗'}`
  );
}

console.log('\n══ SUMMARY');
console.log(`Correct direction + SL would have been hit:  ${correctSLHit}`);
console.log(`Correct direction + SL NOT hit:              ${correctNOSLHit}`);
console.log(`Wrong direction + SL would have been hit:    ${wrongSLHit}`);
console.log(`Wrong direction + SL NOT hit:                ${wrongNOSLHit}`);

// How many correct days would survive wider SLs?
console.log('\n══ IF WE USE WIDER SL — how many correct-direction trades survive?');
for(const sl of [100,150,200,250,300]){
  let survive=0,total=0;
  for(const t of trades){
    const cs=t.cs, entry=t.c2.close, dir=t.signal;
    const dayMove=cs[cs.length-1].close-cs[0].open;
    const correct=(dir==='CE'&&dayMove>0)||(dir==='PE'&&dayMove<0);
    if(!correct) continue;
    total++;
    const maxAgainst=Math.max(...cs.slice(2).map(c=> dir==='CE'?entry-c.low:c.high-entry));
    if(maxAgainst<sl) survive++;
  }
  console.log(`  SL=${sl}: ${survive}/${total} correct-direction trades survive without SL hit`);
}

// What is the average max-against on correct days?
const corrTrades=trades.filter(t=>{
  const cs=t.cs, dir=t.signal;
  const dayMove=cs[cs.length-1].close-cs[0].open;
  return (dir==='CE'&&dayMove>0)||(dir==='PE'&&dayMove<0);
});
const avgAgainst=corrTrades.reduce((s,t)=>{
  const cs=t.cs, entry=t.c2.close, dir=t.signal;
  return s+Math.max(...cs.slice(2).map(c=> dir==='CE'?entry-c.low:c.high-entry));
},0)/corrTrades.length;
const avgFor=corrTrades.reduce((s,t)=>{
  const cs=t.cs, entry=t.c2.close, dir=t.signal;
  return s+Math.max(...cs.slice(2).map(c=> dir==='CE'?c.high-entry:entry-c.low));
},0)/corrTrades.length;
console.log(`\nOn correct-direction days:`);
console.log(`  Avg max move AGAINST us : ${avgAgainst.toFixed(0)} pts`);
console.log(`  Avg max move FOR us     : ${avgFor.toFixed(0)} pts`);
console.log(`  Ratio FOR/AGAINST       : ${(avgFor/avgAgainst).toFixed(2)}x`);

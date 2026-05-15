// entry_final.js — combined final entry logic, direction accuracy only
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ FINAL COMBINED ENTRY LOGIC — direction accuracy only');
console.log('Rule A (same color C1+C2)    → enter on HIGH/LOW breakout of C1+C2 range');
console.log('Rule B (C2 body > C1, opp)   → enter on BODY breakout of C1+C2 range');
console.log('Skip   (C1 body > C2, opp)   → no trade');
console.log('');
console.log('Date         Rule  Sig  BreakLevel  EntryPx  EntryTime  DayMove  Correct?');
console.log('─'.repeat(75));

let correct=0, total=0, noEntry=0, skipped=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const sigDir   = dayMove>0?'UP':'DN';

  let signal=null, rule=null, breakLevel=null;

  if(c1.bull === c2.bull){
    // Rule A: same color → HIGH/LOW breakout
    signal     = c1.bull ? 'CE' : 'PE';
    rule       = 'A';
    breakLevel = signal==='CE' ? Math.max(c1.high, c2.high) : Math.min(c1.low, c2.low);
  } else if(c2.body_size > c1.body_size){
    // Rule B: C2 bigger body → BODY breakout
    signal     = c2.bull ? 'CE' : 'PE';
    rule       = 'B';
    breakLevel = signal==='CE' ? Math.max(c1.body_high, c2.body_high) : Math.min(c1.body_low, c2.body_low);
  } else {
    skipped++;
    console.log(`${date}  SKIP  -    -            -        -          ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  -`);
    continue;
  }

  // Find entry candle
  let entryPx=null, entryTime=null;
  for(let i=2; i<cs.length; i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(signal==='CE' && c.close>breakLevel){ entryPx=c.close; entryTime=c.time; break; }
    if(signal==='PE' && c.close<breakLevel){ entryPx=c.close; entryTime=c.time; break; }
  }

  if(!entryPx){
    noEntry++;
    console.log(`${date}  R${rule}    ${signal}  lvl=${breakLevel.toFixed(0).padStart(7)}  NO_ENTRY           ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}  ✓(no trade)`);
    continue;
  }

  const entryDir = signal==='CE'?'UP':'DN';
  const isCorrect = entryDir===sigDir;
  if(isCorrect) correct++; total++;

  console.log(
    `${date}  R${rule}    ${signal}  lvl=${breakLevel.toFixed(0).padStart(7)}` +
    `  ${entryPx.toFixed(0).padStart(7)}  @${entryTime}` +
    `  ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}` +
    `  ${isCorrect?'✓ CORRECT':'✗ WRONG'}`
  );
}

console.log(`\n${'═'.repeat(75)}`);
console.log(`  Entries taken   : ${total}`);
console.log(`  No entry (skipped by breakout) : ${noEntry}`);
console.log(`  Skipped (C1>C2 opposite)       : ${skipped}`);
console.log(`  Direction correct : ${correct}/${total} = ${total?Math.round(correct/total*100):0}%`);
console.log(`${'═'.repeat(75)}`);
console.log('\n  ENTRY LOGIC IS LOCKED ✓');
console.log('  Next step: define SL');

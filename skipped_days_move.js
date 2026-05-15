// skipped_days_move.js — what happened on days we didn't trade?
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ NON-ENTRY DAYS — did we miss one-sided moves?\n');
console.log('Date         Category     DayMove  DayRange  Direction  C1    C2    Reason');
console.log('─'.repeat(85));

let skippedOneSided=0, noEntryOneSided=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  const dayOpen  = cs[0].open;
  const dayClose = cs[cs.length-1].close;
  const dayHigh  = Math.max(...cs.map(c=>c.high));
  const dayLow   = Math.min(...cs.map(c=>c.low));
  const dayMove  = dayClose - dayOpen;
  const dayRange = dayHigh - dayLow;
  const dir      = dayMove>0 ? 'UP  ' : 'DOWN';

  let signal=null, rule=null, breakLevel=null, category=null, reason=null;

  if(c1.bull === c2.bull){
    signal     = c1.bull ? 'CE' : 'PE';
    rule       = 'A';
    breakLevel = signal==='CE' ? Math.max(c1.high, c2.high) : Math.min(c1.low, c2.low);
    category   = 'ENTRY_DAY';
  } else if(c2.body_size > c1.body_size){
    signal     = c2.bull ? 'CE' : 'PE';
    rule       = 'B';
    breakLevel = signal==='CE' ? Math.max(c1.body_high, c2.body_high) : Math.min(c1.body_low, c2.body_low);
    category   = 'ENTRY_DAY';
  } else {
    category = 'SKIP_C1>C2';
    reason   = `C1=${c1.bull?'GRN':'RED'}(${c1.body_size.toFixed(0)}) C2=${c2.bull?'GRN':'RED'}(${c2.body_size.toFixed(0)})`;
  }

  // For entry days, check if breakout triggered
  if(category==='ENTRY_DAY'){
    let entryPx=null;
    for(let i=2; i<cs.length; i++){
      const c=cs[i];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE' && c.close>breakLevel){ entryPx=c.close; break; }
      if(signal==='PE' && c.close<breakLevel){ entryPx=c.close; break; }
    }
    if(!entryPx){
      category = 'NO_ENTRY  ';
      reason   = `signal=${signal} lvl=${breakLevel.toFixed(0)} never triggered`;
    } else {
      continue; // already analysed
    }
  }

  const sign = dayMove>=0?'+':'';
  const oneSided = Math.abs(dayMove) > 200 ? '*** BIG MOVE ***' : Math.abs(dayMove)>100 ? '(moderate)' : '(small)';
  if(Math.abs(dayMove)>200){
    if(category.includes('SKIP')) skippedOneSided++;
    else noEntryOneSided++;
  }

  console.log(
    `${date}  ${category.padEnd(12)}` +
    `  ${sign}${dayMove.toFixed(0).padStart(5)} pts` +
    `  rng=${dayRange.toFixed(0).padStart(5)}` +
    `  ${dir}` +
    `  ${oneSided}`
  );
  if(reason) console.log(`             └─ ${reason}`);
}

console.log(`\n${'═'.repeat(85)}`);
console.log(`  Big moves (>200 pts) missed:`);
console.log(`    SKIP_C1>C2 days : ${skippedOneSided}`);
console.log(`    NO_ENTRY days   : ${noEntryOneSided}`);
console.log(`${'═'.repeat(85)}`);

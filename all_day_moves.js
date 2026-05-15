// all_day_moves.js — classify ALL 28 days by move size
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ ALL 28 DAYS — move size classification\n');
console.log('Date         DayMove  DayRange  Category     Traded?');
console.log('─'.repeat(60));

let big=0, med=0, small=0, tradedBig=0, tradedMed=0, tradedSmall=0;

// entry days from our logic
const entryDays = new Set([
  '2026-04-08','2026-04-09','2026-04-10','2026-04-13',
  '2026-04-16','2026-04-20','2026-04-21','2026-04-24',
  '2026-05-08','2026-05-11'
]);

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const dayHigh  = Math.max(...cs.map(c=>c.high));
  const dayLow   = Math.min(...cs.map(c=>c.low));
  const dayRange = dayHigh - dayLow;
  const abs      = Math.abs(dayMove);
  const sign     = dayMove>=0?'+':'';
  const traded   = entryDays.has(date) ? '✓ WE TRADED' : '✗ skipped';

  let cat;
  if(abs>=400){      cat='BIG  (≥400)'; big++;   if(entryDays.has(date)) tradedBig++;   }
  else if(abs>=200){ cat='MED  (200-400)'; med++; if(entryDays.has(date)) tradedMed++;  }
  else {             cat='SMALL(<200)';  small++; if(entryDays.has(date)) tradedSmall++; }

  console.log(`${date}  ${sign}${dayMove.toFixed(0).padStart(5)} pts  rng=${dayRange.toFixed(0).padStart(5)}  ${cat}  ${traded}`);
}

console.log(`\n${'═'.repeat(60)}`);
console.log(`  Total days : ${days.length}`);
console.log(`  BIG  (≥400 pts) : ${big} days  → we traded ${tradedBig}/${big}`);
console.log(`  MED  (200-400)  : ${med} days  → we traded ${tradedMed}/${med}`);
console.log(`  SMALL (<200)    : ${small} days → we traded ${tradedSmall}/${small}`);
console.log(`${'═'.repeat(60)}`);

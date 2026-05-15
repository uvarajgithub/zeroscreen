// one_side_days.js — classify all 28 days: one-sided vs reverse vs choppy
// One-sided = max adverse move < 100 pts from open throughout the day
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ ALL 28 DAYS — one-sided vs reverse vs choppy\n');
console.log('Date         DayMove  MaxUp  MaxDown  NetDir  MaxAdverse  Type');
console.log('─'.repeat(70));

let oneSide=0, reverse=0, choppy=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayOpen  = cs[0].open;
  const dayMove  = cs[cs.length-1].close - dayOpen;
  const finalDir = dayMove >= 0 ? 'UP' : 'DOWN';

  const maxUp   = Math.max(...cs.map(c=>c.high))  - dayOpen;
  const maxDown = dayOpen - Math.min(...cs.map(c=>c.low));

  // Adverse = move against final direction
  const maxAdverse = finalDir==='UP' ? maxDown : maxUp;

  let type;
  if(maxAdverse < 100)       { type = '1. ONE-SIDED  '; oneSide++; }
  else if(maxAdverse < 300)  { type = '2. MINOR PULL '; reverse++;  }
  else                       { type = '3. BIG REVERSE'; choppy++;   }

  const sign = dayMove>=0?'+':'';
  console.log(
    `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}` +
    `  up=${maxUp.toFixed(0).padStart(5)}  dn=${maxDown.toFixed(0).padStart(5)}` +
    `  ${finalDir.padEnd(4)}  adv=${maxAdverse.toFixed(0).padStart(5)}` +
    `  ${type}`
  );
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`  ONE-SIDED   (<100 pts adverse) : ${oneSide} days`);
console.log(`  MINOR PULL  (100-300 adverse)  : ${reverse} days`);
console.log(`  BIG REVERSE (>300 adverse)     : ${choppy} days`);
console.log(`${'═'.repeat(70)}`);

// c1c2_same_strength.js — same color but C2 < C1 body vs C2 > C1 body
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ SAME COLOR C1+C2 — split by C2 body vs C1 body size');
console.log('');
console.log('Date         C1    C2    C1Body  C2Body  Stronger  DayMove  Correct?');
console.log('─'.repeat(72));

let c2BigSame=0,c2BigSameCorr=0;
let c2SmSame=0, c2SmSameCorr=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  if(c1.bull !== c2.bull) continue; // only same direction
  const dayMove = cs[cs.length-1].close - cs[0].open;
  const signal  = c1.bull ? 'CE' : 'PE';
  const sigDir  = c1.bull ? 'UP' : 'DN';
  const dayDir  = dayMove > 0 ? 'UP' : 'DN';
  const correct = sigDir === dayDir;
  const stronger= c2.body_size >= c1.body_size ? 'C2>=C1' : 'C2<C1 ';

  if(c2.body_size >= c1.body_size){ c2BigSame++; if(correct) c2BigSameCorr++; }
  else                             { c2SmSame++;  if(correct) c2SmSameCorr++;  }

  console.log(
    `${date}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}   ` +
    `C1=${String(c1.body_size.toFixed(0)).padStart(5)}  C2=${String(c2.body_size.toFixed(0)).padStart(5)}  ` +
    `${stronger}  Move=${((dayMove>=0?'+':'')+dayMove.toFixed(0)).padStart(7)}  ${correct?'✓ WIN':'✗ LOSS'}`
  );
}

console.log('');
console.log(`Same color + C2 body >= C1: ${c2BigSameCorr}/${c2BigSame} = ${c2BigSame?Math.round(c2BigSameCorr/c2BigSame*100):0}% correct`);
console.log(`Same color + C2 body <  C1: ${c2SmSameCorr}/${c2SmSame}  = ${c2SmSame?Math.round(c2SmSameCorr/c2SmSame*100):0}% correct`);
console.log('');
console.log('──────────────────────────────────────────────');
console.log('Interpretation:');
console.log('  C2>=C1 (momentum building)  → strong signal');
console.log('  C2<C1  (momentum fading)    → weaker signal?');

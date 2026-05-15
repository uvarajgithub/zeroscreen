// post_entry_move.js — after entry, how far did market move in signal direction?
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ POST-ENTRY MOVE ANALYSIS');
console.log('For each entry: max favorable move, final close move, any adverse dip\n');
console.log('Date         Rule  Sig  EntryPx  MaxFav  FinalMove  MaxAdv  EntryTime → ExitTime');
console.log('─'.repeat(85));

let totalMaxFav=0, totalFinal=0, entryCount=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];

  let signal=null, rule=null, breakLevel=null;

  if(c1.bull === c2.bull){
    signal     = c1.bull ? 'CE' : 'PE';
    rule       = 'A';
    breakLevel = signal==='CE' ? Math.max(c1.high, c2.high) : Math.min(c1.low, c2.low);
  } else if(c2.body_size > c1.body_size){
    signal     = c2.bull ? 'CE' : 'PE';
    rule       = 'B';
    breakLevel = signal==='CE' ? Math.max(c1.body_high, c2.body_high) : Math.min(c1.body_low, c2.body_low);
  } else {
    continue; // skip
  }

  // Find entry candle
  let entryPx=null, entryIdx=null, entryTime=null;
  for(let i=2; i<cs.length; i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(signal==='CE' && c.close>breakLevel){ entryPx=c.close; entryIdx=i; entryTime=c.time; break; }
    if(signal==='PE' && c.close<breakLevel){ entryPx=c.close; entryIdx=i; entryTime=c.time; break; }
  }

  if(!entryPx) continue; // no entry

  // From entry candle onwards, measure max favorable, max adverse, final close
  let maxFav=0, maxAdv=0, finalMove=0, exitTime=null;
  for(let i=entryIdx+1; i<cs.length; i++){
    const c=cs[i];
    // skip candles after 3:15
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const favMove  = signal==='CE' ? c.high  - entryPx : entryPx - c.low;
    const advMove  = signal==='CE' ? entryPx - c.low   : c.high  - entryPx;
    if(favMove > maxFav){ maxFav=favMove; }
    if(advMove > maxAdv){ maxAdv=advMove; }
    finalMove = signal==='CE' ? c.close - entryPx : entryPx - c.close;
    exitTime  = c.time;
  }

  totalMaxFav += maxFav;
  totalFinal  += finalMove;
  entryCount++;

  const sign = (n)=>(n>=0?'+':'')+n.toFixed(0);
  console.log(
    `${date}  R${rule}    ${signal}  ${entryPx.toFixed(0).padStart(7)}` +
    `  MaxFav:${sign(maxFav).padStart(6)}` +
    `  Final:${sign(finalMove).padStart(6)}` +
    `  MaxAdv:${sign(maxAdv).padStart(6)}` +
    `  @${entryTime}→${exitTime||'--'}`
  );
}

console.log(`\n${'═'.repeat(85)}`);
console.log(`  Entries: ${entryCount}`);
console.log(`  Avg max favorable move : +${(totalMaxFav/entryCount).toFixed(0)} pts`);
console.log(`  Avg final move (close) : ${(totalFinal/entryCount)>=0?'+':''}${(totalFinal/entryCount).toFixed(0)} pts`);
console.log(`${'═'.repeat(85)}`);

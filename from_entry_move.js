// from_entry_move.js — from entry price, one-sided or adverse dip?
// One-sided = after entry, market never came back more than X pts against us
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ FROM ENTRY POINT — how market moved after our entry\n');
console.log('Date         Sig  EntryPx  @Time  MaxFav  MaxAdv  FinalMove  Type');
console.log('─'.repeat(80));

function findEntry(cs, startIdx, skipSignal=null){
  for(let i=startIdx; i<cs.length-1; i++){
    const ca=cs[i], cb=cs[i+1];
    if(ca.h>13||(ca.h===13&&ca.m>=30)) break;
    let signal=null, breakLevel=null;
    if(ca.bull===cb.bull){
      signal=ca.bull?'CE':'PE';
      breakLevel=signal==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if(cb.body_size>ca.body_size){
      signal=cb.bull?'CE':'PE';
      breakLevel=signal==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
    } else continue;
    if(skipSignal && signal===skipSignal) continue;
    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE'&&c.close>breakLevel) return {signal,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i};
      if(signal==='PE'&&c.close<breakLevel) return {signal,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i};
    }
  }
  return null;
}

let oneSide=0, minorAdv=0, bigAdv=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;

  const e1 = findEntry(cs, 0);
  if(!e1) continue;

  // From entry candle onwards, measure max favorable and max adverse (candle close based)
  let maxFav=0, maxAdv=0, finalMove=0;
  for(let j=e1.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const fav = e1.signal==='CE' ? c.high - e1.entryPx  : e1.entryPx - c.low;
    const adv = e1.signal==='CE' ? e1.entryPx - c.low   : c.high - e1.entryPx;
    if(fav>maxFav) maxFav=fav;
    if(adv>maxAdv) maxAdv=adv;
    finalMove = e1.signal==='CE' ? c.close - e1.entryPx : e1.entryPx - c.close;
  }

  let type;
  if(maxAdv < 50)       { type='1. CLEAN ONE-SIDE'; oneSide++;  }
  else if(maxAdv < 150) { type='2. MINOR PULLBACK'; minorAdv++; }
  else                  { type='3. BIG ADVERSE   '; bigAdv++;   }

  const sf = finalMove>=0?'+':'';
  console.log(
    `${date}  ${e1.signal}  ${e1.entryPx.toFixed(0)}  @${e1.entryTime}` +
    `  maxFav:+${maxFav.toFixed(0).padStart(4)}` +
    `  maxAdv:${maxAdv.toFixed(0).padStart(4)}` +
    `  final:${sf}${finalMove.toFixed(0).padStart(5)}` +
    `  ${type}`
  );
}

console.log(`\n${'═'.repeat(80)}`);
console.log(`  CLEAN ONE-SIDE  (adverse <50 pts)  : ${oneSide} days`);
console.log(`  MINOR PULLBACK  (adverse 50-150)    : ${minorAdv} days`);
console.log(`  BIG ADVERSE     (adverse >150)      : ${bigAdv} days`);
console.log(`${'═'.repeat(80)}`);

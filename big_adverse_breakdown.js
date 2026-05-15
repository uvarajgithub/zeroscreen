// big_adverse_breakdown.js — from 18 BIG ADVERSE days, how many went one-side after entry vs reversed
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ 18 BIG ADVERSE DAYS — one-side or reverse after first entry\n');
console.log('Date         Sig  EntryPx  MaxFav  MaxAdv  FinalMove  Result');
console.log('─'.repeat(75));

let oneSide=0, reverse=0;

function findEntry(cs){
  for(let i=0; i<cs.length-1; i++){
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
    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE'&&c.close>breakLevel) return {signal,entryPx:c.close,entryIdx:j,entryTime:c.time};
      if(signal==='PE'&&c.close<breakLevel) return {signal,entryPx:c.close,entryIdx:j,entryTime:c.time};
    }
  }
  return null;
}

for(const [date,cs] of days){
  if(cs.length<3) continue;

  const e1 = findEntry(cs);
  if(!e1) continue;

  // Measure max fav, max adv, final from entry
  let maxFav=0, maxAdv=0, finalMove=0;
  for(let j=e1.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const fav = e1.signal==='CE' ? c.high - e1.entryPx : e1.entryPx - c.low;
    const adv = e1.signal==='CE' ? e1.entryPx - c.low  : c.high - e1.entryPx;
    if(fav>maxFav) maxFav=fav;
    if(adv>maxAdv) maxAdv=adv;
    finalMove = e1.signal==='CE' ? c.close - e1.entryPx : e1.entryPx - c.close;
  }

  // Only show BIG ADVERSE days (maxAdv > 150)
  if(maxAdv <= 150) continue;

  const result = finalMove >= 0 ? '✓ ONE-SIDE (recovered)' : '✗ REVERSE  (stayed neg)';
  if(finalMove >= 0) oneSide++; else reverse++;

  const sf = finalMove>=0?'+':'';
  console.log(
    `${date}  ${e1.signal}  ${e1.entryPx.toFixed(0)} @${e1.entryTime}` +
    `  fav:+${maxFav.toFixed(0).padStart(5)}` +
    `  adv:${maxAdv.toFixed(0).padStart(5)}` +
    `  final:${sf}${finalMove.toFixed(0).padStart(5)}` +
    `  ${result}`
  );
}

console.log(`\n${'═'.repeat(75)}`);
console.log(`  ONE-SIDE (market recovered, closed in our favor) : ${oneSide} days`);
console.log(`  REVERSE  (market stayed against us at close)     : ${reverse} days`);
console.log(`  Total BIG ADVERSE days                           : ${oneSide+reverse} days`);
console.log(`${'═'.repeat(75)}`);

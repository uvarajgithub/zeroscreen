// sl_as_reentry.js — SL = opposite direction breakout (re-entry trigger)
// Measure loss on wrong entry from entry price to re-entry trigger price
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ SL = RE-ENTRY TRIGGER PRICE — 8 wrong first entries\n');
console.log('Date         DayMove  WrongEntry  WrongSig  SL_ExitPx  Loss(pts)  ReEntryPx  GainAfter');
console.log('─'.repeat(95));

let totalLoss=0, totalGain=0, count=0;

function findEntry(cs, startIdx, skipSignal=null, stopAfter=null){
  for(let i=startIdx; i<cs.length-1; i++){
    const ca=cs[i], cb=cs[i+1];
    if(ca.h>13||(ca.h===13&&ca.m>=30)) break;
    let signal=null, rule=null, breakLevel=null;
    if(ca.bull===cb.bull){
      signal=ca.bull?'CE':'PE'; rule='A';
      breakLevel=signal==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if(cb.body_size>ca.body_size){
      signal=cb.bull?'CE':'PE'; rule='B';
      breakLevel=signal==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
    } else continue;
    if(skipSignal && signal===skipSignal) continue;
    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE'&&c.close>breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,pairIdx:i,breakLevel};
      if(signal==='PE'&&c.close<breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,pairIdx:i,breakLevel};
    }
  }
  return null;
}

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const finalDir = dayMove>0?'UP':'DOWN';
  const sign     = dayMove>=0?'+':'';

  const e1 = findEntry(cs, 0);
  if(!e1) continue;
  const e1Dir     = e1.signal==='CE'?'UP':'DOWN';
  const e1Correct = e1Dir===finalDir;
  if(e1Correct) continue; // only show wrong first entries

  // Find re-entry (opposite direction) — this is also our SL exit
  const e2 = findEntry(cs, e1.pairIdx+1, e1.signal);
  if(!e2) continue;

  // Loss = adverse move from e1 entry to e2 entry (SL exit)
  // If CE wrong: we bought, price went down → loss = e1.entryPx - e2.entryPx
  // If PE wrong: we sold, price went up   → loss = e2.entryPx - e1.entryPx
  const loss = e1.signal==='CE'
    ? e1.entryPx - e2.entryPx   // bought high, exited lower
    : e2.entryPx - e1.entryPx;  // sold low, exited higher

  // Gain after re-entry to day close
  const dayClose = cs[cs.length-1].close;
  const gain = e2.signal==='CE'
    ? dayClose - e2.entryPx
    : e2.entryPx - dayClose;

  totalLoss += loss;
  totalGain += gain;
  count++;

  console.log(
    `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}` +
    `  @${e1.entryTime}(${e1.entryPx.toFixed(0)})` +
    `  ${e1.signal}` +
    `  SL@${e2.entryTime}(${e2.entryPx.toFixed(0)})` +
    `  loss:${loss.toFixed(0).padStart(5)} pts` +
    `  reEntry:${e2.entryPx.toFixed(0)}` +
    `  gainAfter:${gain>=0?'+':''}${gain.toFixed(0)}`
  );
}

console.log(`\n${'═'.repeat(95)}`);
console.log(`  Wrong entries with re-entry : ${count}`);
console.log(`  Avg loss per wrong trade    : ${(totalLoss/count).toFixed(0)} pts`);
console.log(`  Avg gain after re-entry     : +${(totalGain/count).toFixed(0)} pts`);
console.log(`  Net avg per wrong+reentry   : ${((totalGain-totalLoss)/count)>=0?'+':''}${((totalGain-totalLoss)/count).toFixed(0)} pts`);
console.log(`${'═'.repeat(95)}`);

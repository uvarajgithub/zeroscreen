// reverse_days_sl_reentry.js — apply SL1 + re-entry on the 12 reverse days
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const reverseDays = ['2026-04-01','2026-04-02','2026-04-15','2026-04-22','2026-04-24',
                     '2026-04-29','2026-04-30','2026-05-05','2026-05-06','2026-05-07',
                     '2026-05-11','2026-05-13'];

console.log('\n══ REVERSE DAYS — SL1 hit? Re-entry? Final result?\n');
console.log('SL1 = breakout candle low(CE) / high(PE) — exit on close beyond SL');
console.log('Re-entry = first opposite signal after SL hit\n');
console.log('Date         E1Sig  Entry    SL1Lvl  SL1Hit?     Loss  ReEntry  R2Sig  R2Entry  FinalGain  Net');
console.log('─'.repeat(105));

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
      if(signal==='CE'&&c.close>breakLevel) return {signal,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i,brkCandle:cs[j]};
      if(signal==='PE'&&c.close<breakLevel) return {signal,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i,brkCandle:cs[j]};
    }
  }
  return null;
}

let totalNet=0, count=0;

for(const [date,cs] of days){
  if(!reverseDays.includes(date)) continue;

  const dayClose = cs[cs.length-1].close;
  const e1 = findEntry(cs, 0);
  if(!e1) continue;

  // SL1 level = breakout candle low(CE) or high(PE)
  const sl1Level = e1.signal==='CE' ? e1.brkCandle.low : e1.brkCandle.high;
  const sl1Dist  = e1.signal==='CE' ? e1.entryPx - sl1Level : sl1Level - e1.entryPx;

  // Find when SL1 is hit (next candle close beyond SL1)
  let slHitIdx=-1, slHitPx=null, slHitTime=null, e1Loss=0;
  for(let j=e1.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(e1.signal==='CE' && c.close < sl1Level){ slHitIdx=j; slHitPx=c.close; slHitTime=c.time; e1Loss=e1.entryPx-c.close; break; }
    if(e1.signal==='PE' && c.close > sl1Level){ slHitIdx=j; slHitPx=c.close; slHitTime=c.time; e1Loss=c.close-e1.entryPx; break; }
  }

  // If SL never hit — held to close
  let e2=null, e2Gain=0, netResult=0;
  if(slHitIdx===-1){
    // no SL hit — final = close - entry
    const finalMove = e1.signal==='CE' ? dayClose - e1.entryPx : e1.entryPx - dayClose;
    netResult = finalMove;
    totalNet += netResult; count++;
    const s = netResult>=0?'+':'';
    console.log(`${date}  ${e1.signal}  ${e1.entryPx.toFixed(0)} @${e1.entryTime}  SL=${sl1Level.toFixed(0)}(${sl1Dist.toFixed(0)}pts)  SL:NEVER HIT  loss:  0  NoReEntry  final:${s}${finalMove.toFixed(0).padStart(5)}  net:${s}${netResult.toFixed(0)}`);
    continue;
  }

  // SL hit — find re-entry in opposite direction from slHitIdx
  e2 = findEntry(cs, slHitIdx, e1.signal);
  if(e2){
    e2Gain = e2.signal==='CE' ? dayClose - e2.entryPx : e2.entryPx - dayClose;
    netResult = -e1Loss + e2Gain;
  } else {
    netResult = -e1Loss; // no re-entry found
  }

  totalNet += netResult; count++;
  const s = netResult>=0?'+':'';
  const g = e2Gain>=0?'+':'';
  console.log(
    `${date}  ${e1.signal}  ${e1.entryPx.toFixed(0)} @${e1.entryTime}` +
    `  SL=${sl1Level.toFixed(0)}(${sl1Dist.toFixed(0)}pts)` +
    `  SL:HIT@${slHitTime}  loss:${e1Loss.toFixed(0).padStart(4)}` +
    `  ${e2?e2.signal+' @'+e2.entryTime+'('+e2.entryPx.toFixed(0)+')':'NO_REENTRY         '}` +
    `  gain:${e2?g+e2Gain.toFixed(0).padStart(5):'    0'}` +
    `  net:${s}${netResult.toFixed(0)}`
  );
}

console.log(`\n${'═'.repeat(105)}`);
console.log(`  Reverse days analyzed : ${count}`);
console.log(`  Total net pts         : ${totalNet>=0?'+':''}${totalNet.toFixed(0)}`);
console.log(`  Avg net per day       : ${(totalNet/count)>=0?'+':''}${(totalNet/count).toFixed(0)} pts`);
console.log(`${'═'.repeat(105)}`);

// reverse_fixed_sl.js — try fixed SL levels on 12 reverse days
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const reverseDays = ['2026-04-01','2026-04-02','2026-04-15','2026-04-22','2026-04-24',
                     '2026-04-29','2026-04-30','2026-05-05','2026-05-06','2026-05-07',
                     '2026-05-11','2026-05-13'];

const fixedSLs = [50, 75, 100, 150, 200];

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
      if(signal==='PE'&&c.close<breakLevel) return {signal,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i,breakLevel};
    }
  }
  return null;
}

// For each fixed SL level, simulate all 12 reverse days
for(const sl of fixedSLs){
  console.log(`\n${'═'.repeat(90)}`);
  console.log(`  FIXED SL = ${sl} pts`);
  console.log(`${'═'.repeat(90)}`);
  console.log('Date         E1Sig  Entry   SLHit@    Loss   ReEntry  R2Gain  Net');
  console.log('─'.repeat(75));

  let totalNet=0;

  for(const [date,cs] of days){
    if(!reverseDays.includes(date)) continue;
    const dayClose = cs[cs.length-1].close;

    const e1 = findEntry(cs, 0);
    if(!e1) continue;

    // Find when fixed SL hit — scan candles from entry, use close price
    let slHitIdx=-1, slHitPx=null, slHitTime=null, e1Loss=sl;
    for(let j=e1.entryIdx+1; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      const adv = e1.signal==='CE' ? e1.entryPx - c.close : c.close - e1.entryPx;
      if(adv >= sl){ slHitIdx=j; slHitPx=c.close; slHitTime=c.time; break; }
    }

    let e2=null, e2Gain=0, netResult=0;
    if(slHitIdx===-1){
      // SL never hit — held to close
      const finalMove = e1.signal==='CE' ? dayClose-e1.entryPx : e1.entryPx-dayClose;
      netResult = finalMove;
      totalNet += netResult;
      const s=netResult>=0?'+':'';
      console.log(`${date}  ${e1.signal}  ${e1.entryPx.toFixed(0)} @${e1.entryTime}  SL:NEVER HIT           final:${s}${finalMove.toFixed(0).padStart(5)}  net:${s}${netResult.toFixed(0)}`);
      continue;
    }

    // SL hit — re-entry in opposite direction
    e2 = findEntry(cs, slHitIdx, e1.signal);
    if(e2){
      e2Gain = e2.signal==='CE' ? dayClose-e2.entryPx : e2.entryPx-dayClose;
      netResult = -sl + e2Gain;
    } else {
      netResult = -sl;
    }
    totalNet += netResult;

    const s=netResult>=0?'+':'';
    const g=e2Gain>=0?'+':'';
    console.log(
      `${date}  ${e1.signal}  ${e1.entryPx.toFixed(0)} @${e1.entryTime}` +
      `  SL:@${slHitTime}  loss:${sl.toString().padStart(4)}` +
      `  ${e2?e2.signal+' @'+e2.entryTime+'('+e2.entryPx.toFixed(0)+')':'NO_REENTRY        '}` +
      `  gain:${e2?g+e2Gain.toFixed(0).padStart(5):'    0'}` +
      `  net:${s}${netResult.toFixed(0)}`
    );
  }

  console.log(`\n  Total net (${sl}pt SL): ${totalNet>=0?'+':''}${totalNet.toFixed(0)} pts  avg: ${(totalNet/reverseDays.length)>=0?'+':''}${(totalNet/reverseDays.length).toFixed(0)}/day`);
}

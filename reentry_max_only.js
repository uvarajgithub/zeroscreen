// reentry_max_only.js — just max favorable from re-entry (ignore close/exit)
// Rule: 50pt SL hit → re-entry. If no SL hit → single entry, measure from there.
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const reverseDays = ['2026-04-01','2026-04-02','2026-04-15','2026-04-22','2026-04-24',
                     '2026-04-29','2026-04-30','2026-05-05','2026-05-06','2026-05-07',
                     '2026-05-11','2026-05-13'];

const FIXED_SL = 50;

console.log('\n══ RE-ENTRY MAX FAVORABLE — 12 reverse days (50pt SL)\n');
console.log('Date         Type        Sig  EntryPx  @Time  MaxFav  PeakTime');
console.log('─'.repeat(70));

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

function maxFavFrom(cs, entryIdx, signal, entryPx){
  let maxFav=0, peakTime='--';
  for(let j=entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const fav = signal==='CE' ? c.high - entryPx : entryPx - c.low;
    if(fav>maxFav){ maxFav=fav; peakTime=c.time; }
  }
  return {maxFav, peakTime};
}

let totalMaxFav=0, count=0;

for(const [date,cs] of days){
  if(!reverseDays.includes(date)) continue;

  const e1 = findEntry(cs, 0);
  if(!e1) continue;

  // Check if 50pt SL hit
  let slHitIdx=-1;
  for(let j=e1.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const adv = e1.signal==='CE' ? e1.entryPx - c.close : c.close - e1.entryPx;
    if(adv >= FIXED_SL){ slHitIdx=j; break; }
  }

  if(slHitIdx===-1){
    // No SL hit — single entry
    const {maxFav, peakTime} = maxFavFrom(cs, e1.entryIdx, e1.signal, e1.entryPx);
    totalMaxFav+=maxFav; count++;
    console.log(`${date}  SINGLE_ENTRY  ${e1.signal}  ${e1.entryPx.toFixed(0)}  @${e1.entryTime}  MaxFav:+${maxFav.toFixed(0).padStart(5)}  peak@${peakTime}`);
    continue;
  }

  // SL hit → re-entry
  const e2 = findEntry(cs, slHitIdx, e1.signal);
  if(!e2){
    count++;
    console.log(`${date}  SL_NO_REENTRY ${e1.signal}  ${e1.entryPx.toFixed(0)}  @${e1.entryTime}  MaxFav:     0  (no re-entry found)`);
    continue;
  }

  const {maxFav, peakTime} = maxFavFrom(cs, e2.entryIdx, e2.signal, e2.entryPx);
  totalMaxFav+=maxFav; count++;
  console.log(
    `${date}  SL→REENTRY    ${e2.signal}  ${e2.entryPx.toFixed(0)}  @${e2.entryTime}  MaxFav:+${maxFav.toFixed(0).padStart(5)}  peak@${peakTime}  [SL was ${e1.signal}]`
  );
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`  Days analyzed          : ${count}`);
console.log(`  Total max favorable    : +${totalMaxFav.toFixed(0)} pts`);
console.log(`  Avg max fav per day    : +${(totalMaxFav/count).toFixed(0)} pts`);
console.log(`${'═'.repeat(70)}`);

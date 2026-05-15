// reentry_capture.js — after 50pt SL + re-entry, max favorable vs actual captured
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const reverseDays = ['2026-04-01','2026-04-02','2026-04-15','2026-04-22','2026-04-24',
                     '2026-04-29','2026-04-30','2026-05-05','2026-05-06','2026-05-07',
                     '2026-05-11','2026-05-13'];

const FIXED_SL = 50;

console.log('\n══ RE-ENTRY CAPTURE — 50pt SL on 12 reverse days\n');
console.log('After re-entry: MaxFav = best possible, Captured = at 3:30 close, Capture% = how much we got');
console.log('');
console.log('Date         E1Sig  R2Sig  R2EntryPx @Time  MaxFav  Captured  Capture%  Net(SL+gain)');
console.log('─'.repeat(90));

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

let totalMaxFav=0, totalCaptured=0, totalNet=0, count=0;

for(const [date,cs] of days){
  if(!reverseDays.includes(date)) continue;
  const dayClose = cs[cs.length-1].close;

  const e1 = findEntry(cs, 0);
  if(!e1) continue;

  // Find SL hit at 50pts
  let slHitIdx=-1;
  for(let j=e1.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const adv = e1.signal==='CE' ? e1.entryPx - c.close : c.close - e1.entryPx;
    if(adv >= FIXED_SL){ slHitIdx=j; break; }
  }

  if(slHitIdx===-1){
    // SL never hit
    const finalMove = e1.signal==='CE' ? dayClose-e1.entryPx : e1.entryPx-dayClose;
    const maxFav = (() => {
      let m=0;
      for(let j=e1.entryIdx+1;j<cs.length;j++){
        const c=cs[j];
        const f=e1.signal==='CE'?c.high-e1.entryPx:e1.entryPx-c.low;
        if(f>m)m=f;
      }
      return m;
    })();
    const pct = maxFav>0 ? Math.round(finalMove/maxFav*100) : 0;
    totalMaxFav+=maxFav; totalCaptured+=finalMove; totalNet+=finalMove; count++;
    console.log(`${date}  ${e1.signal}  --     --         --     +${maxFav.toFixed(0).padStart(5)}  +${finalMove.toFixed(0).padStart(5)}    ${pct}%  SL never hit net:+${finalMove.toFixed(0)}`);
    continue;
  }

  // Re-entry
  const e2 = findEntry(cs, slHitIdx, e1.signal);
  if(!e2){
    totalNet += -FIXED_SL; count++;
    console.log(`${date}  ${e1.signal}  --     NO RE-ENTRY            --      --        --    net:-${FIXED_SL}`);
    continue;
  }

  // From re-entry: max favorable and final captured
  let maxFav=0, captured=0;
  for(let j=e2.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    const fav = e2.signal==='CE' ? c.high - e2.entryPx : e2.entryPx - c.low;
    if(fav>maxFav) maxFav=fav;
    captured = e2.signal==='CE' ? c.close - e2.entryPx : e2.entryPx - c.close;
  }

  const pct = maxFav>0 ? Math.round(captured/maxFav*100) : 0;
  const net = -FIXED_SL + captured;
  totalMaxFav+=maxFav; totalCaptured+=captured; totalNet+=net; count++;

  const sc=captured>=0?'+':'';
  const sn=net>=0?'+':'';
  console.log(
    `${date}  ${e1.signal}  ${e2.signal}  ${e2.entryPx.toFixed(0)} @${e2.entryTime}` +
    `  maxFav:+${maxFav.toFixed(0).padStart(5)}` +
    `  capt:${sc}${captured.toFixed(0).padStart(5)}` +
    `  ${pct.toString().padStart(3)}%` +
    `  net:${sn}${net.toFixed(0)}`
  );
}

console.log(`\n${'═'.repeat(90)}`);
console.log(`  Total max favorable from re-entry : +${totalMaxFav.toFixed(0)} pts  avg:+${(totalMaxFav/count).toFixed(0)}/day`);
console.log(`  Total captured at close           : ${totalCaptured>=0?'+':''}${totalCaptured.toFixed(0)} pts  avg:${(totalCaptured/count)>=0?'+':''}${(totalCaptured/count).toFixed(0)}/day`);
console.log(`  Avg capture %                     : ${Math.round(totalCaptured/totalMaxFav*100)}% of max move`);
console.log(`  Total net (after 50pt SL)         : ${totalNet>=0?'+':''}${totalNet.toFixed(0)} pts  avg:${(totalNet/count)>=0?'+':''}${(totalNet/count).toFixed(0)}/day`);
console.log(`${'═'.repeat(90)}`);

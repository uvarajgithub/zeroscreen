// sl_optimize.js — compare market-based SL vs fixed SL levels on 8 wrong days
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const fixedLevels = [100, 150, 200, 300, 400, 500];

console.log('\n══ SL OPTIMIZATION — 8 wrong first entries\n');
console.log('Market SL = when opposite breakout triggers (current approach)');
console.log('Fixed SL  = exit when price moves X pts against entry\n');

function findEntry(cs, startIdx, skipSignal=null){
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

let totals = {}; // sum of losses per SL type
fixedLevels.forEach(l => totals[l]=0);
totals['market']=0;
let count=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const finalDir = dayMove>0?'UP':'DOWN';

  const e1 = findEntry(cs, 0);
  if(!e1) continue;
  const e1Dir = e1.signal==='CE'?'UP':'DOWN';
  if(e1Dir===finalDir) continue; // only wrong entries

  // Market SL = re-entry trigger price
  const e2 = findEntry(cs, e1.pairIdx+1, e1.signal);
  const marketLoss = e2
    ? (e1.signal==='CE' ? e1.entryPx - e2.entryPx : e2.entryPx - e1.entryPx)
    : 999;
  totals['market'] += marketLoss;

  // Fixed SL: scan candles after entry, find when price first hit each fixed level
  const fixedHit = {};
  fixedLevels.forEach(l => fixedHit[l] = null);

  for(let j=0; j<cs.length; j++){
    const c=cs[j];
    // adverse move on this candle
    const adv = e1.signal==='CE'
      ? e1.entryPx - c.low   // bought, price drops
      : c.high - e1.entryPx; // sold, price rises
    fixedLevels.forEach(l => {
      if(!fixedHit[l] && adv >= l){
        fixedHit[l] = { time: c.time, loss: l };
      }
    });
  }

  fixedLevels.forEach(l => {
    const loss = fixedHit[l] ? fixedHit[l].loss : marketLoss; // if never hit, same as market
    totals[l] += loss;
  });

  count++;
  const sign = dayMove>=0?'+':'';
  console.log(`\n${date}  DayMove:${sign}${dayMove.toFixed(0)}  WrongEntry:${e1.signal}@${e1.entryTime}(${e1.entryPx.toFixed(0)})`);
  console.log(`  Market SL triggered @${e2?e2.entryTime:'--'}  loss = ${marketLoss.toFixed(0)} pts`);
  fixedLevels.forEach(l => {
    const hit = fixedHit[l];
    const saved = marketLoss - l;
    console.log(`  Fixed SL ${l.toString().padStart(3)} pts: ${hit ? `triggered @${hit.time}` : 'NEVER HIT  '} → loss=${l.toString().padStart(3)}  saved vs market: ${saved>=0?'+'+saved.toFixed(0):saved.toFixed(0)}`);
  });
}

console.log(`\n${'═'.repeat(70)}`);
console.log(`  TOTAL LOSS over ${count} wrong days:`);
console.log(`  Market SL : ${totals['market'].toFixed(0)} pts  (avg ${(totals['market']/count).toFixed(0)}/day)`);
fixedLevels.forEach(l => {
  const saved = totals['market'] - totals[l];
  console.log(`  Fixed ${l.toString().padStart(3)} pt SL : ${totals[l].toFixed(0)} pts  (avg ${(totals[l]/count).toFixed(0)}/day)  saved: ${saved>=0?'+'+saved.toFixed(0):saved.toFixed(0)}`);
});
console.log(`${'═'.repeat(70)}`);

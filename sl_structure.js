// sl_structure.js — SL = signal pair's low/high broken on candle close
// Compare: structure SL vs market SL vs fixed 100/150/200
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ STRUCTURE SL — signal pair low/high as SL\n');
console.log('CE entry → SL = close below min(Ca.low, Cb.low) of signal pair');
console.log('PE entry → SL = close above max(Ca.high, Cb.high) of signal pair\n');
console.log('Date         DayMove  Signal  EntryPx  SL_Level  StructureSL_Loss  MarketSL_Loss  Fixed100  Fixed150  Fixed200');
console.log('─'.repeat(110));

function findEntry(cs, startIdx, skipSignal=null){
  for(let i=startIdx; i<cs.length-1; i++){
    const ca=cs[i], cb=cs[i+1];
    if(ca.h>13||(ca.h===13&&ca.m>=30)) break;
    let signal=null, rule=null, breakLevel=null, slLevel=null;
    if(ca.bull===cb.bull){
      signal=ca.bull?'CE':'PE'; rule='A';
      breakLevel=signal==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
      slLevel   =signal==='CE'?Math.min(ca.low,cb.low)  :Math.max(ca.high,cb.high);
    } else if(cb.body_size>ca.body_size){
      signal=cb.bull?'CE':'PE'; rule='B';
      breakLevel=signal==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
      slLevel   =signal==='CE'?Math.min(ca.low,cb.low)            :Math.max(ca.high,cb.high);
    } else continue;
    if(skipSignal && signal===skipSignal) continue;
    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE'&&c.close>breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,pairIdx:i,breakLevel,slLevel,ca,cb};
      if(signal==='PE'&&c.close<breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,pairIdx:i,breakLevel,slLevel,ca,cb};
    }
  }
  return null;
}

let totStructure=0, totMarket=0, tot100=0, tot150=0, tot200=0, count=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const finalDir = dayMove>0?'UP':'DOWN';
  const sign     = dayMove>=0?'+':'';

  const e1 = findEntry(cs, 0);
  if(!e1) continue;
  const e1Dir = e1.signal==='CE'?'UP':'DOWN';
  if(e1Dir===finalDir) continue; // only wrong entries

  // Market SL
  const e2 = findEntry(cs, e1.pairIdx+1, e1.signal);
  const marketLoss = e2
    ? (e1.signal==='CE' ? e1.entryPx - e2.entryPx : e2.entryPx - e1.entryPx)
    : 999;

  // Structure SL: scan candles after entry, find first candle close that breaks slLevel
  let structureLoss = marketLoss; // default = market if structure never breaks
  let slHitTime = '--';
  for(let j=0; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(e1.signal==='CE' && c.close < e1.slLevel){
      structureLoss = e1.entryPx - c.close;
      slHitTime = c.time;
      break;
    }
    if(e1.signal==='PE' && c.close > e1.slLevel){
      structureLoss = c.close - e1.entryPx;
      slHitTime = c.time;
      break;
    }
  }

  // Fixed SLs
  let fix100=marketLoss, fix150=marketLoss, fix200=marketLoss;
  for(let j=0; j<cs.length; j++){
    const c=cs[j];
    const adv = e1.signal==='CE' ? e1.entryPx-c.low : c.high-e1.entryPx;
    if(fix100===marketLoss && adv>=100) fix100=100;
    if(fix150===marketLoss && adv>=150) fix150=150;
    if(fix200===marketLoss && adv>=200) fix200=200;
  }

  totStructure+=structureLoss; totMarket+=marketLoss;
  tot100+=fix100; tot150+=fix150; tot200+=fix200;
  count++;

  const slDist = (e1.signal==='CE'
    ? e1.entryPx - e1.slLevel
    : e1.slLevel - e1.entryPx).toFixed(0);

  console.log(
    `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}  ${e1.signal}@${e1.entryTime}` +
    `  entry=${e1.entryPx.toFixed(0)}  SLlvl=${e1.slLevel.toFixed(0)}(${slDist}pts away)` +
    `  strucSL:${structureLoss.toFixed(0).padStart(4)}@${slHitTime}` +
    `  mktSL:${marketLoss.toFixed(0).padStart(4)}` +
    `  f100:${fix100.toString().padStart(4)}` +
    `  f150:${fix150.toString().padStart(4)}` +
    `  f200:${fix200.toString().padStart(4)}`
  );
}

console.log(`\n${'═'.repeat(110)}`);
console.log(`  TOTAL LOSS (${count} wrong days):`);
console.log(`  Structure SL : ${totStructure.toFixed(0)} pts  avg=${( totStructure/count).toFixed(0)}/day`);
console.log(`  Market SL    : ${totMarket.toFixed(0)} pts  avg=${(totMarket/count).toFixed(0)}/day`);
console.log(`  Fixed 100    : ${tot100} pts  avg=${(tot100/count).toFixed(0)}/day`);
console.log(`  Fixed 150    : ${tot150} pts  avg=${(tot150/count).toFixed(0)}/day`);
console.log(`  Fixed 200    : ${tot200} pts  avg=${(tot200/count).toFixed(0)}/day`);
console.log(`${'═'.repeat(110)}`);

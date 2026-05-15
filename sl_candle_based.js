// sl_candle_based.js — SL = breakout candle low/high OR previous candle low/high
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ CANDLE-BASED SL TEST — 8 wrong first entries\n');
console.log('SL1 = breakout candle low (CE) / high (PE)');
console.log('SL2 = candle before breakout low (CE) / high (PE)\n');
console.log('Date         DayMove  Sig  EntryPx  EntryCandle  SL1(BrkCdl)  Dist1  SL1_Loss  SL2(PrevCdl)  Dist2  SL2_Loss  MktSL');
console.log('─'.repeat(115));

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
      if(signal==='CE'&&c.close>breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i,breakLevel};
      if(signal==='PE'&&c.close<breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,entryIdx:j,pairIdx:i,breakLevel};
    }
  }
  return null;
}

function calcLoss(cs, e1, slLevel){
  // scan candles from entry onwards, find first close that breaks slLevel
  for(let j=e1.entryIdx+1; j<cs.length; j++){
    const c=cs[j];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(e1.signal==='CE' && c.close < slLevel) return { loss: e1.entryPx - c.close, time: c.time };
    if(e1.signal==='PE' && c.close > slLevel) return { loss: c.close - e1.entryPx, time: c.time };
  }
  return null; // SL never hit
}

let totSL1=0, totSL2=0, totMkt=0, count=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const finalDir = dayMove>0?'UP':'DOWN';
  const sign     = dayMove>=0?'+':'';

  const e1 = findEntry(cs, 0);
  if(!e1) continue;
  const e1Dir = e1.signal==='CE'?'UP':'DOWN';
  if(e1Dir===finalDir) continue;

  // Market SL
  const e2 = findEntry(cs, e1.pairIdx+1, e1.signal);
  const marketLoss = e2
    ? (e1.signal==='CE' ? e1.entryPx - e2.entryPx : e2.entryPx - e1.entryPx)
    : 999;

  // Breakout candle and previous candle
  const brkCandle  = cs[e1.entryIdx];
  const prevCandle = cs[e1.entryIdx - 1];

  // SL1 = breakout candle's low (CE) or high (PE)
  const sl1Level = e1.signal==='CE' ? brkCandle.low : brkCandle.high;
  const sl1Dist  = e1.signal==='CE' ? e1.entryPx - sl1Level : sl1Level - e1.entryPx;
  const sl1Hit   = calcLoss(cs, e1, sl1Level);
  const sl1Loss  = sl1Hit ? sl1Hit.loss : 0; // 0 = never hit = no SL loss

  // SL2 = previous candle's low (CE) or high (PE)
  const sl2Level = prevCandle ? (e1.signal==='CE' ? prevCandle.low : prevCandle.high) : sl1Level;
  const sl2Dist  = e1.signal==='CE' ? e1.entryPx - sl2Level : sl2Level - e1.entryPx;
  const sl2Hit   = calcLoss(cs, e1, sl2Level);
  const sl2Loss  = sl2Hit ? sl2Hit.loss : 0;

  totSL1 += sl1Hit ? sl1Loss : marketLoss; // if never hit, we held to market SL
  totSL2 += sl2Hit ? sl2Loss : marketLoss;
  totMkt += marketLoss;
  count++;

  console.log(
    `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}  ${e1.signal}  ${e1.entryPx.toFixed(0)}  @${e1.entryTime}` +
    `  SL1=${sl1Level.toFixed(0)}(${sl1Dist.toFixed(0)}pts)  ${sl1Hit?`hit@${sl1Hit.time} loss=${sl1Loss.toFixed(0)}`:'NEVER HIT'}` +
    `  SL2=${sl2Level.toFixed(0)}(${sl2Dist.toFixed(0)}pts)  ${sl2Hit?`hit@${sl2Hit.time} loss=${sl2Loss.toFixed(0)}`:'NEVER HIT'}` +
    `  mkt=${marketLoss.toFixed(0)}`
  );
}

console.log(`\n${'═'.repeat(115)}`);
console.log(`  TOTAL LOSS (${count} wrong days):  [if SL never hit → counted as market SL]`);
console.log(`  SL1 (breakout candle low/high)  : ${totSL1.toFixed(0)} pts  avg=${(totSL1/count).toFixed(0)}/day`);
console.log(`  SL2 (prev candle low/high)      : ${totSL2.toFixed(0)} pts  avg=${(totSL2/count).toFixed(0)}/day`);
console.log(`  Market SL                       : ${totMkt.toFixed(0)} pts  avg=${(totMkt/count).toFixed(0)}/day`);
console.log(`${'═'.repeat(115)}`);

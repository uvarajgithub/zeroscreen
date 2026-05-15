// breakout_compare.js — compare body breakout vs candle high/low breakout as entry
// Only direction accuracy focus — no SL/target
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

// Get signal days (Case 1 + Case 2 only)
const signals=[];
for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0],c2=cs[1];
  let signal=null, rule=null;
  if(c1.bull===c2.bull){         signal=c1.bull?'CE':'PE'; rule='SAME'; }
  else if(c2.body_size>c1.body_size){ signal=c2.bull?'CE':'PE'; rule='C2BIG'; }
  else continue;
  signals.push({date,signal,rule,c1,c2,cs});
}

console.log('\n══ BREAKOUT LEVEL COMPARISON — direction accuracy focus');
console.log('Body-BB  = close above max(C1.body_high, C2.body_high) for CE');
console.log('High-BB  = close above max(C1.high, C2.high) for CE');
console.log('');
console.log('Date         Sig  Body_BB_lvl  High_BB_lvl  Body_entry@  High_entry@  DayMove  Body_dir  High_dir');
console.log('─'.repeat(100));

let bodyCorr=0,highCorr=0,bodyTotal=0,highTotal=0;
let bodyOnly=0,highOnly=0,both=0,neither=0;

for(const {date,signal,rule,c1,c2,cs} of signals){
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const dayDir   = dayMove>0?'UP':'DN';
  const sigDir   = signal==='CE'?'UP':'DN';

  // Levels
  const bodyLvl = signal==='CE'
    ? Math.max(c1.body_high, c2.body_high)
    : Math.min(c1.body_low,  c2.body_low);
  const candleLvl = signal==='CE'
    ? Math.max(c1.high, c2.high)
    : Math.min(c1.low,  c2.low);

  // Find first breakout candle for each
  let bodyEntry=null, bodyTime=null;
  let highEntry=null, highTime=null;

  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(!bodyEntry){
      if(signal==='CE'&&c.close>bodyLvl)  { bodyEntry=c.close; bodyTime=c.time; }
      if(signal==='PE'&&c.close<bodyLvl)  { bodyEntry=c.close; bodyTime=c.time; }
    }
    if(!highEntry){
      if(signal==='CE'&&c.close>candleLvl){ highEntry=c.close; highTime=c.time; }
      if(signal==='PE'&&c.close<candleLvl){ highEntry=c.close; highTime=c.time; }
    }
    if(bodyEntry&&highEntry) break;
  }

  // Direction match (just: did price confirm signal direction by end of day?)
  const dayCorrect = sigDir===dayDir;
  if(bodyEntry){ bodyTotal++; if(dayCorrect) bodyCorr++; }
  if(highEntry){ highTotal++; if(dayCorrect) highCorr++; }

  if(bodyEntry&&highEntry)   both++;
  else if(bodyEntry&&!highEntry) bodyOnly++;
  else if(!bodyEntry&&highEntry) highOnly++;
  else neither++;

  console.log(
    `${date}  ${signal}  ` +
    `bodyLvl=${bodyLvl.toFixed(0).padStart(7)}  ` +
    `hiLvl=${candleLvl.toFixed(0).padStart(7)}  ` +
    `bodyE=${bodyEntry?bodyTime+' '+bodyEntry.toFixed(0).padStart(6):'NO_ENTRY     '}  ` +
    `hiE=${highEntry?highTime+' '+highEntry.toFixed(0).padStart(6):'NO_ENTRY     '}  ` +
    `move=${((dayMove>=0?'+':'')+dayMove.toFixed(0)).padStart(7)}  ` +
    `${dayCorrect?'✓':'✗'}`
  );
}

console.log('\n══ STATS');
console.log(`Body breakout entries : ${bodyTotal}  →  direction correct ${bodyCorr}/${bodyTotal} = ${bodyTotal?Math.round(bodyCorr/bodyTotal*100):0}%`);
console.log(`High breakout entries : ${highTotal}  →  direction correct ${highCorr}/${highTotal} = ${highTotal?Math.round(highCorr/highTotal*100):0}%`);
console.log(`Both triggered  : ${both} days`);
console.log(`Body only       : ${bodyOnly} days  (high never broke)`);
console.log(`High only       : ${highOnly} days  (body already broken, high not)`);
console.log(`Neither         : ${neither} days`);

// Which entry is earlier (better price) on days where both trigger?
console.log('\n══ ON DAYS WHERE BOTH TRIGGER — which comes first?');
console.log('Date         Sig  Body_entry  Body_time  High_entry  High_time  First?  PriceDiff');
console.log('─'.repeat(85));
let bodyFirst=0, highFirst=0;
for(const {date,signal,rule,c1,c2,cs} of signals){
  const bodyLvl  = signal==='CE'?Math.max(c1.body_high,c2.body_high):Math.min(c1.body_low,c2.body_low);
  const candleLvl= signal==='CE'?Math.max(c1.high,c2.high):Math.min(c1.low,c2.low);
  let bodyEntry=null,bodyTime=null,highEntry=null,highTime=null;
  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(!bodyEntry){
      if(signal==='CE'&&c.close>bodyLvl)  {bodyEntry=c.close;bodyTime=c.time;}
      if(signal==='PE'&&c.close<bodyLvl)  {bodyEntry=c.close;bodyTime=c.time;}
    }
    if(!highEntry){
      if(signal==='CE'&&c.close>candleLvl){highEntry=c.close;highTime=c.time;}
      if(signal==='PE'&&c.close<candleLvl){highEntry=c.close;highTime=c.time;}
    }
    if(bodyEntry&&highEntry) break;
  }
  if(!bodyEntry||!highEntry) continue;
  const bodyIdx=cs.findIndex(c=>c.time===bodyTime);
  const highIdx=cs.findIndex(c=>c.time===highTime);
  const first   = bodyIdx<highIdx?'BODY':bodyIdx>highIdx?'HIGH':'SAME';
  const priceDiff= signal==='CE'?highEntry-bodyEntry:bodyEntry-highEntry;
  if(first==='BODY') bodyFirst++; else if(first==='HIGH') highFirst++;
  console.log(
    `${date}  ${signal}  bodyE=${bodyEntry.toFixed(0).padStart(7)}  @${bodyTime}  hiE=${highEntry.toFixed(0).padStart(7)}  @${highTime}  ${first.padEnd(4)}  priceDiff=${priceDiff.toFixed(0)}`
  );
}
console.log(`Body breaks first: ${bodyFirst} times`);
console.log(`High breaks first: ${highFirst} times`);
console.log('\n→ Body breakout is always earlier/same as high breakout (body is inside candle range)');
console.log('→ High/Low breakout = stronger confirmation but later entry (worse price)');

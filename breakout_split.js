// breakout_split.js — split body vs high/low breakout accuracy by rule
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const signals=[];
for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0],c2=cs[1];
  let signal=null, rule=null;
  if(c1.bull===c2.bull){              signal=c1.bull?'CE':'PE'; rule='SAME_COLOR'; }
  else if(c2.body_size>c1.body_size){ signal=c2.bull?'CE':'PE'; rule='C2>C1_BODY'; }
  else continue;
  signals.push({date,signal,rule,c1,c2,cs});
}

function getEntries(t){
  const {signal,c1,c2,cs}=t;
  const bodyLvl   = signal==='CE'?Math.max(c1.body_high,c2.body_high):Math.min(c1.body_low,c2.body_low);
  const candleLvl = signal==='CE'?Math.max(c1.high,c2.high):Math.min(c1.low,c2.low);
  let bodyEntry=null, highEntry=null;
  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(!bodyEntry){
      if(signal==='CE'&&c.close>bodyLvl)  bodyEntry=c.close;
      if(signal==='PE'&&c.close<bodyLvl)  bodyEntry=c.close;
    }
    if(!highEntry){
      if(signal==='CE'&&c.close>candleLvl) highEntry=c.close;
      if(signal==='PE'&&c.close<candleLvl) highEntry=c.close;
    }
    if(bodyEntry&&highEntry) break;
  }
  return {bodyEntry, highEntry};
}

for(const ruleFilter of ['SAME_COLOR','C2>C1_BODY','ALL']){
  const filtered = ruleFilter==='ALL' ? signals : signals.filter(s=>s.rule===ruleFilter);
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`  RULE: ${ruleFilter}  (${filtered.length} days)`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Date         Sig  C1    C2    BodyEntry  HiEntry  DayMove  Correct?`);
  console.log('─'.repeat(70));

  let bCorr=0,bTotal=0,hCorr=0,hTotal=0;

  for(const t of filtered){
    const {date,signal,rule,c1,c2,cs}=t;
    const dayMove=cs[cs.length-1].close-cs[0].open;
    const dayDir=dayMove>0?'UP':'DN';
    const sigDir=signal==='CE'?'UP':'DN';
    const correct=sigDir===dayDir;
    const {bodyEntry,highEntry}=getEntries(t);

    if(bodyEntry){bTotal++; if(correct)bCorr++;}
    if(highEntry){hTotal++; if(correct)hCorr++;}

    console.log(
      `${date}  ${signal}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}` +
      `  body=${bodyEntry?bodyEntry.toFixed(0).padStart(7):'  NONE '}` +
      `  hi=${highEntry?highEntry.toFixed(0).padStart(7):'  NONE '}` +
      `  ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(7)}` +
      `  ${correct?'✓':'✗'}  [${rule}]`
    );
  }

  console.log(`\n  Body breakout  : ${bCorr}/${bTotal} = ${bTotal?Math.round(bCorr/bTotal*100):0}% direction correct`);
  console.log(`  High/Low break : ${hCorr}/${hTotal} = ${hTotal?Math.round(hCorr/hTotal*100):0}% direction correct`);
}

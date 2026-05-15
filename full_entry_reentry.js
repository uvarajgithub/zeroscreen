// full_entry_reentry.js — rolling entry + re-entry on ALL 28 days, direction accuracy only
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ FULL ENTRY + RE-ENTRY — ALL 28 DAYS — direction accuracy only\n');
console.log('Date         DayMove  Entry1        E1Correct?  ReEntry       R2Correct?  FinalResult');
console.log('─'.repeat(100));

let totalEntries=0, correctEntries=0;
let reentryTaken=0, reentryCorrect=0;
let noEntry=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  const finalDir = dayMove>0?'UP':'DOWN';
  const sign     = dayMove>=0?'+':'';

  // ── Helper: find next valid entry from startIdx, optionally skip a direction
  function findEntry(startIdx, skipSignal=null){
    for(let i=startIdx; i<cs.length-1; i++){
      const ca=cs[i], cb=cs[i+1];
      if(ca.h>13||(ca.h===13&&ca.m>=30)) break; // no new signals after 1:30pm
      let signal=null, rule=null, breakLevel=null;
      if(ca.bull===cb.bull){
        signal=ca.bull?'CE':'PE'; rule='A';
        breakLevel=signal==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
      } else if(cb.body_size>ca.body_size){
        signal=cb.bull?'CE':'PE'; rule='B';
        breakLevel=signal==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
      } else continue;

      if(skipSignal && signal===skipSignal) continue; // skip same direction as wrong trade

      for(let j=i+2; j<cs.length; j++){
        const c=cs[j];
        if(c.h>15||(c.h===15&&c.m>=15)) break;
        if(signal==='CE'&&c.close>breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,pairIdx:i,breakLevel};
        if(signal==='PE'&&c.close<breakLevel) return {signal,rule,entryPx:c.close,entryTime:c.time,pairIdx:i,breakLevel};
      }
    }
    return null;
  }

  // First entry
  const e1 = findEntry(0);

  if(!e1){
    noEntry++;
    console.log(`${date}  ${sign}${dayMove.toFixed(0).padStart(5)}    NO ENTRY`);
    continue;
  }

  totalEntries++;
  const e1Dir     = e1.signal==='CE'?'UP':'DOWN';
  const e1Correct = e1Dir===finalDir;
  if(e1Correct) correctEntries++;

  let reEntryStr = '─────────────────';
  let r2Str      = '─';

  // If first entry wrong → look for re-entry in opposite direction
  if(!e1Correct){
    const e2 = findEntry(e1.pairIdx+1, e1.signal);
    if(e2){
      reentryTaken++;
      totalEntries++;
      const e2Dir     = e2.signal==='CE'?'UP':'DOWN';
      const e2Correct = e2Dir===finalDir;
      if(e2Correct){ reentryCorrect++; correctEntries++; }
      reEntryStr = `R${e2.rule} ${e2.signal} @${e2.entryTime}(${e2.entryPx.toFixed(0)})`;
      r2Str      = e2Correct ? '✓' : '✗';
    }
  }

  const e1Str = `R${e1.rule} ${e1.signal} @${e1.entryTime}(${e1.entryPx.toFixed(0)})`;

  console.log(
    `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}    ${e1Str.padEnd(22)}  ${(e1Correct?'✓ CORRECT':'✗ WRONG').padEnd(10)}  ${reEntryStr.padEnd(22)}  ${r2Str}`
  );
}

console.log(`\n${'═'.repeat(100)}`);
console.log(`  Total days         : ${days.length}`);
console.log(`  Days with no entry : ${noEntry}`);
console.log(`  Total entries taken: ${totalEntries} (first + re-entries)`);
console.log(`  Re-entries taken   : ${reentryTaken}`);
console.log(`  Correct entries    : ${correctEntries}/${totalEntries} = ${Math.round(correctEntries/totalEntries*100)}%`);
console.log(`${'═'.repeat(100)}`);

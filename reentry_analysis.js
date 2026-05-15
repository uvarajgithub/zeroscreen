// reentry_analysis.js — deep dive on 2 wrong days, find re-entry signal
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const wrongDays = ['2026-04-02', '2026-05-06'];

for(const [date,cs] of days){
  if(!wrongDays.includes(date)) continue;

  const dayMove = cs[cs.length-1].close - cs[0].open;
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`  ${date}  DayMove: ${dayMove>=0?'+':''}${dayMove.toFixed(0)} pts  (UP day, we entered PE — WRONG)`);
  console.log(`${'═'.repeat(80)}`);

  // Print all candles
  console.log('\n  All candles:');
  console.log('  Time   Open    High    Low     Close   Color  BodySz  Note');
  console.log('  ' + '─'.repeat(70));
  for(let i=0; i<cs.length; i++){
    const c = cs[i];
    const color = c.bull ? 'GRN' : 'RED';
    const fromOpen = c.close - cs[0].open;
    console.log(
      `  ${c.time}  ${c.open.toFixed(0).padStart(6)}  ${c.high.toFixed(0).padStart(6)}` +
      `  ${c.low.toFixed(0).padStart(6)}  ${c.close.toFixed(0).padStart(6)}` +
      `  ${color}  ${c.body_size.toFixed(0).padStart(5)}  fromOpen:${fromOpen>=0?'+':''}${fromOpen.toFixed(0)}`
    );
  }

  // Find the wrong entry (first valid signal)
  let wrongEntryIdx = -1;
  let wrongEntryPx  = null;
  let wrongSignal   = null;
  console.log('\n  Rolling scan — first signal found:');
  for(let i=0; i<cs.length-1; i++){
    const ca=cs[i], cb=cs[i+1];
    if(ca.h>11||(ca.h===11&&ca.m>=30)) break;
    let signal=null, rule=null, breakLevel=null;
    if(ca.bull===cb.bull){
      signal=ca.bull?'CE':'PE'; rule='A';
      breakLevel=signal==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if(cb.body_size>ca.body_size){
      signal=cb.bull?'CE':'PE'; rule='B';
      breakLevel=signal==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
    } else continue;

    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE'&&c.close>breakLevel){ wrongEntryPx=c.close; wrongEntryIdx=j; wrongSignal=signal; break; }
      if(signal==='PE'&&c.close<breakLevel){ wrongEntryPx=c.close; wrongEntryIdx=j; wrongSignal=signal; break; }
    }
    if(wrongEntryPx){
      console.log(`    Pair C${i+1}+C${i+2} Rule${rule} → ${signal} entered at ${wrongEntryPx} @${cs[wrongEntryIdx].time} ← WRONG`);
      break;
    }
  }

  // Now scan from wrongEntryIdx+1 onwards for RE-ENTRY signal
  console.log('\n  Re-entry scan (after wrong entry):');
  let reEntryFound = false;
  for(let i=wrongEntryIdx; i<cs.length-1; i++){
    const ca=cs[i], cb=cs[i+1];
    if(ca.h>13||(ca.h===13&&ca.m>=30)) break; // stop looking after 1:30pm
    let signal=null, rule=null, breakLevel=null;
    if(ca.bull===cb.bull){
      signal=ca.bull?'CE':'PE'; rule='A';
      breakLevel=signal==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if(cb.body_size>ca.body_size){
      signal=cb.bull?'CE':'PE'; rule='B';
      breakLevel=signal==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
    } else continue;

    if(signal===wrongSignal) continue; // same direction as wrong — skip

    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE'&&c.close>breakLevel){
        const finalMove = cs[cs.length-1].close - c.close;
        console.log(`    Pair C${i+1}+C${i+2}@${ca.time} Rule${rule} → ${signal} re-entry at ${c.close.toFixed(0)} @${c.time}  moveAfter:+${finalMove.toFixed(0)} ← RE-ENTRY`);
        reEntryFound=true; break;
      }
      if(signal==='PE'&&c.close<breakLevel){
        const finalMove = c.close - cs[cs.length-1].close;
        console.log(`    Pair C${i+1}+C${i+2}@${ca.time} Rule${rule} → ${signal} re-entry at ${c.close.toFixed(0)} @${c.time}  moveAfter:+${finalMove.toFixed(0)} ← RE-ENTRY`);
        reEntryFound=true; break;
      }
    }
    if(reEntryFound) break;
  }
  if(!reEntryFound) console.log('    No re-entry signal found');
}

// rolling_entry.js — scan every consecutive candle pair, take first valid signal
// Goal: find entry on ALL 14 big move days
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ ROLLING ENTRY SCAN — all 14 big days (≥400 pts)\n');
console.log('Date         DayMove  SignalPair  Rule  Sig  BreakLvl  EntryPx  EntryTime  Correct?');
console.log('─'.repeat(90));

let correct=0, wrong=0, noEntry=0;

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove = cs[cs.length-1].close - cs[0].open;
  if(Math.abs(dayMove) < 400) continue;

  const finalDir = dayMove > 0 ? 'UP' : 'DOWN';
  const sign = dayMove>=0?'+':'';

  let signalFound = false;

  // Scan consecutive pairs: (0,1), (1,2), (2,3) ... stop at 11:30 candle
  for(let i=0; i<cs.length-1; i++){
    const ca = cs[i];   // first candle of pair
    const cb = cs[i+1]; // second candle of pair

    // Don't look for signals after 11:30
    if(ca.h > 11 || (ca.h===11 && ca.m >= 30)) break;

    let signal=null, rule=null, breakLevel=null;

    if(ca.bull === cb.bull){
      // Rule A: same color → high/low breakout
      signal     = ca.bull ? 'CE' : 'PE';
      rule       = 'A';
      breakLevel = signal==='CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if(cb.body_size > ca.body_size){
      // Rule B: second candle bigger body → body breakout
      signal     = cb.bull ? 'CE' : 'PE';
      rule       = 'B';
      breakLevel = signal==='CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else {
      continue; // C1>C2 opp → skip this pair, try next
    }

    // Now scan from cb+1 onwards for breakout
    let entryPx=null, entryTime=null;
    for(let j=i+2; j<cs.length; j++){
      const c=cs[j];
      if(c.h>15||(c.h===15&&c.m>=15)) break;
      if(signal==='CE' && c.close>breakLevel){ entryPx=c.close; entryTime=c.time; break; }
      if(signal==='PE' && c.close<breakLevel){ entryPx=c.close; entryTime=c.time; break; }
    }

    if(!entryPx) continue; // breakout not triggered for this pair, try next pair

    // Entry found
    signalFound = true;
    const entryDir = signal==='CE' ? 'UP' : 'DOWN';
    const isCorrect = entryDir === finalDir;
    if(isCorrect) correct++; else wrong++;

    const pairLabel = `C${i+1}+C${i+2}@${ca.time}`;
    console.log(
      `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}    ${pairLabel.padEnd(14)}  R${rule}    ${signal}` +
      `  ${breakLevel.toFixed(0).padStart(7)}  ${entryPx.toFixed(0).padStart(7)}  @${entryTime}  ${isCorrect?'✓ CORRECT':'✗ WRONG'}`
    );
    break; // first valid entry found, stop scanning
  }

  if(!signalFound){
    noEntry++;
    console.log(`${date}  ${sign}${dayMove.toFixed(0).padStart(5)}    NO SIGNAL FOUND`);
  }
}

console.log(`\n${'═'.repeat(90)}`);
console.log(`  Entries taken  : ${correct+wrong}`);
console.log(`  Correct        : ${correct}`);
console.log(`  Wrong          : ${wrong}`);
console.log(`  No entry found : ${noEntry}`);
console.log(`  Accuracy       : ${Math.round(correct/(correct+wrong)*100)}%`);
console.log(`${'═'.repeat(90)}`);

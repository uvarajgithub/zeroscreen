// combined_signal.js — combine signal 3 + C2>C1 body rule
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ COMBINED SIGNAL: C1+C2 same direction OR C2 body > C1 body');
console.log('Entry rule: at close of 9:30 candle (C2)');
console.log('');
console.log('Date         C1    C2    Rule             Signal  DayMove  Correct?');
console.log('─'.repeat(72));

let correct=0, total=0, skipped=0;
const trades=[];

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  const dayMove = cs[cs.length-1].close - cs[0].open;
  const dayHigh = Math.max(...cs.map(c=>c.high));
  const dayLow  = Math.min(...cs.map(c=>c.low));

  let signal=null, rule=null;

  if(c1.bull === c2.bull){
    // Same direction
    signal = c1.bull ? 'CE' : 'PE';
    rule   = 'C1+C2 SAME';
  } else if(c2.body_size > c1.body_size){
    // Opposite but C2 bigger
    signal = c2.bull ? 'CE' : 'PE';
    rule   = 'C2>C1 BODY';
  } else {
    // Skip
    skipped++;
    console.log(`${date}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}   SKIP             -       ${(dayMove>=0?'+':'')+dayMove.toFixed(0)}`);
    continue;
  }

  const dayDir   = dayMove > 0 ? 'UP' : 'DN';
  const sigDir   = signal === 'CE' ? 'UP' : 'DN';
  const isCorrect = sigDir === dayDir;
  if(isCorrect) correct++;
  total++;

  // Max profit if correct (how far did it go in our direction from entry)
  const entryPrice = c2.close;
  const maxProfit  = signal==='CE' ? dayHigh - entryPrice : entryPrice - dayLow;
  const dayResult  = signal==='CE' ? dayMove : -dayMove;

  trades.push({date,signal,rule,entryPrice,dayMove,dayResult,maxProfit,isCorrect,c1,c2,cs});

  console.log(
    `${date}  ${c1.bull?'GRN':'RED'}   ${c2.bull?'GRN':'RED'}   ${rule.padEnd(16)} ${signal}   ${(dayMove>=0?'+':'')+dayMove.toFixed(0).padStart(6)}   ${isCorrect?'✓ WIN':'✗ LOSS'}  maxProfit=${maxProfit.toFixed(0)}`
  );
}

console.log(`\n→ Combined signal: ${correct}/${total} correct = ${Math.round(correct/total*100)}%`);
console.log(`→ Skipped (C1>C2 body opposite): ${skipped} days`);
console.log(`→ Total days: ${total+skipped}`);

// Now simulate P&L with different SL/Target combos
console.log('\n══ P&L SIMULATION — Entry at C2 close, various SL/Target');
console.log('(underlying pts, then × Rs15 = option P&L)');
console.log('');

const combos = [
  { sl:100, tgt:200 },
  { sl:100, tgt:300 },
  { sl:150, tgt:300 },
  { sl:100, tgt:null }, // hold to EOD
  { sl:150, tgt:null }, // hold to EOD
];

for(const {sl, tgt} of combos){
  let totalPts=0, wins=0, losses=0;
  const label = tgt ? `SL=${sl} TGT=${tgt}` : `SL=${sl} EOD`;
  for(const t of trades){
    const cs = t.cs;
    const entry = t.c2.close;
    const dir   = t.signal;
    let pnl = 0;
    let exited = false;

    for(let i=2; i<cs.length; i++){
      const c = cs[i];
      const isEOD = c.h>15||(c.h===15&&c.m>=15);
      const profit = dir==='CE' ? c.high - entry : entry - c.low;
      const loss   = dir==='CE' ? entry - c.low  : c.high - entry;

      if(tgt && profit >= tgt){
        pnl = tgt; exited=true; break;
      }
      if(loss >= sl){
        pnl = -sl; exited=true; break;
      }
      if(isEOD){
        pnl = dir==='CE' ? c.close-entry : entry-c.close;
        exited=true; break;
      }
    }
    if(!exited) pnl = dir==='CE' ? cs[cs.length-1].close-entry : entry-cs[cs.length-1].close;
    totalPts += pnl;
    if(pnl>0) wins++; else losses++;
  }
  const rs = totalPts * 15;
  console.log(`  ${label.padEnd(18)} → ${wins}W ${losses}L  Pts=${totalPts>=0?'+':''}${totalPts.toFixed(0)}  Rs=${rs>=0?'+':'-'}${Math.abs(Math.round(rs)).toLocaleString('en-IN')}  (${Math.round(wins/(wins+losses)*100)}%)`);
}

// Show each trade detail for best combo (SL100 EOD)
console.log('\n══ TRADE-BY-TRADE DETAIL  (Entry=C2 close, SL=100, hold to EOD)');
console.log('Date         Signal  Entry    EOD/Exit  Pts      Rs');
console.log('─'.repeat(58));
let runPts=0;
for(const t of trades){
  const cs=t.cs, entry=t.c2.close, dir=t.signal;
  let pnl=0;
  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    const isEOD=c.h>15||(c.h===15&&c.m>=15);
    const loss=dir==='CE'?entry-c.low:c.high-entry;
    if(loss>=100){pnl=-100;break;}
    if(isEOD){pnl=dir==='CE'?c.close-entry:entry-c.close;break;}
  }
  runPts+=pnl;
  const rs=pnl*15;
  console.log(
    `${t.date}  ${dir}     ${entry.toFixed(0).padStart(7)}  ${(pnl>=0?'+':'')+pnl.toFixed(0).padStart(7)}  ${(rs>=0?'+':'')+(rs.toFixed(0)).padStart(8)}  run=${runPts.toFixed(0)}`
  );
}
console.log(`\nTotal: ${(runPts*15>=0?'+Rs':'-Rs')+Math.abs(Math.round(runPts*15)).toLocaleString('en-IN')} over 1 month`);

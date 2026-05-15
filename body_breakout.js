// body_breakout.js — entry on body breakout of C1+C2 range
// CE: enter when any candle closes ABOVE max(C1 body_high, C2 body_high)
// PE: enter when any candle closes BELOW min(C1 body_low, C2 body_low)
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

// Get signal days (same logic as before)
const signals=[];
for(const [date,cs] of days){
  if(cs.length<3) continue;
  const c1=cs[0], c2=cs[1];
  let signal=null, rule=null;
  if(c1.bull===c2.bull){
    signal=c1.bull?'CE':'PE'; rule='SAME';
  } else if(c2.body_size>c1.body_size){
    signal=c2.bull?'CE':'PE'; rule='C2BIG';
  } else continue;
  signals.push({date,signal,rule,c1,c2,cs});
}

console.log('\n══ BODY BREAKOUT ENTRY ANALYSIS');
console.log('CE: enter on first candle that closes ABOVE max(C1_body_high, C2_body_high)');
console.log('PE: enter on first candle that closes BELOW min(C1_body_low,  C2_body_low)');
console.log('');
console.log('Date         Sig  Rule    BreakLevel  EntryAt  EntryTime  DayHigh  DayLow  EOD_PnL  Result');
console.log('─'.repeat(95));

let entryCount=0, noEntry=0, wins=0, losses=0, totalPts=0;

for(const t of signals){
  const {date,signal,rule,c1,c2,cs} = t;

  // Breakout level = body range of C1+C2
  const bodyBreakHigh = Math.max(c1.body_high, c2.body_high); // for CE
  const bodyBreakLow  = Math.min(c1.body_low,  c2.body_low);  // for PE
  const breakLevel    = signal==='CE' ? bodyBreakHigh : bodyBreakLow;

  const dayHigh = Math.max(...cs.map(c=>c.high));
  const dayLow  = Math.min(...cs.map(c=>c.low));

  // Scan from C3 onwards for breakout
  let entryPrice=null, entryTime=null, entryIdx=null;
  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    const isEOD = c.h>15||(c.h===15&&c.m>=15);
    if(isEOD) break;
    if(signal==='CE' && c.close > bodyBreakHigh){
      entryPrice=c.close; entryTime=c.time; entryIdx=i; break;
    }
    if(signal==='PE' && c.close < bodyBreakLow){
      entryPrice=c.close; entryTime=c.time; entryIdx=i; break;
    }
  }

  if(!entryPrice){
    noEntry++;
    console.log(`${date}  ${signal}  ${rule.padEnd(6)}  level=${breakLevel.toFixed(0).padStart(7)}  NO BREAKOUT in session`);
    continue;
  }

  // EOD P&L from entry
  const eodClose = cs[cs.length-1].close;
  const eodPnl   = signal==='CE' ? eodClose-entryPrice : entryPrice-eodClose;
  totalPts += eodPnl;
  entryCount++;
  if(eodPnl>0) wins++; else losses++;

  console.log(
    `${date}  ${signal}  ${rule.padEnd(6)}` +
    `  lvl=${breakLevel.toFixed(0).padStart(6)}` +
    `  entry=${entryPrice.toFixed(0).padStart(6)}  @${entryTime}` +
    `  H=${dayHigh.toFixed(0).padStart(6)}  L=${dayLow.toFixed(0).padStart(6)}` +
    `  eodPnl=${((eodPnl>=0?'+':'')+eodPnl.toFixed(0)).padStart(7)}` +
    `  ${eodPnl>0?'✓ WIN':'✗ LOSS'}`
  );
}

console.log(`\nEntries taken : ${entryCount}`);
console.log(`No breakout   : ${noEntry} (skipped)`);
console.log(`Wins/Losses   : ${wins}W / ${losses}L = ${entryCount?Math.round(wins/entryCount*100):0}% win rate`);
console.log(`Total EOD pts : ${totalPts>=0?'+':''}${totalPts.toFixed(0)}  Rs ${(totalPts*15>=0?'+':'-')+Math.abs(Math.round(totalPts*15)).toLocaleString('en-IN')}`);

// Compare: body breakout vs plain C2 close entry, on same days
console.log('\n══ COMPARE: Body-breakout entry vs C2-close entry (EOD exit, no SL)');
console.log('Date         Sig  C2Entry  C2eod    BodyEntry  BodyEod   Diff');
console.log('─'.repeat(70));
let c2total=0, bbTotal=0;
for(const t of signals){
  const {date,signal,c1,c2,cs}=t;
  const bodyBreakHigh=Math.max(c1.body_high,c2.body_high);
  const bodyBreakLow =Math.min(c1.body_low, c2.body_low);
  const eodClose=cs[cs.length-1].close;
  const c2Pnl = signal==='CE'?eodClose-c2.close:c2.close-eodClose;

  let bbEntry=null;
  for(let i=2;i<cs.length;i++){
    const c=cs[i];
    if(c.h>15||(c.h===15&&c.m>=15)) break;
    if(signal==='CE'&&c.close>bodyBreakHigh){bbEntry=c.close;break;}
    if(signal==='PE'&&c.close<bodyBreakLow ){bbEntry=c.close;break;}
  }
  const bbPnl = bbEntry ? (signal==='CE'?eodClose-bbEntry:bbEntry-eodClose) : null;

  c2total+=c2Pnl;
  if(bbPnl!==null) bbTotal+=bbPnl;

  console.log(
    `${date}  ${signal}` +
    `  c2=${c2.close.toFixed(0).padStart(6)}  pnl=${((c2Pnl>=0?'+':'')+c2Pnl.toFixed(0)).padStart(7)}` +
    (bbEntry ? `  bbEntry=${bbEntry.toFixed(0).padStart(6)}  pnl=${((bbPnl>=0?'+':'')+bbPnl.toFixed(0)).padStart(7)}  diff=${((bbPnl-c2Pnl>=0?'+':''+(bbPnl-c2Pnl).toFixed(0))).padStart(7)}` : `  NO_BB`)
  );
}
console.log(`\nC2-close entry total EOD : ${c2total>=0?'+':''}${c2total.toFixed(0)} pts  Rs${(c2total*15>=0?'+':'-')+Math.abs(Math.round(c2total*15)).toLocaleString('en-IN')}`);
console.log(`Body-breakout entry total: ${bbTotal>=0?'+':''}${bbTotal.toFixed(0)} pts  Rs${(bbTotal*15>=0?'+':'-')+Math.abs(Math.round(bbTotal*15)).toLocaleString('en-IN')}`);

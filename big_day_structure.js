// big_day_structure.js — classify each big day's intraday structure
'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

console.log('\n══ 14 BIG DAYS (≥400 pts) — intraday structure\n');
console.log('Date         Move   Type                 Early(C1-C4)  Peak@  Dip before peak');
console.log('─'.repeat(80));

for(const [date,cs] of days){
  if(cs.length<3) continue;
  const dayMove  = cs[cs.length-1].close - cs[0].open;
  if(Math.abs(dayMove) < 400) continue;

  const dir      = dayMove > 0 ? 'UP' : 'DOWN';
  const dayOpen  = cs[0].open;

  // Track running move from open, candle by candle
  // favorable = in final day direction
  let maxAdverse = 0;   // worst move AGAINST final direction before peak
  let peakFav    = 0;
  let peakTime   = '';
  let adverseBeforePeak = 0;
  let peakFound  = false;

  // Find when peak favorable was reached
  for(let i=0; i<cs.length; i++){
    const c = cs[i];
    const favNow = dir==='UP' ? c.high - dayOpen : dayOpen - c.low;
    const advNow = dir==='UP' ? dayOpen - c.low  : c.high - dayOpen;
    if(favNow > peakFav){ peakFav=favNow; peakTime=c.time; adverseBeforePeak=maxAdverse; }
    if(advNow > maxAdverse) maxAdverse=advNow;
  }

  // Classify early behavior using first 4 candles (C1-C4 = 9:15 to 10:00)
  const earlyCandles = cs.slice(0,4);
  const earlyHigh = Math.max(...earlyCandles.map(c=>c.high));
  const earlyLow  = Math.min(...earlyCandles.map(c=>c.low));
  const earlyMove = dir==='UP' ? earlyHigh-dayOpen : dayOpen-earlyLow; // favorable
  const earlyAdv  = dir==='UP' ? dayOpen-earlyLow  : earlyHigh-dayOpen; // adverse

  // Classification
  let type;
  if(adverseBeforePeak < 50){
    type = '1. CLEAN ONE-SIDE   ';
  } else if(adverseBeforePeak < 150){
    type = '2. MINOR DIP+TREND  ';
  } else if(earlyAdv > earlyMove){
    type = '3. REVERSE→TREND    ';
  } else {
    type = '4. CHOPPY→TREND     ';
  }

  const sign = dayMove>=0?'+':'';
  console.log(
    `${date}  ${sign}${dayMove.toFixed(0).padStart(5)}  ${type}` +
    `  earlyFav:${earlyMove.toFixed(0).padStart(4)} advB4peak:${adverseBeforePeak.toFixed(0).padStart(4)}` +
    `  peak@${peakTime}`
  );
}
console.log(`\n  earlyFav = max favorable in first 4 candles (9:15-10:00)`);
console.log(`  advB4peak = max adverse move before reaching the day's peak`);

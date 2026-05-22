'use strict';
/**
 * BREAKOUT STRATEGY
 * Signal : First pair of consecutive same-color candles in the day
 *          Entry at 2nd candle's close
 * SL     : Low of the 1st same-color candle (CE) / High of 1st (PE)
 * Target : NONE — hold till EOD
 * Exit   : Candle closes beyond SL, or EOD
 */
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));

const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const date = ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0');
  return { date, h: ist.getHours(), m: ist.getMinutes(),
           open: c.open, high: c.high, low: c.low, close: c.close };
}).filter(c => c.close > 0);

const byDay = {};
for (const c of candles) {
  if (!byDay[c.date]) byDay[c.date] = [];
  byDay[c.date].push(c);
}

function runMonth(label, fromDate, toDate) {
  const dates = Object.keys(byDay).sort().filter(d => d >= fromDate && d <= toDate && byDay[d].length >= 3);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  let totalRs = 0, wins = 0, losses = 0;

  console.log('='.repeat(82));
  console.log(' ' + label);
  console.log('='.repeat(82));
  console.log(' Date        | Signal candles  | Dir | Entry | SL    | Exit  | Pts    | Rs       ');
  console.log('-'.repeat(82));

  for (const date of dates) {
    const cs = byDay[date];

    // Rolling scan: find first pair of consecutive same-color candles
    let signal = null;
    for (let i = 1; i < cs.length; i++) {
      if (isEOD(cs[i])) break;
      const prev = cs[i-1], curr = cs[i];
      const prevBull = prev.close >= prev.open;
      const currBull = curr.close >= curr.open;
      if (prevBull === currBull) {
        const dir = currBull ? 'CE' : 'PE';
        const sl  = dir === 'CE' ? prev.low : prev.high;
        const entryTime = curr.h + ':' + String(curr.m).padStart(2,'0');
        signal = { dir, entry: curr.close, sl, entryIdx: i, entryTime };
        break;
      }
    }

    if (!signal) {
      console.log(' ' + date + ' | no consecutive same-color candles found');
      continue;
    }

    // Simulate from next candle onwards
    let exitPts = null, exitNote = '', exitClose = null;
    for (let i = signal.entryIdx + 1; i < cs.length; i++) {
      const c = cs[i];
      const slHit = signal.dir === 'CE' ? c.close <= signal.sl : c.close >= signal.sl;
      if (slHit) {
        exitClose = c.close;
        exitPts   = signal.dir === 'CE' ? c.close - signal.entry : signal.entry - c.close;
        exitNote  = 'SL@' + c.h + ':' + String(c.m).padStart(2,'0');
        break;
      }
      if (isEOD(c)) {
        exitClose = c.close;
        exitPts   = signal.dir === 'CE' ? c.close - signal.entry : signal.entry - c.close;
        exitNote  = 'EOD';
        break;
      }
    }
    if (exitPts === null) {
      const last = cs[cs.length-1];
      exitPts = signal.dir === 'CE' ? last.close - signal.entry : signal.entry - last.close;
      exitNote = 'EOD'; exitClose = last.close;
    }

    const rs     = Math.round(exitPts * 15);
    totalRs     += rs;
    if (exitPts > 0) wins++; else if (exitPts < 0) losses++;

    const slDist = Math.abs(signal.entry - signal.sl).toFixed(0);
    const ptsStr = (exitPts >= 0 ? '+' : '') + exitPts.toFixed(0);
    const rsStr  = (rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN');
    const tag    = exitPts > 0 ? 'WIN' : 'LOSS';

    console.log(
      ' ' + date + ' | entry@' + signal.entryTime.padEnd(5) + ' SL=' + slDist.padStart(3) + 'pts' +
      ' | ' + signal.dir + ' | ' +
      signal.entry.toFixed(0).padStart(5) + ' | ' +
      signal.sl.toFixed(0).padStart(5) + ' | ' +
      (exitClose||0).toFixed(0).padStart(5) + ' | ' +
      ptsStr.padStart(6) + ' | ' +
      rsStr.padStart(8) + '  ' + tag + ' ' + exitNote
    );
  }

  const tradeDays = wins + losses;
  console.log('-'.repeat(82));
  console.log(' ' + label.split(' ')[0] + ' TOTAL : Rs ' + (totalRs>=0?'+':'') + totalRs.toLocaleString('en-IN') +
    '  |  Wins: ' + wins + '  Losses: ' + losses +
    '  Win%: ' + (tradeDays ? ((wins/tradeDays)*100).toFixed(1) : '0') + '%');
  console.log('');
  return totalRs;
}

const mar = runMonth('MARCH 2026', '2026-03-01', '2026-03-31');
const apr = runMonth('APRIL 2026', '2026-04-01', '2026-04-30');
console.log('='.repeat(82));
console.log(' MARCH + APRIL TOTAL : Rs ' + (mar+apr>=0?'+':'') + (mar+apr).toLocaleString('en-IN'));
console.log('='.repeat(82));

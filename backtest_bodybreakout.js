'use strict';
/**
 * BODY BREAKOUT STRATEGY
 * Signal : When a candle's close breaks the BODY of the most recent
 *          same-color candle (not necessarily consecutive)
 *          GREEN: new green close > prev green close  -> CE entry
 *          RED  : new red close   < prev red close   -> PE entry
 * SL     : CE -> prev green candle's LOW
 *          PE -> prev red candle's HIGH
 * Target : NONE — hold till EOD or SL hit (candle close beyond SL)
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

  console.log('='.repeat(86));
  console.log(' ' + label);
  console.log('='.repeat(86));
  console.log(' Date        | Signal            | Dir | Entry | SL    | Exit  | Pts    | Rs      ');
  console.log('-'.repeat(86));

  for (const date of dates) {
    const cs = byDay[date];

    // Rolling scan: track last green and last red candle
    // Signal when current candle's close breaks previous same-color candle's body
    let lastGreen = null;
    let lastRed   = null;
    let signal    = null;

    for (let i = 0; i < cs.length; i++) {
      if (isEOD(cs[i])) break;
      const c    = cs[i];
      const bull = c.close >= c.open;

      if (bull) {
        // Green candle
        if (lastGreen && c.close > lastGreen.close) {
          // Body breakout CE: this green's close > prev green's close (body high)
          const entryTime = c.h + ':' + String(c.m).padStart(2,'0');
          const prevTime  = lastGreen.h + ':' + String(lastGreen.m).padStart(2,'0');
          signal = {
            dir: 'CE', entry: c.close, sl: lastGreen.low,
            entryIdx: i, entryTime,
            note: 'G' + prevTime + '->G' + entryTime
          };
          break;
        }
        lastGreen = c; // update most recent green
      } else {
        // Red candle
        if (lastRed && c.close < lastRed.close) {
          // Body breakout PE: this red's close < prev red's close (body low)
          const entryTime = c.h + ':' + String(c.m).padStart(2,'0');
          const prevTime  = lastRed.h + ':' + String(lastRed.m).padStart(2,'0');
          signal = {
            dir: 'PE', entry: c.close, sl: lastRed.high,
            entryIdx: i, entryTime,
            note: 'R' + prevTime + '->R' + entryTime
          };
          break;
        }
        lastRed = c; // update most recent red
      }
    }

    if (!signal) {
      console.log(' ' + date + ' | no body breakout signal');
      continue;
    }

    // Hold from next candle till EOD or SL hit
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
    const tag    = exitPts > 0 ? 'WIN ' : 'LOSS';

    console.log(
      ' ' + date + ' | ' + signal.note.padEnd(17) +
      ' | ' + signal.dir + ' | ' +
      signal.entry.toFixed(0).padStart(5) + ' | ' +
      signal.sl.toFixed(0).padStart(5) + ' | ' +
      (exitClose||0).toFixed(0).padStart(5) + ' | ' +
      ptsStr.padStart(6) + ' | ' +
      rsStr.padStart(8) + '  ' + tag + ' ' + exitNote + ' (SL=' + slDist + ')'
    );
  }

  const tradeDays = wins + losses;
  console.log('-'.repeat(86));
  console.log(' ' + label.split(' ')[0] + ' TOTAL : Rs ' + (totalRs>=0?'+':'') + totalRs.toLocaleString('en-IN') +
    '  Wins: ' + wins + '  Losses: ' + losses +
    '  Win%: ' + (tradeDays ? ((wins/tradeDays)*100).toFixed(1) : '0') + '%');
  console.log('');
  return totalRs;
}

const mar = runMonth('MARCH 2026', '2026-03-01', '2026-03-31');
const apr = runMonth('APRIL 2026', '2026-04-01', '2026-04-30');
console.log('='.repeat(86));
console.log(' MARCH + APRIL TOTAL : Rs ' + (mar+apr>=0?'+':'') + (mar+apr).toLocaleString('en-IN'));
console.log('='.repeat(86));

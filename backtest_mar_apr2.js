'use strict';
/**
 * YOUR STRATEGY — Every trading day in March & April 2026
 * Signal : C2 & C3 same direction (CE if both green, PE if both red)
 *          Entry at C3 close
 * SL     : C2 low (CE) or C2 high (PE) — candle close exit
 * Trail  : NONE
 * Exit   : EOD
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

  console.log('='.repeat(78));
  console.log(' ' + label);
  console.log('='.repeat(78));
  console.log(' Date        | Dir | Entry | SL    | Exit  | Pts    | Rs       | Result');
  console.log('-'.repeat(78));

  for (const date of dates) {
    const cs = byDay[date];
    const C1 = cs[0], C2 = cs[1], C3 = cs[2];

    const C1bull = C1.close >= C1.open;
    const C2bull = C2.close >= C2.open;
    const C3bull = C3.close >= C3.open;

    // Signal: C2 + C3 same direction
    let dir = null;
    if (C2bull && C3bull)   dir = 'CE';
    if (!C2bull && !C3bull) dir = 'PE';

    if (!dir) {
      console.log(' ' + date + ' | --- | C2 & C3 opposite — no signal');
      continue;
    }

    const C1tag  = C1bull ? 'C1=G' : 'C1=R';
    const entry  = C3.close;
    const sl     = dir === 'CE' ? C2.low : C2.high;
    const slDist = Math.abs(entry - sl).toFixed(0);

    let exitPts = null, exitNote = '', exitClose = null;
    for (let i = 3; i < cs.length; i++) {
      const c = cs[i];
      const slHit = dir === 'CE' ? c.close <= sl : c.close >= sl;
      if (slHit) {
        exitClose = c.close;
        exitPts   = dir === 'CE' ? c.close - entry : entry - c.close;
        exitNote  = 'SL ' + c.h + ':' + String(c.m).padStart(2,'0');
        break;
      }
      if (isEOD(c)) {
        exitClose = c.close;
        exitPts   = dir === 'CE' ? c.close - entry : entry - c.close;
        exitNote  = 'EOD';
        break;
      }
    }
    if (exitPts === null) {
      const last = cs[cs.length-1];
      exitPts = dir === 'CE' ? last.close - entry : entry - last.close;
      exitNote = 'EOD'; exitClose = last.close;
    }

    const rs     = Math.round(exitPts * 15);
    totalRs     += rs;
    const win    = exitPts > 0;
    if (exitPts > 0) wins++; else if (exitPts < 0) losses++;

    const ptsStr = (exitPts >= 0 ? '+' : '') + exitPts.toFixed(0);
    const rsStr  = (rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN');
    const tag    = win ? 'WIN' : 'LOSS';

    console.log(
      ' ' + date + ' | ' + dir + ' | ' +
      entry.toFixed(0).padStart(5) + ' | ' +
      sl.toFixed(0).padStart(5) + ' | ' +
      (exitClose||0).toFixed(0).padStart(5) + ' | ' +
      ptsStr.padStart(6) + ' | ' +
      rsStr.padStart(8) + ' | ' +
      tag + ' — ' + exitNote + ' (' + C1tag + ', SL=' + slDist + 'pts)'
    );
  }

  const tradeDays = wins + losses;
  console.log('-'.repeat(78));
  console.log(' ' + label.split(' ')[0] + ' TOTAL : Rs ' + (totalRs>=0?'+':'') + totalRs.toLocaleString('en-IN') +
    '  |  Wins: ' + wins + '  Losses: ' + losses +
    '  |  Win%: ' + (tradeDays ? ((wins/tradeDays)*100).toFixed(1) : '0') + '%');
  console.log('');
  return totalRs;
}

const mar = runMonth('MARCH 2026', '2026-03-01', '2026-03-31');
const apr = runMonth('APRIL 2026', '2026-04-01', '2026-04-30');
console.log('='.repeat(78));
console.log(' MARCH + APRIL COMBINED : Rs ' + (mar+apr>=0?'+':'') + (mar+apr).toLocaleString('en-IN'));
console.log('='.repeat(78));

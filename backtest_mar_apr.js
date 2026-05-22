'use strict';
/**
 * YOUR STRATEGY — March & April 2026 daily P&L
 * Signal : C1 opposite direction to C2+C3
 *          C2 & C3 same direction → entry at C3 close
 *          CE if C2+C3 bullish | PE if C2+C3 bearish
 * SL     : C2 low (CE) or C2 high (PE) — candle close exit
 * Trail  : NONE
 * Exit   : EOD (3:15 PM)
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

// Filter March + April 2026
const dates = Object.keys(byDay).sort().filter(d =>
  (d >= '2026-03-01' && d <= '2026-04-30') && byDay[d].length >= 5
);

const RS_PT = 15;
let totalPts = 0, wins = 0, losses = 0;

console.log('='.repeat(75));
console.log(' YOUR STRATEGY — March & April 2026');
console.log(' C1 opposite + C2+C3 same direction | SL=C2 low/high | No Trail | EOD');
console.log('='.repeat(75));
console.log(' Date        | Dir | Entry | SL    | Exit  | Pts    | Rs      | Note');
console.log('-'.repeat(75));

for (const date of dates) {
  const cs = byDay[date];
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);

  // Need at least 3 candles
  if (cs.length < 3) continue;
  const C1 = cs[0], C2 = cs[1], C3 = cs[2];

  const C1bull = C1.close >= C1.open;
  const C2bull = C2.close >= C2.open;
  const C3bull = C3.close >= C3.open;

  // Signal: C1 opposite to C2+C3, AND C2+C3 same direction
  let dir = null;
  if (!C1bull && C2bull && C3bull) dir = 'CE';  // C1 red, C2 green, C3 green
  if (C1bull && !C2bull && !C3bull) dir = 'PE'; // C1 green, C2 red, C3 red

  if (!dir) {
    console.log(' ' + date + ' | --- | NO SIGNAL');
    continue;
  }

  const entry = C3.close;
  const sl    = dir === 'CE' ? C2.low : C2.high;
  const slDist = Math.abs(entry - sl).toFixed(0);

  // Simulate from C4 onwards
  let exitPts = null, exitNote = '', exitClose = null;
  for (let i = 3; i < cs.length; i++) {
    const c = cs[i];
    const closeBelow = dir === 'CE' ? c.close <= sl : c.close >= sl;
    if (closeBelow) {
      exitClose = c.close;
      exitPts   = dir === 'CE' ? c.close - entry : entry - c.close;
      exitNote  = 'SL@' + c.h + ':' + String(c.m).padStart(2,'0');
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
    exitNote = 'EOD';
  }

  const rs = Math.round(exitPts * RS_PT);
  totalPts += exitPts;
  if (exitPts > 0) wins++; else if (exitPts < 0) losses++;

  const ptsStr = (exitPts >= 0 ? '+' : '') + exitPts.toFixed(0);
  const rsStr  = (rs >= 0 ? '+' : '') + rs.toLocaleString('en-IN');
  console.log(
    ' ' + date + ' | ' + dir + ' | ' +
    entry.toFixed(0).padStart(5) + ' | ' +
    sl.toFixed(0).padStart(5) + ' | ' +
    (exitClose||0).toFixed(0).padStart(5) + ' | ' +
    ptsStr.padStart(6) + ' | ' +
    rsStr.padStart(7) + ' | ' +
    exitNote + ' (SL dist=' + slDist + ')'
  );
}

const totalRs = Math.round(totalPts * RS_PT);
console.log('='.repeat(75));
console.log(' TOTAL : ' + (totalPts>=0?'+':'') + totalPts.toFixed(0) + ' pts | Rs ' + (totalRs>=0?'+':'') + totalRs.toLocaleString('en-IN'));
console.log(' Wins  : ' + wins + '  Losses: ' + losses + '  Win%: ' + ((wins/(wins+losses))*100).toFixed(1) + '%');
console.log('='.repeat(75));

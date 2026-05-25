const d = require('./cache/banknifty_2026.json');

const prev = d['2026-05-19'];
const prevClose = prev[prev.length - 1].close;
const prevHigh  = Math.max(...prev.map(x => x.high));
const prevLow   = Math.min(...prev.map(x => x.low));
console.log('=== MAY 19 (prev day) ===');
console.log('PDH:', prevHigh, ' PDL:', prevLow, ' PDC:', prevClose);

const c = d['2026-05-20'];
const c0 = c[0]; // 9:15
const c1 = c[1]; // 9:30
const eod = c[c.length - 1].close;

console.log('\n=== MAY 20 ALL CANDLES ===');
c.forEach((x, i) => {
  const timeStr = x.h + ':' + String(x.m).padStart(2,'0');
  const body = (x.close - x.open).toFixed(0);
  const dir = x.close > x.open ? 'BULL' : 'BEAR';
  const mark = i <= 1 ? ' <---' : '';
  console.log(`C${String(i).padStart(2)} ${timeStr}  open=${x.open}  high=${x.high}  low=${x.low}  close=${x.close}  body=${body} ${dir}${mark}`);
});

console.log('\n=== C0 (9:15) BREAKDOWN ===');
const body0 = c0.close - c0.open;
const range0 = c0.high - c0.low;
console.log('Body:', body0.toFixed(0), '  Body%:', (body0/range0*100).toFixed(1)+'%');
console.log('Open vs PDH:', (c0.open - prevHigh).toFixed(0), 'pts');
console.log('Open vs PDL:', (c0.open - prevLow).toFixed(0), 'pts');
console.log('Gap from prevClose:', (c0.open - prevClose).toFixed(0), 'pts');

console.log('\n=== C1 (9:30) BREAKDOWN ===');
const body1 = c1.close - c1.open;
const range1 = c1.high - c1.low;
console.log('Body:', body1.toFixed(0), '  Body%:', (body1/range1*100).toFixed(1)+'%');
console.log('C1 high vs C0 high:', (c1.high - c0.high).toFixed(0));
console.log('C1 low vs C0 low:', (c1.low - c0.low).toFixed(0));
console.log('C1 close vs PDH:', (c1.close - prevHigh).toFixed(0), 'pts');

console.log('\n=== P&L: Enter CE at C1 close, exit EOD ===');
const move = eod - c1.close;
console.log('Entry (C1 close):', c1.close, '  EOD:', eod);
console.log('Move:', move.toFixed(0), 'pts  =>  Rs:', (move*15).toFixed(0));

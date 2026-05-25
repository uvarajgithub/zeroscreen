const d = require('./cache/banknifty_2026.json');

const prev = d['2026-05-20'];
const prevClose = prev[prev.length - 1].close;
const prevHigh  = Math.max(...prev.map(x => x.high));
const prevLow   = Math.min(...prev.map(x => x.low));
console.log('=== MAY 20 (prev day) ===');
console.log('PDH:', prevHigh, ' PDL:', prevLow, ' PDC:', prevClose);

const c = d['2026-05-21'];
console.log('\n=== MAY 21 ALL CANDLES ===');
console.log('Idx  Time    Open       High       Low        Close      Body');

// build times from h/m fields
c.forEach((x, i) => {
  const timeStr = x.h + ':' + String(x.m).padStart(2,'0');
  const body = (x.close - x.open).toFixed(0);
  const dir = x.close > x.open ? 'BULL' : 'BEAR';
  console.log(`C${String(i).padStart(2)} ${timeStr}  ${x.open}  ${x.high}  ${x.low}  ${x.close}  ${body} ${dir}`);
});

// C0 analysis
const c0 = c[0];
const body0 = c0.close - c0.open;
const range0 = c0.high - c0.low;
console.log('\n=== C0 vs prev day ===');
console.log('C0 open vs PDH:', (c0.open - prevHigh).toFixed(0), 'pts (negative=below PDH)');
console.log('C0 open vs PDL:', (c0.open - prevLow).toFixed(0), 'pts');
console.log('C0 body:', body0.toFixed(0), ' body%:', (body0/range0*100).toFixed(1)+'%');
console.log('C0 open near high? high-open:', (c0.high - c0.open).toFixed(1), 'pts');

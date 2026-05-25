const d = require('./cache/banknifty_2026.json');

const prev = d['2026-05-20'];
const prevHigh = Math.max(...prev.map(x => x.high));
const prevLow  = Math.min(...prev.map(x => x.low));
const c = d['2026-05-21'];
const c0 = c[0];
const c14 = c[14]; // 12:45 candle

const upperWick = c0.high - c0.open;
const lowerWick = c0.close - c0.low;
const body = c0.close - c0.open;
const range = c0.high - c0.low;

console.log('=== MAY 21 C0 (9:15 candle) BREAKDOWN ===');
console.log('Open:      ', c0.open);
console.log('High:      ', c0.high, '  (upper wick from open:', upperWick.toFixed(0), 'pts REJECTION)');
console.log('Low:       ', c0.low);
console.log('Close:     ', c0.close);
console.log('Body:      ', body.toFixed(0), 'pts BEARISH');
console.log('Body %:    ', (body/range*100).toFixed(1)+'%');
console.log('');
console.log('Opened ABOVE PDH by:', (c0.open - prevHigh).toFixed(0), 'pts  --> GAP-UP above PDH');
console.log('But closed BELOW PDH by:', (c0.close - prevHigh).toFixed(0), 'pts  --> FAILED gap-up');
console.log('');
console.log('=== SIGNALS POINTING TO PE ===');
console.log('1. GAP-UP above PDH but C0 closed BEARISH (fake breakout):', c0.open > prevHigh && body < 0);
console.log('2. C0 body bearish:', body < 0, '  body='+body.toFixed(0));
console.log('3. C0 upper wick > 100 pts (rejection from high):', upperWick > 100, '  wick='+upperWick.toFixed(0));
console.log('4. C0 opened at HOD then reversed (open-close diff):', (c0.open - c0.close).toFixed(0), 'pts down from open');

console.log('\n=== P&L: Enter PE at C0 close, exit at C14 close (12:45) ===');
const move = c0.close - c14.close;
console.log('Entry (C0 close):', c0.close);
console.log('Exit  (C14 close):', c14.close);
console.log('Move:', move.toFixed(0), 'pts DOWN  =>  Rs:', (move*15).toFixed(0));

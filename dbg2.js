const d = require('./cache/banknifty_2026.json');
const may1 = d['2026-05-01'];
console.log('May 1 type:', typeof may1, Array.isArray(may1));
console.log('May 1 length:', may1 ? may1.length : 'null');
if(may1 && may1.length) console.log('Last candle:', may1[may1.length-1]);
// Also show May 4 first few candles
const c4 = d['2026-05-04'];
console.log('\nMay 4 C0-C4:');
c4.slice(0,5).forEach((x,i) => console.log(i, x.h, x.m, x.open, x.high, x.low, x.close));

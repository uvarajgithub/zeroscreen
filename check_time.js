const d = require('./candles_detail.json');
const day = d.days['2026-04-01'];
console.log('First 5 candles:');
day.slice(0, 5).forEach(c => console.log(c.time, 'h=' + c.h, 'm=' + c.m, 'open=' + c.open));
console.log('Last candle:', day[day.length - 1].time, 'close=', day[day.length - 1].close);
console.log('\nApr 06 (entry at 06:15 in 28-day test):');
const d2 = d.days['2026-04-06'];
d2.slice(0, 5).forEach(c => console.log(c.time, 'h=' + c.h, 'm=' + c.m));

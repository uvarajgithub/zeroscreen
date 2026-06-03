const d = require('./cache/banknifty_5yr.json');
const dates = Object.keys(d).sort();
const c = d[dates[100]][1];
console.log('Sample candle keys:', Object.keys(c));
console.log('Sample candle:', JSON.stringify(c));
console.log('Total dates:', dates.length);
console.log('Date range:', dates[0], '→', dates[dates.length-1]);

const d = require('./candles_detail.json');
// Check candles array dates
const candles = d.candles || [];
const dateTimes = candles.map(c => c.dt || c.date || '').sort();
const lastFew = dateTimes.slice(-30);
console.log('Last 30 candle timestamps in candles array:');
lastFew.forEach(dt => console.log(dt));
console.log('\nTotal candles in array:', candles.length);


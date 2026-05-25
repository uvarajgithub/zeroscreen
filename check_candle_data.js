const d = require('/home/ubuntu/trading-bot/candles_apr_may.json').days;
const keys = Object.keys(d).sort();
const may = keys.filter(k => k.startsWith('2026-05'));
console.log('Total days:', keys.length, '| First:', keys[0], '| Last:', keys[keys.length-1]);
console.log('May days:', may.length, '|', may.join(', '));
const s = d[keys[0]][0];
console.log('Candle fields:', Object.keys(s).join(', '));
console.log('Candles per day:', d[keys[0]].length);

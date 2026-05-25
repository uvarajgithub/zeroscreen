const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json'));
const dates = [...new Set(d.map(c => c.date.slice(0,10)))].sort();
console.log('Total candles:', d.length);
console.log('Trading days:', dates.length);
console.log('First:', dates[0], '| Last:', dates[dates.length-1]);
const may = dates.filter(x => x.startsWith('2026-05'));
console.log('May 2026 days:', may.length, '|', may.join(', '));

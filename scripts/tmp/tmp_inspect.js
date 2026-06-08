const d = JSON.parse(require('fs').readFileSync(process.argv[2]));
console.log('Total candles:', d.length);
console.log('First 3 candles:');
console.log(JSON.stringify(d[0], null, 2));
console.log(JSON.stringify(d[1], null, 2));
console.log(JSON.stringify(d[2], null, 2));
// Check how many unique days
const days = new Set(d.map(c => c.date ? c.date.substring(0,10) : c.timestamp ? c.timestamp.substring(0,10) : Object.keys(c)[0]));
console.log('Sample keys:', Object.keys(d[0]));

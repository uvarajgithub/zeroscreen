const path = require('path');
const d = require(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'));
const keys = Object.keys(d);
console.log('Total days:', keys.length);
console.log('First 3 keys:', keys.slice(0,3));
console.log('Last 3 keys:', keys.slice(-3));
const first = d[keys[0]];
console.log('Type of value:', typeof first, Array.isArray(first) ? 'array len=' + first.length : '');
if (Array.isArray(first)) {
  console.log('First candle:', JSON.stringify(first[0]));
  console.log('Last candle:', JSON.stringify(first[first.length-1]));
} else {
  console.log('Value:', JSON.stringify(first).slice(0,300));
}

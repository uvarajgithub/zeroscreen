const fs = require('fs');
const d = JSON.parse(fs.readFileSync('cache/banknifty_5yr.json', 'utf-8'));
console.log('type:', typeof d, 'isArray:', Array.isArray(d));
if (!Array.isArray(d)) {
  console.log('keys:', Object.keys(d).slice(0, 5));
  const first = Object.values(d)[0];
  console.log('first val sample:', JSON.stringify(first).slice(0, 200));
} else {
  console.log('length:', d.length, 'sample:', JSON.stringify(d[0]));
}

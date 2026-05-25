const d = require('./cache/banknifty_2026.json');
const dates = Object.keys(d).filter(k => k.startsWith('2026-05')).sort();
console.log('May 2026 trading days:', dates.join(', '));

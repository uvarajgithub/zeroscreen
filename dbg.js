const d = require('./cache/banknifty_2026.json');
const all = Object.keys(d).sort();
const idx4 = all.indexOf('2026-05-04');
console.log('idx:', idx4, '  prevDate:', all[idx4-1], '  exists:', !!d[all[idx4-1]]);
console.log('Dates around May 4:', all.slice(Math.max(0,idx4-3), idx4+3));

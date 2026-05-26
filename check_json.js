'use strict';
const d = JSON.parse(require('fs').readFileSync('/home/ubuntu/trading-bot/5year-backtest-result.json'));
const m = Object.keys(d.monthly).sort();
console.log('Total:', d.totals.bodyBreakout);
console.log('Months:', m.length);
m.slice(0,3).forEach(k => console.log(k, JSON.stringify(d.monthly[k])));
console.log('...');
m.slice(-3).forEach(k => console.log(k, JSON.stringify(d.monthly[k])));

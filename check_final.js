const fs = require('fs');
const d = require('/home/ubuntu/trading-bot/5year-backtest-result.json');
console.log('totals:', d.totals.bodyBreakout, 'pts =', d.totals.bodyBreakout * 15, 'Rs');
console.log('period:', d.period.from, 'to', d.period.to);
const may = d.daily.filter(e => e.date.startsWith('2026-05'));
const losses = may.filter(e => e.bbPnL < 0);
console.log('May traded:', may.length, '  losses:', losses.length);
console.log('\nMay days:');
may.sort((a,b) => a.date < b.date ? -1 : 1).forEach(e => {
  const tag = e.bbPnL < 0 ? ' LOSS' : '';
  console.log(' ', e.date, (e.bbPnL > 0 ? '+' : '') + e.bbPnL + tag);
});

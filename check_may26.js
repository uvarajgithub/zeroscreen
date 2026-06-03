const d = require('/home/ubuntu/trading-bot/5year-backtest-result.json');
const m = d.monthly['2026-05'];
console.log('May 2026 monthly:', m);
const days = d.daily.filter(e => e.date.startsWith('2026-05'));
console.log('Traded days in May:', days.length);
const losses = days.filter(e => e.bbPnL < 0);
const wins = days.filter(e => e.bbPnL > 0);
console.log('Wins:', wins.length, '  Losses:', losses.length);
console.log('\nAll May days:');
days.sort((a,b) => a.date < b.date ? -1 : 1).forEach(e => {
  const tag = e.bbPnL < 0 ? ' ← LOSS' : '';
  console.log(`  ${e.date}  ${e.bbPnL > 0 ? '+' : ''}${e.bbPnL}${tag}`);
});

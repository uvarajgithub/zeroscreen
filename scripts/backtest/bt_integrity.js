const bt = JSON.parse(require('fs').readFileSync('/home/ubuntu/trading-bot/5year-backtest-result.json'));
const t = bt.totals;
const daily = bt.daily;

console.log('=== BACKTEST INTEGRITY CHECK ===');
console.log('tradingDays:', bt.tradingDays, '  tradedDays:', bt.tradedDays);
console.log('Stored total:', t.bbTotal, 'pts  wins:', t.bbWins, '  losses:', t.bbLosses, '  winRate:', bt.winRate + '%');
console.log('noTradeDays:', (bt.noTradeDays || []).length);

// Recalculate total from daily array
const calc_total = daily.reduce((s, d) => s + (d.bbPnL || 0), 0);
const calc_wins = daily.filter(d => d.bbPnL > 0).length;
const calc_losses = daily.filter(d => d.bbPnL < 0).length;
const calc_zeros = daily.filter(d => d.bbPnL === 0).length;
const calc_wr = Math.round(calc_wins / (calc_wins + calc_losses) * 1000) / 10;

console.log('\n--- Recalculated from daily[] ---');
console.log('Total pts:', Math.round(calc_total * 10) / 10, '  MATCH:', Math.abs(calc_total - t.bbTotal) < 1);
console.log('Wins:', calc_wins, '  MATCH:', calc_wins === t.bbWins);
console.log('Losses:', calc_losses, '  MATCH:', calc_losses === t.bbLosses);
console.log('Zeros (no-trade):', calc_zeros);
console.log('WinRate:', calc_wr + '%', '  MATCH:', Math.abs(calc_wr - bt.winRate) < 0.2);

// Verify monthly totals sum matches daily sum
const monthly = bt.monthly || {};
const monthlyTotal = Object.values(monthly).reduce((s, m) => s + (m.bbTotal || 0), 0);
console.log('\n--- Monthly sum check ---');
console.log('Sum of monthly totals:', Math.round(monthlyTotal * 10) / 10, '  vs daily sum:', Math.round(calc_total * 10) / 10, '  MATCH:', Math.abs(monthlyTotal - calc_total) < 2);

// Check for suspicious days (unrealistically high)
const maxDay = daily.reduce((a, b) => (b.bbPnL > a.bbPnL ? b : a), { bbPnL: 0 });
const minDay = daily.reduce((a, b) => (b.bbPnL < a.bbPnL ? b : a), { bbPnL: 0 });
console.log('\n--- Extreme days ---');
console.log('Best day:', maxDay.date, '+' + maxDay.bbPnL, 'pts =', Math.round(maxDay.bbPnL * 15) + ' Rs');
console.log('Worst day:', minDay.date, minDay.bbPnL, 'pts =', Math.round(minDay.bbPnL * 15) + ' Rs');

// Check May 2026
const may26 = daily.filter(d => d.date && d.date.startsWith('2026-05'));
console.log('\n--- May 2026 daily records ---');
may26.forEach(d => console.log(' ', d.date, d.bbPnL > 0 ? '+' : '', d.bbPnL, 'pts'));
console.log('May 2026 total:', may26.reduce((s, d) => s + d.bbPnL, 0).toFixed(1), 'pts');

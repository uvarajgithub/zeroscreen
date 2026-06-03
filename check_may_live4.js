const { execSync } = require('child_process');

const rows = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT trade_date, direction, entry_price, exit_price, pnl, exit_reason FROM bot_trades WHERE trade_date LIKE '2026-05-2%' ORDER BY trade_date, id;"`, { encoding: 'utf8' });
console.log('May 20+ bot trades:\n', rows || '(none)');

// Summarize by day
const lines = rows.trim().split('\n').filter(Boolean);
const byDay = {};
for (const line of lines) {
  const [date, dir, entry, exit, pnl, reason] = line.split('|');
  const d = date.slice(0, 10);
  if (!byDay[d]) byDay[d] = 0;
  byDay[d] += parseFloat(pnl || 0);
}
console.log('\nDaily P&L (Rs):');
for (const [d, pnl] of Object.entries(byDay).sort()) {
  const tag = pnl < 0 ? ' ← LOSS' : '';
  console.log(`  ${d}  ${pnl > 0 ? '+' : ''}${pnl.toFixed(0)}${tag}`);
}

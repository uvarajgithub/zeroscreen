const fs = require('fs');

// Check ZeroScreen DB (that's where dashboard reads from)
const { execSync } = require('child_process');
try {
  const tables = execSync('sqlite3 /root/zeroscreen/zeroscreen.db ".tables"', { encoding: 'utf8' });
  console.log('ZeroScreen DB tables:', tables.trim());
  // Check paper trades table
  const may = execSync(`sqlite3 /root/zeroscreen/zeroscreen.db "SELECT date,side,entry_price,exit_price,pnl FROM paper_trades WHERE date LIKE '2026-05-2%' ORDER BY date,id LIMIT 30;"`, { encoding: 'utf8' });
  console.log('\nPaper trades May 20+:', may || '(none)');
} catch(e) { console.log('ZeroScreen DB error:', e.message); }

// Also check trades.json on trading-bot
const tj = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/trades.json', 'utf8'));
console.log('\ntrades.json entries:');
tj.forEach(t => console.log(t.date || t.entryTime, 'pnl=', t.pnl || t.pts || t.profit));

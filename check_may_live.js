const { execSync } = require('child_process');
const fs = require('fs');

// List DB tables
try {
  const tables = execSync('sqlite3 /home/ubuntu/trading-bot/trades.db ".tables"', { encoding: 'utf8' });
  console.log('DB Tables:', tables.trim());
} catch(e) { console.log('DB error:', e.message); }

// Check trades.json for May 26/27
const tj = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/trades.json', 'utf8'));
console.log('\ntrades.json type:', Array.isArray(tj) ? 'array len='+tj.length : 'object keys='+Object.keys(tj).slice(0,5));

// Check paper-trades.json for May 26/27
const pt = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/paper-trades.json', 'utf8'));
const allTrades = Array.isArray(pt) ? pt : (pt.trades || []);
const may2627 = allTrades.filter(t => {
  const d = t.date || t.entryTime || t.exitTime || '';
  return d.includes('2026-05-26') || d.includes('2026-05-27');
});
console.log('\nMay 26/27 in paper-trades.json:', may2627.length, 'trades');
may2627.forEach(t => console.log(t));

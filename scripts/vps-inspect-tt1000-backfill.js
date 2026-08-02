const fs = require('fs');

process.chdir('/home/ubuntu/trading-bot');
const state = JSON.parse(fs.readFileSync('tt1000-state.json', 'utf8'));
console.log(JSON.stringify({
  day: state.day,
  trades: state.trades,
  wins: state.wins,
  losses: state.losses,
  log: state.log,
}, null, 2));

for (const candidate of ['trades.json', 'data/trades.json']) {
  if (!fs.existsSync(candidate)) continue;
  const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
  const rows = Array.isArray(parsed) ? parsed : (parsed.trades || []);
  console.log(`LEDGER_PATH=${candidate}`);
  console.log(`LEDGER_ROWS=${rows.length}`);
  console.log(JSON.stringify(rows.filter((row) => String(row.type || '').includes('TEN_O_CLOCK')), null, 2));
}

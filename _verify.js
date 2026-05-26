const fs = require('fs');

// Real trades from paper-records
const records = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/paper-records.json'));
const bhavTrades = records.filter(t => t.type === 'BHAV_V3' && t.pnl !== 0 && t.exitPrice > 0);
const last30 = bhavTrades.slice(-30);

console.log('=== REAL BOT TRADES (last 30 BHAV_V3 closed) ===');
const realByDay = {};
for (const t of last30) {
  const d = (t.date || '').slice(0, 10);
  if (!d) continue;
  if (!realByDay[d]) realByDay[d] = { pnl: 0, trades: 0 };
  realByDay[d].pnl += t.pnl;
  realByDay[d].trades++;
}
const realDays = Object.keys(realByDay).sort();
for (const d of realDays) {
  console.log(`  ${d}  real P&L: ${realByDay[d].pnl.toFixed(1)} pts  (${realByDay[d].trades} trades)`);
}

// Backtest for same days
const bt = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/5year-backtest-result.json'));
const btByDay = {};
for (const r of bt.daily) btByDay[r.date] = r.bbPnL;

console.log('\n=== BACKTEST vs REAL (same days) ===');
console.log('Date        | BT pts | Real pts | Match?');
console.log('------------|--------|----------|-------');
let matches = 0, total = 0;
for (const d of realDays) {
  const btPnl  = btByDay[d] !== undefined ? btByDay[d] : 'N/A';
  const realPnl = realByDay[d].pnl.toFixed(1);
  const diff   = btByDay[d] !== undefined ? Math.abs(btByDay[d] - realByDay[d].pnl) : 999;
  const match  = diff < 30 ? 'MATCH ✓' : 'DIFF';
  if (btByDay[d] !== undefined) { total++; if (diff < 30) matches++; }
  console.log(`${d}  | ${String(btPnl).padStart(6)} | ${String(realPnl).padStart(8)} | ${match}`);
}
console.log(`\nMatch rate: ${matches}/${total} days within 30pts`);

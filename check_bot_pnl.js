#!/usr/bin/env node
// check_bot_pnl.js — read actual paper trade P&L from ZeroScreen DB + trades.json
const fs = require('fs');
const path = require('path');

// Try trades.json first
const tradeFiles = [
  '/home/ubuntu/trading-bot/trades.json',
  '/home/ubuntu/trading-bot/trade-state.json',
  '/home/ubuntu/trading-bot/logs/trades.json'
];

for (const f of tradeFiles) {
  if (fs.existsSync(f)) {
    console.log('Found:', f);
    try {
      const d = JSON.parse(fs.readFileSync(f, 'utf8'));
      console.log(JSON.stringify(d, null, 2).slice(0, 2000));
    } catch(e) { console.log('parse error:', e.message); }
  }
}

// Try ZeroScreen DB
try {
  const Database = require('/root/zeroscreen/node_modules/better-sqlite3');
  const db = new Database('/root/zeroscreen/zeroscreen.db', { readonly: true });

  // Check bot_trades table
  const cols = db.prepare("PRAGMA table_info(bot_trades)").all();
  console.log('\nbot_trades columns:', cols.map(c=>c.name).join(', '));

  const trades = db.prepare('SELECT * FROM bot_trades ORDER BY rowid DESC LIMIT 200').all();
  console.log('Total bot_trades:', trades.length);

  if (trades.length > 0) {
    console.log('\nSample row:', JSON.stringify(trades[0]));
    const byMonth = {};
    let total = 0;
    trades.forEach(t => {
      const dt = t.exit_time || t.created_at || t.entry_time || '';
      const m = String(dt).slice(0,7);
      if (!byMonth[m]) byMonth[m] = { pl:0, count:0, wins:0 };
      // try different pnl field names
      const pl = Number(t.pnl_points || t.pnl || t.pl || t.profit || 0);
      byMonth[m].pl += pl;
      byMonth[m].count++;
      if (pl > 0) byMonth[m].wins++;
      total += pl;
    });
    console.log('\nMonthly P&L (index points):');
    Object.keys(byMonth).sort().forEach(m => {
      const b = byMonth[m];
      const rs = (b.pl * 15).toFixed(0);
      console.log(`  ${m}  |  ${b.pl.toFixed(1)} pts  |  Rs${rs}  |  ${b.count} trades  |  ${(b.wins/b.count*100).toFixed(0)}% WR`);
    });
    const totalRs = (total * 15).toFixed(0);
    console.log(`\nTOTAL: ${total.toFixed(1)} pts = Rs ${totalRs}`);
  }
} catch(e) {
  console.log('DB error:', e.message);
}

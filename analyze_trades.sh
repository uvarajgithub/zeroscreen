#!/bin/bash
cd /home/ubuntu/trading-bot
node << 'EOF'
require('dotenv').config();
const p = new Pool({ connectionString: process.env.DATABASE_URL });
p.query(`
  SELECT 
    date::date as day,
    COUNT(*) FILTER (WHERE exit_price > 0) as trades,
    SUM(pnl) FILTER (WHERE exit_price > 0) as total_pnl,
    COUNT(*) FILTER (WHERE pnl > 0) as wins,
    COUNT(*) FILTER (WHERE pnl < 0 AND pnl < -50) as sl_hits,
    COUNT(*) FILTER (WHERE reason_exit = 'early_exit_c1') as early_exits
  FROM bot_trades 
  WHERE exit_price > 0
  GROUP BY date::date 
  ORDER BY day DESC 
  LIMIT 10
`).then(r => {
  console.log("Day          | Trades | PnL    | Wins | SL Hits | Early");
  console.log("-------------|--------|--------|------|---------|------");
  r.rows.forEach(row => {
    console.log(`${row.day} |   ${String(row.trades).padEnd(4)}  | ${String(Math.round(row.total_pnl)).padEnd(6)} |  ${row.wins}   |   ${row.sl_hits}     |  ${row.early_exits}`);
  });
  p.end();
}).catch(e => {
  console.error('DB error:', e.message);
  // fallback: read trades.json
  const fs = require('fs');
  const trades = JSON.parse(fs.readFileSync('trades.json','utf8'))
    .filter(t => t.exitPrice > 0);
  const byDay = {};
  trades.forEach(t => {
    const day = t.date.slice(0,10);
    if (!byDay[day]) byDay[day] = { trades:0, pnl:0, wins:0, slHits:0, earlyExits:0 };
    byDay[day].trades++;
    byDay[day].pnl += t.pnl;
    if (t.pnl > 0) byDay[day].wins++;
    if (t.pnl <= -100) byDay[day].slHits++;
    if (t.reasonExit === 'early_exit_c1') byDay[day].earlyExits++;
  });
  console.log("Day          | Trades | PnL    | Wins | SL Hits | Early");
  Object.entries(byDay).sort().reverse().forEach(([day,d]) => {
    console.log(`${day} |   ${String(d.trades).padEnd(4)}  | ${String(Math.round(d.pnl)).padEnd(6)} |  ${d.wins}   |   ${d.slHits}     |  ${d.earlyExits}`);
  });
  p.end().catch(()=>{});
});
EOF

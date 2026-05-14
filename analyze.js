require('dotenv').config();
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/trades.json','utf8'));
const trades = raw.filter(t => t.exitPrice > 0 && t.pnl !== 0);

const byDay = {};
trades.forEach(t => {
  const day = t.date.slice(0,10);
  if (!byDay[day]) byDay[day] = {trades:0,pnl:0,wins:0,slHits:0,earlyExits:0};
  byDay[day].trades++;
  byDay[day].pnl += t.pnl;
  if(t.pnl>0) byDay[day].wins++;
  if(t.pnl<=-50) byDay[day].slHits++;
  if(t.reasonExit==='early_exit_c1') byDay[day].earlyExits++;
});

console.log('\nDate       | T | W | SL | Early | PnL');
console.log('-----------|---|---|----|-------|-----');
Object.entries(byDay).sort().forEach(([d,v]) => {
  const p = Math.round(v.pnl);
  console.log(`${d} | ${v.trades} | ${v.wins} |  ${v.slHits} |   ${v.earlyExits}   | ${p>0?'+':''}${p}`);
});

const reasons = {};
trades.forEach(t => { 
  if(!reasons[t.reasonExit]) reasons[t.reasonExit]={c:0,p:0};
  reasons[t.reasonExit].c++; 
  reasons[t.reasonExit].p+=t.pnl; 
});
console.log('\nReason              | Count | Avg pts');
console.log('--------------------|-------|--------');
Object.entries(reasons).sort((a,b)=>a[1].p-b[1].p).forEach(([r,v]) => 
  console.log(`${r.padEnd(20)}|   ${v.c}   |  ${(v.p/v.c).toFixed(1)}`)
);

const total = trades.reduce((s,t)=>s+t.pnl,0);
const wins = trades.filter(t=>t.pnl>0).length;
console.log(`\nTotal: ${trades.length} trades | ${wins} wins | ${trades.length-wins} losses | Win rate: ${Math.round(wins/trades.length*100)}% | Net: ${Math.round(total)} pts`);

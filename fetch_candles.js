// fetch_candles.js — save last 1 month candles to candles_apr_may.json
'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const fs = require('fs');

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}` },
      timeout: 20000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} }); });
    req.on('error', reject); req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); }); req.end();
  });
}

async function main() {
  process.stdout.write('Fetching Apr+May 2026... ');
  const r1 = await kiteGet('/instruments/historical/260105/15minute?from=2026-04-01+09:00:00&to=2026-04-30+15:30:00&continuous=0&oi=0');
  const r2 = await kiteGet('/instruments/historical/260105/15minute?from=2026-05-01+09:00:00&to=2026-05-13+15:30:00&continuous=0&oi=0');
  const raw = [...(r1.data.candles||[]), ...(r2.data.candles||[])];
  const candles = raw.map(c => {
    const d = new Date(c[0]);
    return {
      dt: c[0].slice(0,16),
      date: c[0].slice(0,10),
      time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
      h: d.getHours(), m: d.getMinutes(),
      open: c[1], high: c[2], low: c[3], close: c[4], vol: c[5]
    };
  });

  // Group by day
  const map = {};
  for (const c of candles) { if (!map[c.date]) map[c.date]=[]; map[c.date].push(c); }
  const days = Object.entries(map).sort(([a],[b])=>a<b?-1:1);

  // Print day summary
  console.log(`done — ${candles.length} candles, ${days.length} days\n`);
  console.log('DATE         OPEN    HIGH    LOW     CLOSE   RANGE  MOVE   CANDLES');
  console.log('─'.repeat(72));
  for (const [date, cs] of days) {
    const open  = cs[0].open;
    const close = cs[cs.length-1].close;
    const high  = Math.max(...cs.map(c=>c.high));
    const low   = Math.min(...cs.map(c=>c.low));
    const range = (high-low).toFixed(0);
    const move  = (close-open>=0?'+':'')+(close-open).toFixed(0);
    console.log(`${date}  ${String(open.toFixed(0)).padStart(7)} ${String(high.toFixed(0)).padStart(7)} ${String(low.toFixed(0)).padStart(7)} ${String(close.toFixed(0)).padStart(7)} ${String(range).padStart(6)} ${move.padStart(7)}  ${cs.length}`);
  }

  fs.writeFileSync('/home/ubuntu/trading-bot/candles_apr_may.json', JSON.stringify({days: Object.fromEntries(days)}, null, 2));
  console.log('\n✓ Saved to /home/ubuntu/trading-bot/candles_apr_may.json');
  console.log('Ready — ask your questions one by one.');
}
main().catch(e=>{ console.error('FATAL:', e.message); process.exit(1); });

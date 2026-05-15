// fetch_candles2.js — full candle detail: OHLC + body + wicks, saved to JSON
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
  process.stdout.write('Fetching Apr+May 2026 candles... ');
  const r1 = await kiteGet('/instruments/historical/260105/15minute?from=2026-04-01+09:00:00&to=2026-04-30+15:30:00&continuous=0&oi=0');
  const r2 = await kiteGet('/instruments/historical/260105/15minute?from=2026-05-01+09:00:00&to=2026-05-13+15:30:00&continuous=0&oi=0');
  const raw = [...(r1.data.candles||[]), ...(r2.data.candles||[])];

  const candles = raw.map(c => {
    const d = new Date(c[0]);
    const open=c[1], high=c[2], low=c[3], close=c[4], vol=c[5];
    const bull      = close >= open;
    const body_high = Math.max(open, close);
    const body_low  = Math.min(open, close);
    const body_size = +(body_high - body_low).toFixed(2);
    const upper_wick= +(high - body_high).toFixed(2);  // wick above body
    const lower_wick= +(body_low - low).toFixed(2);    // wick below body
    const total_range = +(high - low).toFixed(2);
    return {
      dt:   c[0].slice(0,16),
      date: c[0].slice(0,10),
      time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
      open, high, low, close, vol,
      bull,
      body_high, body_low, body_size,
      upper_wick, lower_wick,
      total_range
    };
  });

  // Group by day
  const map = {};
  for (const c of candles) { if (!map[c.date]) map[c.date]=[]; map[c.date].push(c); }
  const days = Object.entries(map).sort(([a],[b])=>a<b?-1:1);

  console.log(`done — ${candles.length} candles across ${days.length} days\n`);

  // Print all candles day by day
  for (const [date, cs] of days) {
    const dayOpen  = cs[0].open;
    const dayClose = cs[cs.length-1].close;
    const dayHigh  = Math.max(...cs.map(c=>c.high));
    const dayLow   = Math.min(...cs.map(c=>c.low));
    const dayRange = (dayHigh-dayLow).toFixed(0);
    const dayMove  = (dayClose-dayOpen>=0?'+':'')+(dayClose-dayOpen).toFixed(0);
    console.log(`\n════ ${date}  Open=${dayOpen}  High=${dayHigh}  Low=${dayLow}  Close=${dayClose}  Range=${dayRange}  Move=${dayMove}`);
    console.log(`Time   DIR  Open     High     Low      Close    Body_H   Body_L  BodySz  UpWick  LowWick  Range`);
    console.log('─'.repeat(105));
    for (const c of cs) {
      const dir = c.bull ? ' BUL' : ' BEA';
      console.log(
        `${c.time}  ${dir}` +
        `  ${String(c.open.toFixed(0)).padStart(7)}` +
        `  ${String(c.high.toFixed(0)).padStart(7)}` +
        `  ${String(c.low.toFixed(0)).padStart(7)}` +
        `  ${String(c.close.toFixed(0)).padStart(7)}` +
        `  ${String(c.body_high.toFixed(0)).padStart(7)}` +
        `  ${String(c.body_low.toFixed(0)).padStart(7)}` +
        `  ${String(c.body_size.toFixed(0)).padStart(6)}` +
        `  ${String(c.upper_wick.toFixed(0)).padStart(6)}` +
        `  ${String(c.lower_wick.toFixed(0)).padStart(7)}` +
        `  ${String(c.total_range.toFixed(0)).padStart(6)}`
      );
    }
  }

  // Save JSON
  const out = { candles, days: Object.fromEntries(days) };
  fs.writeFileSync('/home/ubuntu/trading-bot/candles_detail.json', JSON.stringify(out, null, 2));
  console.log('\n\n✓ Full detail saved to /home/ubuntu/trading-bot/candles_detail.json');
  console.log('Ready — ask your questions.');
}
main().catch(e=>{ console.error('FATAL:', e.message); process.exit(1); });

require('dotenv').config();
const https = require('https');

const API_KEY = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

async function fetchCandles(from, to) {
  return new Promise((resolve, reject) => {
    const path = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
    const req = https.request({
      hostname: 'api.kite.trade',
      path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  // check last 5 trading days
  const dates = ['2026-05-15','2026-05-14','2026-05-13','2026-05-12','2026-05-11'];
  for (const d of dates) {
    const r = await fetchCandles(d, d);
    const n = r.data && r.data.candles ? r.data.candles.length : 0;
    console.log(`${d}: ${n} candles ${n > 0 ? '✓' : '(holiday/no data)'}`);
  }
}

main().catch(console.error);

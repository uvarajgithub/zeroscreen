'use strict';
// Fetch BankNifty 15m candles from Yahoo Finance for May 29-30
const https = require('https');

function fetchYahoo(from, to) {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5ENSEBANK?interval=15m&period1=${from}&period2=${to}`;
    const req = https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          const result = j.chart.result[0];
          const timestamps = result.timestamp;
          const q = result.indicators.quote[0];
          const candles = timestamps.map((ts, i) => ({
            date: new Date(ts * 1000),
            open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i]
          })).filter(c => c.open && c.high && c.low && c.close);
          resolve(candles);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function toIST(d) {
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  return ist.getUTCHours().toString().padStart(2,'0') + ':' + ist.getUTCMinutes().toString().padStart(2,'0');
}

function dateIST(d) {
  const ist = new Date(d.getTime() + 5.5 * 3600000);
  return ist.toISOString().slice(0,10);
}

function isMarket(c) {
  const t = toIST(c.date);
  return t >= '09:15' && t <= '15:15';
}

(async () => {
  // Epoch for May 27 (prev day for May 29) through May 31
  const from = Math.floor(new Date('2026-05-27T00:00:00Z').getTime() / 1000);
    const to   = Math.floor(new Date('2026-06-02T00:00:00Z').getTime() / 1000);
  try {
    const all = await fetchYahoo(from, to);
    console.log(`Total candles fetched: ${all.length}`);

    const byDay = {};
    for (const c of all) {
      if (!c.open) continue;
      const d = dateIST(c.date);
      if (!byDay[d]) byDay[d] = [];
      if (isMarket(c)) byDay[d].push(c);
    }

    for (const [day, cs] of Object.entries(byDay).sort()) {
      console.log(`\n${day}: ${cs.length} candles  ${cs[0] ? toIST(cs[0].date) : ''}→${cs[cs.length-1] ? toIST(cs[cs.length-1].date) : ''}`);
      const pdh = Math.max(...cs.map(c => c.high));
      const pdl = Math.min(...cs.map(c => c.low));
      console.log(`  Range: ${pdl.toFixed(0)} – ${pdh.toFixed(0)}`);
      for (const c of cs) {
        const bPct = (c.high - c.low) > 0 ? Math.round((c.close - c.open)/(c.high - c.low)*100) : 0;
        const bStr = (bPct > 0 ? '+' : '') + bPct + '%';
        console.log(`  ${toIST(c.date)}  O:${c.open.toFixed(0)} H:${c.high.toFixed(0)} L:${c.low.toFixed(0)} C:${c.close.toFixed(0)}  body:${bStr}`);
      }
    }
  } catch(e) {
    console.error('Failed:', e.message);
  }
})();

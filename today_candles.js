require('dotenv').config();
const https = require('https');
const k = process.env.API_KEY, t = process.env.ACCESS_TOKEN;
const d = new Date().toISOString().slice(0,10);
const url = `/instruments/historical/260105/15minute?from=${d}+09:00:00&to=${d}+15:30:00&continuous=0&oi=0`;
https.get({
  hostname: 'api.kite.trade', path: url,
  headers: { 'X-Kite-Version': '3', 'Authorization': `token ${k}:${t}` }
}, r => {
  let b = ''; r.on('data', c => b += c);
  r.on('end', () => {
    const c = JSON.parse(b).data.candles;
    const open915 = c[0][1];
    const last = c[c.length-1][4];
    console.log(`\n9:15 open: ${Math.round(open915)}  |  EOD close: ${Math.round(last)}  |  Net move: ${Math.round(last-open915)} pts`);
    console.log(`PE from 9:15 EOD result: ${Math.round(open915-last)} pts (${open915-last > 0 ? 'PROFIT ✓' : 'LOSS ✗'})\n`);
    console.log('Time         Open    Close   Move');
    console.log('─'.repeat(40));
    c.forEach(x => {
      const tm = new Date(x[0]).toLocaleTimeString('en-IN', {timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:true});
      const mv = Math.round(x[4]-x[1]);
      console.log(`${tm}   ${Math.round(x[1])}   ${Math.round(x[4])}   ${mv > 0 ? '+' : ''}${mv}`);
    });
  });
});

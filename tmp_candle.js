const https = require('https');
let data = '';
const API_KEY = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = 'yB5gCZWSQ7fyA9m988aKJDuykD7zE8sd';
https.get({
  hostname: 'api.kite.trade',
  path: '/instruments/historical/260105/5minute?from=2026-05-05+09:15:00&to=2026-05-05+10:15:00',
  headers: { 'X-Kite-Version': '3', 'Authorization': 'token ' + API_KEY + ':' + ACCESS_TOKEN }
}, res => {
  res.on('data', c => data += c);
  res.on('end', () => {
    const j = JSON.parse(data);
    const candles = j.data && j.data.candles || [];
    console.log('time,open,high,low,close,vol');
    candles.forEach(c => console.log(c.join(',')));
  });
}).on('error', e => console.error(e));

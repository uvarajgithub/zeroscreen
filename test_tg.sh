#!/bin/bash
cd /home/ubuntu/trading-bot
node -e "
require('dotenv').config();
const https = require('https');
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
console.log('TOKEN:', TOKEN ? 'SET('+TOKEN.slice(0,10)+'...)' : 'MISSING');
console.log('CHAT:', CHAT || 'MISSING');
const body = JSON.stringify({chat_id: CHAT, text: '✅ Bot candle test OK — ' + new Date().toLocaleString('en-IN',{timeZone:'Asia/Kolkata'}), parse_mode: 'Markdown'});
const req = https.request({
  hostname: 'api.telegram.org',
  path: '/bot' + TOKEN + '/sendMessage',
  method: 'POST',
  headers: {'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},
  timeout: 10000
}, (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => console.log('Response:', data));
});
req.on('error', e => console.error('Error:', e.message, e.code));
req.on('timeout', () => { req.destroy(); console.error('Timeout'); });
req.write(body);
req.end();
"

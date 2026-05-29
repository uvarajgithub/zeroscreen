const hb = JSON.parse(require('fs').readFileSync('/home/ubuntu/trading-bot/bot-heartbeat.json'));
const cl = hb.DrishtiCandleLog || [];
console.log('Total candles logged:', cl.length);
console.log('Date:', hb.date || hb.at);
cl.forEach(c => {
  const sig = c.signal || 'none';
  console.log(`C${c.idx+1}  ${c.time||'?'}  close:${c.close}  body:${c.bodyPct}%  signal:${sig}  reason:${c.reason}`);
});

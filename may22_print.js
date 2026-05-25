const d = require('./cache/banknifty_2026.json');
const c = d['2026-05-22'];
// show keys of first candle
console.log('Keys:', Object.keys(c[0]));
c.forEach((x,i) => {
  const t = new Date(x.date || x.timestamp || x.time_epoch || x[Object.keys(x)[0]]);
  const label = i === 0 ? ' <-- 9:15 CANDLE' : '';
  const body = x.close - x.open;
  console.log(`C${i} open=${x.open} high=${x.high} low=${x.low} close=${x.close} body=${body.toFixed(0)}${label}`);
});

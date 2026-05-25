const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_2026.json', 'utf8'));
const day = raw['2026-05-06'];
const prev = raw['2026-05-05'];
const PDH = Math.max(...prev.map(c => c.high));
const PDL = Math.min(...prev.map(c => c.low));
console.log(`PDH=${PDH} PDL=${PDL}`);
console.log('May 6 candles:');
day.forEach((c, i) => {
  const range = c.high - c.low || 1;
  const body = ((c.close - c.open) / range * 100).toFixed(0);
  const tag = c.high > PDH ? 'ABV_PDH' : c.low < PDL ? 'BLW_PDL' : '';
  console.log(`C${i} ${c.time} O:${c.open} H:${c.high} L:${c.low} C:${c.close} body%:${body} ${tag}`);
});

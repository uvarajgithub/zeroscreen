const fs = require('fs');
const d = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/amina-candle-log.json'));
const days = [...new Set(d.map(c => c.date))].sort().slice(-10);
console.log('Recent days:', days);
const may20 = d.filter(c => c.date === '2026-05-20');
const may19 = d.filter(c => c.date === '2026-05-19');
console.log('May 20 candles:', may20.length);
console.log('May 19 candles:', may19.length);
if (may20.length > 0) {
  console.log('\nMay 20 candles:');
  for (const c of may20) {
    console.log(`  ${c.time||c.date}  O:${c.open}  H:${c.high}  L:${c.low}  C:${c.close}`);
  }
}
if (may19.length > 0) {
  console.log('\nMay 19 candles:');
  for (const c of may19) {
    console.log(`  ${c.time||c.date}  O:${c.open}  H:${c.high}  L:${c.low}  C:${c.close}`);
  }
}

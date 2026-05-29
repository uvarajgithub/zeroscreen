const { getTodayCandles, getPrevDayCandles } = require('./dist/src/market.js');
const { findBhavEntry } = require('./dist/src/bhav_strategy.js');

(async () => {
  const all  = await getTodayCandles();
  const prev = await getPrevDayCandles();
  const botCandles = all.slice(1);
  const PDH = Math.max(...prev.map(c => c.high));
  const PDL = Math.min(...prev.map(c => c.low));
  const C0open = botCandles[0]?.open;
  let ctx = 'INSIDE';
  if (C0open > PDH + 120) ctx = 'ABOVE_PDH';
  else if (C0open < PDL) ctx = 'BELOW_PDL';
  console.log('PDH:' + PDH + ' PDL:' + PDL + ' C0open:' + C0open + ' ctx:' + ctx + ' botCandles:' + botCandles.length);
  console.log('');
  for (let i = 0; i < botCandles.length; i++) {
    const subset = botCandles.slice(0, i + 1);
    const c = botCandles[i];
    const range = c.high - c.low;
    const bp = range > 0 ? Math.round((c.close - c.open) / range * 100) : 0;
    const sig = findBhavEntry(subset, prev);
    const s = sig ? sig.side + ' [' + sig.reason + ']' : 'NULL';
    console.log('C' + i + ' O:' + c.open.toFixed(0) + ' H:' + c.high.toFixed(0) + ' L:' + c.low.toFixed(0) + ' C:' + c.close.toFixed(0) + ' body:' + (bp >= 0 ? '+' : '') + bp + '% => ' + s);
  }
})().catch(e => console.error(e.message, e.stack));

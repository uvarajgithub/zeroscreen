const d = require('./cache/banknifty_2026.json');
// May 1 is holiday (0 candles). Prev of May 4 = April 30
const prev4 = d['2026-04-30'];
const PH4 = Math.max(...prev4.map(x=>x.high));
const PL4 = Math.min(...prev4.map(x=>x.low));
const PC4 = prev4[prev4.length-1].close;
const c4 = d['2026-05-04'];
const c2_4 = c4[2];
const eod4 = c4[c4.length-1].close;
console.log('=== MAY 4 prev=Apr30  PDH:', PH4, ' PDL:', PL4, ' PDC:', PC4);
console.log('Gap:', (c4[0].open-PC4).toFixed(0), '  vs PDH:', (c4[0].open-PH4).toFixed(0), '  vs PDL:', (c4[0].open-PL4).toFixed(0));
c4.slice(0,6).forEach((x,i) => {
  const b = (x.close-x.open).toFixed(0);
  const r = x.high-x.low;
  const mk = i===2?' <--ENTRY':'';
  console.log(`  C${i} ${x.h}:${String(x.m).padStart(2,'0')}  O:${x.open} H:${x.high} L:${x.low} C:${x.close}  body:${b} ${(b/r*100).toFixed(1)}% ${x.close>x.open?'BULL':'BEAR'}${mk}`);
});
const pnl_ce = (eod4-c2_4.close).toFixed(0);
const pnl_pe = (c2_4.close-eod4).toFixed(0);
console.log('CE:', pnl_ce, 'pts Rs:', (pnl_ce*15).toFixed(0), '  PE:', pnl_pe, 'pts');

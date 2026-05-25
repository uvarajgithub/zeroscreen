const d = require('./cache/banknifty_2026.json');
const all = Object.keys(d).sort();
// May 4 prev
const idx4 = all.indexOf('2026-05-04');
const prevDate4 = all[idx4-1];
const prev4 = d[prevDate4];
const PH4 = Math.max(...prev4.map(x=>x.high));
const PL4 = Math.min(...prev4.map(x=>x.low));
const PC4 = prev4[prev4.length-1].close;
const c4 = d['2026-05-04'];
const c2_4 = c4[2]; // 9:45
const eod4 = c4[c4.length-1].close;
console.log('=== MAY 4 — C2 (9:45) -> EOD ===');
console.log('PrevDate:', prevDate4, '  PDH:', PH4, ' PDL:', PL4, ' PDC:', PC4);
console.log('Gap:', (c4[0].open-PC4).toFixed(0), '  vs PDH:', (c4[0].open-PH4).toFixed(0), '  vs PDL:', (c4[0].open-PL4).toFixed(0));
c4.slice(0,6).forEach((x,i) => {
  const b = (x.close-x.open).toFixed(0);
  const r = x.high-x.low;
  const bp = (b/r*100).toFixed(1);
  const mk = i===2?' <--ENTRY':'';
  console.log(`  C${i} ${x.h}:${String(x.m).padStart(2,'0')}  O:${x.open} H:${x.high} L:${x.low} C:${x.close}  body:${b} ${bp}% ${x.close>x.open?'BULL':'BEAR'}${mk}`);
});
const pnl_ce = (eod4-c2_4.close).toFixed(0);
const pnl_pe = (c2_4.close-eod4).toFixed(0);
console.log('CE:', pnl_ce, 'pts Rs:', (pnl_ce*15).toFixed(0), '  PE:', pnl_pe, 'pts Rs:', (pnl_pe*15).toFixed(0));

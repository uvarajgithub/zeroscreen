const d = require('./cache/banknifty_2026.json');

// ===== MAY 19 (avoid day) — prev = May 18 =====
const prev19 = d['2026-05-18'];
const prevH19 = Math.max(...prev19.map(x => x.high));
const prevL19 = Math.min(...prev19.map(x => x.low));
const prevC19 = prev19[prev19.length-1].close;
const c19 = d['2026-05-19'];
const c19_0 = c19[0], c19_1 = c19[1];
const b19_0 = c19_0.close - c19_0.open;
const b19_1 = c19_1.close - c19_1.open;
const r19_0 = c19_0.high - c19_0.low;
const r19_1 = c19_1.high - c19_1.low;

console.log('=== MAY 19 — WHY AVOID? ===');
console.log('PDH:', prevH19, ' PDL:', prevL19, ' PDC:', prevC19);
console.log('Gap from prevClose:', (c19_0.open - prevC19).toFixed(0), 'pts');
console.log('Open vs PDH:', (c19_0.open - prevH19).toFixed(0), '  Open vs PDL:', (c19_0.open - prevL19).toFixed(0));
console.log('C0 body:', b19_0.toFixed(0), ' body%:', (b19_0/r19_0*100).toFixed(1)+'%', b19_0>0?'BULL':'BEAR');
console.log('C1 body:', b19_1.toFixed(0), ' body%:', (b19_1/r19_1*100).toFixed(1)+'%', b19_1>0?'BULL':'BEAR');
console.log('C0 dir vs C1 dir — CONFLICTING?', (b19_0>0) !== (b19_1>0) ? 'YES (opposite)' : 'NO (same)');
console.log('');
c19.slice(0,5).forEach((x,i) => {
  const b = (x.close-x.open).toFixed(0);
  console.log(`C${i} ${x.h}:${String(x.m).padStart(2,'0')}  open=${x.open}  high=${x.high}  low=${x.low}  close=${x.close}  body=${b} ${x.close>x.open?'BULL':'BEAR'}`);
});

// ===== MAY 18 — CE at 10:00 (C3), exit EOD; prev = May 15 =====
const prev18 = d['2026-05-15'];
const prevH18 = Math.max(...prev18.map(x => x.high));
const prevL18 = Math.min(...prev18.map(x => x.low));
const prevC18 = prev18[prev18.length-1].close;
const c18 = d['2026-05-18'];
const eod18 = c18[c18.length-1].close;
const c3_18 = c18[3]; // 10:00

console.log('\n\n=== MAY 18 — CE AT 10:00 (C3) ===');
console.log('PDH:', prevH18, ' PDL:', prevL18, ' PDC:', prevC18);
console.log('Gap from prevClose:', (c18[0].open - prevC18).toFixed(0), 'pts');
console.log('Open vs PDH:', (c18[0].open - prevH18).toFixed(0), '  Open vs PDL:', (c18[0].open - prevL18).toFixed(0));
console.log('');
c18.slice(0,6).forEach((x,i) => {
  const b = (x.close-x.open).toFixed(0);
  const r = x.high - x.low;
  const m = i===3?' <-- ENTRY':'';
  console.log(`C${i} ${x.h}:${String(x.m).padStart(2,'0')}  open=${x.open}  high=${x.high}  low=${x.low}  close=${x.close}  body=${b} ${(b/r*100).toFixed(0)}% ${x.close>x.open?'BULL':'BEAR'}${m}`);
});
console.log('');
console.log('C3 close vs PDH:', (c3_18.close - prevH18).toFixed(0), '(+ve = broke above PDH)');
console.log('C3 close vs PDL:', (c3_18.close - prevL18).toFixed(0));
console.log('P&L CE at C3 close -> EOD:', (eod18-c3_18.close).toFixed(0), 'pts  Rs:', ((eod18-c3_18.close)*15).toFixed(0));

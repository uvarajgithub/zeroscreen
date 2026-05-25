const d = require('./cache/banknifty_2026.json');

// ===== MAY 19 =====
const prev19 = d['2026-05-16']; // prev trading day before May 19 (May 17 is weekend, May 16 is Friday)
const prevHigh19 = Math.max(...prev19.map(x => x.high));
const prevLow19  = Math.min(...prev19.map(x => x.low));
const prevClose19 = prev19[prev19.length-1].close;

const c19 = d['2026-05-19'];
const c19_0 = c19[0];
const c19_1 = c19[1];
const body19_0 = c19_0.close - c19_0.open;
const range19_0 = c19_0.high - c19_0.low;
const body19_1 = c19_1.close - c19_1.open;
const range19_1 = c19_1.high - c19_1.low;

console.log('=== MAY 16 (prev day for May 19) ===');
console.log('PDH:', prevHigh19, ' PDL:', prevLow19, ' PDC:', prevClose19);
console.log('\n=== MAY 19 CANDLES ===');
c19.forEach((x,i) => {
  const t = x.h+':'+String(x.m).padStart(2,'0');
  const b = (x.close-x.open).toFixed(0);
  const dir = x.close > x.open ? 'BULL' : 'BEAR';
  const m = i<4?' <--':'';
  console.log(`C${String(i).padStart(2)} ${t}  open=${x.open}  high=${x.high}  low=${x.low}  close=${x.close}  body=${b} ${dir}${m}`);
});
console.log('\nC0 body:', body19_0.toFixed(0), ' body%:', (body19_0/range19_0*100).toFixed(1)+'%');
console.log('C1 body:', body19_1.toFixed(0), ' body%:', (body19_1/range19_1*100).toFixed(1)+'%');
console.log('Gap from prevClose:', (c19_0.open - prevClose19).toFixed(0));
console.log('Open vs PDH:', (c19_0.open - prevHigh19).toFixed(0), '  Open vs PDL:', (c19_0.open - prevLow19).toFixed(0));
console.log('C0 dir:', body19_0 > 0 ? 'BULL' : 'BEAR', '  C1 dir:', body19_1 > 0 ? 'BULL' : 'BEAR', '  => CONFLICTING?', (body19_0>0) !== (body19_1>0));

// ===== MAY 18 =====
const prev18 = d['2026-05-16'];
const prevHigh18 = Math.max(...prev18.map(x => x.high));
const prevLow18  = Math.min(...prev18.map(x => x.low));
const prevClose18 = prev18[prev18.length-1].close;

const c18 = d['2026-05-18'];
// Wait -- need prev day of May 18 which is May 15 or May 16?
// May 18 is Monday, prev trading day is May 16 (Friday) -- but user said 18th so let me check
const prev18_actual = d['2026-05-15'] || d['2026-05-16'];
const prevH18 = Math.max(...prev18_actual.map(x => x.high));
const prevL18 = Math.min(...prev18_actual.map(x => x.low));
const prevC18 = prev18_actual[prev18_actual.length-1].close;

const c3_18 = c18[3]; // 10:00 candle
const eod18 = c18[c18.length-1].close;

console.log('\n\n=== MAY 15/16 (prev day for May 18) ===');
console.log('PDH:', prevH18, ' PDL:', prevL18, ' PDC:', prevC18);
console.log('\n=== MAY 18 CANDLES ===');
c18.forEach((x,i) => {
  const t = x.h+':'+String(x.m).padStart(2,'0');
  const b = (x.close-x.open).toFixed(0);
  const dir = x.close > x.open ? 'BULL' : 'BEAR';
  const m = i<=3?' <--':'';
  console.log(`C${String(i).padStart(2)} ${t}  open=${x.open}  high=${x.high}  low=${x.low}  close=${x.close}  body=${b} ${dir}${m}`);
});
console.log('\nC0 body:', (c18[0].close-c18[0].open).toFixed(0));
console.log('C1 body:', (c18[1].close-c18[1].open).toFixed(0));
console.log('C2 body:', (c18[2].close-c18[2].open).toFixed(0));
console.log('C3 (10:00) body:', (c3_18.close-c3_18.open).toFixed(0), c3_18.close>c3_18.open?'BULL':'BEAR');
console.log('Gap from prevClose:', (c18[0].open - prevC18).toFixed(0));
console.log('C0 open vs PDH:', (c18[0].open - prevH18).toFixed(0), '  vs PDL:', (c18[0].open - prevL18).toFixed(0));
console.log('\nP&L CE at C3 close -> EOD:', (eod18-c3_18.close).toFixed(0), 'pts  Rs:', ((eod18-c3_18.close)*15).toFixed(0));

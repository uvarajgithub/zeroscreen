const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_2026.json'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const dt = '2026-05-22';
const cs = raw[dt];
const prevDt = ALL[ALL.indexOf(dt) - 1];
const prev = raw[prevDt];
const pdh = arr => Math.max(...arr.map(c => c.high));
const pdl = arr => Math.min(...arr.map(c => c.low));
const bp  = c => (c.high - c.low) === 0 ? 0 : (c.close - c.open) / (c.high - c.low) * 100;
const PH = pdh(prev), PL = pdl(prev);
const C0 = cs[0];
const vsPDH = C0.open - PH;
const vsPDL = C0.open - PL;
const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
console.log('Prev day: ' + prevDt + '  PDH=' + PH.toFixed(2) + '  PDL=' + PL.toFixed(2));
console.log('May 22 ctx=' + ctx + '  C0.open=' + C0.open.toFixed(2) + '  vsPDH=' + vsPDH.toFixed(0) + '  vsPDL=' + vsPDL.toFixed(0));
console.log('');
for (let i = 0; i < Math.min(12, cs.length); i++) {
  const c = cs[i];
  const time = new Date(c.openTime || (new Date('2026-05-22T09:15:00+05:30').getTime() + i * 15 * 60000));
  console.log('C' + i + ': o=' + c.open.toFixed(2) + ' c=' + c.close.toFixed(2) + ' h=' + c.high.toFixed(2) + ' l=' + c.low.toFixed(2) + ' bp=' + bp(c).toFixed(1) + '%');
}

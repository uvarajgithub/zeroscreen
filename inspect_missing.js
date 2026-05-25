const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_2026.json'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const bp  = c => (c.high - c.low) === 0 ? 0 : (c.close - c.open) / (c.high - c.low) * 100;

const dates = ['2026-03-09','2026-04-02','2026-04-30','2026-05-12','2026-05-18'];
for (const dt of dates) {
  const cs = raw[dt];
  if (!cs || cs.length === 0) { console.log(dt, 'NO DATA'); continue; }
  const prevIdx = ALL.indexOf(dt) - 1;
  if (prevIdx < 0) { console.log(dt, 'NO PREV'); continue; }
  const prev = raw[ALL[prevIdx]];
  const PH = pdh(prev), PL = pdl(prev);
  const C0 = cs[0];
  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  console.log('\n' + dt + '  ctx=' + ctx + '  PDH=' + PH + '  PDL=' + PL + '  C0.open=' + C0.open + '  vsPDH=' + vsPDH.toFixed(0));
  for (let i = 0; i <= Math.min(7, cs.length-1); i++) {
    const c = cs[i];
    console.log('  C' + i + ': o=' + c.open + ' c=' + c.close + ' h=' + c.high + ' l=' + c.low + ' bp=' + bp(c).toFixed(1) + '%');
  }
}

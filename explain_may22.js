const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_2026.json'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const bp  = c => (c.high - c.low) === 0 ? 0 : (c.close - c.open) / (c.high - c.low) * 100;

const dt = '2026-05-22';
const cs = raw[dt];
const prevIdx = ALL.indexOf(dt) - 1;
const prev = raw[ALL[prevIdx]];
const PH = pdh(prev), PL = pdl(prev);

console.log('=== May 22, 2026 ===');
console.log('PDH=' + PH.toFixed(2) + '  PDL=' + PL.toFixed(2));
console.log('C0.open=' + cs[0].open + '  vs PDH=' + (cs[0].open - PH).toFixed(0) + 'pts  vs PDL=' + (cs[0].open - PL).toFixed(0) + 'pts');
console.log('');
console.log('All candles (15-min each):');
for (let i = 0; i < cs.length; i++) {
  const c = cs[i];
  const b = bp(c).toFixed(1);
  const time = new Date(c.time || (9*60+15+i*15)*60*1000);
  const hh = Math.floor((9*60 + 15 + i*15) / 60);
  const mm = (9*60 + 15 + i*15) % 60;
  const ts = String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0');
  console.log('C' + String(i).padStart(2) + ' ' + ts + '  o=' + c.open.toFixed(2) + '  c=' + c.close.toFixed(2) + '  h=' + c.high.toFixed(2) + '  l=' + c.low.toFixed(2) + '  bp=' + b + '%');
}

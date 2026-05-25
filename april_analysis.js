const d = require('./cache/banknifty_2026.json');
const ALL = Object.keys(d).sort().filter(k => d[k].length > 0);

function getPrev(date) {
  const idx = ALL.indexOf(date);
  return idx > 0 ? d[ALL[idx-1]] : null;
}
const pdh = cs => Math.max(...cs.map(x=>x.high));
const pdl = cs => Math.min(...cs.map(x=>x.low));
const pdc = cs => cs[cs.length-1].close;
const body = c => (c.close - c.open);
const rng  = c => c.high - c.low;
const bp   = c => (body(c)/rng(c)*100).toFixed(1);
const dir  = c => c.close > c.open ? 'B' : 'S';
const t    = c => c.h+':'+String(c.m).padStart(2,'0');

function run(date, entryIdx, exitIdx, label) {
  const cs = d[date];
  if (!cs || !cs.length) { console.log(date, 'NO DATA'); return; }
  const prev = getPrev(date);
  const PH = pdh(prev), PL = pdl(prev), PC = pdc(prev);
  const entry = cs[entryIdx];
  const exitC = exitIdx === 'EOD' ? cs[cs.length-1] : cs[exitIdx];
  const gap = (cs[0].open - PC).toFixed(0);
  const vsPDH = (cs[0].open - PH).toFixed(0);
  const vsPDL = (cs[0].open - PL).toFixed(0);
  const upto = Math.min(Math.max(entryIdx+2, 4), cs.length);
  
  console.log(`\n== ${date} ${label||''} ==  gap:${gap}  vsPDH:${vsPDH}  vsPDL:${vsPDL}`);
  cs.slice(0, upto).forEach((x,i) => {
    const b = body(x).toFixed(0);
    const mk = i===entryIdx?' <--':'';
    console.log(`  C${String(i).padStart(2)} ${t(x)} O:${x.open} H:${x.high} L:${x.low} C:${x.close} b:${b} ${bp(x)}% ${dir(x)}${mk}`);
  });
  const ce = (exitC.close - entry.close).toFixed(0);
  const pe = (entry.close - exitC.close).toFixed(0);
  console.log(`  entry:${entry.close} exit:${exitC.close}(${exitIdx==='EOD'?'EOD':t(exitC)})  CE:${ce}pts Rs:${(ce*15).toFixed(0)}  PE:${pe}pts Rs:${(pe*15).toFixed(0)}`);
}

function avoid(date) {
  const cs = d[date];
  if (!cs || !cs.length) { console.log(date, 'NO DATA'); return; }
  const prev = getPrev(date);
  const PH = pdh(prev), PL = pdl(prev), PC = pdc(prev);
  const c0=cs[0],c1=cs[1];
  const gap=(c0.open-PC).toFixed(0), vsPDH=(c0.open-PH).toFixed(0), vsPDL=(c0.open-PL).toFixed(0);
  console.log(`\n== ${date} AVOID ==  gap:${gap}  vsPDH:${vsPDH}  vsPDL:${vsPDL}`);
  cs.slice(0,4).forEach((x,i) => {
    const b = body(x).toFixed(0);
    console.log(`  C${i} ${t(x)} O:${x.open} H:${x.high} L:${x.low} C:${x.close} b:${b} ${bp(x)}% ${dir(x)}`);
  });
}

run('2026-04-01', 5, 15);       // 10:30 -> 13:00
run('2026-04-02', 1, 'EOD');    // 9:30 -> EOD
run('2026-04-06', 1, 'EOD');    // 9:30 -> EOD
run('2026-04-07', 2, 'EOD');    // 9:45 -> EOD
run('2026-04-08', 0, 'EOD');    // 9:15 -> EOD
run('2026-04-09', 1, 'EOD');    // 9:30 -> EOD
run('2026-04-10', 0, 'EOD');    // 9:15 -> EOD
run('2026-04-13', 1, 'EOD');    // 9:30 -> EOD
run('2026-04-15', 5, 8);        // 10:30 -> 11:15
run('2026-04-16', 1, 16);       // 9:30 -> 13:15
run('2026-04-17', 2, 'EOD');    // 9:45 -> EOD
run('2026-04-20', 2, 6);        // 9:45 -> 10:45
run('2026-04-21', 0, 'EOD');    // 9:15 -> EOD
avoid('2026-04-22');
run('2026-04-23', 3, 'EOD');    // 10:00 -> EOD
avoid('2026-04-24');
avoid('2026-04-27');
run('2026-04-28', 3, 'EOD');    // 10:00 -> EOD
// Apr 29: two entries
run('2026-04-29', 1, 13, 'E1'); // 9:30 -> 12:30
run('2026-04-29', 14, 'EOD', 'E2'); // 12:45 -> EOD
run('2026-04-30', 5, 17);       // 10:30 -> 13:30

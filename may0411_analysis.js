const d = require('./cache/banknifty_2026.json');

function getPrev(date) {
  const all = Object.keys(d).sort();
  return d[all[all.indexOf(date)-1]];
}
const pdh = cs => Math.max(...cs.map(x=>x.high));
const pdl = cs => Math.min(...cs.map(x=>x.low));
const pdc = cs => cs[cs.length-1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bpct = c => (body(c)/rng(c)*100).toFixed(1);
const dir  = c => c.close > c.open ? 'BULL' : 'BEAR';
const t    = c => c.h+':'+String(c.m).padStart(2,'0');
const eod  = cs => cs[cs.length-1].close;

function analyze(date, entryIdx, exitIdx, showUpto) {
  const cs = d[date];
  const prev = getPrev(date);
  const PH = pdh(prev), PL = pdl(prev), PC = pdc(prev);
  const c0 = cs[0];
  const entry = cs[entryIdx];
  const exitC = exitIdx === 'EOD' ? cs[cs.length-1] : cs[exitIdx];

  console.log(`\n${'='.repeat(60)}`);
  console.log(`${date}  |  C${entryIdx} (${t(entry)}) -> ${exitIdx==='EOD'?'EOD':t(exitC)}`);
  console.log(`PDH:${PH}  PDL:${PL}  PDC:${PC}`);
  console.log(`Gap:${(c0.open-PC).toFixed(0)}  vs PDH:${(c0.open-PH).toFixed(0)}  vs PDL:${(c0.open-PL).toFixed(0)}`);
  const upto = showUpto || Math.max(entryIdx+2, 5);
  cs.slice(0, upto).forEach((x,i) => {
    const b = body(x).toFixed(0);
    const mk = i===entryIdx?' <--ENTRY':'';
    console.log(`  C${String(i).padStart(2)} ${t(x)}  O:${x.open} H:${x.high} L:${x.low} C:${x.close}  body:${b} ${bpct(x)}% ${dir(x)}${mk}`);
  });
  const pnl_ce = (exitC.close - entry.close).toFixed(0);
  const pnl_pe = (entry.close - exitC.close).toFixed(0);
  console.log(`  CE: ${pnl_ce}pts Rs:${(pnl_ce*15).toFixed(0)}  |  PE: ${pnl_pe}pts Rs:${(pnl_pe*15).toFixed(0)}`);
}

analyze('2026-05-11', 3, 15, 8);   // 10:00 -> 13:00
analyze('2026-05-08', 0, 19, 6);   // 9:15 -> 14:00
analyze('2026-05-07', 10, 13, 13); // 11:45 -> 12:30
// May 6: two entries
const c6 = d['2026-05-06'];
const p6 = getPrev('2026-05-06');
console.log(`\n${'='.repeat(60)}`);
console.log(`2026-05-06  TWO ENTRIES: E1=C1(9:30)->C14(12:45)  E2=C15(13:00)->EOD`);
console.log(`PDH:${pdh(p6)} PDL:${pdl(p6)} PDC:${pdc(p6)}`);
console.log(`Gap:${(c6[0].open-pdc(p6)).toFixed(0)}  vs PDH:${(c6[0].open-pdh(p6)).toFixed(0)}  vs PDL:${(c6[0].open-pdl(p6)).toFixed(0)}`);
c6.slice(0,18).forEach((x,i) => {
  const b = body(x).toFixed(0);
  const mk = (i===1||i===15)?' <--ENTRY':'';
  console.log(`  C${String(i).padStart(2)} ${t(x)}  O:${x.open} H:${x.high} L:${x.low} C:${x.close}  body:${b} ${bpct(x)}% ${dir(x)}${mk}`);
});
const e1 = c6[1], ex1 = c6[14], e2 = c6[15], ex2 = eod(c6);
console.log(`  E1 CE:${(ex1.close-e1.close).toFixed(0)}pts Rs:${((ex1.close-e1.close)*15).toFixed(0)}  PE:${(e1.close-ex1.close).toFixed(0)}pts`);
console.log(`  E2 CE:${(ex2-e2.close).toFixed(0)}pts Rs:${((ex2-e2.close)*15).toFixed(0)}  PE:${(e2.close-ex2).toFixed(0)}pts`);

analyze('2026-05-05', 11, 15, 14); // 12:00 -> 13:00
analyze('2026-05-04', 2, 'EOD', 6); // 9:45 -> EOD

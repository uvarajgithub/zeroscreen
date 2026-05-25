const d = require('./cache/banknifty_2026.json');

function getPrevDay(date) {
  const all = Object.keys(d).sort();
  const idx = all.indexOf(date);
  return idx > 0 ? d[all[idx-1]] : null;
}
function pdh(cs) { return Math.max(...cs.map(x=>x.high)); }
function pdl(cs) { return Math.min(...cs.map(x=>x.low)); }
function pdc(cs) { return cs[cs.length-1].close; }
function body(c) { return c.close - c.open; }
function rng(c)  { return c.high - c.low; }
function bpct(c) { return (body(c)/rng(c)*100).toFixed(1); }
function dir(c)  { return c.close > c.open ? 'BULL' : 'BEAR'; }
function t(c)    { return c.h+':'+String(c.m).padStart(2,'0'); }

function printDay(date, entryIdx, side, exitIdx) {
  const cs = d[date];
  const prev = getPrevDay(date);
  const PH = pdh(prev), PL = pdl(prev), PC = pdc(prev);
  const c0 = cs[0];
  const entry = cs[entryIdx];
  const exit  = exitIdx === 'EOD' ? cs[cs.length-1] : cs[exitIdx];
  const gap = (c0.open - PC).toFixed(0);
  const vs_pdh = (c0.open - PH).toFixed(0);
  const vs_pdl = (c0.open - PL).toFixed(0);
  const pnl_pts = side==='CE' ? exit.close - entry.close : entry.close - exit.close;

  console.log(`\n${'='.repeat(55)}`);
  console.log(`${date}  |  Entry: C${entryIdx} (${t(entry)}) ${side}  |  Exit: ${exitIdx==='EOD'?'EOD':t(exit)}`);
  console.log(`${'='.repeat(55)}`);
  console.log(`Prev day  PDH:${PH}  PDL:${PL}  PDC:${PC}`);
  console.log(`Gap: ${gap}pts  Open vs PDH: ${vs_pdh}  Open vs PDL: ${vs_pdl}`);
  console.log(`\nFirst 5 candles:`);
  cs.slice(0, Math.max(entryIdx+2, 5)).forEach((x,i) => {
    const b = body(x).toFixed(0);
    const mark = i===entryIdx ? ' <-- ENTRY' : '';
    console.log(`  C${i} ${t(x)}  open=${x.open}  high=${x.high}  low=${x.low}  close=${x.close}  body=${b} ${bpct(x)}% ${dir(x)}${mark}`);
  });
  console.log(`\nEntry close: ${entry.close}  Exit close: ${exit.close}`);
  console.log(`P&L: ${pnl_pts.toFixed(0)} pts  =>  Rs: ${(pnl_pts*15).toFixed(0)}`);
}

// May 15: C2 PE, EOD
printDay('2026-05-15', 2, 'PE', 'EOD');
// May 14: C7 CE, C21 (14:30)
printDay('2026-05-14', 7, 'CE', 21);
// May 13: C2, exit C14 (12:45) — side TBD from data
printDay('2026-05-13', 2, 'PE', 14); // will check
printDay('2026-05-13', 2, 'CE', 14); // both to see which is right
// May 12: C4, EOD — side TBD
printDay('2026-05-12', 4, 'PE', 'EOD');
printDay('2026-05-12', 4, 'CE', 'EOD');

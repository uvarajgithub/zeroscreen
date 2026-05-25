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

function run(date, entryIdx, exitIdx) {
  const cs = d[date]; if (!cs||!cs.length){console.log(date,'NO DATA');return;}
  const prev = getPrev(date);
  if(!prev){console.log(date,'NO PREV');return;}
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const entry=cs[entryIdx];
  const exitC=exitIdx==='EOD'?cs[cs.length-1]:cs[exitIdx];
  const gap=(cs[0].open-PC).toFixed(0);
  const vsPDH=(cs[0].open-PH).toFixed(0);
  const vsPDL=(cs[0].open-PL).toFixed(0);
  const upto=Math.min(Math.max(entryIdx+2,4),cs.length);
  console.log(`\n== ${date} ==  gap:${gap}  vsPDH:${vsPDH}  vsPDL:${vsPDL}`);
  cs.slice(0,upto).forEach((x,i)=>{
    const b=body(x).toFixed(0);
    const mk=i===entryIdx?' <--':'';
    console.log(`  C${String(i).padStart(2)} ${t(x)} O:${x.open} H:${x.high} L:${x.low} C:${x.close} b:${b} ${bp(x)}% ${dir(x)}${mk}`);
  });
  const ce=(exitC.close-entry.close).toFixed(0);
  const pe=(entry.close-exitC.close).toFixed(0);
  console.log(`  entry:${entry.close} exit:${exitC.close}(${exitIdx==='EOD'?'EOD':t(exitC)})  CE:${ce}pts Rs:${(ce*15).toFixed(0)}  PE:${pe}pts Rs:${(pe*15).toFixed(0)}`);
}

function avoid(date) {
  const cs=d[date]; if(!cs||!cs.length){console.log(date,'NO DATA');return;}
  const prev=getPrev(date); if(!prev)return;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const c0=cs[0];
  console.log(`\n== ${date} AVOID ==  gap:${(c0.open-PC).toFixed(0)}  vsPDH:${(c0.open-PH).toFixed(0)}  vsPDL:${(c0.open-PL).toFixed(0)}`);
  cs.slice(0,4).forEach((x,i)=>{
    const b=body(x).toFixed(0);
    console.log(`  C${i} ${t(x)} b:${b} ${bp(x)}% ${dir(x)}`);
  });
}

run('2026-03-02', 2, 18);   // Mar 1 is Sunday, first trading day is Mar 2? let's check
run('2026-03-03', 2, 18);   // fallback
avoid('2026-03-04');
avoid('2026-03-05');
run('2026-03-06', 0, 'EOD');
run('2026-03-09', 2, 'EOD');
run('2026-03-10', 3, 'EOD');
run('2026-03-11', 0, 'EOD');
avoid('2026-03-12');
run('2026-03-13', 0, 'EOD');
run('2026-03-16', 7, 22);   // 11:00 -> 14:45
run('2026-03-17', 2, 'EOD');
run('2026-03-18', 4, 'EOD');
run('2026-03-19', 1, 'EOD');
run('2026-03-20', 1, 'EOD');
run('2026-03-23', 0, 'EOD');
run('2026-03-24', 7, 'EOD'); // 11:00 -> EOD
run('2026-03-25', 0, 'EOD');
run('2026-03-27', 0, 'EOD');

const d = require('./cache/banknifty_2026.json');
const ALL = Object.keys(d).sort().filter(k => d[k].length > 0);
function getPrev(date) { const i=ALL.indexOf(date); return i>0?d[ALL[i-1]]:null; }
const pdh=cs=>Math.max(...cs.map(x=>x.high));
const pdl=cs=>Math.min(...cs.map(x=>x.low));
const pdc=cs=>cs[cs.length-1].close;
const body=c=>c.close-c.open;
const rng=c=>c.high-c.low;
const bp=c=>(body(c)/rng(c)*100).toFixed(1);
const uw=c=>c.high-c.open; // upper wick from open

// ALL known trades
const trades = [
  // date, entryIdx, side
  ['2026-03-02',2,'PE'], ['2026-03-06',0,'PE'], ['2026-03-09',2,'CE'],
  ['2026-03-10',3,'CE'], ['2026-03-11',0,'PE'], ['2026-03-13',0,'PE'],
  ['2026-03-16',7,'CE'], ['2026-03-17',2,'CE'], ['2026-03-18',4,'CE'],
  ['2026-03-19',1,'PE'], ['2026-03-20',1,'PE'], ['2026-03-23',0,'PE'],
  ['2026-03-24',7,'CE'], ['2026-03-25',0,'CE'], ['2026-03-27',0,'PE'],
  ['2026-04-01',5,'CE'], ['2026-04-02',1,'CE'], ['2026-04-06',1,'CE'],
  ['2026-04-07',2,'CE'], ['2026-04-08',0,'CE'], ['2026-04-09',1,'PE'],
  ['2026-04-10',0,'CE'], ['2026-04-13',1,'CE'], ['2026-04-15',5,'PE'],
  ['2026-04-16',1,'PE'], ['2026-04-17',2,'CE'], ['2026-04-20',2,'CE'],
  ['2026-04-21',0,'CE'], ['2026-04-23',3,'PE'], ['2026-04-28',3,'PE'],
  ['2026-04-29',1,'CE'], ['2026-04-29',14,'PE'], ['2026-04-30',5,'CE'],
  ['2026-05-04',2,'PE'], ['2026-05-05',11,'CE'], ['2026-05-06',1,'PE'],
  ['2026-05-06',15,'CE'], ['2026-05-07',10,'CE'], ['2026-05-08',0,'PE'],
  ['2026-05-11',3,'CE'], ['2026-05-12',4,'PE'], ['2026-05-13',2,'CE'],
  ['2026-05-14',7,'CE'], ['2026-05-15',2,'PE'], ['2026-05-18',3,'CE'],
  ['2026-05-19','AVOID'], ['2026-05-20',1,'CE'], ['2026-05-21',0,'PE'],
  ['2026-05-22',0,'CE'],
];

console.log('=== PATTERN ANALYSIS ACROSS ALL DAYS ===\n');

let counts = {C0_CE:0,C0_PE:0,C1_CE:0,C1_PE:0,later_CE:0,later_PE:0};
let contexts = {above_pdh:[], below_pdl:[], inside:[]};

trades.forEach(([date,idx,side]) => {
  if(idx==='AVOID') return;
  const cs=d[date]; const prev=getPrev(date); if(!prev||!cs) return;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const c0=cs[0];
  const gap=c0.open-PC;
  const vsPDH=c0.open-PH;
  const vsPDL=c0.open-PL;
  const c0body=body(c0), c0bp=parseFloat(bp(c0)), c0uw=uw(c0);
  const entryCand=cs[idx];
  const ebody=body(entryCand), ebp=parseFloat(bp(entryCand));

  // classify context
  let ctx = vsPDH > 0 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  
  // count entry candle index
  if(idx===0) side==='CE'?counts.C0_CE++:counts.C0_PE++;
  else if(idx===1) side==='CE'?counts.C1_CE++:counts.C1_PE++;
  else side==='CE'?counts.later_CE++:counts.later_PE++;

  // check shooting star for C0 entries
  const isStar = idx===0 && c0uw > Math.abs(c0body)*1.5 && c0body < 0;
  
  console.log(`${date} ctx:${ctx.padEnd(9)} gap:${gap.toFixed(0).padStart(6)} C0:${c0bp.toFixed(0).padStart(4)}% ${c0body>0?'B':'S'}  C0uw:${c0uw.toFixed(0).padStart(4)}  Entry:C${idx} ${ebp.toFixed(0).padStart(4)}%${ebody>0?'B':'S'} -> ${side} ${isStar?'⭐STAR':''}`)
});

console.log('\n=== ENTRY CANDLE INDEX DISTRIBUTION ===');
console.log('C0 CE:', counts.C0_CE, '  C0 PE:', counts.C0_PE);
console.log('C1 CE:', counts.C1_CE, '  C1 PE:', counts.C1_PE);
console.log('C2+ CE:', counts.later_CE, '  C2+ PE:', counts.later_PE);

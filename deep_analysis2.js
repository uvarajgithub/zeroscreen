// deep_analysis2.js — Extended pattern analysis with vsPDH, vsPDL, C0 lower wick
const d = require('./cache/banknifty_2026.json');
const ALL = Object.keys(d).sort().filter(k => d[k].length > 0);
const getPrev = date => { const i=ALL.indexOf(date); return i>0?d[ALL[i-1]]:null; };
const pdh=cs=>Math.max(...cs.map(x=>x.high));
const pdl=cs=>Math.min(...cs.map(x=>x.low));
const pdc=cs=>cs[cs.length-1].close;
const body=c=>c.close-c.open;
const rng=c=>c.high-c.low;
const bp=c=>rng(c)>0?Math.round(body(c)/rng(c)*100):0;
const uw=c=>c.high-c.open;
const lw=c=>c.open-c.low;

const trades = [
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
  ['2026-05-20',1,'CE'], ['2026-05-21',0,'PE'], ['2026-05-22',0,'CE'],
];
const AVOID = new Set(['2026-03-04','2026-03-05','2026-03-12',
  '2026-04-04','2026-04-05','2026-04-22','2026-04-24','2026-04-27','2026-05-19']);

console.log('=== DEEP PATTERN ANALYSIS 2 ===\n');
console.log('date       ctx      vsPDH  vsPDL  C0b%  C0uw  C0lw  C1b%  C2b%   Entry  WinDir?');
console.log('─'.repeat(100));

const abovePDH=[], belowPDL=[], insideArr=[];

trades.forEach(([date,idx,side]) => {
  const cs=d[date]; const prev=getPrev(date); if(!prev||!cs) return;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const c0=cs[0];
  const vsPDH=Math.round(c0.open-PH);
  const vsPDL=Math.round(c0.open-PL);
  const ctx = vsPDH>0?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE  ';

  const c0bp=bp(c0), c0uw_=Math.round(uw(c0)), c0lw_=Math.round(lw(c0));
  const c1bp=cs[1]?bp(cs[1]):0;
  const c2bp=cs[2]?bp(cs[2]):0;
  const ec=cs[idx];
  const eodClose = cs[cs.length-1].close;
  const winDir = side==='CE'?(eodClose>ec.close?'✓WIN':' LOSS'):(eodClose<ec.close?'✓WIN':' LOSS');

  const vsPDHstr = (vsPDH>0?'+':'')+vsPDH;
  const vsPDLstr = (vsPDL<0?'':'+')+(vsPDL);

  console.log(`${date} ${ctx} ${vsPDHstr.padStart(6)} ${vsPDLstr.padStart(6)}  ${(c0bp+'%').padStart(4)} ${c0uw_.toString().padStart(5)} ${c0lw_.toString().padStart(5)} ${(c1bp+'%').padStart(5)} ${(c2bp+'%').padStart(5)}   C${idx.toString().padEnd(2)} ${side}  ${winDir}`);

  if(vsPDH>0) abovePDH.push({date,vsPDH,vsPDL,c0bp,c0uw:c0uw_,c0lw:c0lw_,c1bp,idx,side,ec});
  else if(vsPDL<0) belowPDL.push({date,vsPDH,vsPDL,c0bp,c0uw:c0uw_,c0lw:c0lw_,c1bp,idx,side,ec,PL});
  else insideArr.push({date,vsPDH,vsPDL,c0bp,c0uw:c0uw_,c0lw:c0lw_,c1bp,c2bp,idx,side,ec});
});

// ABOVE_PDH: find the vsPDH threshold
console.log('\n\n══════ ABOVE_PDH: vsPDH SIZE vs DIRECTION ══════');
console.log('date        vsPDH    C0b%   C1b%   -> entry   side   | KEY INSIGHT');
abovePDH.sort((a,b)=>a.vsPDH-b.vsPDH).forEach(t=>{
  const tag = t.vsPDH < 120 ? '← BARELY ABOVE (PDH support)' :
              t.vsPDH > 1000 ? '← EXTRAORDINARY GAP' : '← FAKE BREAKOUT ZONE';
  console.log(`${t.date}  +${t.vsPDH.toString().padStart(4)}  ${(t.c0bp+'%').padStart(5)}  ${(t.c1bp+'%').padStart(5)}   C${t.idx}  ${t.side}    ${tag}`);
});

// BELOW_PDL: C0 character vs entry
console.log('\n\n══════ BELOW_PDL: C0 TYPE vs DIRECTION ══════');
console.log('date       vsPDL    C0b%   C0uw  C0lw  C0.h<PDL  -> entry  side');
belowPDL.sort((a,b)=>a.c0bp-b.c0bp).forEach(t=>{
  const cs=d[t.date]; const prev=getPrev(t.date);
  const PL_val=pdl(prev); const c0=cs[0];
  const c0hBelowPDL=c0.high < PL_val;
  const climax = t.c0bp < -70 ? '← SELLING CLIMAX→CE' :
                 t.c0bp > 70  ? '← RECOVERY BOUNCE→PE' :
                 c0hBelowPDL  ? '← NO RECOVERY→PE' : '← moderate';
  console.log(`${t.date}  ${t.vsPDL.toString().padStart(5)}  ${(t.c0bp+'%').padStart(5)} ${t.c0uw.toString().padStart(5)} ${t.c0lw.toString().padStart(5)}  ${c0hBelowPDL?'YES':'no '.padEnd(3)}       C${t.idx}  ${t.side}   ${climax}`);
});

// INSIDE: What makes C0 an immediate entry vs wait?
console.log('\n\n══════ INSIDE: C0 body threshold for immediate entry ══════');
console.log('date       C0b%  C0uw  C0lw  C1b%  C2b%  → C idx  side  | immediate vs wait');
insideArr.sort((a,b)=>a.c0bp-b.c0bp).forEach(t=>{
  const tag = t.idx===0 ? 'C0 IMMEDIATE' :
              t.idx===1 ? 'C1 entry' :
              t.idx<=4  ? `C${t.idx} entry` : `LATE C${t.idx}`;
  console.log(`${t.date}  ${(t.c0bp+'%').padStart(5)} ${t.c0uw.toString().padStart(5)} ${t.c0lw.toString().padStart(5)} ${(t.c1bp+'%').padStart(5)} ${(t.c2bp+'%').padStart(5)}  → C${t.idx.toString().padEnd(2)}  ${t.side}   [${tag}]`);
});

// AVOID days
console.log('\n\n══════ AVOID DAYS: what C0-C4 looks like ══════');
const allAvoidsInData = [...AVOID].filter(date => d[date] && d[date].length > 0);
allAvoidsInData.forEach(date => {
  const cs=d[date]; const prev=getPrev(date); if(!prev||!cs) return;
  const PH=pdh(prev),PL=pdl(prev),PC=pdc(prev);
  const c0=cs[0];
  const vsPDH=Math.round(c0.open-PH), vsPDL=Math.round(c0.open-PL);
  const ctx=vsPDH>0?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const bps=cs.slice(0,5).map(c=>bp(c)+'%');
  console.log(`${date} ${ctx.padEnd(9)} C0-C4:[${bps.join(',')}]`);
});

// KEY THRESHOLDS SUMMARY
console.log('\n\n══════ THRESHOLD ANALYSIS ══════');
const c0ImmediateEntries = insideArr.filter(t=>t.idx===0);
const c0Wait = insideArr.filter(t=>t.idx>0);
console.log(`\nINSIDE C0-immediate entries (${c0ImmediateEntries.length}):`);
console.log(`  C0 body% range: min=${Math.min(...c0ImmediateEntries.map(t=>t.c0bp))}%  max=${Math.max(...c0ImmediateEntries.map(t=>t.c0bp))}%`);
console.log(`  C0 body% values: ${c0ImmediateEntries.map(t=>t.c0bp+'%').join(', ')}`);
console.log(`\nINSIDE C1+ entries (${c0Wait.length}):`);
console.log(`  C0 body% values when entry delayed: ${c0Wait.map(t=>`${t.c0bp}%(C${t.idx})`).join(', ')}`);

const abovePDH_pe = abovePDH.filter(t=>t.side==='PE');
const abovePDH_ce = abovePDH.filter(t=>t.side==='CE');
console.log(`\nABOVE_PDH PE entries vsPDH: ${abovePDH_pe.map(t=>'+'+t.vsPDH).join(', ')}`);
console.log(`ABOVE_PDH CE entries vsPDH: ${abovePDH_ce.map(t=>'+'+t.vsPDH).join(', ')}`);
console.log(`ABOVE_PDH threshold guess: entries <150 → CE, >150 (unless >1000) → PE`);

const belowPDL_ce = belowPDL.filter(t=>t.side==='CE');
const belowPDL_pe = belowPDL.filter(t=>t.side==='PE');
console.log(`\nBELOW_PDL CE entries C0body: ${belowPDL_ce.map(t=>t.c0bp+'%').join(', ')}`);
console.log(`BELOW_PDL PE entries C0body: ${belowPDL_pe.map(t=>t.c0bp+'%').join(', ')}`);

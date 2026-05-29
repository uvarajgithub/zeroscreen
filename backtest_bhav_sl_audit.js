// backtest_bhav_sl_audit.js
// Full 384 combos × 3 SL types = 1,152 total
// Audit: check if HYBRID-10+SL200 holds up, find any miscalculation

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2]||'cache/banknifty_5yr.json','utf8'));
const ALL = Object.keys(raw).sort().filter(k=>raw[k]&&raw[k].length>0);
const PTS = 15;

const pdh = cs=>Math.max(...cs.map(c=>c.high));
const pdl = cs=>Math.min(...cs.map(c=>c.low));
const pdc = cs=>cs[cs.length-1].close;
const body= c=>c.close-c.open;
const rng = c=>c.high-c.low;
const bp  = c=>rng(c)>0?body(c)/rng(c)*100:0;
const firstBull   =(cs,f,t=30)=>{for(let i=f;i<cs.length;i++)if(bp(cs[i])>t)return i;return -1;};
const firstBear   =(cs,f,t=30)=>{for(let i=f;i<cs.length;i++)if(bp(cs[i])<-t)return i;return -1;};
const firstStrong =(cs,f,t=55)=>{for(let i=f;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null;};

function findEntry(cs,prev){
  if(!cs||cs.length<2||!prev||prev.length===0)return null;
  const PH=pdh(prev),PL_=pdl(prev),PC=pdc(prev);
  const C0=cs[0],gap=C0.open-PC;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL_;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=cs[1]?bp(cs[1]):0;
  const bps4=cs.slice(0,Math.min(4,cs.length)).map(bp);
  let w=0;for(let i=1;i<bps4.length;i++)if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65)w++;
  if(w>=2)return null;
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)return{idx:0,side:'CE',ctx};
    if(C0bp>85)return{idx:0,side:'CE',ctx};
    if(C0bp<-20)return{idx:0,side:'PE',ctx};
    const b=firstBear(cs,1,35);if(b>0&&b<=7)return{idx:b,side:'PE',ctx};
    const c=firstStrong(cs,2,55);if(c)return{idx:c.i,side:c.side,ctx};
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80)return{idx:0,side:'PE',ctx};
    if(C0bp<-65)return null;
    if(C0bp>65){const i=firstBear(cs,1,30);if(i>0)return{idx:i,side:'PE',ctx};}
    if(C0.high<PL_){
      if(C1bp>20)return{idx:1,side:'CE',ctx};
      if(C1bp<-20)return{idx:0,side:'PE',ctx};
      const s=firstStrong(cs,2,40);if(s&&s.i<=5)return{idx:s.i,side:s.side,ctx};
      return null;
    }
    if(C0bp>20){const i=firstBear(cs,1,30);if(i>0&&i<=6)return{idx:i,side:'PE',ctx};}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,cs.length-2);i++)if(bp(cs[i])<-45&&cs[i-1].close<PL_)return{idx:i,side:'PE',ctx};}
    return null;
  }
  if(C0.close<PL_)return{idx:0,side:'PE',ctx};
  if(C0.close>PH) return{idx:0,side:'CE',ctx};
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0b=C0bp>0,al=(c0b&&!gapDown)||(!c0b&&!gapUp);
    if(al){if(C1bp*C0bp<0&&Math.abs(C1bp)>72)return{idx:1,side:C1bp>0?'CE':'PE',ctx};return{idx:0,side:c0b?'CE':'PE',ctx};}
    const gs=gapUp?'CE':'PE';const rv=gapUp?firstBull(cs,1,35):firstBear(cs,1,35);
    if(rv>0&&rv<=5)return{idx:rv,side:gs,ctx};
    return{idx:0,side:c0b?'CE':'PE',ctx};
  }
  if(Math.abs(C0bp)>30){
    if(C1bp*C0bp>0)return{idx:0,side:C0bp>0?'CE':'PE',ctx};
    if(Math.abs(C1bp)>65&&C1bp*C0bp<0&&cs.length>2){const C2bp=bp(cs[2]);if(C2bp*C0bp>0&&Math.abs(C2bp)>20)return{idx:0,side:C0bp>0?'CE':'PE',ctx};}
  }
  for(let i=2;i<=8;i++){
    if(i>=cs.length)break;
    const cbp=bp(cs[i]);
    if(Math.abs(cbp)>55){
      const sb=cbp>0,og=(sb&&gapDown)||(!sb&&gapUp),cm=(sb&&C0bp<-20)||(!sb&&C0bp>20);
      if(og&&cm)continue;
      const pv=bp(cs[i-1]);
      if(Math.abs(pv)>60&&pv*cbp<0&&i+1<cs.length&&bp(cs[i+1])*cbp<0&&Math.abs(bp(cs[i+1]))>60)return null;
      return{idx:i,side:cbp>0?'CE':'PE',ctx};
    }
  }
  for(let i=5;i<Math.min(cs.length,21);i++){
    const pc=cs[i-1].close;
    if(cs[i].low<=PL_&&pc>PL_&&bp(cs[i])>35)return{idx:i,side:'CE',ctx};
    if(cs[i].high>=PH&&pc<PH&&bp(cs[i])<-35)return{idx:i,side:'PE',ctx};
  }
  return null;
}
function findReEntry(cs,from,side){
  for(let i=from+1;i<cs.length-2;i++){const b=bp(cs[i]);if(side==='CE'&&b>35)return i;if(side==='PE'&&b<-35)return i;}
  return -1;
}

// FIXED-target exit (no trail)
function exitFixed(cs,entryIdx,side,SL,TARGET,slMode){
  const ep=cs[entryIdx].close,sign=side==='CE'?1:-1;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const op=sign*(c.open-ep);
    if(op>=TARGET) return{pl:TARGET*PTS,exitIdx:i,type:'TG'};
    if(op<-SL)     return{pl:-SL*PTS,exitIdx:i,type:'SLG'};
    const fav =side==='CE'?(c.high-ep):(ep-c.low);
    const adv =side==='CE'?(c.low-ep):(ep-c.high);
    const cls =sign*(c.close-ep);
    if(fav>=TARGET) return{pl:TARGET*PTS,exitIdx:i,type:'T'};
    // SL
    if(slMode==='intrabar'&&adv<=-SL)             return{pl:-SL*PTS,exitIdx:i,type:'SL'};
    if(slMode==='close'&&cls<=-SL)                return{pl:cls*PTS,exitIdx:i,type:'SL'};
    if(typeof slMode==='number'&&adv<=-SL&&cls<=-SL+slMode) return{pl:cls*PTS,exitIdx:i,type:'SL'};
  }
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

// TRAIL exit (Fix3)
function exitTrail(cs,entryIdx,side,SL,TRAIL_GAP,slMode){
  const ep=cs[entryIdx].close,sign=side==='CE'?1:-1;
  let trail=-SL,peak=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const op=sign*(c.open-ep);
    if(trail>0&&op<trail) return{pl:op*PTS,exitIdx:i,type:'TG'};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,exitIdx:i,type:'SLG'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sign*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const np=Math.max(peak,fav);
    const nt=np>=TRAIL_GAP?np-TRAIL_GAP:-SL;
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,exitIdx:i,type:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,exitIdx:i,type:'TS'};
    if(trail<=0){
      if(slMode==='intrabar'&&adv<=-SL)             return{pl:-SL*PTS,exitIdx:i,type:'SL'};
      if(slMode==='close'&&cls<=-SL)                return{pl:cls*PTS,exitIdx:i,type:'SL'};
      if(typeof slMode==='number'&&adv<=-SL&&cls<=-SL+slMode) return{pl:cls*PTS,exitIdx:i,type:'SL'};
    }
    peak=np;trail=nt;
  }
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

function calcExit(cs,idx,side,SL,exitCfg,slMode){
  if(exitCfg.type==='trail') return exitTrail(cs,idx,side,SL,exitCfg.gap,slMode);
  if(exitCfg.type==='fixed') return exitFixed(cs,idx,side,SL,exitCfg.target,slMode);
  // EOD
  return{pl:(side==='CE'?1:-1)*(cs[cs.length-1].close-cs[idx].close)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

function run(entryCtx,SL,slMode,exitCfg,withRE){
  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,slHits=0,slPl=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    if(entryCtx!=='ALL'&&entry.ctx!==entryCtx)continue;
    const r1=calcExit(cs,entry.idx,entry.side,SL,exitCfg,slMode);
    tr++;if(r1.pl>0)wins++;
    if(r1.type==='SL'||r1.type==='SLG'){slHits++;slPl+=r1.pl;}
    let rpl=0,cei=r1.exitIdx,ct=r1.type,cp=r1.pl,cs2=entry.side;
    if(withRE&&r1.pl>0&&r1.type!=='EOD'){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.exitIdx+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,r1.exitIdx,entry.side);
      if(ri>0&&(sf<0||ri<sf)){const rr=calcExit(cs,ri,rev,SL,exitCfg,slMode);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;cs2=rev;}
    }
    if(withRE){
      for(let i=0;i<3;i++){
        if(ct!=='EOD'&&cp>0){const ri=findReEntry(cs,cei,cs2);if(ri>0){const rr=calcExit(cs,ri,cs2,SL,exitCfg,slMode);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;}else break;}else break;
      }
    }
    const day=r1.pl+rpl;pl+=day;eq+=day;
    if(eq>pk)pk=eq;const d2=pk-eq;if(d2>dd)dd=d2;
    const y=date.slice(0,4);yr[y]=(yr[y]||0)+day;
  }
  return{pl,tr,wr:(wins/tr*100).toFixed(1),slHits,slPl,dd,allPos:Object.values(yr).every(v=>v>=0),yr};
}

// ─── GRID ─────────────────────────────────────────────────────────────────────
const ENTRIES  = ['ALL','ABOVE_PDH','BELOW_PDL','INSIDE'];
const SLS      = [50,75,100,150,200,250];
const SL_MODES = [
  {label:'INTRABAR', mode:'intrabar'},
  {label:'CLOSE',    mode:'close'},
  {label:'HYB-10',   mode:10},
];
const EXITS = [
  {label:'Trail-20',  cfg:{type:'trail',gap:20}},
  {label:'Trail-50',  cfg:{type:'trail',gap:50}},
  {label:'Trail-100', cfg:{type:'trail',gap:100}},
  {label:'Fixed-125', cfg:{type:'fixed',target:125}},
  {label:'Fixed-175', cfg:{type:'fixed',target:175}},
  {label:'Fixed-250', cfg:{type:'fixed',target:250}},
  {label:'Fixed-500', cfg:{type:'fixed',target:500}},
  {label:'EOD',       cfg:{type:'eod'}},
];
const RE_OPTS  = [true,false];

console.log('  Running 1,152 combinations (384 × 3 SL types)...\n');
const results=[];
for(const entry of ENTRIES)
for(const sl of SLS)
for(const slm of SL_MODES)
for(const ex of EXITS)
for(const re of RE_OPTS){
  const r=run(entry,sl,slm.mode,ex.cfg,re);
  results.push({entry,sl,slMode:slm.label,exit:ex.label,re,slHits:r.slHits,...r});
}
results.sort((a,b)=>b.pl-a.pl);

console.log('  TOP 30 RESULTS (1,152 combos, sorted by P&L)');
console.log('  ' + '═'.repeat(105));
console.log('  Rank  Entry       SL_type    SL    Exit        RE      P&L              WR%    SL_hits  MaxDD        AllPos');
console.log('  ' + '─'.repeat(105));
for(let i=0;i<30;i++){
  const r=results[i];
  const ap=r.allPos?'✓':' ';
  const re=r.re?String(r.reCount||'RE'):'--';
  console.log(`  ${String(i+1).padStart(3)}   ${r.entry.padEnd(10)} ${r.slMode.padEnd(10)} ${String(r.sl).padStart(3)}   ${r.exit.padEnd(10)} ${String(re).padStart(5)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}   ${r.wr}%   ${String(r.slHits).padStart(5)}   ₹${r.dd.toLocaleString('en-IN').padStart(10)}  ${ap}`);
}

// ── Focus: ALL + Trail-20 + RE — compare 3 SL types at each SL level
console.log('\n\n  FOCUS: Entry=ALL | Exit=Trail-20 | with RE — SL type × SL level');
console.log('  ' + '═'.repeat(85));
console.log('  SL   │ INTRABAR              │ CLOSE                 │ HYB-10               │ Winner');
console.log('  ─────┼───────────────────────┼───────────────────────┼───────────────────────┼────────');
for(const sl of SLS){
  const row=SL_MODES.map(m=>{
    const r=results.find(x=>x.entry==='ALL'&&x.sl===sl&&x.slMode===m.label&&x.exit==='Trail-20'&&x.re===true);
    return r?`₹${(r.pl/100000).toFixed(2)}L ${r.wr}% ${String(r.slHits).padStart(3)}${r.allPos?'✓':' '}`:'-';
  });
  const vals=SL_MODES.map(m=>results.find(x=>x.entry==='ALL'&&x.sl===sl&&x.slMode===m.label&&x.exit==='Trail-20'&&x.re===true));
  const best=vals.reduce((a,b)=>(!b||a.pl>=b.pl)?a:b);
  const bestName=['INB','CLO','HYB'][vals.indexOf(best)];
  console.log(`  ${String(sl).padStart(3)}  │ ${row[0].padEnd(21)}│ ${row[1].padEnd(21)}│ ${row[2].padEnd(21)}│ ${bestName}`);
}

// ── Audit: SL-only difference between INTRABAR and HYBRID at best combo
console.log('\n\n  AUDIT: Days where SL type changes outcome (ALL+SL200+Trail20+RE)');
console.log('  ═══════════════════════════════════════════════════════════════════');
// Count days where SL fires on intrabar but NOT on hybrid
let diffCount=0,savedByHybrid=0,savedPl=0;
for(const date of ALL){
  const cs=raw[date],prev=getPrev(date);
  if(!prev)continue;
  const entry=findEntry(cs,prev);
  if(!entry)continue;
  const rInb=exitTrail(cs,entry.idx,entry.side,200,20,'intrabar');
  const rHyb=exitTrail(cs,entry.idx,entry.side,200,20,10);
  if((rInb.type==='SL'||rInb.type==='SLG')&&rHyb.type!=='SL'&&rHyb.type!=='SLG'){
    diffCount++;
    savedByHybrid++;
    savedPl+=rHyb.pl-rInb.pl;
  }
}
console.log(`  Days where INTRABAR fires SL but HYBRID skips it : ${diffCount}`);
console.log(`  Average P&L improvement per saved day             : ₹${(savedPl/Math.max(diffCount,1)).toFixed(0)}`);
console.log(`  Total P&L improvement from SL avoidance           : ₹${savedPl.toLocaleString('en-IN')}`);

// ── Best per SL type
console.log('\n\n  BEST PER SL TYPE (overall)');
console.log('  ' + '═'.repeat(80));
for(const m of SL_MODES){
  const best=results.filter(r=>r.slMode===m.label).sort((a,b)=>b.pl-a.pl)[0];
  const allPosBest=results.filter(r=>r.slMode===m.label&&r.allPos).sort((a,b)=>b.pl-a.pl)[0];
  console.log(`  ${m.label.padEnd(10)}: Best overall → Entry=${best.entry} SL=${best.sl} Exit=${best.exit} RE=${best.re?'Y':'N'} → ₹${best.pl.toLocaleString('en-IN')} AllPos:${best.allPos?'YES':'NO'}`);
  if(!best.allPos) console.log(`             All-years-positive → Entry=${allPosBest.entry} SL=${allPosBest.sl} Exit=${allPosBest.exit} RE=${allPosBest.re?'Y':'N'} → ₹${allPosBest.pl.toLocaleString('en-IN')}`);
}

const winner=results.filter(r=>r.allPos)[0];
console.log(`\n  ══ WINNER (all-years-positive) ══`);
console.log(`  Entry=${winner.entry}  SL_type=${winner.slMode}  SL=${winner.sl}  Exit=${winner.exit}  RE=${winner.re?'YES':'NO'}`);
console.log(`  P&L: ₹${winner.pl.toLocaleString('en-IN')}  WR: ${winner.wr}%  MaxDD: ₹${winner.dd.toLocaleString('en-IN')}`);
console.log('  Yearly:');
for(const [y,p] of Object.entries(winner.yr).sort())
  console.log(`    ${y}: ₹${p.toLocaleString('en-IN').padStart(14)}  ${p>=0?'+':'-'}`);

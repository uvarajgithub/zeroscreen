// backtest_bhav_all_conditions.js
// Test ALL remaining untested conditions at winner params:
//   Base: Entry=ALL, HYB-10, SL=200, ACT20-G10, RE=yes
// Tests:
//   A. Activation × Gap fine sweep
//   B. Entry time filter (max candle index)
//   C. Max trades per day
//   D. Day of week filter
//   E. Re-entry gap (wait N candles after exit)
//   F. Entry body% filter (quality of entry candle)
//   G. Context-specific SL (per-context SL levels)

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

function findReEntryAfterGap(cs,from,side,gap){
  for(let i=from+1+gap;i<cs.length-2;i++){const b=bp(cs[i]);if(side==='CE'&&b>35)return i;if(side==='PE'&&b<-35)return i;}
  return -1;
}
function findReEntry(cs,from,side){return findReEntryAfterGap(cs,from,side,0);}

// Core exit: ACT(activate,gap) + HYB-10 SL
function exitACT(cs,ei,side,SL,ACTIVATE,GAP){
  const ep=cs[ei].close,sg=side==='CE'?1:-1;
  let trail=-SL,peak=0;
  for(let i=ei+1;i<cs.length;i++){
    const c=cs[i];
    const op=sg*(c.open-ep);
    if(trail>0&&op<trail) return{pl:op*PTS,i,t:'TG'};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,i,t:'SLG'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sg*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const np=Math.max(peak,fav),nt=np>=ACTIVATE?np-GAP:-SL;
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,i,t:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i,t:'TS'};
    if(trail<=0&&adv<=-SL&&cls<=-SL+10) return{pl:cls*PTS,i,t:'SL'};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,t:'EOD'};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}
function getDOW(d){const dt=new Date(d);return dt.getDay();} // 0=Sun,1=Mon,...,5=Fri

function run(opts={}){
  const {
    SL=200, ACTIVATE=20, GAP=10,
    maxIdx=99,           // max entry candle index
    maxTrades=5,         // max trades per day (initial+re)
    dowFilter=null,      // null=all, array of allowed days [1,2,3,4,5]
    reGap=0,             // candles to wait before re-entry
    minEntryBP=0,        // min |body%| of entry candle
    ctxSL=null,          // {ABOVE_PDH:X, BELOW_PDL:Y, INSIDE:Z} per-context SL
  } = opts;

  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,slHits=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    if(dowFilter && !dowFilter.includes(getDOW(date))) continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    if(entry.idx>maxIdx) continue;
    if(Math.abs(bp(cs[entry.idx]))<minEntryBP) continue;
    const slForCtx = ctxSL ? (ctxSL[entry.ctx]||SL) : SL;

    const r1=exitACT(cs,entry.idx,entry.side,slForCtx,ACTIVATE,GAP);
    tr++;if(r1.pl>0)wins++;
    if(r1.t==='SL'||r1.t==='SLG')slHits++;

    let rpl=0,cei=r1.i,ct=r1.t,cp=r1.pl,cs2=entry.side,tCount=1;
    if(r1.pl>0&&r1.t!=='EOD'&&tCount<maxTrades){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.i+1+reGap;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntryAfterGap(cs,r1.i,entry.side,reGap);
      if(ri>0&&(sf<0||ri<sf)){tCount++;const rr=exitACT(cs,ri,rev,slForCtx,ACTIVATE,GAP);rpl+=rr.pl;cei=rr.i;ct=rr.t;cp=rr.pl;cs2=rev;}
    }
    for(let i=0;i<3;i++){
      if(ct!=='EOD'&&cp>0&&tCount<maxTrades){
        const ri=findReEntryAfterGap(cs,cei,cs2,reGap);
        if(ri>0){tCount++;const rr=exitACT(cs,ri,cs2,slForCtx,ACTIVATE,GAP);rpl+=rr.pl;cei=rr.i;ct=rr.t;cp=rr.pl;}
        else break;
      } else break;
    }
    const day=r1.pl+rpl;pl+=day;eq+=day;
    if(eq>pk)pk=eq;const d2=pk-eq;if(d2>dd)dd=d2;
    const y=date.slice(0,4);yr[y]=(yr[y]||0)+day;
  }
  const allPos=Object.values(yr).every(v=>v>=0);
  return{pl,tr,wr:(wins/tr*100).toFixed(1),slHits,dd,allPos,yr};
}

function printRow(label,r,base=null){
  const ap=r.allPos?'✓':' ';
  const diff=base?(r.pl-base.pl>=0?'+':'')+`₹${(r.pl-base.pl).toLocaleString('en-IN')}`:'';
  console.log(`  ${label.padEnd(28)} ₹${r.pl.toLocaleString('en-IN').padStart(14)}  WR:${r.wr}%  DD:₹${r.dd.toLocaleString('en-IN').padStart(10)}  SL:${r.slHits}  ${ap}  ${diff}`);
}

const BASE = run(); // ACT20-G10, all defaults
console.log('\n  BASE (ACT20-G10, ALL defaults): ₹'+BASE.pl.toLocaleString('en-IN')+'  WR:'+BASE.wr+'%  DD:₹'+BASE.dd.toLocaleString('en-IN')+'  AllPos:'+BASE.allPos);
console.log('  '+'-'.repeat(95));

// ═══════════════════════════════════════════════════════
// A. ACTIVATION × GAP fine sweep
// ═══════════════════════════════════════════════════════
console.log('\n  A. ACTIVATION × GAP FINE SWEEP');
console.log('  '+'-'.repeat(95));
console.log('  ACT\\GAP    5       7       10      12      15      20');
console.log('  '+'-'.repeat(95));
const ACTS=[15,20,25,30,40,50];
const GAPS=[5,7,10,12,15,20];
let bestA={pl:-Infinity},bestALabel='';
for(const act of ACTS){
  let row=`  Act=${String(act).padEnd(4)}  `;
  for(const g of GAPS){
    if(g>=act){row+='  --      ';continue;}
    const r=run({ACTIVATE:act,GAP:g});
    const ap=r.allPos?'✓':' ';
    const s=`₹${(r.pl/100000).toFixed(2)}L${ap}`;
    row+=s.padEnd(9)+' ';
    if(r.pl>bestA.pl){bestA=r;bestALabel=`Act=${act} Gap=${g}`;}
  }
  console.log(row);
}
console.log(`  → Best: ${bestALabel}  ₹${bestA.pl.toLocaleString('en-IN')}  WR:${bestA.wr}%  DD:₹${bestA.dd.toLocaleString('en-IN')}  AllPos:${bestA.allPos?'YES':'NO'}`);

// ═══════════════════════════════════════════════════════
// B. ENTRY TIME FILTER (max candle index)
// ═══════════════════════════════════════════════════════
console.log('\n\n  B. ENTRY TIME FILTER (max candle idx from open)');
console.log('  Candle 0=9:15, 1=9:30, 5=10:15, 10=11:45, 15=12:45, 20=14:15');
console.log('  '+'-'.repeat(95));
const MAX_IDXS=[0,1,2,3,5,7,10,15,20,99];
let bestB={pl:-Infinity},bestBLabel='';
for(const mx of MAX_IDXS){
  const label=mx===99?'Any time  ':`By candle ${String(mx).padStart(2)}`;
  const r=run({maxIdx:mx});
  printRow(label,r,BASE);
  if(r.pl>bestB.pl){bestB=r;bestBLabel=label.trim();}
}
console.log(`  → Best: ${bestBLabel}  ₹${bestB.pl.toLocaleString('en-IN')}`);

// ═══════════════════════════════════════════════════════
// C. MAX TRADES PER DAY
// ═══════════════════════════════════════════════════════
console.log('\n\n  C. MAX TRADES PER DAY');
console.log('  '+'-'.repeat(95));
let bestC={pl:-Infinity},bestCLabel='';
for(const mt of [1,2,3,4,5,10]){
  const label=`MaxTrades=${mt}`;
  const r=run({maxTrades:mt});
  printRow(label,r,BASE);
  if(r.pl>bestC.pl){bestC=r;bestCLabel=label;}
}
console.log(`  → Best: ${bestCLabel}  ₹${bestC.pl.toLocaleString('en-IN')}`);

// ═══════════════════════════════════════════════════════
// D. DAY OF WEEK FILTER
// ═══════════════════════════════════════════════════════
console.log('\n\n  D. DAY OF WEEK FILTER  (1=Mon 2=Tue 3=Wed 4=Thu 5=Fri)');
console.log('  '+'-'.repeat(95));
const DOW_FILTERS=[
  {label:'All days',          f:null},
  {label:'No Monday',         f:[2,3,4,5]},
  {label:'No Friday',         f:[1,2,3,4]},
  {label:'No Mon+Fri',        f:[2,3,4]},
  {label:'Only Tue-Thu',      f:[2,3,4]},
  {label:'Mon+Fri only',      f:[1,5]},
  {label:'Mon only',          f:[1]},
  {label:'Fri only',          f:[5]},
  {label:'Wed only',          f:[3]},
];
let bestD={pl:-Infinity},bestDLabel='';
for(const d of DOW_FILTERS){
  const r=run({dowFilter:d.f});
  printRow(d.label,r,BASE);
  if(r.pl>bestD.pl){bestD=r;bestDLabel=d.label;}
}
console.log(`  → Best: ${bestDLabel}  ₹${bestD.pl.toLocaleString('en-IN')}`);

// ═══════════════════════════════════════════════════════
// E. RE-ENTRY GAP (wait N candles after exit before re-entry)
// ═══════════════════════════════════════════════════════
console.log('\n\n  E. RE-ENTRY CANDLE GAP (wait N candles after exit)');
console.log('  '+'-'.repeat(95));
let bestE={pl:-Infinity},bestELabel='';
for(const rg of [0,1,2,3,5]){
  const label=`ReGap=${rg} candles`;
  const r=run({reGap:rg});
  printRow(label,r,BASE);
  if(r.pl>bestE.pl){bestE=r;bestELabel=label;}
}
console.log(`  → Best: ${bestELabel}  ₹${bestE.pl.toLocaleString('en-IN')}`);

// ═══════════════════════════════════════════════════════
// F. ENTRY CANDLE BODY% FILTER
// ═══════════════════════════════════════════════════════
console.log('\n\n  F. ENTRY CANDLE BODY% FILTER (min |body%| of entry candle)');
console.log('  '+'-'.repeat(95));
let bestF={pl:-Infinity},bestFLabel='';
for(const mbp of [0,10,20,30,40,50,60,70]){
  const label=`MinBodyPct=${mbp}%`;
  const r=run({minEntryBP:mbp});
  printRow(label,r,BASE);
  if(r.pl>bestF.pl){bestF=r;bestFLabel=label;}
}
console.log(`  → Best: ${bestFLabel}  ₹${bestF.pl.toLocaleString('en-IN')}`);

// ═══════════════════════════════════════════════════════
// G. PER-CONTEXT SL (different SL per context)
// ═══════════════════════════════════════════════════════
console.log('\n\n  G. PER-CONTEXT SL (custom SL per market context)');
console.log('  '+'-'.repeat(95));
const CTX_SL_COMBOS=[
  {label:'All 200 (base)',        c:{ABOVE_PDH:200,BELOW_PDL:200,INSIDE:200}},
  {label:'PDH=150 PDL=150 IN=250',c:{ABOVE_PDH:150,BELOW_PDL:150,INSIDE:250}},
  {label:'PDH=200 PDL=150 IN=200',c:{ABOVE_PDH:200,BELOW_PDL:150,INSIDE:200}},
  {label:'PDH=150 PDL=200 IN=200',c:{ABOVE_PDH:150,BELOW_PDL:200,INSIDE:200}},
  {label:'PDH=250 PDL=150 IN=200',c:{ABOVE_PDH:250,BELOW_PDL:150,INSIDE:200}},
  {label:'PDH=100 PDL=100 IN=250',c:{ABOVE_PDH:100,BELOW_PDL:100,INSIDE:250}},
  {label:'PDH=200 PDL=200 IN=250',c:{ABOVE_PDH:200,BELOW_PDL:200,INSIDE:250}},
  {label:'PDH=150 PDL=150 IN=200',c:{ABOVE_PDH:150,BELOW_PDL:150,INSIDE:200}},
];
let bestG={pl:-Infinity},bestGLabel='';
for(const combo of CTX_SL_COMBOS){
  const r=run({ctxSL:combo.c});
  printRow(combo.label,r,BASE);
  if(r.pl>bestG.pl){bestG=r;bestGLabel=combo.label;}
}
console.log(`  → Best: ${bestGLabel}  ₹${bestG.pl.toLocaleString('en-IN')}`);

// ═══════════════════════════════════════════════════════
// FINAL SUMMARY
// ═══════════════════════════════════════════════════════
console.log('\n\n  ══ FINAL SUMMARY: Best per dimension vs BASE ══');
console.log('  '+('═'.repeat(95)));
console.log(`  BASE (ACT20-G10 defaults)     : ₹${BASE.pl.toLocaleString('en-IN').padStart(14)}  WR:${BASE.wr}%  DD:₹${BASE.dd.toLocaleString('en-IN')}`);
const dims=[
  {name:'A. Activation×Gap',  r:bestA, label:bestALabel},
  {name:'B. Entry time',       r:bestB, label:bestBLabel},
  {name:'C. Max trades',       r:bestC, label:bestCLabel},
  {name:'D. Day of week',      r:bestD, label:bestDLabel},
  {name:'E. Re-entry gap',     r:bestE, label:bestELabel},
  {name:'F. Body% filter',     r:bestF, label:bestFLabel},
  {name:'G. Per-ctx SL',       r:bestG, label:bestGLabel},
];
for(const d of dims){
  const diff=d.r.pl-BASE.pl;
  const sign=diff>=0?'+':'-';
  const ap=d.r.allPos?'✓':' ';
  console.log(`  ${d.name.padEnd(22)} ${d.label.padEnd(28)} ₹${d.r.pl.toLocaleString('en-IN').padStart(14)}  ${sign}₹${Math.abs(diff).toLocaleString('en-IN')}  ${ap}`);
}

// Check if combining best from each dimension helps
console.log('\n\n  ══ COMBINED BEST: Apply best setting from each dimension ══');
const bestActOpts = bestALabel.match(/Act=(\d+) Gap=(\d+)/);
const combinedOpts = {
  ACTIVATE: bestActOpts?parseInt(bestActOpts[1]):20,
  GAP:      bestActOpts?parseInt(bestActOpts[2]):10,
  maxIdx:   99,   // time filter not applied if it reduces P&L
  maxTrades:5,
  dowFilter:null,
  reGap:0,
  minEntryBP:0,
};
const combined=run(combinedOpts);
console.log(`  Combined params: Act=${combinedOpts.ACTIVATE} Gap=${combinedOpts.GAP}`);
console.log(`  P&L: ₹${combined.pl.toLocaleString('en-IN')}  WR:${combined.wr}%  MaxDD:₹${combined.dd.toLocaleString('en-IN')}  AllPos:${combined.allPos?'YES ✓':'NO'}`);
console.log('  Yearly:');
for(const [y,p] of Object.entries(combined.yr).sort())
  console.log(`    ${y}: ₹${p.toLocaleString('en-IN').padStart(14)}  ${p>=0?'+':'-'}`);

// backtest_bhav_exit_combo.js
// Fix: Entry=ALL, SL_type=HYB-10, SL=200, RE=YES (our winner params)
// Sweep ALL exit variations:
//   1. Trail GAP fine sweep (5..200)
//   2. Fixed target fine sweep (50..600)
//   3. Trail + Fixed cap (trail but exit at max target too)
//   4. Trail with separate activation threshold (activate trail only after X pts)

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

// SL=HYB-10
function slCheck(adv,cls,SL){
  return adv<=-SL && cls<=-SL+10;
}

// EXIT TYPE 1: Pure Trail (Fix3)
function exitTrail(cs,ei,side,SL,GAP){
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
    const np=Math.max(peak,fav),nt=np>=GAP?np-GAP:-SL;
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,i,t:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i,t:'TS'};
    if(trail<=0&&slCheck(adv,cls,SL)) return{pl:cls*PTS,i,t:'SL'};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,t:'EOD'};
}

// EXIT TYPE 2: Fixed target
function exitFixed(cs,ei,side,SL,TARGET){
  const ep=cs[ei].close,sg=side==='CE'?1:-1;
  for(let i=ei+1;i<cs.length;i++){
    const c=cs[i];
    const op=sg*(c.open-ep);
    if(op>=TARGET) return{pl:TARGET*PTS,i,t:'TG'};
    if(op<-SL)     return{pl:-SL*PTS,i,t:'SLG'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const cls=sg*(c.close-ep);
    if(fav>=TARGET) return{pl:TARGET*PTS,i,t:'T'};
    if(slCheck(adv,cls,SL)) return{pl:cls*PTS,i,t:'SL'};
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,t:'EOD'};
}

// EXIT TYPE 3: Trail + Fixed cap (trail but cap at MAX_TARGET)
function exitTrailCap(cs,ei,side,SL,GAP,MAX){
  const ep=cs[ei].close,sg=side==='CE'?1:-1;
  let trail=-SL,peak=0;
  for(let i=ei+1;i<cs.length;i++){
    const c=cs[i];
    const op=sg*(c.open-ep);
    if(op>=MAX)   return{pl:MAX*PTS,i,t:'CAP'};
    if(trail>0&&op<trail) return{pl:op*PTS,i,t:'TG'};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,i,t:'SLG'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sg*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    if(fav>=MAX) return{pl:MAX*PTS,i,t:'CAP'};
    const np=Math.max(peak,fav),nt=np>=GAP?np-GAP:-SL;
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,i,t:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i,t:'TS'};
    if(trail<=0&&slCheck(adv,cls,SL)) return{pl:cls*PTS,i,t:'SL'};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,t:'EOD'};
}

// EXIT TYPE 4: Trail with separate activation threshold
// Trail only activates once peak >= ACTIVATE, then trails by GAP
function exitTrailActivate(cs,ei,side,SL,GAP,ACTIVATE){
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
    const np=Math.max(peak,fav);
    // Trail only activates after ACTIVATE pts reached
    const nt=np>=ACTIVATE?np-GAP:-SL;
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,i,t:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i,t:'TS'};
    if(trail<=0&&slCheck(adv,cls,SL)) return{pl:cls*PTS,i,t:'SL'};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,t:'EOD'};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

function runWith(exitFn){
  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,slHits=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    const r1=exitFn(cs,entry.idx,entry.side);
    tr++;if(r1.pl>0)wins++;
    if(r1.t==='SL'||r1.t==='SLG')slHits++;
    let rpl=0,cei=r1.i,ct=r1.t,cp=r1.pl,cs2=entry.side;
    if(r1.pl>0&&r1.t!=='EOD'){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.i+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,r1.i,entry.side);
      if(ri>0&&(sf<0||ri<sf)){const rr=exitFn(cs,ri,rev);rpl+=rr.pl;cei=rr.i;ct=rr.t;cp=rr.pl;cs2=rev;}
    }
    for(let i=0;i<3;i++){
      if(ct!=='EOD'&&cp>0){const ri=findReEntry(cs,cei,cs2);if(ri>0){const rr=exitFn(cs,ri,cs2);rpl+=rr.pl;cei=rr.i;ct=rr.t;cp=rr.pl;}else break;}else break;
    }
    const day=r1.pl+rpl;pl+=day;eq+=day;
    if(eq>pk)pk=eq;const d2=pk-eq;if(d2>dd)dd=d2;
    const y=date.slice(0,4);yr[y]=(yr[y]||0)+day;
  }
  return{pl,wr:(wins/tr*100).toFixed(1),slHits,dd,allPos:Object.values(yr).every(v=>v>=0),yr};
}

const SL=200;

// ── 1. Trail GAP sweep ────────────────────────────────────────────────────────
const GAPS=[5,10,15,20,25,30,40,50,75,100,150,200];
console.log('\n  1. TRAIL GAP SWEEP  (Entry=ALL, HYB-10, SL=200, RE=yes)');
console.log('  ' + '─'.repeat(70));
console.log('  GAP   P&L             WR%    SL_hits  MaxDD          AllPos');
console.log('  ' + '─'.repeat(70));
let bestTrail={pl:-Infinity},bestGap=0;
for(const g of GAPS){
  const r=runWith((cs,ei,side)=>exitTrail(cs,ei,side,SL,g));
  const ap=r.allPos?'✓':' ';
  console.log(`  ${String(g).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%  ${String(r.slHits).padStart(5)}    ₹${r.dd.toLocaleString('en-IN').padStart(12)}  ${ap}`);
  if(r.pl>bestTrail.pl){bestTrail=r;bestGap=g;}
}
console.log(`  → Best GAP: ${bestGap}  P&L: ₹${bestTrail.pl.toLocaleString('en-IN')}  AllPos:${bestTrail.allPos?'YES':'NO'}`);

// ── 2. Fixed Target sweep ─────────────────────────────────────────────────────
const TARGETS=[30,50,75,100,125,150,175,200,250,300,400,500,600];
console.log('\n\n  2. FIXED TARGET SWEEP  (Entry=ALL, HYB-10, SL=200, RE=yes)');
console.log('  ' + '─'.repeat(70));
console.log('  T     P&L             WR%    SL_hits  MaxDD          AllPos');
console.log('  ' + '─'.repeat(70));
let bestFixed={pl:-Infinity},bestT=0;
for(const t of TARGETS){
  const r=runWith((cs,ei,side)=>exitFixed(cs,ei,side,SL,t));
  const ap=r.allPos?'✓':' ';
  console.log(`  ${String(t).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%  ${String(r.slHits).padStart(5)}    ₹${r.dd.toLocaleString('en-IN').padStart(12)}  ${ap}`);
  if(r.pl>bestFixed.pl){bestFixed=r;bestT=t;}
}
console.log(`  → Best T: ${bestT}  P&L: ₹${bestFixed.pl.toLocaleString('en-IN')}  AllPos:${bestFixed.allPos?'YES':'NO'}`);

// ── 3. Trail + Fixed Cap ──────────────────────────────────────────────────────
const CAPS=[100,150,200,250,300,400,500,600,800,1000];
console.log('\n\n  3. TRAIL-20 + FIXED CAP  (Entry=ALL, HYB-10, SL=200, RE=yes)');
console.log('  ' + '─'.repeat(70));
console.log('  Cap   P&L             WR%    SL_hits  MaxDD          AllPos');
console.log('  ' + '─'.repeat(70));
let bestCap={pl:-Infinity},bestCapV=0;
for(const cap of CAPS){
  const r=runWith((cs,ei,side)=>exitTrailCap(cs,ei,side,SL,20,cap));
  const ap=r.allPos?'✓':' ';
  console.log(`  ${String(cap).padStart(4)}  ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%  ${String(r.slHits).padStart(5)}    ₹${r.dd.toLocaleString('en-IN').padStart(12)}  ${ap}`);
  if(r.pl>bestCap.pl){bestCap=r;bestCapV=cap;}
}
console.log(`  → Best Cap: ${bestCapV}  P&L: ₹${bestCap.pl.toLocaleString('en-IN')}  AllPos:${bestCap.allPos?'YES':'NO'}`);

// ── 4. Trail with Activation Threshold (ACTIVATE, GAP both vary) ──────────────
const ACTIVATES=[20,30,40,50,75,100,150,200];
const GAP_FOR_ACT=[10,20,30];
console.log('\n\n  4. TRAIL ACTIVATION THRESHOLD  (Trail starts only after ACTIVATE pts)');
console.log('  (Entry=ALL, HYB-10, SL=200, RE=yes)');
console.log('  ' + '─'.repeat(78));
console.log('  Activate  Gap   P&L             WR%    SL_hits  MaxDD          AllPos');
console.log('  ' + '─'.repeat(78));
let bestAct={pl:-Infinity},bestActV=0,bestActGap=0;
for(const act of ACTIVATES){
  for(const g of GAP_FOR_ACT){
    if(g>act) continue; // gap can't be larger than activation
    const r=runWith((cs,ei,side)=>exitTrailActivate(cs,ei,side,SL,g,act));
    const ap=r.allPos?'✓':' ';
    console.log(`  ${String(act).padStart(8)}  ${String(g).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%  ${String(r.slHits).padStart(5)}    ₹${r.dd.toLocaleString('en-IN').padStart(12)}  ${ap}`);
    if(r.pl>bestAct.pl){bestAct=r;bestActV=act;bestActGap=g;}
  }
}
console.log(`  → Best: Activate=${bestActV} Gap=${bestActGap}  P&L: ₹${bestAct.pl.toLocaleString('en-IN')}  AllPos:${bestAct.allPos?'YES':'NO'}`);

// ── FINAL SUMMARY ─────────────────────────────────────────────────────────────
console.log('\n\n  ══ EXIT CONDITIONS SUMMARY ══');
console.log('  ' + '═'.repeat(60));
const candidates=[
  {name:`Trail-${bestGap}`,        r:bestTrail},
  {name:`Fixed-${bestT}`,          r:bestFixed},
  {name:`TrailCap-${bestCapV}`,    r:bestCap},
  {name:`Activate${bestActV}-G${bestActGap}`, r:bestAct},
];
candidates.sort((a,b)=>b.r.pl-a.r.pl);
for(const c of candidates){
  const ap=c.r.allPos?'✓':' ';
  console.log(`  ${c.name.padEnd(20)}: ₹${c.r.pl.toLocaleString('en-IN').padStart(14)}  WR:${c.r.wr}%  MaxDD:₹${c.r.dd.toLocaleString('en-IN')}  ${ap}`);
}
const winner=candidates[0];
console.log(`\n  WINNER: ${winner.name}  →  ₹${winner.r.pl.toLocaleString('en-IN')}  AllPos:${winner.r.allPos?'YES ✓':'NO'}`);
console.log('  Yearly:');
for(const [y,p] of Object.entries(winner.r.yr).sort())
  console.log(`    ${y}: ₹${p.toLocaleString('en-IN').padStart(14)}  ${p>=0?'+':'-'}`);

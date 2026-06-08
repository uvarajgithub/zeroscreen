// backtest_bhav_combo.js
// FULL COMBINATORIAL GRID: Entry × SL × Exit
// Tests every combination and ranks by P&L
// 
// DIMENSIONS:
//   Entry  : ALL / ABOVE_PDH / BELOW_PDL / INSIDE  (4 options)
//   SL     : 50 / 75 / 100 / 150 / 200 / 250       (6 options)
//   Exit   : Trail GAP 20/50/100 + Fixed T 125/175/250/500 + EOD  (8 options)
//   RE     : with / without re-entries               (2 options)
//
// Total combinations: 4 × 6 × 8 × 2 = 384

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);
const PTS = 15;

// ─── helpers ─────────────────────────────────────────────────────────────────
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const firstBull   = (cs,f,t=30)=>{for(let i=f;i<cs.length;i++)if(bp(cs[i])>t)return i;return -1;};
const firstBear   = (cs,f,t=30)=>{for(let i=f;i<cs.length;i++)if(bp(cs[i])<-t)return i;return -1;};
const firstStrong = (cs,f,t=55)=>{for(let i=f;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null;};

function findEntry(cs, prev) {
  if(!cs||cs.length<2||!prev||prev.length===0) return null;
  const PH=pdh(prev),PL_=pdl(prev),PC=pdc(prev);
  const C0=cs[0],gap=C0.open-PC;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL_;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=cs[1]?bp(cs[1]):0;
  const bps4=cs.slice(0,Math.min(4,cs.length)).map(bp);
  let w=0;
  for(let i=1;i<bps4.length;i++) if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65) w++;
  if(w>=2) return null;
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000) return{idx:0,side:'CE',ctx};
    if(C0bp>85)    return{idx:0,side:'CE',ctx};
    if(C0bp<-20)   return{idx:0,side:'PE',ctx};
    const b=firstBear(cs,1,35);if(b>0&&b<=7)return{idx:b,side:'PE',ctx};
    const c=firstStrong(cs,2,55);if(c)return{idx:c.i,side:c.side,ctx};
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return{idx:0,side:'PE',ctx};
    if(C0bp<-65) return null;
    if(C0bp>65){const i=firstBear(cs,1,30);if(i>0)return{idx:i,side:'PE',ctx};}
    if(C0.high<PL_){
      if(C1bp>20) return{idx:1,side:'CE',ctx};
      if(C1bp<-20) return{idx:0,side:'PE',ctx};
      const s=firstStrong(cs,2,40);if(s&&s.i<=5)return{idx:s.i,side:s.side,ctx};
      return null;
    }
    if(C0bp>20){const i=firstBear(cs,1,30);if(i>0&&i<=6)return{idx:i,side:'PE',ctx};}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,cs.length-2);i++)if(bp(cs[i])<-45&&cs[i-1].close<PL_)return{idx:i,side:'PE',ctx};}
    return null;
  }
  if(C0.close<PL_) return{idx:0,side:'PE',ctx};
  if(C0.close>PH)  return{idx:0,side:'CE',ctx};
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

// ─── EXIT STRATEGIES ─────────────────────────────────────────────────────────
// Fix3 trail: same-candle allowed when close confirms
function exitTrail(cs, entryIdx, side, SL, TRAIL_GAP) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  let trail=-SL, peak=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const op=sign*(c.open-ep);
    if(trail>0&&op<trail)   return{pl:op*PTS,exitIdx:i,type:'TG'};
    if(trail<=0&&op<-SL)    return{pl:-SL*PTS,exitIdx:i,type:'SLG'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sign*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const np=Math.max(peak,fav), nt=np>=TRAIL_GAP?np-TRAIL_GAP:-SL;
    if(trail>0&&adv<=trail)          return{pl:trail*PTS,exitIdx:i,type:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt)       return{pl:nt*PTS,exitIdx:i,type:'TS'};
    if(trail<=0&&adv<=-SL)           return{pl:-SL*PTS,exitIdx:i,type:'SL'};
    peak=np; trail=nt;
  }
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

// Fixed target + SL
function exitFixed(cs, entryIdx, side, SL, T) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    if(sign===1){
      if(c.open>=ep+T) return{pl:T*PTS,exitIdx:i,type:'T'};
      if(c.open<=ep-SL) return{pl:-SL*PTS,exitIdx:i,type:'SL'};
      if(c.high>=ep+T) return{pl:T*PTS,exitIdx:i,type:'T'};
      if(c.low<=ep-SL) return{pl:-SL*PTS,exitIdx:i,type:'SL'};
    } else {
      if(c.open<=ep-T) return{pl:T*PTS,exitIdx:i,type:'T'};
      if(c.open>=ep+SL) return{pl:-SL*PTS,exitIdx:i,type:'SL'};
      if(c.low<=ep-T) return{pl:T*PTS,exitIdx:i,type:'T'};
      if(c.high>=ep+SL) return{pl:-SL*PTS,exitIdx:i,type:'SL'};
    }
  }
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

// EOD only
function exitEOD(cs, entryIdx, side) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

// ─── RUN ONE COMBINATION ──────────────────────────────────────────────────────
function run(entryCtx, SL, exitFn, withRE) {
  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,re=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev) continue;
    const entry=findEntry(cs,prev);
    if(!entry) continue;
    if(entryCtx!=='ALL'&&entry.ctx!==entryCtx) continue;
    const r1=exitFn(cs,entry.idx,entry.side);
    const {pl:p1,exitIdx:ei1,type:t1}=r1;
    tr++; if(p1>0)wins++;
    let rpl=0,cei=ei1,ct=t1,cp=p1,cs2=entry.side;
    if(withRE){
      if(r1.pl>0&&t1!=='EOD'&&r1.pl>0){
        const peak=exitFn===exitEOD?0:(r1.pl/(PTS*SL)*SL);// rough peak
        // reverse RE
        const rev=entry.side==='CE'?'PE':'CE';
        let ri=-1;
        for(let i=ei1+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
        const sf=findReEntry(cs,ei1,entry.side);
        if(ri>0&&(sf<0||ri<sf)){re++;const rr=exitFn(cs,ri,rev);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;cs2=rev;}
      }
      for(let i=0;i<3;i++){
        if(ct!=='EOD'&&cp>0){
          const ri=findReEntry(cs,cei,cs2);
          if(ri>0){re++;const rr=exitFn(cs,ri,cs2);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;}
          else break;
        } else break;
      }
    }
    const day=p1+rpl; pl+=day; eq+=day;
    if(eq>pk)pk=eq; const d2=pk-eq; if(d2>dd)dd=d2;
    const y=date.slice(0,4); yr[y]=(yr[y]||0)+day;
  }
  const allPos=Object.values(yr).every(v=>v>=0);
  return{pl,tr,wr:(wins/tr*100).toFixed(1),dd,re,allPos,yr};
}

// ─── DEFINE ALL COMBOS ────────────────────────────────────────────────────────
const ENTRIES = ['ALL','ABOVE_PDH','BELOW_PDL','INSIDE'];
const SLS     = [50, 75, 100, 150, 200, 250];
const EXITS   = [
  {name:'Trail-20',  fn:(cs,i,s,sl)=>exitTrail(cs,i,s,sl,20)},
  {name:'Trail-50',  fn:(cs,i,s,sl)=>exitTrail(cs,i,s,sl,50)},
  {name:'Trail-100', fn:(cs,i,s,sl)=>exitTrail(cs,i,s,sl,100)},
  {name:'Fixed-125', fn:(cs,i,s,sl)=>exitFixed(cs,i,s,sl,125)},
  {name:'Fixed-175', fn:(cs,i,s,sl)=>exitFixed(cs,i,s,sl,175)},
  {name:'Fixed-250', fn:(cs,i,s,sl)=>exitFixed(cs,i,s,sl,250)},
  {name:'Fixed-500', fn:(cs,i,s,sl)=>exitFixed(cs,i,s,sl,500)},
  {name:'EOD',       fn:(cs,i,s,sl)=>exitEOD(cs,i,s)},
];
const RE = [false, true];

console.log('\n  Running all combinations...\n');
const results=[];
for(const entry of ENTRIES)
for(const sl of SLS)
for(const ex of EXITS)
for(const re of RE){
  const r=run(entry,sl,(cs,i,s)=>ex.fn(cs,i,s,sl),re);
  results.push({entry,sl,exit:ex.name,re:re?'RE':'--',...r});
}

// Sort by P&L
results.sort((a,b)=>b.pl-a.pl);

console.log('  ALL COMBINATIONS — Top 30 by P&L');
console.log('  ════════════════════════════════════════════════════════════════════════════════');
console.log('  Rank  Entry       SL    Exit        RE    5yr P&L          WR%   Trades  MaxDD       AllPos');
console.log('  ────────────────────────────────────────────────────────────────────────────────');
for(let i=0;i<Math.min(30,results.length);i++){
  const r=results[i];
  const ap=r.allPos?'✓':' ';
  console.log(`  ${String(i+1).padStart(3)}   ${r.entry.padEnd(10)} ${String(r.sl).padStart(3)}   ${r.exit.padEnd(10)} ${r.re}  ₹${r.pl.toLocaleString('en-IN').padStart(16)}  ${r.wr.padStart(5)}%  ${String(r.tr).padStart(6)}  ₹${r.dd.toLocaleString('en-IN').padStart(10)}  ${ap}`);
}

// Best per entry context
console.log('\n\n  BEST PER ENTRY CONTEXT (highest P&L per context)');
console.log('  ══════════════════════════════════════════════════════════════════════');
for(const ctx of ENTRIES){
  const best=results.filter(r=>r.entry===ctx)[0];
  console.log(`  ${ctx.padEnd(12)} → SL=${best.sl}  Exit=${best.exit}  RE=${best.re}  ₹${best.pl.toLocaleString('en-IN')}  WR=${best.wr}%  AllPos=${best.allPos?'✓':'✗'}`);
}

// Best all-years-positive
const bestAP=results.find(r=>r.allPos);
if(bestAP){
  console.log('\n  BEST ALL-YEARS-POSITIVE COMBO:');
  console.log(`  Entry=${bestAP.entry}  SL=${bestAP.sl}  Exit=${bestAP.exit}  RE=${bestAP.re}`);
  console.log(`  5yr P&L: ₹${bestAP.pl.toLocaleString('en-IN')}  WR: ${bestAP.wr}%  MaxDD: ₹${bestAP.dd.toLocaleString('en-IN')}`);
  console.log('  Yearly:');
  for(const [y,p] of Object.entries(bestAP.yr).sort())
    console.log(`    ${y}: ₹${p.toLocaleString('en-IN').padStart(14)}  ${p>=0?'+':'-'}`);
}

// SL comparison at best exit (Trail-20, ALL, with RE)
console.log('\n  SL SENSITIVITY (Entry=ALL, Exit=Trail-20, RE=yes):');
console.log('  SL     5yr P&L          WR%    MaxDD         AllPos');
for(const sl of SLS){
  const r=results.find(x=>x.entry==='ALL'&&x.sl===sl&&x.exit==='Trail-20'&&x.re==='RE');
  if(r) console.log(`  ${String(sl).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}   ${r.wr}%   ₹${r.dd.toLocaleString('en-IN').padStart(10)}  ${r.allPos?'✓':' '}`);
}

console.log(`\n  Total combinations tested: ${results.length}`);

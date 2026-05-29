// backtest_bhav_sl_compare3.js
// Clean side-by-side: INTRABAR vs CLOSE vs HYBRID(thresh=10)
// across all SL values — Entry=ALL, Trail-20, with RE

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

function run(SL,slMode){
  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,slHits=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    const r1=exitTrail(cs,entry.idx,entry.side,SL,20,slMode);
    tr++;if(r1.pl>0)wins++;
    if(r1.type==='SL'||r1.type==='SLG')slHits++;
    let rpl=0,cei=r1.exitIdx,ct=r1.type,cp=r1.pl,cs2=entry.side;
    if(r1.pl>0&&r1.type!=='EOD'){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.exitIdx+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,r1.exitIdx,entry.side);
      if(ri>0&&(sf<0||ri<sf)){const rr=exitTrail(cs,ri,rev,SL,20,slMode);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;cs2=rev;}
    }
    for(let i=0;i<3;i++){
      if(ct!=='EOD'&&cp>0){const ri=findReEntry(cs,cei,cs2);if(ri>0){const rr=exitTrail(cs,ri,cs2,SL,20,slMode);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;}else break;}else break;
    }
    const day=r1.pl+rpl;pl+=day;eq+=day;
    if(eq>pk)pk=eq;const d2=pk-eq;if(d2>dd)dd=d2;
    const y=date.slice(0,4);yr[y]=(yr[y]||0)+day;
  }
  return{pl,wr:(wins/tr*100).toFixed(1),slHits,dd,allPos:Object.values(yr).every(v=>v>=0),yr};
}

const SLS=[50,75,100,125,150,175,200,225,250,300];
const MODES=[
  {name:'INTRABAR',  mode:'intrabar'},
  {name:'CLOSE',     mode:'close'},
  {name:'HYBRID-10', mode:10},
];

// ── Table 1: side-by-side per SL ──────────────────────────────────────────────
console.log('\n  PURE INTRABAR  vs  CLOSE  vs  HYBRID(thresh=10)');
console.log('  Entry=ALL | Trail-20 | with RE');
console.log('');
console.log('       │          INTRABAR            │           CLOSE             │        HYBRID (thresh=10)   │');
console.log('  SL   │  P&L          WR    SL_hits  │  P&L          WR    SL_hits │  P&L          WR    SL_hits │  Best');
console.log('  ─────┼─────────────────────────────┼─────────────────────────────┼─────────────────────────────┼────────');

for(const sl of SLS){
  const res=MODES.map(m=>run(sl,m.mode));
  const best=res.reduce((a,b)=>b.pl>a.pl?b:a);
  const bestIdx=res.indexOf(best);
  const row=res.map((r,i)=>{
    const ap=r.allPos?'✓':' ';
    const mark=i===bestIdx?'◄':'';
    return `  ₹${(r.pl/100000).toFixed(2)}L  ${r.wr}%  ${String(r.slHits).padStart(3)}${ap}${mark}`;
  });
  const bestName=['INB','CLO','HYB'][bestIdx];
  console.log(`  ${String(sl).padStart(3)}  │${row[0].padEnd(29)}│${row[1].padEnd(29)}│${row[2].padEnd(29)}│  ${bestName}`);
}

// ── Table 2: Year-by-year for the overall top pick per mode ──────────────────
console.log('\n\n  YEARLY BREAKDOWN — Best SL for each mode');
console.log('  ' + '═'.repeat(80));

let overallBest={pl:-Infinity};
for(const m of MODES){
  let best={pl:-Infinity},bestSL=0;
  for(const sl of SLS){const r=run(sl,m.mode);if(r.pl>best.pl){best=r;bestSL=sl;}}
  console.log(`\n  ${m.name.padEnd(12)} — Best SL=${bestSL}  P&L=₹${best.pl.toLocaleString('en-IN')}  WR=${best.wr}%  MaxDD=₹${best.dd.toLocaleString('en-IN')}  AllPos:${best.allPos?'YES✓':'NO'}`);
  for(const [y,p] of Object.entries(best.yr).sort())
    process.stdout.write(`    ${y}: ₹${(p/100000).toFixed(2)}L ${p>=0?'+':'-'}  `);
  console.log('');
  if(best.pl>overallBest.pl){overallBest={...best,mode:m.name,sl:bestSL};}
}

console.log('\n\n  ══ OVERALL WINNER ══');
console.log(`  Mode: ${overallBest.mode}  SL: ${overallBest.sl}  P&L: ₹${overallBest.pl.toLocaleString('en-IN')}`);
console.log(`  WR: ${overallBest.wr}%  MaxDD: ₹${overallBest.dd.toLocaleString('en-IN')}  AllPos: ${overallBest.allPos?'YES ✓':'NO'}`);

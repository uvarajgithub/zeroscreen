// backtest_bhav_sl_thresh.js
// SL modes:
//   intrabar  : fires when low <= entry - SL  (pure wick-based)
//   close     : fires when close <= entry - SL (pure close-based)
//   threshold : fires when low <= entry - SL  AND  close <= entry - SL + THRESH
//               → wick hit SL but close didn't recover by more than THRESH pts
//               THRESH=0  → same as close SL
//               THRESH=∞  → same as intrabar SL
//               THRESH=20 → "wick hit but close within 20 pts of SL"

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

// SL_MODE: 'intrabar' | 'close' | number (threshold pts above SL that close can be)
function exitTrail(cs, entryIdx, side, SL, TRAIL_GAP, slMode) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  let trail=-SL, peak=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const op=sign*(c.open-ep);
    if(trail>0&&op<trail) return{pl:op*PTS,exitIdx:i,type:'TG'};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,exitIdx:i,type:'SLG'};

    const adv = side==='CE'?(c.low-ep):(ep-c.high);
    const cls = sign*(c.close-ep);
    const fav = side==='CE'?(c.high-ep):(ep-c.low);
    const np  = Math.max(peak,fav);
    const nt  = np>=TRAIL_GAP?np-TRAIL_GAP:-SL;

    // Trail exits
    if(trail>0&&adv<=trail)         return{pl:trail*PTS,exitIdx:i,type:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt)      return{pl:nt*PTS,exitIdx:i,type:'TS'};

    // SL with mode
    if(trail<=0){
      const wickHit = adv<=-SL;
      if(slMode==='intrabar' && wickHit){
        return{pl:-SL*PTS,exitIdx:i,type:'SL'};
      } else if(slMode==='close' && cls<=-SL){
        return{pl:cls*PTS,exitIdx:i,type:'SL'};
      } else if(typeof slMode==='number'){
        // Threshold: wick hit SL AND close didn't recover more than THRESH pts above SL
        // i.e. close <= entry - SL + THRESH  →  cls <= -SL + THRESH
        if(wickHit && cls <= -SL + slMode){
          // Exit at close price (since we waited for close)
          return{pl:cls*PTS,exitIdx:i,type:'SL'};
        }
      }
    }
    peak=np; trail=nt;
  }
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

function run(SL, slMode, TRAIL_GAP=20, withRE=true){
  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,slHits=0,slPl=0,reCount=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;

    const r1=exitTrail(cs,entry.idx,entry.side,SL,TRAIL_GAP,slMode);
    tr++;if(r1.pl>0)wins++;
    if(r1.type==='SL'||r1.type==='SLG'){slHits++;slPl+=r1.pl;}

    let rpl=0,cei=r1.exitIdx,ct=r1.type,cp=r1.pl,cs2=entry.side;
    if(withRE){
      if(r1.pl>0&&r1.type!=='EOD'){
        const rev=entry.side==='CE'?'PE':'CE';
        let ri=-1;
        for(let i=r1.exitIdx+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
        const sf=findReEntry(cs,r1.exitIdx,entry.side);
        if(ri>0&&(sf<0||ri<sf)){reCount++;const rr=exitTrail(cs,ri,rev,SL,TRAIL_GAP,slMode);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;cs2=rev;}
      }
      for(let i=0;i<3;i++){
        if(ct!=='EOD'&&cp>0){
          const ri=findReEntry(cs,cei,cs2);
          if(ri>0){reCount++;const rr=exitTrail(cs,ri,cs2,SL,TRAIL_GAP,slMode);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;}
          else break;
        } else break;
      }
    }
    const day=r1.pl+rpl; pl+=day; eq+=day;
    if(eq>pk)pk=eq;const d2=pk-eq;if(d2>dd)dd=d2;
    const y=date.slice(0,4);yr[y]=(yr[y]||0)+day;
  }
  const allPos=Object.values(yr).every(v=>v>=0);
  return{pl,tr,wr:(wins/tr*100).toFixed(1),dd,slHits,slPl,reCount,allPos,yr};
}

// ─── Main comparison ──────────────────────────────────────────────────────────
const SLS       = [100, 150, 200, 250];
// Thresholds to test: 0=close, 10,20,30,50,75,100=intrabar
const THRESHOLDS= [
  {label:'close(0)',    mode:'close'},
  {label:'thresh=10',  mode:10},
  {label:'thresh=20',  mode:20},
  {label:'thresh=30',  mode:30},
  {label:'thresh=50',  mode:50},
  {label:'thresh=75',  mode:75},
  {label:'thresh=100', mode:100},
  {label:'intrabar',   mode:'intrabar'},
];

console.log('\n  SL MODE COMPARISON  (Entry=ALL, Trail-20, with RE)');
console.log('  SL_mode         SL    5yr P&L          WR%   SL_hits  SL_loss          MaxDD         AllPos');
console.log('  ' + '─'.repeat(96));

let best={pl:-Infinity},bestLabel='';
for(const sl of SLS){
  for(const th of THRESHOLDS){
    const r=run(sl,th.mode,20,true);
    const ap=r.allPos?'✓':' ';
    const line=`  ${th.label.padEnd(15)} ${String(sl).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%  ${String(r.slHits).padStart(5)}   ₹${r.slPl.toLocaleString('en-IN').padStart(14)}  ₹${r.dd.toLocaleString('en-IN').padStart(12)}  ${ap}`;
    console.log(line);
    if(r.pl>best.pl){best=r;bestLabel=`${th.label} | SL=${sl}`;}
  }
  console.log('  ·');
}

console.log('\n  ══ WINNER ══  ' + bestLabel);
console.log(`  5yr P&L : ₹${best.pl.toLocaleString('en-IN')}`);
console.log(`  WR      : ${best.wr}%   SL hits: ${best.slHits}   MaxDD: ₹${best.dd.toLocaleString('en-IN')}`);
console.log(`  AllPos  : ${best.allPos?'YES ✓':'NO'}`);
console.log('  Yearly:');
for(const [y,p] of Object.entries(best.yr).sort())
  console.log(`    ${y}: ₹${p.toLocaleString('en-IN').padStart(14)}  ${p>=0?'+':'-'}`);

// Quick sweep across ALL SL values for the best mode
console.log('\n  ── Best mode across all SL values ──────────────────────────────────────');
const bestMode=THRESHOLDS.find(t=>t.label===bestLabel.split(' |')[0]);
if(bestMode){
  const allSLs=[50,75,100,125,150,175,200,225,250,300];
  console.log(`  Mode: ${bestMode.label}`);
  for(const sl of allSLs){
    const r=run(sl,bestMode.mode,20,true);
    const ap=r.allPos?'✓':' ';
    console.log(`  SL=${String(sl).padStart(3)}: ₹${r.pl.toLocaleString('en-IN').padStart(14)}  WR:${r.wr}%  SL_hits:${String(r.slHits).padStart(4)}  MaxDD:₹${r.dd.toLocaleString('en-IN').padStart(10)}  ${ap}`);
  }
}

// backtest_bhav_walkforward.js
// Walk-forward test to check if Act=15 Gap=5 is curve-fitting or genuine
//
// Method:
//   For each test year (2023, 2024, 2025, 2026):
//     1. Find best Act+Gap on ALL years BEFORE test year (in-sample)
//     2. Apply those best params to test year ONLY (out-of-sample)
//     3. Compare: fixed base (Act=20 Gap=10) vs walk-forward best vs overfit (Act=15 Gap=5)
//
// If Act=15 Gap=5 keeps winning in-sample AND out-of-sample → genuinely better
// If best in-sample params vary year-to-year → curve-fitting

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

function exitACT(cs,ei,side,SL,ACT,GAP){
  const ep=cs[ei].close,sg=side==='CE'?1:-1;
  let trail=-SL,peak=0;
  for(let i=ei+1;i<cs.length;i++){
    const c=cs[i];
    const op=sg*(c.open-ep);
    if(trail>0&&op<trail) return{pl:op*PTS,i};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,i};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sg*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const np=Math.max(peak,fav),nt=np>=ACT?np-GAP:-SL;
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,i};
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i};
    if(trail<=0&&adv<=-SL&&cls<=-SL+10) return{pl:cls*PTS,i};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1};
}

function getPrev(d){const idx=ALL.indexOf(d);return idx>0?raw[ALL[idx-1]]:null;}

// Run on a subset of dates
function runDates(dates,ACT,GAP){
  let pl=0,tr=0,wins=0;
  const SL=200;
  for(const date of dates){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    const r1=exitACT(cs,entry.idx,entry.side,SL,ACT,GAP);
    tr++;if(r1.pl>0)wins++;
    let rpl=0,cei=r1.i,ct='',cp=r1.pl,cs2=entry.side;
    if(r1.pl>0&&r1.i<cs.length-1){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.i+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,r1.i,entry.side);
      if(ri>0&&(sf<0||ri<sf)){const rr=exitACT(cs,ri,rev,SL,ACT,GAP);rpl+=rr.pl;cei=rr.i;cp=rr.pl;cs2=rev;}
    }
    for(let i=0;i<3;i++){
      if(cp>0&&cei<cs.length-1){const ri=findReEntry(cs,cei,cs2);if(ri>0){const rr=exitACT(cs,ri,cs2,SL,ACT,GAP);rpl+=rr.pl;cei=rr.i;cp=rr.pl;}else break;}else break;
    }
    pl+=r1.pl+rpl;
  }
  return{pl,tr,wr:tr>0?(wins/tr*100).toFixed(1):0};
}

// Find best Act+Gap on given dates
function findBest(dates){
  const ACTS=[15,20,25,30];
  const GAPS=[5,7,10,15,20];
  let best={pl:-Infinity},bestLabel='';
  for(const act of ACTS)
    for(const g of GAPS){
      if(g>=act)continue;
      const r=runDates(dates,act,g);
      if(r.pl>best.pl){best=r;bestLabel=`Act=${act} Gap=${g}`;}
    }
  return{best,label:bestLabel};
}

const YEARS=['2021','2022','2023','2024','2025','2026'];
const datesByYear={};
for(const y of YEARS) datesByYear[y]=ALL.filter(d=>d.startsWith(y));

// ─── WALK-FORWARD TEST ────────────────────────────────────────────────────────
console.log('\n  WALK-FORWARD VALIDATION');
console.log('  Optimize on past years → test on next year (never seen)');
console.log('  '+('═'.repeat(100)));
console.log('  TestYear  InSample years   Best params found     OOS P&L      Base(A20G10) OOS  Overfit(A15G5) OOS');
console.log('  '+('-'.repeat(100)));

const BASE_ACT=20,BASE_GAP=10;
const OVER_ACT=15,OVER_GAP=5;
const wfResults=[];

for(let t=1;t<YEARS.length;t++){
  const testYear=YEARS[t];
  const trainYears=YEARS.slice(0,t);
  const trainDates=trainYears.flatMap(y=>datesByYear[y]);
  const testDates=datesByYear[testYear];
  if(testDates.length===0)continue;

  const {best,label}=findBest(trainDates);
  const oosWF  =runDates(testDates,parseInt(label.match(/Act=(\d+)/)[1]),parseInt(label.match(/Gap=(\d+)/)[1]));
  const oosBase=runDates(testDates,BASE_ACT,BASE_GAP);
  const oosOver=runDates(testDates,OVER_ACT,OVER_GAP);

  const wfWin = oosWF.pl>=oosBase.pl?'WF':'BASE';
  const overBetter = oosOver.pl>oosBase.pl?'OVER>BASE':'OVER<BASE';
  console.log(`  ${testYear}      ${trainYears.join('+')}   ${label.padEnd(18)}  ₹${oosWF.pl.toLocaleString('en-IN').padStart(12)}   ₹${oosBase.pl.toLocaleString('en-IN').padStart(12)}   ₹${oosOver.pl.toLocaleString('en-IN').padStart(12)}   ${overBetter}`);
  wfResults.push({testYear,label,oosWF,oosBase,oosOver});
}

// ─── CONSISTENCY CHECK ────────────────────────────────────────────────────────
console.log('\n\n  CONSISTENCY: Best params found per in-sample period');
console.log('  '+('-'.repeat(60)));
for(const r of wfResults)
  console.log(`  Train on years BEFORE ${r.testYear} → Best: ${r.label}`);

// ─── FULL-PERIOD YEARLY COMPARISON ───────────────────────────────────────────
console.log('\n\n  YEAR-BY-YEAR: Act15G5 vs Act20G10 vs Act20G5 (per year P&L)');
console.log('  '+('═'.repeat(80)));
console.log('  Year    Act15G5         Act20G10        Act20G5         Act15G10        Winner');
console.log('  '+('-'.repeat(80)));

const COMPARE=[
  {a:15,g:5,  label:'A15G5 '},
  {a:20,g:10, label:'A20G10'},
  {a:20,g:5,  label:'A20G5 '},
  {a:15,g:10, label:'A15G10'},
];
let totals=COMPARE.map(()=>0);
for(const y of YEARS){
  const dates=datesByYear[y];
  if(!dates||dates.length===0)continue;
  const res=COMPARE.map(c=>runDates(dates,c.a,c.g));
  totals=totals.map((t,i)=>t+res[i].pl);
  const bestPl=Math.max(...res.map(r=>r.pl));
  const bestIdx=res.findIndex(r=>r.pl===bestPl);
  const row=res.map(r=>`₹${r.pl.toLocaleString('en-IN').padStart(12)}`).join('  ');
  console.log(`  ${y}  ${row}  ${COMPARE[bestIdx].label}`);
}
console.log('  '+('-'.repeat(80)));
const totRow=totals.map(t=>`₹${t.toLocaleString('en-IN').padStart(12)}`).join('  ');
console.log(`  TOTAL ${totRow}`);

// ─── VERDICT ─────────────────────────────────────────────────────────────────
console.log('\n\n  ══ VERDICT ══');
const overBeatBase=wfResults.filter(r=>r.oosOver.pl>r.oosBase.pl).length;
const totalWF=wfResults.length;
console.log(`  Act15G5 beat Act20G10 out-of-sample in ${overBeatBase}/${totalWF} test years`);
if(overBeatBase>=Math.ceil(totalWF*0.7)){
  console.log('  → Act15G5 is CONSISTENTLY better OOS → NOT curve-fitting → USE IT');
} else if(overBeatBase>=Math.ceil(totalWF*0.5)){
  console.log('  → Act15G5 wins more often than not OOS → PROBABLY genuine, but use with caution');
} else {
  console.log('  → Act15G5 does NOT consistently beat base OOS → CURVE-FITTING → STICK TO Act20G10');
}

const wfWins=wfResults.filter(r=>r.oosWF.pl>=r.oosBase.pl).length;
console.log(`  Walk-forward optimized beat base in ${wfWins}/${totalWF} test years`);
const uniqueParams=[...new Set(wfResults.map(r=>r.label))];
console.log(`  In-sample best params: ${uniqueParams.join(', ')} (${uniqueParams.length===1?'STABLE — same params every time':'UNSTABLE — changes each period'})`);

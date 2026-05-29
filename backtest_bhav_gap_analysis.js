// backtest_bhav_gap_analysis.js
// Measures: when new-trail exit fires, how far is the close below the trail?
// This tells us how much Version A (exit at trail) overstates vs reality (exit at close)
// Also runs full A vs B comparison for all Gap values to find the honest sweet spot

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2]||'cache/banknifty_5yr.json','utf8'));
const ALL = Object.keys(raw).sort().filter(k=>raw[k]&&raw[k].length>0);
const PTS = 15;
const SL  = 200;
const ACT = 15;

const bp = c => c.high > c.low ? (c.close-c.open)/(c.high-c.low)*100 : 0;
const pdh = cs => Math.max(...cs.map(c=>c.high));
const pdl = cs => Math.min(...cs.map(c=>c.low));
const pdc = cs => cs[cs.length-1].close;
const firstBull=(cs,f,t=30)=>{for(let i=f;i<cs.length;i++)if(bp(cs[i])>t)return i;return -1;};
const firstBear=(cs,f,t=30)=>{for(let i=f;i<cs.length;i++)if(bp(cs[i])<-t)return i;return -1;};
const firstStrong=(cs,f,t=55)=>{for(let i=f;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null;};

function findEntry(cs,prev){
  if(!cs||cs.length<2||!prev||prev.length===0)return null;
  const PH=pdh(prev),PL_=pdl(prev),PC=pdc(prev);
  const C0=cs[0];
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL_;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0);
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
    const b=firstBear(cs,1,35);if(b>0&&b<=7)return{idx:b,side:'PE',ctx};
    const c=firstStrong(cs,2,55);if(c)return{idx:c.i,side:c.side,ctx};
    return null;
  }
  if(Math.abs(C0bp)>90)return{idx:0,side:C0bp>0?'CE':'PE',ctx};
  if(Math.abs(C0bp)<10&&cs[1]){const s=firstStrong(cs,1,65);if(s)return{idx:s.i,side:s.side,ctx};}
  const s=firstStrong(cs,1,55);if(s)return{idx:s.i,side:s.side,ctx};
  return null;
}

function findReEntry(cs,from,side){
  for(let i=from+1;i<cs.length-2;i++){
    const b=bp(cs[i]);
    if(side==='CE'&&b>35)return i;
    if(side==='PE'&&b<-35)return i;
  }
  return -1;
}

function getPrev(d){const idx=ALL.indexOf(d);return idx>0?raw[ALL[idx-1]]:null;}

// SECTION 1: Measure average overshoot for each GAP value
// Overshoot = trail_level - close_price when new-trail exit fires
// If using stop orders at trail level, overshoot = 0 (you exit at trail)
// If using candle-close monitoring, overshoot = real loss vs assumed exit
console.log('\n=== SECTION 1: Trail exit overshoot by GAP value ===');
console.log('(When new-trail fires: close is how far below trail level?)');
console.log('GAP  Fires   AvgShoot  MedShoot  P50   P75   P90   ₹/exit avg');
console.log('───  ──────  ────────  ────────  ────  ────  ────  ──────────');

for(const GAP of [5, 10, 15, 20, 25, 30]){
  const diffs = [];
  for(const date of ALL){
    const cs=raw[date];
    if(!cs||cs.length<2)continue;
    for(let ei=0;ei<cs.length-3;ei++){
      const ep=cs[ei].close,sg=1;
      let peak=0;
      for(let i=ei+1;i<cs.length;i++){
        const c=cs[i];
        const adv=c.low-ep;
        const cls=c.close-ep;
        const fav=c.high-ep;
        const np=Math.max(peak,fav),nt=np>=ACT?np-GAP:-SL;
        if(nt>0&&adv<=nt&&cls<=nt){
          diffs.push(nt-cls); // how far close is below trail
          break;
        }
        if(adv<=-SL&&cls<=-SL+10)break;
        peak=np;
      }
    }
  }
  if(!diffs.length){console.log('G='+GAP+' no data');continue;}
  diffs.sort((a,b)=>a-b);
  const avg=(diffs.reduce((a,b)=>a+b,0)/diffs.length);
  const med=diffs[Math.floor(diffs.length/2)];
  const p75=diffs[Math.floor(diffs.length*0.75)];
  const p90=diffs[Math.floor(diffs.length*0.90)];
  console.log(`G=${GAP}  ${String(diffs.length).padEnd(6)}  ${avg.toFixed(1).padEnd(8)}  ${med.toFixed(1).padEnd(8)}  ${med.toFixed(0).padEnd(4)}  ${p75.toFixed(0).padEnd(4)}  ${p90.toFixed(0).padEnd(4)}  ₹${(avg*PTS).toFixed(0)}`);
}

// SECTION 2: Full A vs B P&L for each GAP
// Version A = exit at trail level (stop-order model)
// Version B = exit at close (candle-close monitoring model)
console.log('\n=== SECTION 2: Stop-order model vs Candle-close model by GAP ===');
console.log('GAP  VersionA(stop-order)  VersionB(candle-close)  Diff       A-real%');
console.log('───  ──────────────────  ──────────────────────  ─────────  ──────');

function runGap(GAP, useCloseExit){
  let pl=0,tr=0,wins=0;
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    const exit1=doExit(cs,entry.idx,entry.side,GAP,useCloseExit);
    tr++;if(exit1.pl>0)wins++;
    let rpl=0,cei=exit1.i,cp=exit1.pl,cs2=entry.side;
    // re-entries on profit
    if(exit1.pl>0&&exit1.i<cs.length-1){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=exit1.i+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,exit1.i,entry.side);
      if(ri>0&&(sf<0||ri<sf)){
        const rr=doExit(cs,ri,rev,GAP,useCloseExit);
        rpl+=rr.pl;cei=rr.i;cp=rr.pl;cs2=rev;tr++;
      }
    }
    for(let i=0;i<3;i++){
      if(cp>0&&cei<cs.length-1){
        const ri=findReEntry(cs,cei,cs2);
        if(ri>0){const rr=doExit(cs,ri,cs2,GAP,useCloseExit);rpl+=rr.pl;cei=rr.i;cp=rr.pl;tr++;}
        else break;
      }else break;
    }
    pl+=exit1.pl+rpl;
  }
  return{pl,tr,wr:(wins/tr*100).toFixed(1)};
}

function doExit(cs,ei,side,GAP,useCloseExit){
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

    if(useCloseExit){
      // Candle-close model: both checks require close confirm, exit at CLOSE
      if(trail>0&&adv<=trail&&cls<=trail) return{pl:cls*PTS,i};
      if(nt>0&&adv<=nt&&cls<=nt)         return{pl:cls*PTS,i};
    } else {
      // Stop-order model: old trail fires on wick, new trail exits at trail level
      if(trail>0&&adv<=trail)    return{pl:trail*PTS,i};
      if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i};
    }
    if(trail<=0&&adv<=-SL&&cls<=-SL+10) return{pl:cls*PTS,i};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1};
}

const fmt = n => '₹'+(n/1e5).toFixed(2)+'L';

for(const GAP of [5, 10, 15, 20, 25, 30]){
  const A = runGap(GAP, false);  // stop-order
  const B = runGap(GAP, true);   // candle-close
  const diff = A.pl - B.pl;
  const pct = (B.pl/A.pl*100).toFixed(0);
  console.log(`G=${GAP}  ${fmt(A.pl).padEnd(18)}  ${fmt(B.pl).padEnd(22)}  ${fmt(diff).padEnd(9)}  B is ${pct}% of A`);
}

console.log('\n=== CONCLUSION ===');
console.log('If live execution uses STOP ORDERS  → Version A (stop-order model) is correct');
console.log('If live execution uses CANDLE-CLOSE → Version B (candle-close model) is honest');
console.log('Gap=5 with stop orders is risky: stop can be skipped by fast moves (gap-over)');
console.log('Gap=20 with candle-close is more practical and more honest');

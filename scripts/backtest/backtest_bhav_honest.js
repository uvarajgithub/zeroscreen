// backtest_bhav_honest.js
// Finds the REAL concern: are we overstating by exiting at TRAIL level vs CLOSE price?
//
// The issue: in exitACT(), trail exit uses return{pl:nt*PTS,i} = exits at trail level
// But if monitoring at candle-CLOSE only, you'd exit at CLOSE price (which is BELOW trail)
// This test measures how much that matters.
//
// Also tests: intrabar old-trail check — fires on low without close confirm.
// If candle-close only model, that's also wrong.
//
// VERSION A: current code (exits at trail level, old-trail fires on wick)
// VERSION B: candle-close honest (exits at close price, old-trail needs close confirm)
// VERSION C: stop-order model (exits at trail level, old-trail fires on wick = correct for stops)
//
// Also adds ₹200 per trade transaction cost to show realistic net P&L

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2]||'cache/banknifty_5yr.json','utf8'));
const ALL = Object.keys(raw).sort().filter(k=>raw[k]&&raw[k].length>0);
const PTS = 15;
const TX_COST = 200; // ₹200 per round-trip trade (brokerage + STT + fees)

// ACT=15 GAP=5 (winner params), SL=200, HYB-10
const ACT = 15, GAP = 5, SL = 200;

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
  // INSIDE
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

// VERSION A: original code (trail exits at trail level, old-trail fires on wick)
function exitA(cs,ei,side){
  const ep=cs[ei].close,sg=side==='CE'?1:-1;
  let trail=-SL,peak=0;
  for(let i=ei+1;i<cs.length;i++){
    const c=cs[i];
    const op=sg*(c.open-ep);
    if(trail>0&&op<trail) return{pl:op*PTS,i,how:'gap-open'};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,i,how:'gap-sl'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sg*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const np=Math.max(peak,fav),nt=np>=ACT?np-GAP:-SL;
    // OLD trail check: fires on intrabar low (no close confirm)
    if(trail>0&&adv<=trail)    return{pl:trail*PTS,i,how:'old-trail-intrabar'};
    // NEW trail check: uses close confirm but exits at trail level (not close price)
    if(nt>0&&adv<=nt&&cls<=nt) return{pl:nt*PTS,i,how:'new-trail-at-nt'};
    // HYB-10 SL: correct — exits at close price
    if(trail<=0&&adv<=-SL&&cls<=-SL+10) return{pl:cls*PTS,i,how:'hyb-sl'};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,how:'eod'};
}

// VERSION B: candle-close honest model
//   - old-trail fires only when close ALSO below trail (same as new-trail)
//   - new-trail exits at CLOSE price, not trail level
//   - this is the TRUE candle-close monitoring model
function exitB(cs,ei,side){
  const ep=cs[ei].close,sg=side==='CE'?1:-1;
  let trail=-SL,peak=0;
  for(let i=ei+1;i<cs.length;i++){
    const c=cs[i];
    const op=sg*(c.open-ep);
    if(trail>0&&op<trail) return{pl:op*PTS,i,how:'gap-open'};
    if(trail<=0&&op<-SL)  return{pl:-SL*PTS,i,how:'gap-sl'};
    const adv=side==='CE'?(c.low-ep):(ep-c.high);
    const cls=sg*(c.close-ep);
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    const np=Math.max(peak,fav),nt=np>=ACT?np-GAP:-SL;
    // OLD trail: now requires close confirm (pure candle-close model)
    if(trail>0&&adv<=trail&&cls<=trail) return{pl:cls*PTS,i,how:'old-trail-close'};
    // NEW trail: requires close confirm, exits at CLOSE (not trail level)
    if(nt>0&&adv<=nt&&cls<=nt)         return{pl:cls*PTS,i,how:'new-trail-close'};
    // HYB-10 SL: same as before
    if(trail<=0&&adv<=-SL&&cls<=-SL+10) return{pl:cls*PTS,i,how:'hyb-sl'};
    peak=np;trail=nt;
  }
  return{pl:sg*(cs[cs.length-1].close-ep)*PTS,i:cs.length-1,how:'eod'};
}

// VERSION C: stop-order model
//   - old-trail fires on intrabar low → exit at trail (stop order, correct for stops)
//   - new-trail fires on intrabar low + close confirm → exit at trail level (stop already triggered)
//   This is what Version A does — but we separate it for clarity
// Version C = Version A (already coded above)

function getPrev(d){const idx=ALL.indexOf(d);return idx>0?raw[ALL[idx-1]]:null;}

function runVersion(exitFn){
  let pl=0,tr=0,wins=0;
  const howCounts={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    let dayTrades=0;
    const r1=exitFn(cs,entry.idx,entry.side);
    tr++;dayTrades++;
    if(r1.pl>0)wins++;
    howCounts[r1.how]=(howCounts[r1.how]||0)+1;
    let rpl=0,cei=r1.i,cp=r1.pl,cs2=entry.side;
    // Reverse re-entry on first SL
    if(r1.pl<=0&&r1.i<cs.length-1){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.i+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,r1.i,entry.side);
      if(ri>0&&(sf<0||ri<sf)){
        const rr=exitFn(cs,ri,rev);
        rpl+=rr.pl;cei=rr.i;cp=rr.pl;cs2=rev;dayTrades++;
        howCounts[rr.how]=(howCounts[rr.how]||0)+1;
      }
    }
    // Continuing re-entries on winners
    for(let i=0;i<3;i++){
      if(cp>0&&cei<cs.length-1){
        const ri=findReEntry(cs,cei,cs2);
        if(ri>0){
          const rr=exitFn(cs,ri,cs2);
          rpl+=rr.pl;cei=rr.i;cp=rr.pl;dayTrades++;
          howCounts[rr.how]=(howCounts[rr.how]||0)+1;
        }else break;
      }else break;
    }
    pl+=r1.pl+rpl;
  }
  return{pl,tr,wr:(wins/tr*100).toFixed(1),howCounts};
}

function fmt(n){return'₹'+(n/1e5).toFixed(2)+'L';}
function fmtRs(n){const sign=n>=0?'+':'-';return sign+'₹'+(Math.abs(n)).toLocaleString('en-IN');}

const resA = runVersion(exitA);  // Original (trail level exit)
const resB = runVersion(exitB);  // Honest (close price exit)

const tradeCount = resA.tr;
const txCostTotal = tradeCount * TX_COST;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║         HONEST BACKTEST — Exit Price Reality Check           ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('\nParams: Act=15 Gap=5, SL=200 HYB-10, RE=yes, 5.4yr BankNifty\n');

console.log('─────────────────────────────────────────────────────────────────');
console.log('VERSION A — Original (trail exit = trail level, old-trail on wick)');
console.log(`  P&L     : ${fmt(resA.pl)}  (₹${resA.pl.toLocaleString('en-IN')})`);
console.log(`  Trades  : ${resA.tr}   Win rate: ${resA.wr}%`);
console.log(`  Exit breakdown:`, resA.howCounts);

console.log('\nVERSION B — Candle-close honest (exit at CLOSE price, close confirm)');
console.log(`  P&L     : ${fmt(resB.pl)}  (₹${resB.pl.toLocaleString('en-IN')})`);
console.log(`  Trades  : ${resB.tr}   Win rate: ${resB.wr}%`);
console.log(`  Exit breakdown:`, resB.howCounts);

const diff = resA.pl - resB.pl;
console.log('\n─────────────────────────────────────────────────────────────────');
console.log(`OVERSTATEMENT from exit-at-trail vs exit-at-close: ${fmtRs(diff)}`);
if(diff>0) console.log(`  → Version A overstates by ₹${diff.toLocaleString('en-IN')} (${(diff/resA.pl*100).toFixed(1)}%)`);
else       console.log(`  → Version B is actually BETTER (no overstatement in A)`);

console.log('\n─────────────────────────────────────────────────────────────────');
console.log(`TRANSACTION COSTS (₹${TX_COST}/trade × ${tradeCount} trades):`);
console.log(`  Total cost  : ₹${txCostTotal.toLocaleString('en-IN')}`);
console.log(`  Version A net: ${fmt(resA.pl - txCostTotal)}`);
console.log(`  Version B net: ${fmt(resB.pl - txCostTotal)}`);

console.log('\n─────────────────────────────────────────────────────────────────');
console.log('YEAR-BY-YEAR COMPARISON (A vs B, after ₹200/trade cost)\n');

function runByYear(exitFn){
  const years={};
  for(const date of ALL){
    const yr=date.slice(0,4);
    const cs=raw[date],prev=getPrev(date);
    if(!prev)continue;
    const entry=findEntry(cs,prev);
    if(!entry)continue;
    if(!years[yr])years[yr]={pl:0,tr:0};
    const r1=exitFn(cs,entry.idx,entry.side);
    years[yr].tr++;years[yr].pl+=r1.pl;
    let rpl=0,cei=r1.i,cp=r1.pl,cs2=entry.side;
    if(r1.pl<=0&&r1.i<cs.length-1){
      const rev=entry.side==='CE'?'PE':'CE';
      let ri=-1;
      for(let i=r1.i+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
      const sf=findReEntry(cs,r1.i,entry.side);
      if(ri>0&&(sf<0||ri<sf)){const rr=exitFn(cs,ri,rev);rpl+=rr.pl;cei=rr.i;cp=rr.pl;cs2=rev;years[yr].tr++;}
    }
    for(let i=0;i<3;i++){
      if(cp>0&&cei<cs.length-1){const ri=findReEntry(cs,cei,cs2);if(ri>0){const rr=exitFn(cs,ri,cs2);rpl+=rr.pl;cei=rr.i;cp=rr.pl;years[yr].tr++;}else break;}else break;
    }
    years[yr].pl+=rpl;
  }
  return years;
}

const yA=runByYear(exitA),yB=runByYear(exitB);
const allYears=Object.keys(yA).sort();
console.log('Year  Version A (orig)   Version B (honest)  Diff       A-netCost  B-netCost');
console.log('────  ────────────────   ──────────────────  ─────────  ─────────  ─────────');
let totA=0,totB=0,totTr=0;
for(const yr of allYears){
  const a=yA[yr],b=yB[yr]||{pl:0,tr:0};
  const cost=a.tr*TX_COST;
  totA+=a.pl;totB+=b.pl;totTr+=a.tr;
  const tag=b.pl>0?'+':'-';
  console.log(`${yr}  ${fmt(a.pl).padEnd(16)} ${fmt(b.pl).padEnd(18)} ${fmtRs(a.pl-b.pl).padEnd(10)} ${fmt(a.pl-cost).padEnd(10)} ${fmt(b.pl-cost)}`);
}
const totCost=totTr*TX_COST;
console.log('────  ────────────────   ──────────────────  ─────────  ─────────  ─────────');
console.log(`TOT   ${fmt(totA).padEnd(16)} ${fmt(totB).padEnd(18)} ${fmtRs(totA-totB).padEnd(10)} ${fmt(totA-totCost).padEnd(10)} ${fmt(totB-totCost)}`);

console.log('\n─────────────────────────────────────────────────────────────────');
console.log('VERDICT:');
if(resB.pl - txCostTotal >= 2000000){
  console.log(`  ✅ Version B (honest) net of costs = ${fmt(resB.pl-txCostTotal)} — STILL ≥ ₹20L target`);
  console.log(`  The original results were NOT fake — just slightly optimistic about exit precision`);
}else{
  console.log(`  ⚠️  Version B (honest) net of costs = ${fmt(resB.pl-txCostTotal)} — BELOW ₹20L target`);
  console.log(`  → Need to revisit strategy with gap=10 or different params`);
}

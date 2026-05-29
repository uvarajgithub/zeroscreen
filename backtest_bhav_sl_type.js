// backtest_bhav_sl_type.js
// Compare: SL fires on INTRABAR low  vs  SL fires on CANDLE CLOSE
// Grid: Entry × SL_level × SL_type × Exit × RE
// SL_type: 'intrabar' = fires when low < entry-SL (current)
//          'close'    = fires only when candle closes below entry-SL (more forgiving)

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);
const PTS = 15;

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

// ─── EXIT: Trail (Fix3) with SL_TYPE switch ───────────────────────────────────
function exitTrail(cs, entryIdx, side, SL, TRAIL_GAP, slType) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  let trail=-SL, peak=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const op=sign*(c.open-ep);
    // Gap through trail/SL at open
    if(trail>0&&op<trail)  return{pl:op*PTS,exitIdx:i,type:'TG'};
    if(trail<=0&&op<-SL)   return{pl:-SL*PTS,exitIdx:i,type:'SLG'};

    const adv =side==='CE'?(c.low-ep):(ep-c.high);   // intrabar adverse
    const cls =sign*(c.close-ep);                      // close pts
    const fav =side==='CE'?(c.high-ep):(ep-c.low);
    const np  =Math.max(peak,fav);
    const nt  =np>=TRAIL_GAP?np-TRAIL_GAP:-SL;

    // Trail exits (prev-candle and same-candle — unchanged)
    if(trail>0&&adv<=trail)         return{pl:trail*PTS,exitIdx:i,type:'TP'};
    if(nt>0&&adv<=nt&&cls<=nt)      return{pl:nt*PTS,exitIdx:i,type:'TS'};

    // SL — TWO MODES
    if(trail<=0){
      if(slType==='intrabar' && adv<=-SL)  return{pl:-SL*PTS,exitIdx:i,type:'SL'};
      if(slType==='close'    && cls<=-SL)  return{pl:cls*PTS,exitIdx:i,type:'SL'}; // exit at close price
    }
    peak=np; trail=nt;
  }
  return{pl:sign*(cs[cs.length-1].close-ep)*PTS,exitIdx:cs.length-1,type:'EOD'};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

function run(entryCtx, SL, slType, TRAIL_GAP, withRE) {
  let pl=0,eq=0,pk=0,dd=0,tr=0,wins=0,reCount=0,slHits=0,slLoss=0;
  const yr={};
  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev) continue;
    const entry=findEntry(cs,prev);
    if(!entry) continue;
    if(entryCtx!=='ALL'&&entry.ctx!==entryCtx) continue;

    const r1=exitTrail(cs,entry.idx,entry.side,SL,TRAIL_GAP,slType);
    const {pl:p1,exitIdx:ei1,type:t1}=r1;
    tr++; if(p1>0)wins++;
    if(t1==='SL'||t1==='SLG'){slHits++;slLoss+=p1;}

    let rpl=0,cei=ei1,ct=t1,cp=p1,cs2=entry.side;
    if(withRE){
      if(p1>0&&t1!=='EOD'){
        const rev=entry.side==='CE'?'PE':'CE';
        let ri=-1;
        for(let i=ei1+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
        const sf=findReEntry(cs,ei1,entry.side);
        if(ri>0&&(sf<0||ri<sf)){reCount++;const rr=exitTrail(cs,ri,rev,SL,TRAIL_GAP,slType);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;cs2=rev;}
      }
      for(let i=0;i<3;i++){
        if(ct!=='EOD'&&cp>0){
          const ri=findReEntry(cs,cei,cs2);
          if(ri>0){reCount++;const rr=exitTrail(cs,ri,cs2,SL,TRAIL_GAP,slType);rpl+=rr.pl;cei=rr.exitIdx;ct=rr.type;cp=rr.pl;}
          else break;
        } else break;
      }
    }
    const day=p1+rpl; pl+=day; eq+=day;
    if(eq>pk)pk=eq; const d2=pk-eq; if(d2>dd)dd=d2;
    const y=date.slice(0,4); yr[y]=(yr[y]||0)+day;
  }
  const allPos=Object.values(yr).every(v=>v>=0);
  return{pl,tr,wr:(wins/tr*100).toFixed(1),dd,reCount,slHits,slLoss,allPos,yr};
}

// ─── GRID ─────────────────────────────────────────────────────────────────────
const SLS       = [50, 75, 100, 150, 200, 250];
const SL_TYPES  = ['intrabar','close'];
const TRAIL_GAPS= [20, 50, 100];
const ENTRIES   = ['ALL','ABOVE_PDH','BELOW_PDL','INSIDE'];

console.log('\n  INTRABAR SL  vs  CLOSE SL — Full grid (Entry=ALL, Trail-20, with RE)');
console.log('  ══════════════════════════════════════════════════════════════════════');
console.log('  SL_type    SL    5yr P&L          WR%   SL_hits  SL_loss       MaxDD       AllPos');
console.log('  ─────────────────────────────────────────────────────────────────────────────────');

for(const sl of SLS){
  for(const slT of SL_TYPES){
    const r=run('ALL',sl,slT,20,true);
    const ap=r.allPos?'✓':' ';
    console.log(`  ${slT.padEnd(10)} ${String(sl).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%   ${String(r.slHits).padStart(5)}    ₹${r.slLoss.toLocaleString('en-IN').padStart(12)}  ₹${r.dd.toLocaleString('en-IN').padStart(10)}  ${ap}`);
  }
  console.log('  ·');
}

// Best combo across all 4 dimensions
console.log('\n\n  FULL GRID: Entry × SL × SL_type × Trail_GAP (with RE, sorted by P&L)');
console.log('  ══════════════════════════════════════════════════════════════════════════');
console.log('  Entry       SL_type    SL   Gap   5yr P&L          WR%   SL_hits  MaxDD        AllPos');
console.log('  ───────────────────────────────────────────────────────────────────────────────────────');

const results=[];
for(const entry of ENTRIES)
for(const sl of SLS)
for(const slT of SL_TYPES)
for(const tg of TRAIL_GAPS){
  const r=run(entry,sl,slT,tg,true);
  results.push({entry,sl,slT,tg,...r});
}
results.sort((a,b)=>b.pl-a.pl);

for(let i=0;i<25;i++){
  const r=results[i];
  const ap=r.allPos?'✓':' ';
  console.log(`  ${r.entry.padEnd(10)} ${r.slT.padEnd(10)} ${String(r.sl).padStart(3)}  ${String(r.tg).padStart(3)}   ₹${r.pl.toLocaleString('en-IN').padStart(14)}  ${r.wr}%  ${String(r.slHits).padStart(5)}    ₹${r.dd.toLocaleString('en-IN').padStart(10)}  ${ap}`);
}

const best=results[0];
console.log(`\n  ══ WINNER ══`);
console.log(`  Entry: ${best.entry}  SL_type: ${best.slT}  SL: ${best.sl}  Trail_GAP: ${best.tg}`);
console.log(`  5yr P&L : ₹${best.pl.toLocaleString('en-IN')}`);
console.log(`  WR      : ${best.wr}%  SL hits: ${best.slHits}  SL loss: ₹${best.slLoss.toLocaleString('en-IN')}`);
console.log(`  MaxDD   : ₹${best.dd.toLocaleString('en-IN')}  AllPos: ${best.allPos?'YES':'NO'}`);
console.log('  Yearly:');
for(const [y,p] of Object.entries(best.yr).sort())
  console.log(`    ${y}: ₹${p.toLocaleString('en-IN').padStart(14)}  ${p>=0?'+':'-'}`);

// SL_type head-to-head at the SAME parameters
console.log('\n  HEAD-TO-HEAD at best params (Entry=ALL, SL=250, Trail-20, with RE):');
for(const slT of SL_TYPES){
  const r=results.find(x=>x.entry==='ALL'&&x.sl===250&&x.slT===slT&&x.tg===20);
  if(r) console.log(`  ${slT.padEnd(10)}: ₹${r.pl.toLocaleString('en-IN').padStart(14)}  WR:${r.wr}%  SL_hits:${r.slHits}  SL_loss:₹${r.slLoss.toLocaleString('en-IN')}  MaxDD:₹${r.dd.toLocaleString('en-IN')}`);
}

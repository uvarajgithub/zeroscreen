// backtest_bhav_pieces.js
// BHAV V3 broken into pieces — test each piece contribution individually
//
// PIECES:
//  P1: Entry Context — ABOVE_PDH only
//  P2: Entry Context — BELOW_PDL only
//  P3: Entry Context — INSIDE only
//  P4: Exit — NO re-entries (main trade only)
//  P5: Exit — re-entries ONLY contribution
//  P6: Trail source — same-candle trail (close-confirmed, Fix3)
//  P7: Trail source — prev-candle trail (honest, v4 style)
//  P8: SL exits contribution
//  P9: EOD exits contribution
//  P10: Trail GAP sensitivity (20/50/100/150 with Fix3)
//
// Goal: find exactly which piece drove 33L and which fix restores it honestly

'use strict';
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);

const SL_PTS     = 150;
const PTS_PER_RS = 15;

const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const firstBull   = (cs, f, t=30) => { for(let i=f;i<cs.length;i++) if(bp(cs[i])>t) return i; return -1; };
const firstBear   = (cs, f, t=30) => { for(let i=f;i<cs.length;i++) if(bp(cs[i])<-t) return i; return -1; };
const firstStrong = (cs, f, t=55) => { for(let i=f;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};}return null; };

// ─── findEntry returns {idx, side, ctx} ──────────────────────────────────────
function findEntry(candles, prev) {
  if(!candles||candles.length<2||!prev||prev.length===0) return null;
  const PH=pdh(prev),PL_=pdl(prev),PC=pdc(prev);
  const C0=candles[0],gap=C0.open-PC;
  const vsPDH=C0.open-PH,vsPDL=C0.open-PL_;
  const ctx=vsPDH>120?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0),C1bp=candles[1]?bp(candles[1]):0;
  const bps4=candles.slice(0,Math.min(4,candles.length)).map(bp);
  let w=0;
  for(let i=1;i<bps4.length;i++) if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65) w++;
  if(w>=2) return null;
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000) return {idx:0,side:'CE',ctx};
    if(C0bp>85)    return {idx:0,side:'CE',ctx};
    if(C0bp<-20)   return {idx:0,side:'PE',ctx};
    const b=firstBear(candles,1,35); if(b>0&&b<=7) return {idx:b,side:'PE',ctx};
    const c=firstStrong(candles,2,55); if(c) return {idx:c.i,side:c.side,ctx};
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-80) return {idx:0,side:'PE',ctx};
    if(C0bp<-65) return null;
    if(C0bp>65){const i=firstBear(candles,1,30);if(i>0)return{idx:i,side:'PE',ctx};}
    if(C0.high<PL_){
      if(C1bp>20) return {idx:1,side:'CE',ctx};
      if(C1bp<-20) return {idx:0,side:'PE',ctx};
      const s=firstStrong(candles,2,40);if(s&&s.i<=5)return{idx:s.i,side:s.side,ctx};
      return null;
    }
    if(C0bp>20){const i=firstBear(candles,1,30);if(i>0&&i<=6)return{idx:i,side:'PE',ctx};}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,candles.length-2);i++)if(bp(candles[i])<-45&&candles[i-1].close<PL_)return{idx:i,side:'PE',ctx};}
    return null;
  }
  if(C0.close<PL_) return {idx:0,side:'PE',ctx};
  if(C0.close>PH)  return {idx:0,side:'CE',ctx};
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0b=C0bp>0,al=(c0b&&!gapDown)||(!c0b&&!gapUp);
    if(al){if(C1bp*C0bp<0&&Math.abs(C1bp)>72)return{idx:1,side:C1bp>0?'CE':'PE',ctx};return{idx:0,side:c0b?'CE':'PE',ctx};}
    else{const gs=gapUp?'CE':'PE';const rv=gapUp?firstBull(candles,1,35):firstBear(candles,1,35);if(rv>0&&rv<=5)return{idx:rv,side:gs,ctx};return{idx:0,side:c0b?'CE':'PE',ctx};}
  }
  if(Math.abs(C0bp)>30){
    if(C1bp*C0bp>0) return {idx:0,side:C0bp>0?'CE':'PE',ctx};
    if(Math.abs(C1bp)>65&&C1bp*C0bp<0&&candles.length>2){const C2bp=bp(candles[2]);if(C2bp*C0bp>0&&Math.abs(C2bp)>20)return{idx:0,side:C0bp>0?'CE':'PE',ctx};}
  }
  for(let i=2;i<=8;i++){
    if(i>=candles.length) break;
    const cbp=bp(candles[i]);
    if(Math.abs(cbp)>55){
      const sb=cbp>0,og=(sb&&gapDown)||(!sb&&gapUp),cm=(sb&&C0bp<-20)||(!sb&&C0bp>20);
      if(og&&cm) continue;
      const pv=bp(candles[i-1]);
      if(Math.abs(pv)>60&&pv*cbp<0&&i+1<candles.length&&bp(candles[i+1])*cbp<0&&Math.abs(bp(candles[i+1]))>60)return null;
      return {idx:i,side:cbp>0?'CE':'PE',ctx};
    }
  }
  for(let i=5;i<Math.min(candles.length,21);i++){
    const pc=candles[i-1].close;
    if(candles[i].low<=PL_&&pc>PL_&&bp(candles[i])>35) return {idx:i,side:'CE',ctx};
    if(candles[i].high>=PH&&pc<PH&&bp(candles[i])<-35) return {idx:i,side:'PE',ctx};
  }
  return null;
}

function findReEntry(cs, fromIdx, side) {
  const t=side==='CE'?55:-55;
  for(let i=fromIdx+1;i<cs.length-2;i++){const b=bp(cs[i]);if(side==='CE'&&b>t)return i;if(side==='PE'&&b<t)return i;}
  return -1;
}

// ─── FIX 3 calcPL — honest same-candle trail (close-confirms) ────────────────
function calcPL(cs, entryIdx, side, TRAIL_GAP) {
  const ep=cs[entryIdx].close, sign=side==='CE'?1:-1;
  let trailStop=-SL_PTS, peakPts=0;
  for(let i=entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const openPts=sign*(c.open-ep);
    if(trailStop>0&&openPts<trailStop) return{pl:openPts*PTS_PER_RS,peakPts,exitIdx:i,type:'TRAIL_GAP',exitPrice:c.open};
    if(trailStop<=0&&openPts<-SL_PTS) return{pl:-SL_PTS*PTS_PER_RS,peakPts,exitIdx:i,type:'SL_GAP',exitPrice:c.open};
    const adversePts=side==='CE'?(c.low-ep):(ep-c.high);
    const closePts  =sign*(c.close-ep);
    const favPts    =side==='CE'?(c.high-ep):(ep-c.low);
    const newPeak   =Math.max(peakPts,favPts);
    const newTrail  =newPeak>=TRAIL_GAP?newPeak-TRAIL_GAP:-SL_PTS;
    // Prev-candle trail (always valid)
    if(trailStop>0&&adversePts<=trailStop) return{pl:trailStop*PTS_PER_RS,peakPts,exitIdx:i,type:'TRAIL_PREV',exitPrice:ep+sign*trailStop};
    // Same-candle trail (valid when close also fell below trail level)
    if(newTrail>0&&adversePts<=newTrail&&closePts<=newTrail) return{pl:newTrail*PTS_PER_RS,peakPts:newPeak,exitIdx:i,type:'TRAIL_SAME',exitPrice:ep+sign*newTrail};
    // SL
    if(trailStop<=0&&adversePts<=-SL_PTS) return{pl:-SL_PTS*PTS_PER_RS,peakPts,exitIdx:i,type:'SL',exitPrice:side==='CE'?ep-SL_PTS:ep+SL_PTS};
    peakPts=newPeak; trailStop=newTrail;
  }
  const exitPrice=cs[cs.length-1].close;
  return{pl:sign*(exitPrice-ep)*PTS_PER_RS,peakPts,exitIdx:cs.length-1,type:'EOD',exitPrice};
}

function getPrev(d){const i=ALL.indexOf(d);return i>0?raw[ALL[i-1]]:null;}

// ─── MASTER RUN FUNCTION ──────────────────────────────────────────────────────
function runWith({ctxFilter=null, noReEntry=false, TRAIL_GAP=20}) {
  const stats={total:0,pl:0,trades:0,wins:0,re:0,
    byType:{TRAIL_SAME:0,TRAIL_PREV:0,TRAIL_GAP:0,SL:0,SL_GAP:0,EOD:0},
    byTypePL:{TRAIL_SAME:0,TRAIL_PREV:0,TRAIL_GAP:0,SL:0,SL_GAP:0,EOD:0},
    byCtx:{ABOVE_PDH:0,BELOW_PDL:0,INSIDE:0},
    byCtxPL:{ABOVE_PDH:0,BELOW_PDL:0,INSIDE:0},
    equity:0,peak:0,maxDD:0,yearly:{}};

  for(const date of ALL){
    const cs=raw[date],prev=getPrev(date);
    if(!prev) continue;
    stats.total++;
    const entry=findEntry(cs,prev);
    if(!entry) continue;
    if(ctxFilter && entry.ctx !== ctxFilter) continue;

    const res1=calcPL(cs,entry.idx,entry.side,TRAIL_GAP);
    const {pl,exitIdx,peakPts}=res1;
    const type1=res1.type;
    stats.trades++; if(pl>0) stats.wins++;
    stats.byType[type1]=(stats.byType[type1]||0)+1;
    stats.byTypePL[type1]=(stats.byTypePL[type1]||0)+pl;
    stats.byCtx[entry.ctx]=(stats.byCtx[entry.ctx]||0)+1;
    stats.byCtxPL[entry.ctx]=(stats.byCtxPL[entry.ctx]||0)+pl;

    let rePL=0, curExitIdx=exitIdx, curType=type1, curPL=pl, curSide=entry.side;

    if(!noReEntry){
      if(peakPts>=100&&type1!=='EOD'&&pl>0){
        const rev=entry.side==='CE'?'PE':'CE';
        let ri=-1;
        for(let i=exitIdx+1;i<=cs.length-3;i++){const b=bp(cs[i]);if((rev==='CE'&&b>65)||(rev==='PE'&&b<-65)){ri=i;break;}}
        const sf=findReEntry(cs,exitIdx,entry.side);
        if(ri>0&&(sf<0||ri<sf)){stats.re++;const r=calcPL(cs,ri,rev,TRAIL_GAP);rePL+=r.pl;curExitIdx=r.exitIdx;curType=r.type;curPL=r.pl;curSide=rev;}
      }
      for(let re=0;re<3;re++){
        if(curType!=='EOD'&&curPL>0){
          const ri=findReEntry(cs,curExitIdx,curSide);
          if(ri>0){stats.re++;const r=calcPL(cs,ri,curSide,TRAIL_GAP);rePL+=r.pl;curExitIdx=r.exitIdx;curType=r.type;curPL=r.pl;}
          else break;
        } else break;
      }
    }

    const dayPL=pl+rePL;
    stats.pl+=dayPL; stats.equity+=dayPL;
    if(stats.equity>stats.peak) stats.peak=stats.equity;
    const dd=stats.peak-stats.equity; if(dd>stats.maxDD) stats.maxDD=dd;
    const yr=date.slice(0,4); stats.yearly[yr]=(stats.yearly[yr]||0)+dayPL;
  }
  return stats;
}

// ─── RUN ALL PIECES ───────────────────────────────────────────────────────────
function print(label, s) {
  const wr=(s.wins/s.trades*100).toFixed(1);
  const ap=Object.values(s.yearly).every(v=>v>=0)?'ALL+':'    ';
  const yrs=Object.entries(s.yearly).sort().map(([y,v])=>`${y}:₹${v.toLocaleString('en-IN')}`).join(' | ');
  console.log(`\n  ┌─ ${label}`);
  console.log(`  │  5yr P&L: ₹${s.pl.toLocaleString('en-IN').padStart(14)}  WR:${wr}%  Trades:${s.trades}  RE:${s.re}  MaxDD:₹${s.maxDD.toLocaleString('en-IN')}  ${ap}`);
  console.log(`  │  Exit types → TRAIL_SAME:${s.byType.TRAIL_SAME}(₹${s.byTypePL.TRAIL_SAME.toLocaleString('en-IN')}) | TRAIL_PREV:${s.byType.TRAIL_PREV}(₹${s.byTypePL.TRAIL_PREV.toLocaleString('en-IN')}) | TRAIL_GAP:${s.byType.TRAIL_GAP||0} | SL:${s.byType.SL+s.byType.SL_GAP||0} | EOD:${s.byType.EOD||0}`);
  console.log(`  │  Years: ${yrs}`);
}

console.log('\n\n  ══════════════════════════════════════════════════════════════════');
console.log('  BHAV V3 — PIECE BY PIECE BREAKDOWN (Fix3 exit: close-confirms-trail)');
console.log('  ══════════════════════════════════════════════════════════════════\n');

// PIECE 1: Full strategy with Fix3 (baseline)
print('FULL STRATEGY — Fix3 (Trail GAP=20, with re-entries)', runWith({TRAIL_GAP:20}));

// PIECE 2: Entry contexts split
print('ENTRY: ABOVE_PDH only', runWith({ctxFilter:'ABOVE_PDH', TRAIL_GAP:20}));
print('ENTRY: BELOW_PDL only', runWith({ctxFilter:'BELOW_PDL', TRAIL_GAP:20}));
print('ENTRY: INSIDE only',    runWith({ctxFilter:'INSIDE',    TRAIL_GAP:20}));

// PIECE 3: Re-entry impact
const withRE  = runWith({TRAIL_GAP:20});
const noRE    = runWith({TRAIL_GAP:20, noReEntry:true});
console.log('\n  ┌─ RE-ENTRY CONTRIBUTION');
console.log(`  │  With RE : ₹${withRE.pl.toLocaleString('en-IN')}  (${withRE.re} re-entries)`);
console.log(`  │  No RE   : ₹${noRE.pl.toLocaleString('en-IN')}`);
console.log(`  │  RE adds : ₹${(withRE.pl-noRE.pl).toLocaleString('en-IN')} from ${withRE.re} re-entries`);

// PIECE 4: Trail GAP sensitivity (how TRAIL_GAP changes results)
console.log('\n  ┌─ TRAIL_GAP SENSITIVITY (Fix3 exit, with RE)');
console.log('  │   GAP    5yr P&L       WR%   SameTrl  PrevTrl  SL   EOD  AllPos');
for(const tg of [20, 30, 50, 75, 100, 125, 150, 175, 200]){
  const s=runWith({TRAIL_GAP:tg});
  const ap=Object.values(s.yearly).every(v=>v>=0)?'✓':' ';
  console.log(`  │   ${String(tg).padStart(3)}   ₹${s.pl.toLocaleString('en-IN').padStart(13)}  ${(s.wins/s.trades*100).toFixed(1)}%   ${String(s.byType.TRAIL_SAME).padStart(5)}    ${String(s.byType.TRAIL_PREV).padStart(5)}   ${String(s.byType.SL+s.byType.SL_GAP).padStart(4)} ${String(s.byType.EOD).padStart(4)}    ${ap}`);
}

// PIECE 5: Exit type PL breakdown for full strategy
const full=runWith({TRAIL_GAP:20});
const totalTrades=full.trades+full.re;
console.log('\n  ┌─ EXIT TYPE P&L BREAKDOWN (full strategy, TRAIL_GAP=20)');
console.log(`  │  TRAIL_SAME : ${full.byType.TRAIL_SAME} exits → ₹${full.byTypePL.TRAIL_SAME.toLocaleString('en-IN')}`);
console.log(`  │  TRAIL_PREV : ${full.byType.TRAIL_PREV} exits → ₹${full.byTypePL.TRAIL_PREV.toLocaleString('en-IN')}`);
console.log(`  │  SL exits   : ${full.byType.SL+full.byType.SL_GAP} exits → ₹${((full.byTypePL.SL||0)+(full.byTypePL.SL_GAP||0)).toLocaleString('en-IN')}`);
console.log(`  │  EOD exits  : ${full.byType.EOD} exits → ₹${full.byTypePL.EOD.toLocaleString('en-IN')}`);
console.log(`  │  TOTAL      : ₹${full.pl.toLocaleString('en-IN')}`);
console.log(`  │`);
console.log(`  │  IF we could capture ONLY same-candle trails legitimately:`);
console.log(`  │    That piece alone = ₹${full.byTypePL.TRAIL_SAME.toLocaleString('en-IN')} from ${full.byType.TRAIL_SAME} exits`);
console.log(`  │    Avg per same-candle trail = ₹${(full.byTypePL.TRAIL_SAME/(full.byType.TRAIL_SAME||1)).toFixed(0)}`);

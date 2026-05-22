'use strict';
// ============================================================
//  VARIANT B — Structure SL Comparison
//  EXACT same logic as backtest_variantB_full.js
//  Added: rollingEntryScan returns structSL (C1 candle extreme)
//  Variants: Fixed SL=60 vs Structure SL (C1 high/low)
// ============================================================
const fs = require('fs');

const RS        = 15;
const TRAIL_GAP = 100;
const BUFFER    = 25;

const raw = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const date = ist.getFullYear()+'-'+String(ist.getMonth()+1).padStart(2,'0')+'-'+String(ist.getDate()).padStart(2,'0');
  return {date,h:ist.getHours(),m:ist.getMinutes(),open:c.open,high:c.high,low:c.low,close:c.close};
}).filter(c=>c.close>0);

const byDay={};
for(const c of candles){if(!byDay[c.date])byDay[c.date]=[];byDay[c.date].push(c);}
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
console.log(`Days: ${allDates.length}  (${allDates[0]} → ${allDates[allDates.length-1]})\n`);

const isEOD = c => c.h>15||(c.h===15&&c.m>=14);

function enrich(c){
  const bull=c.close>=c.open;const bh=Math.max(c.open,c.close);const bl=Math.min(c.open,c.close);
  return Object.assign({},c,{bull,body_high:bh,body_low:bl,body_size:bh-bl});
}

// rollingEntryScan — returns structSL (C1 candle extreme) in addition to existing fields
function rollingEntryScan(cs){
  for(let i=0;i<cs.length-1;i++){
    const ca=cs[i],cb=cs[i+1];let sig=null,c2l=0,c3l=0,structSL=0;
    if(ca.bull===cb.bull){
      sig=ca.bull?'CE':'PE';
      c2l=sig==='CE'?ca.high:ca.low;
      c3l=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
      structSL=sig==='CE'?ca.low:ca.high;   // C1 opposite extreme (low for CE, high for PE)
    } else if(cb.body_size>ca.body_size){
      sig=cb.bull?'CE':'PE';
      c2l=sig==='CE'?ca.body_high:ca.body_low;
      c3l=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
      structSL=sig==='CE'?ca.body_low:ca.body_high;
    } else continue;
    if(sig==='CE'&&cb.close>c2l)return{sig,entryIdx:i+1,structSL};
    if(sig==='PE'&&cb.close<c2l)return{sig,entryIdx:i+1,structSL};
    for(let j=i+2;j<cs.length;j++){
      const c=cs[j];
      if(sig==='CE'&&c.close>c3l)return{sig,entryIdx:j,structSL};
      if(sig==='PE'&&c.close<c3l)return{sig,entryIdx:j,structSL};
    }
  }
  return null;
}

// EXACT same as backtest_variantB_full.js but accepts initialSL parameter
function simLeg(cs, startIdx, dir, initialSL){
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-initialSL:entry+initialSL;
  let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c))return {pts:dir==='CE'?c.close-entry:entry-c.close,type:'EOD',exitIdx:idx};
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    if(peak>=initialSL){const locked=Math.max(0,peak-TRAIL_GAP);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    if(intraTouched&&margin>=BUFFER)return {pts:dir==='CE'?sl-entry:entry-sl,type:'SL',exitIdx:idx};
  }
  const last=cs[cs.length-1];
  return {pts:dir==='CE'?last.close-entry:entry-last.close,type:'EOD',exitIdx:cs.length-1};
}

function simDay(rawcs, getInitialSL){
  const cs=rawcs.map(enrich);
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    const initialSL = getInitialSL(res, cs[idx]);
    const t1=simLeg(cs,idx,res.sig,initialSL);
    let rePts=0;
    if(t1.type==='SL'){
      const reDir=res.sig==='CE'?'PE':'CE';
      const re=simLeg(cs,t1.exitIdx,reDir,60); // RE always uses fixed 60
      rePts=re.pts;
    }
    const total=t1.pts+rePts;
    return {pts:total,win:total>0?1:0,loss:total<0?1:0,traded:true};
  }
  return {pts:0,win:0,loss:0,traded:false};
}

function runBacktest(label, getInitialSL) {
  let totalPts=0, wins=0, losses=0;
  let equity=0, peak=0, maxDD=0;
  const yearly={};
  for(const date of allDates){
    const cs=byDay[date];
    if(!cs||cs.length<4)continue;
    const r=simDay(cs, getInitialSL);
    totalPts+=r.pts;
    const yr=date.slice(0,4);
    if(!yearly[yr])yearly[yr]=0;
    yearly[yr]+=r.pts;
    if(r.traded){if(r.pts>0)wins++;else if(r.pts<0)losses++;}
    equity+=r.pts;
    if(equity>peak)peak=equity;
    if(peak-equity>maxDD)maxDD=peak-equity;
  }
  const traded=wins+losses;
  return {label,totalRs:Math.round(totalPts*RS),winPct:((wins/traded)*100).toFixed(1),wins,losses,maxDDRs:Math.round(maxDD*RS),yearly};
}

console.log('Running variants...\n');
const variants = [
  { label: 'A. Fixed SL=60       (baseline ₹24.15L)',       fn: ()=>60 },
  { label: 'B. Structure SL      no cap              ',      fn: (r,c)=>Math.abs(r.structSL-c.close) },
  { label: 'C. Structure SL      cap=80pts           ',      fn: (r,c)=>Math.min(Math.abs(r.structSL-c.close),80) },
  { label: 'D. Structure SL      cap=100pts          ',      fn: (r,c)=>Math.min(Math.abs(r.structSL-c.close),100) },
  { label: 'E. Structure SL      cap=60pts           ',      fn: (r,c)=>Math.min(Math.abs(r.structSL-c.close),60) },
];

const results = variants.map(v => runBacktest(v.label, v.fn));
const base = results[0];
const fmt  = n => (n>=0?'+':'')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');

const LINE='='.repeat(102);
console.log(LINE);
console.log('  AMINA 100 Variant B — Structure SL vs Fixed SL  |  5 years  |  Trail=100 / Buffer=25');
console.log(LINE);
console.log(`  ${'Variant'.padEnd(48)} ${'Total \u20b9'.padStart(13)} ${'Win%'.padStart(6)} ${'W/L'.padStart(9)} ${'MaxDD'.padStart(11)} ${'vs A'.padStart(12)}`);
console.log('  '+'-'.repeat(98));
for(const r of results){
  const diff=r===base?'---':fmt(r.totalRs-base.totalRs);
  const mark=r!==base&&r.totalRs>base.totalRs?' \u2705':r!==base?' \u274c':'';
  console.log(`  ${r.label.padEnd(48)} ${fmt(r.totalRs).padStart(13)} ${(r.winPct+'%').padStart(6)} ${(r.wins+'/'+r.losses).padStart(9)} ${fmt(-r.maxDDRs).padStart(11)} ${(diff+mark).padStart(14)}`);
}
console.log(LINE);

const allYears=[...new Set(results.flatMap(r=>Object.keys(r.yearly)))].sort();
console.log('\n  YEAR-BY-YEAR (\u20b9):');
const hdrs=results.map((_,i)=>String.fromCharCode(65+i)).map(h=>h.padStart(14));
console.log(`  ${'Year'.padEnd(6)}${hdrs.join('')}`);
console.log('  '+'-'.repeat(80));
for(const yr of allYears){
  const vals=results.map(r=>fmt(Math.round((r.yearly[yr]||0)*RS)).padStart(14));
  console.log(`  ${yr.padEnd(6)}${vals.join('')}`);
}
console.log(LINE);
console.log();

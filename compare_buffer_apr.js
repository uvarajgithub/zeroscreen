const fs = require('fs');
const RS = 15, SL_INITIAL = 60, TRAIL_GAP = 100, BUFFER = 25;
const raw = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const date = ist.getFullYear()+'-'+String(ist.getMonth()+1).padStart(2,'0')+'-'+String(ist.getDate()).padStart(2,'0');
  return {date,h:ist.getHours(),m:ist.getMinutes(),open:c.open,high:c.high,low:c.low,close:c.close};
}).filter(c=>c.close>0);
const byDay={};
for(const c of candles){if(!byDay[c.date])byDay[c.date]=[];byDay[c.date].push(c);}
const isEOD=c=>c.h>15||(c.h===15&&c.m>=14);

function enrich(c){
  const bull=c.close>=c.open;const bh=Math.max(c.open,c.close);const bl=Math.min(c.open,c.close);
  return Object.assign({},c,{bull,body_high:bh,body_low:bl,body_size:bh-bl});
}
function rollingEntryScan(cs){
  for(let i=0;i<cs.length-1;i++){
    const ca=cs[i],cb=cs[i+1];let sig=null,c2l=0,c3l=0;
    if(ca.bull===cb.bull){sig=ca.bull?'CE':'PE';c2l=sig==='CE'?ca.high:ca.low;c3l=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);}
    else if(cb.body_size>ca.body_size){sig=cb.bull?'CE':'PE';c2l=sig==='CE'?ca.body_high:ca.body_low;c3l=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);}
    else continue;
    if(sig==='CE'&&cb.close>c2l)return{sig,entryIdx:i+1};
    if(sig==='PE'&&cb.close<c2l)return{sig,entryIdx:i+1};
    for(let j=i+2;j<cs.length;j++){const c=cs[j];if(sig==='CE'&&c.close>c3l)return{sig,entryIdx:j};if(sig==='PE'&&c.close<c3l)return{sig,entryIdx:j};}
  }
  return null;
}

function simLeg(cs, startIdx, dir, useBuffer) {
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
  let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c)) return {pts:dir==='CE'?c.close-entry:entry-c.close, type:'EOD'};
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-TRAIL_GAP);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    const hit = useBuffer ? (intraTouched && margin>=BUFFER) : (intraTouched && margin>=0);
    if(hit) return {pts:dir==='CE'?sl-entry:entry-sl, type:'SL', exitSl:sl};
  }
  const last=cs[cs.length-1];
  return {pts:dir==='CE'?last.close-entry:entry-last.close, type:'EOD'};
}

function simDay(rawcs, useBuffer) {
  const cs=rawcs.map(enrich);
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    const t1=simLeg(cs,idx,res.sig,useBuffer);
    let rePts=0,reType='';
    if(t1.type==='SL'){
      const reDir=res.sig==='CE'?'PE':'CE';
      const re=simLeg(cs,idx + (cs.slice(idx+1).findIndex((_,i)=>cs[idx+1+i].close===t1.exitSl||true)+ 1)||idx+1,reDir,useBuffer);
      // simplified: just find the SL exit candle index
    }
    return {pts:t1.pts, dir:res.sig, type:t1.type, entry:cs[idx].close};
  }
  return {pts:0, dir:null, type:'NONE', entry:0};
}

// Get last month of data (April 2026)
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
const lastDates=allDates.filter(d=>d>='2026-04-01'&&d<='2026-04-30');

const fr=n=>(n>=0?'+':'-')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');
const fp=n=>(n>=0?'+':'')+n.toFixed(0)+'pt';
const L='='.repeat(90);const S='-'.repeat(90);

console.log(L);
console.log('  DAY-BY-DAY April 2026 ? AMINA Current (tick_double) vs AMINA + 25pt Buffer');
console.log(L);
console.log('  Date       Dir   Entry   CURRENT tick_double        BUFFER 25pt            Diff');
console.log(S);

let totCur=0, totBuf=0;
let curW=0,curL=0,bufW=0,bufL=0;

for(const date of lastDates){
  const cs=byDay[date];
  const cur=simDay(cs,false);
  const buf=simDay(cs,true);
  const rsCur=Math.round(cur.pts*RS);
  const rsBuf=Math.round(buf.pts*RS);
  totCur+=rsCur; totBuf+=rsBuf;
  if(cur.pts>0)curW++;else if(cur.pts<0)curL++;
  if(buf.pts>0)bufW++;else if(buf.pts<0)bufL++;
  const diff=rsBuf-rsCur;
  const diffStr=(diff>0?'+':'')+diff;
  const changed=diff!==0?'  <-- DIFF':'';
  console.log('  '+date+'  '+(cur.dir||'NONE').padEnd(4)+'  '+(cur.entry||'').toString().padStart(6)+'  '+fp(cur.pts).padStart(7)+'  '+fr(rsCur).padStart(12)+'  '+fp(buf.pts).padStart(7)+'  '+fr(rsBuf).padStart(12)+'  '+(diffStr).padStart(7)+changed);
}
console.log(S);
console.log('  TOTAL'+' '.repeat(29)+fr(totCur).padStart(12)+'  '+''.padStart(7)+'  '+fr(totBuf).padStart(12)+'  '+fr(totBuf-totCur).padStart(7));
console.log('  W/L  '+' '.repeat(29)+(curW+'W/'+curL+'L').padStart(12)+'  '+''.padStart(7)+'  '+(bufW+'W/'+bufL+'L').padStart(12));
console.log(L);

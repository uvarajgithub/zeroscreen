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
    const hit=useBuffer?(intraTouched&&margin>=BUFFER):(intraTouched&&margin>=0);
    if(hit) return {pts:dir==='CE'?sl-entry:entry-sl, type:'SL', exitSl:Math.round(sl)};
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
    return {pts:t1.pts, dir:res.sig, type:t1.type, entry:cs[idx].close};
  }
  return {pts:0, dir:null, type:'NONE', entry:0};
}

const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5&&d>='2026-03-01');
const fr=n=>(n>=0?'+':'-')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');
const fp=n=>(n>=0?'+':'')+Math.round(n)+'pt';
const L='='.repeat(95);const S='-'.repeat(95);

console.log(L);
console.log('  DAY-BY-DAY Mar+Apr+May 2026  --  AMINA Current  vs  AMINA + 25pt Buffer');
console.log(L);
console.log('  Date         Dir   Entry      Current(pts)    Current(Rs)    Buffer(pts)    Buffer(Rs)       Diff');
console.log(S);

let totCur=0,totBuf=0,curW=0,curL=0,bufW=0,bufL=0;
let mCur={},mBuf={};

for(const date of allDates){
  const cs=byDay[date];
  const cur=simDay(cs,false);
  const buf=simDay(cs,true);
  const rsCur=Math.round(cur.pts*RS);
  const rsBuf=Math.round(buf.pts*RS);
  totCur+=rsCur; totBuf+=rsBuf;
  const mo=date.slice(0,7);
  mCur[mo]=(mCur[mo]||0)+rsCur; mBuf[mo]=(mBuf[mo]||0)+rsBuf;
  if(cur.pts>0)curW++;else if(cur.pts<0)curL++;
  if(buf.pts>0)bufW++;else if(buf.pts<0)bufL++;
  const diff=rsBuf-rsCur;
  const flag=diff!==0?'  <-- +'+diff:'';
  const dir=cur.dir||'NONE';
  const entry=cur.entry?cur.entry.toFixed(0):'';
  console.log('  '+date+'    '+dir.padEnd(4)+'  '+entry.padStart(6)+'    '+fp(cur.pts).padStart(7)+'    '+fr(rsCur).padStart(10)+'    '+fp(buf.pts).padStart(7)+'    '+fr(rsBuf).padStart(10)+'    '+flag);
}
console.log(S);
const months=Object.keys(mCur).sort();
for(const m of months){
  console.log('  '+m+' subtotal'+' '.repeat(24)+fr(mCur[m]).padStart(10)+'               '+fr(mBuf[m]).padStart(10)+'    diff='+fr(mBuf[m]-mCur[m]));
}
console.log(S);
console.log('  TOTAL'+' '.repeat(37)+fr(totCur).padStart(10)+'               '+fr(totBuf).padStart(10)+'    diff='+fr(totBuf-totCur));
console.log('  W/L'+' '.repeat(38)+(curW+'W/'+curL+'L').padStart(10)+'               '+(bufW+'W/'+bufL+'L').padStart(10));
console.log(L);

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
function simLeg(cs,startIdx,dir,useBuffer){
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
  let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c))return dir==='CE'?c.close-entry:entry-c.close;
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-TRAIL_GAP);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    const hit=useBuffer?(intraTouched&&margin>=BUFFER):(intraTouched&&margin>=0);
    if(hit)return dir==='CE'?sl-entry:entry-sl;
  }
  const last=cs[cs.length-1];
  return dir==='CE'?last.close-entry:entry-last.close;
}
function simAmina(rawcs,useBuffer){
  const cs=rawcs.map(enrich);
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    return {pts:simLeg(cs,idx,res.sig,useBuffer),dir:res.sig,entry:cs[idx].close};
  }
  return {pts:0,dir:null,entry:0};
}

// T2: C2+C3 same color, SL=C2 low/high, EOD exit, candle-close SL
function simT2(rawcs){
  if(rawcs.length<3)return {pts:0,dir:null,entry:0};
  const C2=rawcs[1],C3=rawcs[2];
  if(isEOD(C3))return {pts:0,dir:null,entry:0};
  const b2=C2.close>=C2.open,b3=C3.close>=C3.open;
  if(b2!==b3)return {pts:0,dir:null,entry:0};
  const dir=b2?'CE':'PE';
  const entry=C3.close;
  const sl=dir==='CE'?C2.low:C2.high;
  for(let i=3;i<rawcs.length;i++){
    const c=rawcs[i];
    const slHit=dir==='CE'?c.close<=sl:c.close>=sl;
    if(slHit||isEOD(c))return {pts:dir==='CE'?c.close-entry:entry-c.close,dir,entry};
  }
  const last=rawcs[rawcs.length-1];
  return {pts:dir==='CE'?last.close-entry:entry-last.close,dir,entry};
}

const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5&&d>='2026-03-01');
const fr=n=>n===0?'      0':(n>0?'+':'-')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');
const L='='.repeat(105);const S='-'.repeat(105);

console.log(L);
console.log('  DAY-BY-DAY Mar+Apr 2026  --  AMINA Current  |  AMINA+Buffer  |  T2(C2+C3 same color, EOD)');
console.log(L);
console.log('  Date       Dir    Entry    AMINA-Cur      AMINA+Buf       T2-C2C3     Best');
console.log(S);

let tA=0,tB=0,tT=0,wA=0,lA=0,wB=0,lB=0,wT=0,lT=0;
let mA={},mB={},mT={};

for(const date of allDates){
  const cs=byDay[date];
  const a=simAmina(cs,false);
  const b=simAmina(cs,true);
  const t=simT2(cs);
  const rsA=Math.round(a.pts*RS),rsB=Math.round(b.pts*RS),rsT=Math.round(t.pts*RS);
  tA+=rsA;tB+=rsB;tT+=rsT;
  const mo=date.slice(0,7);
  mA[mo]=(mA[mo]||0)+rsA;mB[mo]=(mB[mo]||0)+rsB;mT[mo]=(mT[mo]||0)+rsT;
  if(a.pts>0)wA++;else if(a.pts<0)lA++;
  if(b.pts>0)wB++;else if(b.pts<0)lB++;
  if(t.pts>0)wT++;else if(t.pts<0)lT++;
  const vals=[{n:'A',v:rsA},{n:'B',v:rsB},{n:'T2',v:rsT}].sort((x,y)=>y.v-x.v);
  const best=vals[0].n;
  const dir=a.dir||t.dir||'--';
  const entry=(a.entry||t.entry||0).toFixed(0);
  const flag=(rsA!==rsB||rsA!==rsT)?'  *':'';
  console.log('  '+date+'  '+dir.padEnd(4)+'  '+entry.padStart(6)+'   '+fr(rsA).padStart(10)+'   '+fr(rsB).padStart(10)+'   '+fr(rsT).padStart(10)+'   '+best+flag);
}
console.log(S);
const months=Object.keys(mA).sort();
for(const m of months){
  const vals=[{n:'A',v:mA[m]},{n:'B',v:mB[m]},{n:'T2',v:mT[m]}].sort((x,y)=>y.v-x.v);
  console.log('  '+m+'  subtotal        '+fr(mA[m]).padStart(10)+'   '+fr(mB[m]).padStart(10)+'   '+fr(mT[m]).padStart(10)+'   BEST='+vals[0].n);
}
console.log(S);
const tv=[{n:'AMINA-Cur',v:tA},{n:'AMINA+Buf',v:tB},{n:'T2-C2C3',v:tT}].sort((x,y)=>y.v-x.v);
console.log('  TOTAL                   '+fr(tA).padStart(10)+'   '+fr(tB).padStart(10)+'   '+fr(tT).padStart(10)+'   BEST='+tv[0].n);
console.log('  W/L                     '+(wA+'W/'+lA+'L').padStart(10)+'   '+(wB+'W/'+lB+'L').padStart(10)+'   '+(wT+'W/'+lT+'L').padStart(10));
console.log(L);

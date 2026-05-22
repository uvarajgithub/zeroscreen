const fs = require('fs');
const RS = 15, SL_INITIAL = 60, BUFFER = 25;
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
function simAmina(rawcs, trailGap){
  const cs=rawcs.map(enrich);
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    const dir=res.sig;
    const entry=cs[idx].close;
    let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
    let peak=0;
    for(let i=idx+1;i<cs.length;i++){
      const c=cs[i];
      if(isEOD(c))return {pts:dir==='CE'?c.close-entry:entry-c.close,dir,entry};
      const ib=dir==='CE'?c.high-entry:entry-c.low;
      if(ib>peak)peak=ib;
      if(peak>=SL_INITIAL){const locked=Math.max(0,peak-trailGap);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
      const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
      const margin=dir==='CE'?sl-c.close:c.close-sl;
      if(intraTouched&&margin>=BUFFER)return {pts:dir==='CE'?sl-entry:entry-sl,dir,entry};
    }
    const last=cs[cs.length-1];
    return {pts:dir==='CE'?last.close-entry:entry-last.close,dir,entry};
  }
  return {pts:0,dir:null,entry:0};
}
function simT2(rawcs){
  if(rawcs.length<3)return {pts:0,dir:null,entry:0};
  const C2=rawcs[1],C3=rawcs[2];
  if(isEOD(C3))return {pts:0,dir:null,entry:0};
  const b2=C2.close>=C2.open,b3=C3.close>=C3.open;
  if(b2!==b3)return {pts:0,dir:null,entry:0};
  const dir=b2?'CE':'PE';const entry=C3.close;const sl=dir==='CE'?C2.low:C2.high;
  for(let i=3;i<rawcs.length;i++){
    const c=rawcs[i];
    if((dir==='CE'?c.close<=sl:c.close>=sl)||isEOD(c))return {pts:dir==='CE'?c.close-entry:entry-c.close,dir,entry};
  }
  const last=rawcs[rawcs.length-1];
  return {pts:dir==='CE'?last.close-entry:entry-last.close,dir,entry};
}

const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5&&d>='2026-03-01');
const fr=n=>n===0?'       0':(n>0?'+':'')+'\u20b9'+n.toLocaleString('en-IN');
const L='='.repeat(115);const S='-'.repeat(115);

console.log(L);
console.log('  Mar+Apr 2026  --  Trail100(cur) | Trail150 | Trail200 | Trail300 | T2-C2C3  (all with 25pt buffer)');
console.log(L);
console.log('  Date      Dir    T100-cur      T150          T200          T300          T2-C2C3     Best');
console.log(S);

const tots={t100:0,t150:0,t200:0,t300:0,t2:0};
const wins={t100:0,t150:0,t200:0,t300:0,t2:0};
const loss={t100:0,t150:0,t200:0,t300:0,t2:0};
const mots={};

for(const date of allDates){
  const cs=byDay[date];
  const a100=simAmina(cs,100);
  const a150=simAmina(cs,150);
  const a200=simAmina(cs,200);
  const a300=simAmina(cs,300);
  const t2=simT2(cs);
  const r={t100:Math.round(a100.pts*RS),t150:Math.round(a150.pts*RS),t200:Math.round(a200.pts*RS),t300:Math.round(a300.pts*RS),t2:Math.round(t2.pts*RS)};
  for(const k of Object.keys(tots)){tots[k]+=r[k];if(r[k]>0)wins[k]++;else if(r[k]<0)loss[k]++;}
  const mo=date.slice(0,7);
  if(!mots[mo])mots[mo]={t100:0,t150:0,t200:0,t300:0,t2:0};
  for(const k of Object.keys(tots))mots[mo][k]+=r[k];
  const best=Object.keys(r).sort((a,b)=>r[b]-r[a])[0];
  const dir=(a100.dir||t2.dir||'--');
  const changed=(r.t100!==r.t150||r.t100!==r.t200||r.t100!==r.t300||r.t100!==r.t2);
  console.log('  '+date+'  '+dir.padEnd(4)+'  '+fr(r.t100).padStart(10)+'  '+fr(r.t150).padStart(10)+'  '+fr(r.t200).padStart(10)+'  '+fr(r.t300).padStart(10)+'  '+fr(r.t2).padStart(10)+'  '+best+(changed?'  *':''));
}
console.log(S);
for(const mo of Object.keys(mots).sort()){
  const m=mots[mo];const best=Object.keys(m).sort((a,b)=>m[b]-m[a])[0];
  console.log('  '+mo+' TOTAL     '+fr(m.t100).padStart(10)+'  '+fr(m.t150).padStart(10)+'  '+fr(m.t200).padStart(10)+'  '+fr(m.t300).padStart(10)+'  '+fr(m.t2).padStart(10)+'  BEST='+best);
}
console.log(S);
const best=Object.keys(tots).sort((a,b)=>tots[b]-tots[a])[0];
console.log('  GRAND TOT    '+fr(tots.t100).padStart(10)+'  '+fr(tots.t150).padStart(10)+'  '+fr(tots.t200).padStart(10)+'  '+fr(tots.t300).padStart(10)+'  '+fr(tots.t2).padStart(10)+'  BEST='+best);
console.log('  W/L         '+(wins.t100+'W/'+loss.t100+'L').padStart(10)+'  '+(wins.t150+'W/'+loss.t150+'L').padStart(10)+'  '+(wins.t200+'W/'+loss.t200+'L').padStart(10)+'  '+(wins.t300+'W/'+loss.t300+'L').padStart(10)+'  '+(wins.t2+'W/'+loss.t2+'L').padStart(10));
console.log(L);

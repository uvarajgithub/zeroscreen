const fs = require('fs');
const RS = 15, SL_INITIAL = 60;
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
function simLeg(cs, startIdx, dir, trailGap, buffer){
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
  let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c))return {pts:dir==='CE'?c.close-entry:entry-c.close,type:'EOD',exitIdx:idx};
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-trailGap);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    if(intraTouched&&margin>=buffer)return {pts:dir==='CE'?sl-entry:entry-sl,type:'SL',exitIdx:idx};
  }
  const last=cs[cs.length-1];
  return {pts:dir==='CE'?last.close-entry:entry-last.close,type:'EOD',exitIdx:cs.length-1};
}
function simDay(rawcs, trailGap, buffer, useRE){
  const cs=rawcs.map(enrich);
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    const t1=simLeg(cs,idx,res.sig,trailGap,buffer);
    let rePts=0;
    if(useRE&&t1.type==='SL'){
      const reDir=res.sig==='CE'?'PE':'CE';
      const re=simLeg(cs,t1.exitIdx,reDir,trailGap,buffer);
      rePts=re.pts;
    }
    return t1.pts+rePts;
  }
  return 0;
}

// 5 variants:
// A: current  (trail=100, buffer=0,  RE=yes)
// B: buf only (trail=100, buffer=25, RE=yes)
// C: buf+t200 (trail=200, buffer=25, RE=yes)
// D: buf+noRE (trail=100, buffer=25, RE=no)
// E: buf+t200+noRE (trail=200, buffer=25, RE=no)
const variants=[
  {k:'A',label:'Current     (T100,buf=0, RE)',  trail:100,buf:0,  re:true},
  {k:'B',label:'Buf25       (T100,buf=25,RE)',  trail:100,buf:25, re:true},
  {k:'C',label:'Buf25+T200  (T200,buf=25,RE)',  trail:200,buf:25, re:true},
  {k:'D',label:'Buf25+NoRE  (T100,buf=25,noRE)',trail:100,buf:25, re:false},
  {k:'E',label:'Buf25+T200+NoRE(T200,b25,noRE)',trail:200,buf:25, re:false},
];

const tots={},wins={},loss={},eq={},peak={},mdd={},yearly={};
for(const v of variants){tots[v.k]=0;wins[v.k]=0;loss[v.k]=0;eq[v.k]=0;peak[v.k]=0;mdd[v.k]=0;yearly[v.k]={};}

for(const date of allDates){
  const cs=byDay[date];
  for(const v of variants){
    const pts=simDay(cs,v.trail,v.buf,v.re);
    const rs=Math.round(pts*RS);
    tots[v.k]+=rs;eq[v.k]+=rs;
    if(eq[v.k]>peak[v.k])peak[v.k]=eq[v.k];
    if(peak[v.k]-eq[v.k]>mdd[v.k])mdd[v.k]=peak[v.k]-eq[v.k];
    const yr=date.slice(0,4);
    yearly[v.k][yr]=(yearly[v.k][yr]||0)+rs;
    if(pts>0)wins[v.k]++;else if(pts<0)loss[v.k]++;
  }
}

const fr=n=>(n>=0?'+':'-')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');
const fl=n=>(n>=0?'+':'-')+(Math.abs(n)/100000).toFixed(2)+'L';
const L='='.repeat(110);const S='-'.repeat(110);
console.log(L);
console.log('  5-YEAR BACKTEST ? AMINA Improvement Matrix ('+allDates[0]+' to '+allDates[allDates.length-1]+')');
console.log(L);
console.log('  Variant'.padEnd(36)+'Net Rs'.padStart(14)+'Net'.padStart(9)+'Win%'.padStart(7)+'Trades'.padStart(8)+'Avg/Day'.padStart(10)+'MaxDD'.padStart(12));
console.log(S);
for(const v of variants){
  const td=wins[v.k]+loss[v.k];
  const wp=td?((wins[v.k]/td)*100).toFixed(1):'0';
  console.log('  '+v.label.padEnd(36)+fr(tots[v.k]).padStart(14)+fl(tots[v.k]).padStart(9)+(wp+'%').padStart(7)+td.toString().padStart(8)+fr(Math.round(tots[v.k]/td)).padStart(10)+fr(mdd[v.k]).padStart(12));
}
console.log(L);
const years=Object.keys(yearly['A']).sort();
console.log('\n  Year-by-year Rs:');
console.log('  '+'Year'.padEnd(6)+'A-Current'.padStart(12)+'B-Buf25'.padStart(12)+'C-Buf+T200'.padStart(13)+'D-Buf+NoRE'.padStart(13)+'E-B+T200+NoRE'.padStart(15));
console.log(S.slice(0,73));
for(const yr of years){
  const row=variants.map(v=>fr(yearly[v.k][yr]||0).padStart(12));
  const best=variants.map(v=>({k:v.k,v:yearly[v.k][yr]||0})).sort((a,b)=>b.v-a.v)[0].k;
  console.log('  '+yr.padEnd(6)+row.join(' ')+'  <-'+best);
}
console.log(L);

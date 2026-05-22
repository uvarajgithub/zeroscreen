// Last 5 days detailed P&L — Variant B (buf=25, trail=100, RE=opposite)
const fs=require('fs');
const RS=15,SL_INITIAL=60,TRAIL_GAP=100,BUFFER=25;
const raw=JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));
const candles=raw.map(c=>{
  const utc=new Date(c.date);
  const ist=new Date(utc.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const date=ist.getFullYear()+'-'+String(ist.getMonth()+1).padStart(2,'0')+'-'+String(ist.getDate()).padStart(2,'0');
  return{date,h:ist.getHours(),m:ist.getMinutes(),open:c.open,high:c.high,low:c.low,close:c.close};
}).filter(c=>c.close>0);
const byDay={};
for(const c of candles){if(!byDay[c.date])byDay[c.date]=[];byDay[c.date].push(c);}
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
const last5=allDates.slice(-5);

const isEOD=c=>c.h>15||(c.h===15&&c.m>=14);
function enrich(c){const bull=c.close>=c.open;const bh=Math.max(c.open,c.close);const bl=Math.min(c.open,c.close);return Object.assign({},c,{bull,body_high:bh,body_low:bl,body_size:bh-bl});}
function rollingEntryScan(cs){
  for(let i=0;i<cs.length-1;i++){
    const ca=cs[i],cb=cs[i+1];let sig=null,c2l=0,c3l=0,rule='';
    if(ca.bull===cb.bull){sig=ca.bull?'CE':'PE';c2l=sig==='CE'?ca.high:ca.low;c3l=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);rule='A';}
    else if(cb.body_size>ca.body_size){sig=cb.bull?'CE':'PE';c2l=sig==='CE'?ca.body_high:ca.body_low;c3l=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);rule='B';}
    else continue;
    if(sig==='CE'&&cb.close>c2l)return{sig,entryIdx:i+1,px:cb.close,rule:rule+'(C2)'};
    if(sig==='PE'&&cb.close<c2l)return{sig,entryIdx:i+1,px:cb.close,rule:rule+'(C2)'};
    for(let j=i+2;j<cs.length;j++){const c=cs[j];if(sig==='CE'&&c.close>c3l)return{sig,entryIdx:j,px:c.close,rule};if(sig==='PE'&&c.close<c3l)return{sig,entryIdx:j,px:c.close,rule};}
  }
  return null;
}
function simLeg(cs,startIdx,dir){
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
  let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c))return{pts:dir==='CE'?c.close-entry:entry-c.close,type:'EOD',exitPx:c.close,exitTime:`${c.h}:${String(c.m).padStart(2,'0')}`};
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-TRAIL_GAP);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    if(intraTouched&&margin>=BUFFER)return{pts:dir==='CE'?sl-entry:entry-sl,type:'SL',exitPx:sl,exitTime:`${c.h}:${String(c.m).padStart(2,'0')}`};
  }
  const last=cs[cs.length-1];
  return{pts:dir==='CE'?last.close-entry:entry-last.close,type:'EOD',exitPx:last.close,exitTime:'EOD'};
}

console.log('='.repeat(70));
console.log(' LAST 5 TRADING DAYS — Variant B (buf=25, trail=100, RE=opposite)');
console.log('='.repeat(70));

let grandTotal=0;
for(const date of last5){
  const cs=byDay[date].map(enrich);
  // Find entry
  let res=null;
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const r=rollingEntryScan(cs.slice(0,idx+1));
    if(!r||r.entryIdx!==idx)continue;
    res=r; break;
  }
  console.log('\n'+'-'.repeat(70));
  console.log(` DATE: ${date}`);
  const c1=cs[0],c2=cs[1],c3=cs[2];
  console.log(` Open: ${c1.open.toFixed(0)}  |  C1: ${c1.open.toFixed(0)}/${c1.high.toFixed(0)}/${c1.low.toFixed(0)}/${c1.close.toFixed(0)} ${c1.bull?'▲':'▼'}`);
  console.log(` C2: ${c2.open.toFixed(0)}/${c2.high.toFixed(0)}/${c2.low.toFixed(0)}/${c2.close.toFixed(0)} ${c2.bull?'▲':'▼'}  |  C3: ${c3.open.toFixed(0)}/${c3.high.toFixed(0)}/${c3.low.toFixed(0)}/${c3.close.toFixed(0)} ${c3.bull?'▲':'▼'}`);
  if(!res){
    console.log(` SIGNAL: NONE — No trade`);
    console.log(` DAY P&L: +Rs 0`);
    continue;
  }
  const entryTime=`${cs[res.entryIdx].h}:${String(cs[res.entryIdx].m).padStart(2,'0')}`;
  console.log(` SIGNAL: ${res.sig} @ ${res.px.toFixed(0)} at ${entryTime} (Rule ${res.rule})`);
  const t1=simLeg(cs,res.entryIdx,res.sig);
  const t1Rs=Math.round(t1.pts*RS);
  console.log(` T1 ${res.sig}: Entry ${res.px.toFixed(0)} → SL exit ${t1.exitPx.toFixed(0)} @ ${t1.exitTime} | ${t1.pts>=0?'+':''}${t1.pts.toFixed(1)} pts | Rs ${t1Rs>=0?'+':''}${t1Rs} [${t1.type}]`);
  let rePts=0,reRs=0;
  if(t1.type==='SL'){
    const reDir=res.sig==='CE'?'PE':'CE';
    const reIdx=cs.findIndex((c,i)=>i>res.entryIdx&&c.h===parseInt(t1.exitTime)&&c.m===parseInt(t1.exitTime.split(':')[1]));
    const reStartIdx=reIdx>=0?reIdx:res.entryIdx+1;
    // find correct exit index
    let reStart=res.entryIdx+1;
    for(let i=res.entryIdx+1;i<cs.length;i++){
      const c=cs[i];
      const ct=`${c.h}:${String(c.m).padStart(2,'0')}`;
      if(ct===t1.exitTime){reStart=i;break;}
    }
    const re=simLeg(cs,reStart,reDir);
    rePts=re.pts;reRs=Math.round(re.pts*RS);
    console.log(` RE ${reDir}: Entry ${cs[reStart].close.toFixed(0)} → exit ${re.exitPx.toFixed(0)} @ ${re.exitTime} | ${re.pts>=0?'+':''}${re.pts.toFixed(1)} pts | Rs ${reRs>=0?'+':''}${reRs} [${re.type}]`);
  }
  const dayPts=t1.pts+rePts;
  const dayRs=t1Rs+reRs;
  grandTotal+=dayRs;
  const result=dayRs>0?'WIN':dayRs<0?'LOSS':'FLAT';
  console.log(` DAY P&L: Rs ${dayRs>=0?'+':''}${dayRs}  [${result}]`);
}
console.log('\n'+'='.repeat(70));
console.log(` 5-DAY TOTAL: Rs ${grandTotal>=0?'+':''}${grandTotal}`);
console.log('='.repeat(70));

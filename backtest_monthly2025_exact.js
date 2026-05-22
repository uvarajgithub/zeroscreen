const fs = require('fs');
const RS = 15, SL_INITIAL = 60, TRAIL_GAP = 100;
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
function enrich(c){const bull=c.close>=c.open;const bh=Math.max(c.open,c.close);const bl=Math.min(c.open,c.close);return Object.assign({},c,{bull,body_high:bh,body_low:bl,body_size:bh-bl});}
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
function simLeg(cs,startIdx,dir,mode){
  const entry=cs[startIdx].close;let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];if(isEOD(c))return dir==='CE'?c.close-entry:entry-c.close;
    const ib=dir==='CE'?c.high-entry:entry-c.low;if(ib>peak)peak=ib;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-TRAIL_GAP);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const it=dir==='CE'?c.low<=sl:c.high>=sl;const cc=dir==='CE'?c.close<=sl:c.close>=sl;
    const hit=mode==='candle_close'?cc:(it&&cc);
    if(hit)return mode==='candle_close'?(dir==='CE'?c.close-entry:entry-c.close):(dir==='CE'?sl-entry:entry-sl);
  }
  const last=cs[cs.length-1];return dir==='CE'?last.close-entry:entry-last.close;
}
function simDay(rawcs,mode){
  const cs=rawcs.map(enrich);let pts=0;
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    const t1=simLeg(cs,idx,res.sig,mode);pts+=t1;
    break;
  }
  return pts;
}
const months=['01','02','03','04','05','06','07','08','09','10','11','12'];
const mn=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fr=n=>(n>=0?'+':'-')+'\u20b9'+Math.abs(n).toLocaleString('en-IN');
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5&&d.startsWith('2025'));
const L='='.repeat(70);const S='-'.repeat(70);
console.log(L);
console.log('  MONTHLY 2025 - AMINA tick_double (exact backtest_confirm logic)');
console.log('  Note: includes trailing SL (100pt), RE entry removed for clarity');
console.log(L);
let tot=0;
for(let mi=0;mi<12;mi++){
  const md=allDates.filter(d=>d.startsWith('2025-'+months[mi]));
  if(!md.length){console.log('  '+mn[mi]+': (no data)');continue;}
  let pts=0,w=0,l=0;
  for(const d of md){const p=simDay(byDay[d],'tick_double');pts+=p;if(p>0)w++;else if(p<0)l++;}
  const rs=Math.round(pts*RS);tot+=rs;
  console.log('  '+mn[mi].padEnd(6)+fr(rs).padStart(14)+'  ('+w+'W/'+l+'L of '+md.length+' days)');
}
console.log(S);
console.log('  TOTAL '+fr(tot));
console.log(L);

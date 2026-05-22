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
const tf=c=>c.h+':'+(c.m<10?'0':'')+c.m;

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
    if(sig==='CE'&&cb.close>c2l)return{sig,entryIdx:i+1,c2l,c3l};
    if(sig==='PE'&&cb.close<c2l)return{sig,entryIdx:i+1,c2l,c3l};
    for(let j=i+2;j<cs.length;j++){const c=cs[j];if(sig==='CE'&&c.close>c3l)return{sig,entryIdx:j,c2l,c3l};if(sig==='PE'&&c.close<c3l)return{sig,entryIdx:j,c2l,c3l};}
  }
  return null;
}
function simLeg(cs,startIdx,dir,verbose){
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
  let peak=0;
  if(verbose) console.log('     Entry '+dir+' @ '+entry.toFixed(2)+' | initial SL='+sl.toFixed(2));
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c)){
      const pts=dir==='CE'?c.close-entry:entry-c.close;
      if(verbose) console.log('     ['+tf(c)+'] EOD exit @ '+c.close+' | pts='+(pts>0?'+':'')+pts.toFixed(1));
      return {pts,type:'EOD',exitIdx:idx};
    }
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    const prevSl=sl;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-TRAIL_GAP);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    const trailMoved=Math.abs(sl-prevSl)>0.1;
    if(trailMoved&&verbose) console.log('     ['+tf(c)+'] Trail SL moved to '+sl.toFixed(2)+' (peak='+peak.toFixed(1)+')');
    if(intraTouched){
      if(verbose) console.log('     ['+tf(c)+'] SL touched! low='+c.low+' high='+c.high+' SL='+sl.toFixed(2)+' close='+c.close+' margin='+(margin>0?'+':'')+margin.toFixed(1)+(margin>=BUFFER?' -> EXIT':' -> BUFFER NOT MET, stay in'));
      if(margin>=BUFFER){
        const pts=dir==='CE'?sl-entry:entry-sl;
        return {pts,type:'SL',exitIdx:idx};
      }
    }
  }
  const last=cs[cs.length-1];
  const pts=dir==='CE'?last.close-entry:entry-last.close;
  if(verbose) console.log('     EOD exit @ '+last.close+' | pts='+(pts>0?'+':'')+pts.toFixed(1));
  return {pts,type:'EOD',exitIdx:cs.length-1};
}

const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5&&d>='2026-03-01');
const L='='.repeat(80);
let grandTotal=0;let wins=0,losses=0;

for(const date of allDates){
  const cs=byDay[date].map(enrich);
  console.log('\n'+L);
  console.log(' DATE: '+date);
  console.log(' Candles: '+cs.filter(c=>!isEOD(c)).length+' intraday  |  OHLC of first 3:');
  cs.slice(0,3).forEach((c,i)=>console.log('   C'+(i+1)+' ['+tf(c)+'] O='+c.open+' H='+c.high+' L='+c.low+' C='+c.close+' '+(c.bull?'BULL':'BEAR')));
  console.log(L);

  let found=false;
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    found=true;
    console.log(' SIGNAL: '+res.sig+' at ['+tf(cs[idx])+'] entry='+cs[idx].close.toFixed(2)+' (signal: '+(res.sig==='CE'?'bull':'bear')+' body breakout)');
    console.log(' T1 LEG:');
    const t1=simLeg(cs,idx,res.sig,true);
    const t1Rs=Math.round(t1.pts*RS);
    console.log(' T1 RESULT: '+(t1.pts>=0?'+':'')+t1.pts.toFixed(1)+' pts = '+(t1Rs>=0?'+Rs':'-Rs')+Math.abs(t1Rs)+' | Exit: '+t1.type);

    let rePts=0;
    if(t1.type==='SL'){
      const reDir=res.sig==='CE'?'PE':'CE';
      console.log(' RE LEG ('+reDir+' from ['+tf(cs[t1.exitIdx])+']):');
      const re=simLeg(cs,t1.exitIdx,reDir,true);
      const reRs=Math.round(re.pts*RS);
      rePts=re.pts;
      console.log(' RE RESULT: '+(re.pts>=0?'+':'')+re.pts.toFixed(1)+' pts = '+(reRs>=0?'+Rs':'-Rs')+Math.abs(reRs)+' | Exit: '+re.type);
    }

    const dayPts=t1.pts+rePts;
    const dayRs=Math.round(dayPts*RS);
    grandTotal+=dayRs;
    if(dayPts>0)wins++;else if(dayPts<0)losses++;
    console.log(' DAY P&L: '+(dayPts>=0?'+':'')+dayPts.toFixed(1)+' pts | '+(dayRs>=0?'+':'')+'\u20b9'+Math.abs(dayRs).toLocaleString('en-IN')+' | Running: \u20b9'+grandTotal.toLocaleString('en-IN'));
    break;
  }
  if(!found) console.log(' NO SIGNAL today');
}
console.log('\n'+L);
console.log(' FINAL: Total=\u20b9'+grandTotal.toLocaleString('en-IN')+' | '+wins+'W/'+losses+'L');
console.log(L);

'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 30000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} }); });
    req.on('error', reject); req.on('timeout', ()=>{req.destroy();reject(new Error('timeout'))}); req.end();
  });
}

const SL_T1=50, SL_RE=100, RS=15;
const GAP_THRESH=300, PROP_FACTOR=0.25;

function mv(sig,e,p){ return sig==='CE'?p-e:e-p; }

function enrich(c){ const [,o,h,l,cl]=c; const bull=cl>=o; return {open:o,high:h,low:l,close:cl,bull,body_high:Math.max(o,cl),body_low:Math.min(o,cl),body_size:Math.abs(cl-o)}; }

function findC1C2(cs) {
  for (let i=0;i<cs.length-1;i++) {
    const ca=cs[i],cb=cs[i+1]; let sig=null,bl=null;
    if (ca.bull===cb.bull){ sig=ca.bull?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (cb.body_size>ca.body_size){ sig=cb.bull?'CE':'PE'; bl=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low); }
    else continue;
    for (let j=i+2;j<cs.length;j++){
      if (sig==='CE'&&cs[j].close>bl) return {sig,px:cs[j].close,idx:j,source:'C1C2'};
      if (sig==='PE'&&cs[j].close<bl) return {sig,px:cs[j].close,idx:j,source:'C1C2'};
    }
  }
  return null;
}

// OLD strategy: C1C2 entry, fixed SL50, re-entry VMT-style
function simOLD(cs, alwaysRe) {
  if (cs.length<4) return {pts:0,noEntry:true};
  const entry=findC1C2(cs);
  if (!entry) return {pts:0,noEntry:true};
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  let slHit=false,sIdx=null,sPx=null;
  let t1pts=mv(entry.sig,entry.px,last);
  for (let i=entry.idx+1;i<cs.length;i++){
    if (mv(entry.sig,entry.px,cs[i].close)<=-SL_T1){ slHit=true;sIdx=i;sPx=cs[i].close;t1pts=-SL_T1;break; }
  }
  let repts=0;
  if (slHit){
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    if (alwaysRe||mar<0){
      repts=mv(rs,sPx,last);
      for (let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-SL_RE){repts=-SL_RE;break;}
    }
  }
  return {pts:t1pts+repts,t1pts,repts,sig:entry.sig,slHit,entry,source:'C1C2'};
}

// NEW strategy: Gap rule + PropSL×0.25, else fallback to C1C2 with SL50
function simNEW(cs, alwaysRe) {
  if (cs.length<4) return {pts:0,noEntry:true};
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  const body0=cs[0].body_size;
  const isGap=body0>=GAP_THRESH;

  let entry, slT1;
  if (isGap){
    const sig=cs[0].bull?'CE':'PE';
    entry={sig,px:cs[0].close,idx:0,source:'GAP'};
    slT1=Math.max(50, Math.round(body0*PROP_FACTOR));
  } else {
    entry=findC1C2(cs);
    slT1=SL_T1;
  }
  if (!entry) return {pts:0,noEntry:true};

  let slHit=false,sIdx=null,sPx=null;
  let t1pts=mv(entry.sig,entry.px,last);
  for (let i=entry.idx+1;i<cs.length;i++){
    if (mv(entry.sig,entry.px,cs[i].close)<=-slT1){ slHit=true;sIdx=i;sPx=cs[i].close;t1pts=-slT1;break; }
  }
  let repts=0;
  if (slHit){
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    if (alwaysRe||mar<0){
      repts=mv(rs,sPx,last);
      for (let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-SL_RE){repts=-SL_RE;break;}
    }
  }
  return {pts:t1pts+repts,t1pts,repts,sig:entry.sig,slHit,slT1,isGap,entry,source:isGap?'GAP':'C1C2'};
}

function classifyDay(cs) {
  const open=cs[0].open,close=cs[cs.length-1].close;
  const high=Math.max(...cs.map(c=>c.high)),low=Math.min(...cs.map(c=>c.low));
  const range=high-low; if(range===0) return 'CHOPPY';
  const netRatio=Math.abs(close-open)/range;
  if(netRatio>=0.55) return 'TRENDING';
  let flips=0;
  for(let i=1;i<cs.length;i++) if(cs[i].bull!==cs[i-1].bull) flips++;
  const flipRatio=flips/(cs.length-1);
  const avgBody=cs.reduce((s,c)=>s+c.body_size,0)/cs.length;
  const bodyRatio=avgBody/range;
  if(bodyRatio>0.40&&flipRatio<0.50) return 'TRENDING';
  if(bodyRatio<0.20||flipRatio>0.65) return 'CHOPPY';
  return 'REVERSAL';
}

async function analyzeMonth(label, from, to) {
  const f=encodeURIComponent(from+' 09:15:00'), t2=encodeURIComponent(to+' 15:30:00');
  const resp=await kiteGet(`/instruments/historical/260105/15minute?from=${f}&to=${t2}&continuous=0&oi=0`);
  if(resp.status!=='success'){ console.log('ERR:',JSON.stringify(resp).slice(0,200)); return; }

  const days={};
  for(const c of resp.data.candles){
    const d=c[0].slice(0,10);
    if(!days[d]) days[d]=[];
    days[d].push(c);
  }

  console.log('\n');
  console.log('═'.repeat(115));
  console.log(`  ${label} — Old VMT vs Old AMINA vs NEW (Gap300+PropSL×0.25)`);
  console.log('═'.repeat(115));
  console.log(`${'Date'.padEnd(12)} ${'Type'.padEnd(10)} ${'Src'.padEnd(5)} ${'SL'.padEnd(4)}  ${'OLD VMT'.padStart(8)}  ${'OLD AMINA'.padStart(9)}  ${'NEW VMT'.padStart(8)}  ${'NEW AMINA'.padStart(9)}  ${'Change VMT'.padStart(11)}  Notes`);
  console.log('-'.repeat(115));

  let totOldVMT=0,totOldAMINA=0,totNewVMT=0,totNewAMINA=0;
  const rows=[];

  for(const day of Object.keys(days).sort()){
    const cs=days[day].map(enrich);
    if(cs.length<10) continue;
    const type=classifyDay(cs);
    const oldVMT  =simOLD(cs,false), oldAMINA=simOLD(cs,true);
    const newVMT  =simNEW(cs,false), newAMINA=simNEW(cs,true);
    const ovPts=Math.round(oldVMT.pts||0),  oaPts=Math.round(oldAMINA.pts||0);
    const nvPts=Math.round(newVMT.pts||0),  naPts=Math.round(newAMINA.pts||0);
    totOldVMT+=ovPts; totOldAMINA+=oaPts; totNewVMT+=nvPts; totNewAMINA+=naPts;

    const src=newVMT.source||'?';
    const slStr=newVMT.slHit?`Y${newVMT.slT1}`:'no ';
    const diffVMT=nvPts-ovPts;
    const note=newVMT.isGap?`GAP body=${Math.round(cs[0].body_size)} SL=${newVMT.slT1}`:(src==='C1C2'?'':'');
    const dStr=(diffVMT>0?'▲+':'▼')+diffVMT;

    console.log(`${day.padEnd(12)} ${type.padEnd(10)} ${src.padEnd(5)} ${slStr.padEnd(4)}  ${String(ovPts).padStart(8)}  ${String(oaPts).padStart(9)}  ${String(nvPts).padStart(8)}  ${String(naPts).padStart(9)}  ${dStr.padStart(11)}  ${note}`);
    rows.push({day,type,ovPts,oaPts,nvPts,naPts,isGap:newVMT.isGap||false});
  }

  const gapRows=rows.filter(r=>r.isGap);
  const changed=rows.filter(r=>r.nvPts!==r.ovPts);

  console.log('─'.repeat(115));
  console.log(`${'TOTAL'.padEnd(12)} ${''.padEnd(10)} ${''.padEnd(5)} ${''.padEnd(4)}  ${String(totOldVMT).padStart(8)}  ${String(totOldAMINA).padStart(9)}  ${String(totNewVMT).padStart(8)}  ${String(totNewAMINA).padStart(9)}  ${(totNewVMT-totOldVMT>0?'▲+':'▼')+(totNewVMT-totOldVMT)}`);

  console.log('\n── SUMMARY ────────────────────────────────────────────────────────────');
  console.log(`  OLD VMT   : ${totOldVMT} pts = ₹${totOldVMT*RS}`);
  console.log(`  OLD AMINA : ${totOldAMINA} pts = ₹${totOldAMINA*RS}`);
  console.log(`  NEW VMT   : ${totNewVMT} pts = ₹${totNewVMT*RS}   (${totNewVMT-totOldVMT>0?'▲+':'▼'}${totNewVMT-totOldVMT} pts vs old)`);
  console.log(`  NEW AMINA : ${totNewAMINA} pts = ₹${totNewAMINA*RS}   (${totNewAMINA-totOldAMINA>0?'▲+':'▼'}${totNewAMINA-totOldAMINA} pts vs old)`);
  console.log(`  Gap rule fired: ${gapRows.length} days — ${gapRows.map(r=>r.day.slice(5)).join(', ')}`);
  console.log(`  Days changed  : ${changed.length} — ${changed.map(r=>r.day.slice(5)+'('+r.ovPts+'→'+r.nvPts+')').join(', ')}`);
}

async function main(){
  await analyzeMonth('MARCH 2026', '2026-03-01', '2026-03-31');
  await analyzeMonth('APRIL 2026', '2026-04-01', '2026-04-30');
}
main().catch(e=>console.error('FATAL:',e.message));

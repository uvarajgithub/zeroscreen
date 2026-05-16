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
function fetchCandles(from, to) {
  const f=encodeURIComponent(from+' 09:15:00'), t2=encodeURIComponent(to+' 15:30:00');
  return kiteGet(`/instruments/historical/260105/15minute?from=${f}&to=${t2}&continuous=0&oi=0`);
}

function mv(sig,e,p){ return sig==='CE'?p-e:e-p; }

function findEntry(cs) {
  for (let i=0;i<cs.length-1;i++) {
    const ca=cs[i],cb=cs[i+1];
    let sig=null,bl=null;
    const bullA=ca.close>=ca.open,bullB=cb.close>=cb.open;
    const bodyA=Math.abs(ca.close-ca.open),bodyB=Math.abs(cb.close-cb.open);
    const bhA=Math.max(ca.open,ca.close),blA=Math.min(ca.open,ca.close);
    const bhB=Math.max(cb.open,cb.close),blB=Math.min(cb.open,cb.close);
    if (bullA===bullB){ sig=bullA?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (bodyB>bodyA){ sig=bullB?'CE':'PE'; bl=sig==='CE'?Math.max(bhA,bhB):Math.min(blA,blB); }
    else continue;
    for (let j=i+2;j<cs.length;j++){
      if (sig==='CE'&&cs[j].close>bl) return {sig,px:cs[j].close,idx:j,bl,source:'C1C2'};
      if (sig==='PE'&&cs[j].close<bl) return {sig,px:cs[j].close,idx:j,bl,source:'C1C2'};
    }
  }
  return null;
}

// opts: { gapThresh, gapSL, normalSL, reEntrySL }
function simulate(cs, opts) {
  const { gapThresh=0, gapSL=50, normalSL=50, reEntrySL=100 } = opts;
  if (!cs||cs.length<3) return null;
  const dayOpen=cs[0].open;

  let entry=null;
  const body0=Math.abs(cs[0].close-cs[0].open);
  const isGapDay = gapThresh>0 && body0>=gapThresh;

  if (isGapDay) {
    const sig=cs[0].close>=cs[0].open?'CE':'PE';
    entry={sig,px:cs[0].close,idx:0,source:'GAP'};
  } else {
    entry=findEntry(cs);
  }
  if (!entry) return null;

  const slT1 = isGapDay ? gapSL : normalSL;

  let slHit=false,sIdx=null,sPx=null;
  for (let i=entry.idx+1;i<cs.length;i++){
    if (mv(entry.sig,entry.px,cs[i].close)<=-slT1){ slHit=true; sIdx=i; sPx=cs[i].close; break; }
  }

  let t1pts = slHit ? -slT1 : mv(entry.sig,entry.px,cs[cs.length-1].close);
  let repts=0;
  if (slHit){
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    if (mar<0){
      repts=mv(rs,sPx,cs[cs.length-1].close);
      for (let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-reEntrySL){repts=-reEntrySL;break;}
    }
  }
  return {entry,slHit,isGapDay,slT1,t1pts,repts,total:t1pts+repts};
}

function splitDays(candles){
  const days={};
  for(const c of candles){
    const d=c[0].slice(0,10);
    if(!days[d]) days[d]=[];
    days[d].push({ts:c[0].slice(11,16),open:c[1],high:c[2],low:c[3],close:c[4]});
  }
  return days;
}
async function runYear(year){
  const chunks=[];
  for(let m=0;m<12;m+=2){
    const from=new Date(year,m,1),to=new Date(year,m+2,1); to.setDate(to.getDate()-1);
    const r=await fetchCandles(from.toISOString().slice(0,10),to.toISOString().slice(0,10));
    if(r.status==='success') chunks.push(...r.data.candles);
    await new Promise(res=>setTimeout(res,300));
  }
  return splitDays(chunks);
}

async function main(){
  const YEARS=[2021,2022,2023,2024,2025];
  const allDays=[];
  for(const yr of YEARS){
    process.stdout.write(`Fetching ${yr}... `);
    const days=await runYear(yr);
    for(const [date,cs] of Object.entries(days).sort()){
      if(cs.length<10) continue;
      const dayClose=cs[cs.length-1].close;
      const netMove=Math.abs(dayClose-cs[0].open);
      const dayRange=Math.max(...cs.map(c=>c.high))-Math.min(...cs.map(c=>c.low));
      allDays.push({date,cs,netMove,dayRange,dir:dayClose>=cs[0].open?'UP':'DN'});
    }
    console.log(`${Object.keys(days).length} days`);
  }

  const RS=15;
  const variants=[
    { name:'A. Current (SL50 EOD)',      gapThresh:0,   gapSL:50,  normalSL:50,  reEntrySL:100 },
    { name:'B. Gap300 (SL50)',            gapThresh:300, gapSL:50,  normalSL:50,  reEntrySL:100 },
    { name:'C. Gap400 (SL50)',            gapThresh:400, gapSL:50,  normalSL:50,  reEntrySL:100 },
    { name:'D. Gap300 WideSL100',         gapThresh:300, gapSL:100, normalSL:50,  reEntrySL:100 },
    { name:'E. Gap300 WideSL150',         gapThresh:300, gapSL:150, normalSL:50,  reEntrySL:100 },
    { name:'F. Gap400 WideSL100',         gapThresh:400, gapSL:100, normalSL:50,  reEntrySL:100 },
    { name:'G. Gap400 WideSL150',         gapThresh:400, gapSL:150, normalSL:50,  reEntrySL:100 },
    { name:'H. Gap400 WideSL200',         gapThresh:400, gapSL:200, normalSL:50,  reEntrySL:100 },
    { name:'I. Gap500 WideSL150',         gapThresh:500, gapSL:150, normalSL:50,  reEntrySL:100 },
    { name:'J. Gap1000 WideSL300',        gapThresh:1000,gapSL:300, normalSL:50,  reEntrySL:100 },
  ];

  const results=variants.map(v=>({...v,totalPts:0,days:0,wins:0,losses:0,gapDays:0,gapPts:0}));

  for(const d of allDays){
    for(let vi=0;vi<variants.length;vi++){
      const sim=simulate(d.cs,variants[vi]);
      if(!sim) continue;
      const r=results[vi];
      r.days++; r.totalPts+=sim.total;
      if(sim.total>0) r.wins++; else if(sim.total<0) r.losses++;
      if(sim.isGapDay){ r.gapDays++; r.gapPts+=sim.total; }
    }
  }

  const base=results[0].totalPts;
  console.log('\n'+'='.repeat(90));
  console.log('5-YEAR P&L — Gap Rule + Wide SL on Event Days');
  console.log('='.repeat(90));
  console.log(`${'Variant'.padEnd(28)} ${'TotalPts'.padStart(9)} ${'₹ P&L'.padStart(11)} ${'W'.padStart(5)} ${'L'.padStart(5)} ${'GapDays'.padStart(8)} ${'GapPts'.padStart(8)}  vs Baseline`);
  console.log('-'.repeat(90));
  for(const r of results){
    const diff=r.totalPts-base;
    const vs=diff>0?`▲+${Math.round(diff)}pts ₹+${Math.round(diff)*RS}`:diff<0?`▼${Math.round(diff)}pts ₹${Math.round(diff)*RS}`:'(baseline)';
    console.log(`${r.name.padEnd(28)} ${String(Math.round(r.totalPts)).padStart(9)} ${('₹'+(Math.round(r.totalPts)*RS)).padStart(11)} ${String(r.wins).padStart(5)} ${String(r.losses).padStart(5)} ${String(r.gapDays).padStart(8)} ${String(Math.round(r.gapPts)).padStart(8)}  ${vs}`);
  }

  // Top 20 move days — all variants
  allDays.sort((a,b)=>b.netMove-a.netMove);
  const top20=allDays.slice(0,20);
  console.log('\n'+'='.repeat(120));
  console.log('TOP 20 MOVE DAYS — % of Net Move Captured per Variant');
  console.log('='.repeat(120));
  const hdr=variants.map(v=>v.name.slice(0,7).padStart(8)).join('');
  console.log(`${'Date'.padEnd(12)} ${'Dir'.padEnd(4)} ${'NetMv'.padStart(6)} ${hdr}`);
  console.log('-'.repeat(120));
  for(const d of top20){
    const sims=variants.map(v=>simulate(d.cs,v));
    const pts=sims.map(s=>s?Math.round(s.total):0);
    const best=Math.max(...pts);
    const caps=pts.map((p,i)=>{
      const pct=(p/d.netMove*100).toFixed(0)+'%';
      return (pts[i]===best&&best>pts[0]?'★':' ')+pct.padStart(7);
    }).join('');
    console.log(`${d.date.padEnd(12)} ${d.dir.padEnd(4)} ${Math.round(d.netMove).toString().padStart(6)} ${caps}`);
  }

  // Detail: Election crash day
  const elec=allDays.find(d=>d.date==='2024-06-04');
  if(elec){
    console.log('\n'+'='.repeat(85));
    console.log(`DEEP DIVE: 2024-06-04 ELECTION CRASH — DN ${Math.round(elec.netMove)}pts`);
    console.log(`First candle: body=${Math.round(Math.abs(elec.cs[0].close-elec.cs[0].open))}pts (${elec.cs[0].close>=elec.cs[0].open?'BUL':'BEA'})`);
    console.log('='.repeat(85));
    for(const v of variants){
      const s=simulate(elec.cs,v);
      if(!s) continue;
      const pct=(s.total/elec.netMove*100).toFixed(1);
      const src=s.isGapDay?`GAP(SL${s.slT1})`:`C1C2(SL${s.slT1})`;
      const sl=s.slHit?'SL hit':'no SL';
      console.log(`  ${v.name.padEnd(28)} ${src.padEnd(14)} ${sl.padEnd(8)} ${String(Math.round(s.total)).padStart(6)}pts  ₹${Math.round(s.total)*RS}  (${pct}%)`);
    }
  }
  const next=allDays.find(d=>d.date==='2024-06-05');
  if(next){
    console.log('\n'+'='.repeat(85));
    console.log(`DEEP DIVE: 2024-06-05 ELECTION RECOVERY — UP ${Math.round(next.netMove)}pts`);
    console.log(`First candle: body=${Math.round(Math.abs(next.cs[0].close-next.cs[0].open))}pts (${next.cs[0].close>=next.cs[0].open?'BUL':'BEA'})`);
    console.log('='.repeat(85));
    for(const v of variants){
      const s=simulate(next.cs,v);
      if(!s) continue;
      const pct=(s.total/next.netMove*100).toFixed(1);
      const src=s.isGapDay?`GAP(SL${s.slT1})`:`C1C2(SL${s.slT1})`;
      const sl=s.slHit?'SL hit':'no SL';
      console.log(`  ${v.name.padEnd(28)} ${src.padEnd(14)} ${sl.padEnd(8)} ${String(Math.round(s.total)).padStart(6)}pts  ₹${Math.round(s.total)*RS}  (${pct}%)`);
    }
  }
}
main().catch(e=>console.error('FATAL:',e.message));

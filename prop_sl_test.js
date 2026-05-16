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

function findC1C2(cs) {
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
      if (sig==='CE'&&cs[j].close>bl) return {sig,px:cs[j].close,idx:j,source:'C1C2'};
      if (sig==='PE'&&cs[j].close<bl) return {sig,px:cs[j].close,idx:j,source:'C1C2'};
    }
  }
  return null;
}

// Core simulate
// gapThresh: body size to trigger gap rule
// slMode: 'fixed50' | 'propFactor' | 'noSL'
// propFactor: if slMode='propFactor', SL = body0 * propFactor
// reMode: 'normal' (reverse) | 'sameDir' (re-enter in gap direction) | 'none'
function simulate(cs, opts) {
  const { gapThresh=0, slMode='fixed50', propFactor=0.25, reMode='normal' } = opts;
  if (!cs||cs.length<3) return null;
  const dayOpen = cs[0].open;
  const body0   = Math.abs(cs[0].close-cs[0].open);
  const isGap   = gapThresh>0 && body0>=gapThresh;

  let entry = null;
  if (isGap) {
    const sig = cs[0].close>=cs[0].open ? 'CE' : 'PE';
    entry = { sig, px: cs[0].close, idx:0, source:'GAP' };
  } else {
    entry = findC1C2(cs);
  }
  if (!entry) return null;

  // Determine T1 SL size
  let slT1;
  if (slMode==='noSL')          slT1 = 999999;
  else if (slMode==='propFactor') slT1 = Math.max(50, Math.round(body0 * propFactor));
  else                            slT1 = 50;

  // Scan for T1 SL or EOD
  let slHit=false, sIdx=null, sPx=null;
  for (let i=entry.idx+1;i<cs.length;i++){
    if (mv(entry.sig,entry.px,cs[i].close)<=-slT1){
      slHit=true; sIdx=i; sPx=cs[i].close; break;
    }
  }

  const t1pts = slHit ? -slT1 : mv(entry.sig,entry.px,cs[cs.length-1].close);
  let repts=0;

  if (slHit) {
    let reDir, reSL=100;
    if (isGap && reMode==='sameDir') {
      // Re-enter in the ORIGINAL gap direction (not reversal)
      reDir = entry.sig;
      reSL  = slT1; // same SL as T1 for the re-entry
    } else {
      // Normal: opposite direction, VMT filter applies
      const rs = entry.sig==='CE'?'PE':'CE';
      const mar = rs==='CE' ? sPx-dayOpen : -(sPx-dayOpen);
      reDir = mar<0 ? rs : null;
    }
    if (reDir) {
      repts = mv(reDir, sPx, cs[cs.length-1].close);
      for (let i=sIdx+1;i<cs.length;i++){
        if (mv(reDir,sPx,cs[i].close)<=-reSL){repts=-reSL;break;}
      }
    }
  }

  return { entry, isGap, slT1, slHit, sPx, t1pts, repts, total:t1pts+repts };
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
      allDays.push({date,cs,netMove,dayRange,dir:dayClose>=cs[0].open?'UP':'DN',
        body0:Math.abs(cs[0].close-cs[0].open)});
    }
    console.log(`${Object.keys(days).length} days`);
  }
  const RS=15;

  const variants = [
    { label:'A. Current (no gap rule)',           gapThresh:0,   slMode:'fixed50',   propFactor:0,    reMode:'normal'  },
    { label:'B. Gap300 SL50 (prev best)',          gapThresh:300, slMode:'fixed50',   propFactor:0,    reMode:'normal'  },
    // Proportional SL — survive the morning bounce
    { label:'C. Gap300 PropSL×0.20',              gapThresh:300, slMode:'propFactor', propFactor:0.20, reMode:'normal'  },
    { label:'D. Gap300 PropSL×0.25',              gapThresh:300, slMode:'propFactor', propFactor:0.25, reMode:'normal'  },
    { label:'E. Gap300 PropSL×0.30',              gapThresh:300, slMode:'propFactor', propFactor:0.30, reMode:'normal'  },
    // Same-direction re-entry after SL on gap day
    { label:'F. Gap300 SL50 SameReDir',           gapThresh:300, slMode:'fixed50',   propFactor:0,    reMode:'sameDir' },
    { label:'G. Gap300 PropSL×0.25 SameReDir',    gapThresh:300, slMode:'propFactor', propFactor:0.25, reMode:'sameDir' },
    // No SL on gap days (hold blind)
    { label:'H. Gap300 NoSL (hold blind)',         gapThresh:300, slMode:'noSL',      propFactor:0,    reMode:'none'    },
    { label:'I. Gap500 PropSL×0.25',              gapThresh:500, slMode:'propFactor', propFactor:0.25, reMode:'normal'  },
    { label:'J. Gap500 NoSL (hold blind)',         gapThresh:500, slMode:'noSL',      propFactor:0,    reMode:'none'    },
  ];

  const results = variants.map(v=>({...v, total:0, days:0, wins:0, losses:0, gapDays:0, gapTotal:0}));
  for(const d of allDays){
    for(let vi=0;vi<variants.length;vi++){
      const s=simulate(d.cs,variants[vi]);
      if(!s) continue;
      const r=results[vi];
      r.days++; r.total+=s.total;
      if(s.total>0) r.wins++; else if(s.total<0) r.losses++;
      if(s.isGap){ r.gapDays++; r.gapTotal+=s.total; }
    }
  }

  const base=results[0].total;
  console.log('\n'+'='.repeat(95));
  console.log('5-YEAR P&L — Proportional SL + Same-Direction Re-Entry (2021–2025)');
  console.log('='.repeat(95));
  console.log(`${'Variant'.padEnd(35)} ${'TotalPts'.padStart(9)} ${'₹ P&L'.padStart(12)} ${'W'.padStart(5)} ${'L'.padStart(5)} ${'GapDays'.padStart(8)} ${'GapPts'.padStart(8)}  vs A`);
  console.log('-'.repeat(95));
  for(const r of results){
    const diff=r.total-base;
    const vs=diff>0?`▲+${Math.round(diff)}pts ₹+${Math.round(diff)*RS}`:diff<0?`▼${Math.round(diff)}pts ₹${Math.round(diff)*RS}`:'baseline';
    console.log(`${r.label.padEnd(35)} ${String(Math.round(r.total)).padStart(9)} ${('₹'+(Math.round(r.total)*RS)).padStart(12)} ${String(r.wins).padStart(5)} ${String(r.losses).padStart(5)} ${String(r.gapDays).padStart(8)} ${String(Math.round(r.gapTotal)).padStart(8)}  ${vs}`);
  }

  // Top 10 biggest move days
  allDays.sort((a,b)=>b.netMove-a.netMove);
  const top10=allDays.slice(0,10);
  console.log('\n'+'='.repeat(115));
  console.log('TOP 10 MOVE DAYS — % Captured by Variant');
  console.log('='.repeat(115));
  const hdr=variants.map(v=>v.label.slice(0,6).padStart(7)).join(' ');
  console.log(`${'Date'.padEnd(12)} ${'Dir'.padEnd(4)} ${'NetMv'.padStart(6)} ${'Body0'.padStart(6)}  ${hdr}`);
  console.log('-'.repeat(115));
  for(const d of top10){
    const sims=variants.map(v=>simulate(d.cs,v));
    const pts=sims.map(s=>s?Math.round(s.total):0);
    const best=Math.max(...pts);
    const cols=pts.map((p,i)=>{
      const pct=Math.round(p/d.netMove*100)+'%';
      const star=p===best&&p>pts[0]?'★':' ';
      return (star+pct).padStart(7);
    }).join(' ');
    console.log(`${d.date.padEnd(12)} ${d.dir.padEnd(4)} ${Math.round(d.netMove).toString().padStart(6)} ${Math.round(d.body0).toString().padStart(6)}  ${cols}`);
  }

  // ─── DEEP DIVE: June 4 2024 — show exactly where each variant exits ───
  const elec=allDays.find(d=>d.date==='2024-06-04');
  if(elec){
    console.log('\n'+'='.repeat(100));
    console.log(`DEEP DIVE: 2024-06-04 — ELECTION CRASH  DN ${Math.round(elec.netMove)}pts  |  First candle: ${Math.round(elec.body0)}pt BEAR`);
    console.log(`Theoretical max from 9:15 close: ${Math.round(elec.cs[0].close)} → EOD ${Math.round(elec.cs[elec.cs.length-1].close)} = ${Math.round(elec.cs[0].close-elec.cs[elec.cs.length-1].close)}pts (${Math.round((elec.cs[0].close-elec.cs[elec.cs.length-1].close)/elec.netMove*100)}% of net move)`);
    console.log('='.repeat(100));
    console.log(`Time    Close     Dir    Adverse_from_9:15close   ${variants.slice(0,6).map(v=>v.label.slice(0,8).padStart(10)).join(' ')}`);
    console.log('-'.repeat(100));
    const firstClose=elec.cs[0].close; // 49,181
    const sims=variants.slice(0,6).map(v=>simulate(elec.cs,v));

    // For each candle, show running P&L for PE from firstClose
    for(let i=0;i<elec.cs.length;i++){
      const c=elec.cs[i];
      const dir=c.close>=c.open?'▲':'▼';
      const adv=i>0?Math.round(c.close-firstClose):0; // adverse for PE = close > firstClose
      const advStr=i===0?'(ENTRY)':adv>=0?`+${adv} vs entry`:String(adv)+' vs entry';
      const cols=sims.map((s,vi)=>{
        if(!s||!s.entry) return '         -';
        if(i<s.entry.idx) return '         -';
        if(i===s.entry.idx){
          const src=s.entry.source==='GAP'?'GAP':'C1C2';
          return `  [${src}@${Math.round(s.entry.px)}]`.padStart(10);
        }
        // after entry
        const pts=mv(s.entry.sig,s.entry.px,c.close);
        const slHitHere=s.slHit&&i===s.sIdx;
        const inRe=s.slHit&&i>s.sIdx;
        if(slHitHere) return `[SL${Math.round(s.t1pts)}]`.padStart(10);
        if(!s.slHit||i<=s.sIdx) return ((pts>=0?'+':'')+Math.round(pts)+'pts').padStart(10);
        if(inRe){
          // re-entry direction
          const reDir=variants[vi].reMode==='sameDir'?s.entry.sig:(s.entry.sig==='CE'?'PE':'CE');
          const rp=mv(reDir,s.sPx,c.close);
          return ((rp>=0?'+':'')+Math.round(rp)+'r').padStart(10);
        }
        return ''.padStart(10);
      }).join(' ');
      console.log(`${c.ts}  ${String(c.close).padStart(8)}  ${dir}  ${advStr.padEnd(22)} ${cols}`);
    }
    console.log('');
    console.log('SUMMARY:');
    for(let vi=0;vi<6;vi++){
      const s=sims[vi];
      if(!s) continue;
      const pct=(s.total/elec.netMove*100).toFixed(1);
      const slInfo=s.slHit?`SL${s.slT1} hit @${Math.round(s.sPx||0)}`:'no SL hit';
      console.log(`  ${variants[vi].label.padEnd(35)} ${slInfo.padEnd(20)} TOTAL: ${String(Math.round(s.total)).padStart(6)}pts ₹${Math.round(s.total)*RS}  (${pct}% of ${Math.round(elec.netMove)}pt move)`);
    }
    console.log(`\n  THEORETICAL MAX (9:15 close→EOD, no SL): ${Math.round(firstClose-elec.cs[elec.cs.length-1].close)}pts = ₹${Math.round(firstClose-elec.cs[elec.cs.length-1].close)*RS} (${Math.round((firstClose-elec.cs[elec.cs.length-1].close)/elec.netMove*100)}%)`);
    console.log(`  PERFECT MAX  (9:15 open→12:15 peak+EOD): theoretically ~3000+pts but requires peak-exit logic`);
  }
}
main().catch(e=>console.error('FATAL:',e.message));

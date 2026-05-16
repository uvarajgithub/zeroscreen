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
    const ca=cs[i],cb=cs[i+1]; let sig=null,bl=null;
    const bullA=ca.close>=ca.open, bullB=cb.close>=cb.open;
    const bodyA=Math.abs(ca.close-ca.open), bodyB=Math.abs(cb.close-cb.open);
    const bhA=Math.max(ca.open,ca.close), blA=Math.min(ca.open,ca.close);
    const bhB=Math.max(cb.open,cb.close), blB=Math.min(cb.open,cb.close);
    if (bullA===bullB){ sig=bullA?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (bodyB>bodyA){ sig=bullB?'CE':'PE'; bl=sig==='CE'?Math.max(bhA,bhB):Math.min(blA,blB); }
    else continue;
    for (let j=i+2;j<cs.length;j++){
      if (sig==='CE'&&cs[j].close>bl) return {sig,px:cs[j].close,idx:j,pairTime:cs[i].ts};
      if (sig==='PE'&&cs[j].close<bl) return {sig,px:cs[j].close,idx:j,pairTime:cs[i].ts};
    }
  }
  return null;
}

// Full simulate — returns rich detail for analysis
function simulateFull(cs) {
  if (!cs||cs.length<3) return null;
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  const dayHigh=Math.max(...cs.map(c=>c.high)), dayLow=Math.min(...cs.map(c=>c.low));
  const dayRange=dayHigh-dayLow;
  const entry=findC1C2(cs);
  if (!entry) return null;

  let slHit=false, sIdx=null, sPx=null;
  for (let i=entry.idx+1;i<cs.length;i++){
    if (mv(entry.sig,entry.px,cs[i].close)<=-50){ slHit=true; sIdx=i; sPx=cs[i].close; break; }
  }
  if (!slHit) return null; // no SL hit — not in 288 days

  const rs=entry.sig==='CE'?'PE':'CE';
  const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
  if (mar>=0) return null; // VMT filter blocked re-entry — not in 288 days

  // Re-entry
  let repts=mv(rs,sPx,last);
  for (let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-100){repts=-100;break;}
  if (repts>-100) return null; // re-entry did NOT hit SL — not in 288 days

  // === Now classify this day — collect features ===
  const slTime=cs[sIdx].ts;
  const slIdx=sIdx;
  const entryTime=cs[entry.idx].ts;
  const slTimeNum=parseInt(slTime.replace(':',''));
  const entryTimeNum=parseInt(entryTime.replace(':',''));

  // Candles between entry and SL
  const candlesToSL=sIdx-entry.idx;

  // At SL time: where is price vs dayOpen
  const marAtSL=mar; // already computed above (negative = VMT filter said OK)
  const marAtSLPct=mar/dayRange*100;

  // Range at SL time vs total range
  const rangeToSL=Math.max(...cs.slice(0,sIdx+1).map(c=>c.high))-Math.min(...cs.slice(0,sIdx+1).map(c=>c.low));

  // Candles after SL — how many opposing candles before re-entry would fail
  // How choppy is the market BEFORE entry
  let flipsBeforeEntry=0;
  for(let i=1;i<=entry.idx;i++) if((cs[i].close>=cs[i].open)!==(cs[i-1].close>=cs[i-1].open)) flipsBeforeEntry++;
  const flipRatioEarly = entry.idx>0 ? flipsBeforeEntry/entry.idx : 0;

  // Body size of entry candle pair vs day range
  const body0=Math.abs(cs[0].close-cs[0].open);
  const body1=Math.abs(cs[1].close-cs[1].open);

  // At SL: was market trending or choppy post-SL?
  let postSLFlips=0;
  for(let i=sIdx+1;i<cs.length;i++) if((cs[i].close>=cs[i].open)!==(cs[i-1].close>=cs[i-1].open)) postSLFlips++;
  const postSLFlipRatio=cs.length-sIdx>1?postSLFlips/(cs.length-sIdx-1):0;

  // At SL: how far did price move away from SL price after SL
  let maxAdverse=0; // max adverse move against re-entry direction
  for(let i=sIdx+1;i<cs.length;i++) {
    const reAdverse = mv(rs,sPx,cs[i].close); // if positive = re-entry was right at this point
    // max adverse = how far it went wrong
    if(mv(rs,sPx,cs[i].close)<maxAdverse) maxAdverse=mv(rs,sPx,cs[i].close);
  }

  // VIX proxy: day range / day open * 100
  const vixProxy=dayRange/dayOpen*100;

  return {
    slTime, entryTime, slTimeNum, entryTimeNum,
    candlesToSL, marAtSL: Math.round(marAtSL), marAtSLPct: Math.round(marAtSLPct),
    rangeToSL: Math.round(rangeToSL), dayRange: Math.round(dayRange),
    rangeUsedPct: Math.round(rangeToSL/dayRange*100),
    flipRatioEarly: Math.round(flipRatioEarly*100)/100,
    postSLFlipRatio: Math.round(postSLFlipRatio*100)/100,
    body0: Math.round(body0), body1: Math.round(body1),
    vixProxy: Math.round(vixProxy*10)/10,
    sig: entry.sig, rs,
    entryIdx: entry.idx, slIdx,
    dayOpen: Math.round(dayOpen),
  };
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

// ─── Re-simulate with a given re-entry filter ───
function simWithFilter(cs, filterFn) {
  if (!cs||cs.length<3) return null;
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  const entry=findC1C2(cs);
  if (!entry) return null;

  let slHit=false, sIdx=null, sPx=null;
  for (let i=entry.idx+1;i<cs.length;i++){
    if (mv(entry.sig,entry.px,cs[i].close)<=-50){ slHit=true; sIdx=i; sPx=cs[i].close; break; }
  }

  let t1pts=slHit?-50:mv(entry.sig,entry.px,last);
  let repts=0;

  if (slHit){
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    // VMT filter must pass first
    if (mar<0) {
      // Apply additional filter
      const takeRe = filterFn(cs, entry, sIdx, sPx, rs, dayOpen);
      if (takeRe) {
        repts=mv(rs,sPx,last);
        for(let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-100){repts=-100;break;}
      }
    }
  }
  return Math.round(t1pts+repts);
}

async function main(){
  const YEARS=[2021,2022,2023,2024,2025];
  const allDays=[];
  for(const yr of YEARS){
    process.stdout.write(`Fetching ${yr}... `);
    const days=await runYear(yr);
    for(const [date,cs] of Object.entries(days).sort()){
      if(cs.length<10) continue;
      allDays.push({date,cs});
    }
    console.log(`${Object.keys(days).length} days`);
  }

  // ─── Collect all 288 days ───
  const bad288=[];
  for(const d of allDays){
    const f=simulateFull(d.cs);
    if(f) bad288.push({date:d.date,...f});
  }

  console.log(`\nTotal -150pt days found: ${bad288.length}\n`);

  // ─── Pattern Analysis ───
  const RS=15;

  // Distribution: SL hit time
  const slTimes={};
  for(const d of bad288){
    slTimes[d.slTime]=(slTimes[d.slTime]||0)+1;
  }
  console.log('── SL HIT TIME DISTRIBUTION ─────────────────────────────────');
  for(const [t,c] of Object.entries(slTimes).sort()) console.log(`  ${t} : ${'█'.repeat(Math.round(c/2))} ${c} days`);

  // Distribution: candles to SL
  const cToSL={};
  for(const d of bad288) cToSL[d.candlesToSL]=(cToSL[d.candlesToSL]||0)+1;
  console.log('\n── CANDLES FROM ENTRY TO SL ──────────────────────────────────');
  for(const [n,c] of Object.entries(cToSL).sort((a,b)=>+a[0]-+b[0])) console.log(`  ${String(n).padStart(2)} candles: ${'█'.repeat(Math.round(c/2))} ${c} days`);

  // Distribution: day range
  const ranges=bad288.map(d=>d.dayRange);
  const avgRange=Math.round(ranges.reduce((a,b)=>a+b,0)/ranges.length);
  const medRange=ranges.sort((a,b)=>a-b)[Math.floor(ranges.length/2)];
  console.log(`\n── DAY RANGE of -150pt days ──────────────────────────────────`);
  console.log(`  Avg range: ${avgRange}pts  |  Median: ${medRange}pts`);
  console.log(`  <300pts: ${bad288.filter(d=>d.dayRange<300).length} days`);
  console.log(`  300-500: ${bad288.filter(d=>d.dayRange>=300&&d.dayRange<500).length} days`);
  console.log(`  500-700: ${bad288.filter(d=>d.dayRange>=500&&d.dayRange<700).length} days`);
  console.log(`  >700pts: ${bad288.filter(d=>d.dayRange>=700).length} days`);

  // Distribution: post-SL flip ratio (choppy after SL = re-entry will fail)
  console.log(`\n── POST-SL CHOPPINESS (flip ratio after SL hit) ─────────────`);
  console.log(`  <0.40 (trending): ${bad288.filter(d=>d.postSLFlipRatio<0.40).length} days`);
  console.log(`  0.40-0.55:        ${bad288.filter(d=>d.postSLFlipRatio>=0.40&&d.postSLFlipRatio<0.55).length} days`);
  console.log(`  0.55-0.65:        ${bad288.filter(d=>d.postSLFlipRatio>=0.55&&d.postSLFlipRatio<0.65).length} days`);
  console.log(`  >0.65 (choppy):   ${bad288.filter(d=>d.postSLFlipRatio>=0.65).length} days`);

  // Day range <400 → always choppy
  console.log(`\n── RANGE USED % at SL time ───────────────────────────────────`);
  console.log(`  <30% used: ${bad288.filter(d=>d.rangeUsedPct<30).length} days  (SL hit early, range barely moved)`);
  console.log(`  30-50%:    ${bad288.filter(d=>d.rangeUsedPct>=30&&d.rangeUsedPct<50).length} days`);
  console.log(`  50-70%:    ${bad288.filter(d=>d.rangeUsedPct>=50&&d.rangeUsedPct<70).length} days`);
  console.log(`  >70%:      ${bad288.filter(d=>d.rangeUsedPct>=70).length} days`);

  // SL time distribution by time of day
  const earlyBad=bad288.filter(d=>d.slTimeNum<=1030).length;
  const midBad=bad288.filter(d=>d.slTimeNum>1030&&d.slTimeNum<=1230).length;
  const lateBad=bad288.filter(d=>d.slTimeNum>1230).length;
  console.log(`\n── SL HIT TIME BUCKET ────────────────────────────────────────`);
  console.log(`  Early (09:15-10:30): ${earlyBad} days`);
  console.log(`  Mid   (10:30-12:30): ${midBad} days`);
  console.log(`  Late  (12:30+):      ${lateBad} days`);

  // ─── NOW TEST FILTERS ───────────────────────────────────────────────
  console.log('\n'+'='.repeat(90));
  console.log('FILTER TESTS — How many of the 288 -150pt days can each filter avoid?');
  console.log('='.repeat(90));

  const filters = [
    { name:'A. Current (no extra filter)',         fn:()=>true },
    { name:'B. Skip if SL within 3 candles',       fn:(cs,e,sIdx)=> sIdx-e.idx > 3 },
    { name:'C. Skip if SL within 2 candles',       fn:(cs,e,sIdx)=> sIdx-e.idx > 2 },
    { name:'D. Skip if SL hit by 10:30',           fn:(cs,e,sIdx)=> parseInt(cs[sIdx].ts.replace(':','')) > 1030 },
    { name:'E. Skip if SL hit by 11:00',           fn:(cs,e,sIdx)=> parseInt(cs[sIdx].ts.replace(':','')) > 1100 },
    { name:'F. Skip if dayRange < 400',            fn:(cs)=>{ const h=Math.max(...cs.map(c=>c.high)),l=Math.min(...cs.map(c=>c.low)); return h-l>=400; }},
    { name:'G. Skip if dayRange < 500',            fn:(cs)=>{ const h=Math.max(...cs.map(c=>c.high)),l=Math.min(...cs.map(c=>c.low)); return h-l>=500; }},
    { name:'H. Skip if postSL flipRatio > 0.60',   fn:(cs,e,sIdx,sPx,rs)=>{
        let flips=0;
        for(let i=sIdx+2;i<Math.min(sIdx+6,cs.length);i++) if((cs[i].close>=cs[i].open)!==(cs[i-1].close>=cs[i-1].open)) flips++;
        return flips/Math.min(5,cs.length-sIdx-1)<0.60;
    }},
    { name:'I. Skip if next 2 candles choppy',     fn:(cs,e,sIdx,sPx,rs)=>{
        if(sIdx+2>=cs.length) return false;
        const c1=cs[sIdx+1],c2=cs[sIdx+2];
        // next 2 candles are alternating direction = choppy
        const b1=c1.close>=c1.open, b2=c2.close>=c2.open;
        return b1===b2; // same direction = OK to re-enter
    }},
    { name:'J. Skip if SL <2c AND range<500',      fn:(cs,e,sIdx)=>{
        const h=Math.max(...cs.map(c=>c.high)),l=Math.min(...cs.map(c=>c.low));
        const range=h-l;
        const fastSL=sIdx-e.idx<=2;
        return !(fastSL&&range<500);
    }},
    { name:'K. Skip re-entry always (SL only)',    fn:()=>false },
  ];

  const baseTotal=allDays.reduce((sum,d)=>{
    const s=simWithFilter(d.cs,()=>true);
    return sum+(s||0);
  },0);

  console.log(`${'Filter'.padEnd(38)} ${'Avoided'.padStart(8)} ${'Still-150'.padStart(11)} ${'TotalPts'.padStart(10)} ${'₹P&L'.padStart(11)} ${'vs Current'}`);
  console.log('-'.repeat(90));

  for(const flt of filters){
    let avoided=0, stillBad=0, total=0;
    for(const d of allDays){
      const s=simWithFilter(d.cs,flt.fn);
      total+=(s||0);
    }
    // count avoided vs stillBad on the 288 days
    for(const d of bad288){
      const fullD=allDays.find(x=>x.date===d.date);
      if(!fullD) continue;
      const s=simWithFilter(fullD.cs,flt.fn);
      if(s===-150) stillBad++;
      else if(s===-50) avoided++; // blocked re-entry, just T1 SL
    }
    const diff=total-baseTotal;
    const vs=diff>=0?`▲+${diff}pts ₹+${diff*RS}`:`▼${diff}pts ₹${diff*RS}`;
    console.log(`${flt.name.padEnd(38)} ${String(avoided).padStart(8)} ${String(stillBad).padStart(11)} ${String(total).padStart(10)} ${('₹'+(total*RS)).padStart(11)}  ${vs}`);
  }

  // ─── Best days saved by filter E (SL by 11:00) ───
  console.log('\n── SAMPLE: days where "Skip if SL by 11:00" helps ─────────────────────');
  for(const d of bad288.filter(d=>d.slTimeNum<=1100).slice(0,15)){
    console.log(`  ${d.date}  SL@${d.slTime}  entry@${d.entryTime}  candlesToSL:${d.candlesToSL}  range:${d.dayRange}pts  postFlip:${d.postSLFlipRatio}`);
  }
}
main().catch(e=>console.error('FATAL:',e.message));

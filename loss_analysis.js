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
      if (sig==='CE'&&cs[j].close>bl) return {sig,px:cs[j].close,idx:j};
      if (sig==='PE'&&cs[j].close<bl) return {sig,px:cs[j].close,idx:j};
    }
  }
  return null;
}
function candleBody(c){ return Math.abs(c.close-c.open); }
function isOpposing(sig,c){ return sig==='CE'?c.close<c.open:c.close>c.open; }

function simulate(cs, opts={}) {
  const { slT1=50, profitTrigger=9999, revBodyAbs=0, revBodyPct=0, consec=0 } = opts;
  if (!cs||cs.length<3) return null;
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  const entry=findC1C2(cs);
  if (!entry) return null;

  let slHit=false, sIdx=null, sPx=null;
  let peak=0, consecCount=0;
  let exitPts=null, exitReason='EOD';

  for (let i=entry.idx+1;i<cs.length;i++) {
    const c=cs[i];
    const pts=mv(entry.sig,entry.px,c.close);
    if (pts>peak){ peak=pts; consecCount=0; }
    if (pts<=-slT1){ slHit=true; sIdx=i; sPx=c.close; exitPts=-slT1; exitReason='SL'; break; }
    if (peak>=profitTrigger) {
      const opp=isOpposing(entry.sig,c);
      const body=candleBody(c);
      if (revBodyAbs>0&&opp&&body>=revBodyAbs&&pts>0){ exitPts=pts; exitReason='REV_ABS'; break; }
      if (revBodyPct>0&&opp&&body>=peak*revBodyPct&&pts>0){ exitPts=pts; exitReason='REV_PCT'; break; }
      if (consec>0){ if(opp)consecCount++;else consecCount=0; if(consecCount>=consec&&pts>0){exitPts=pts;exitReason='CONSEC';break;} }
    }
  }

  let t1pts = exitPts!==null ? exitPts : mv(entry.sig,entry.px,last);
  let repts=0;
  if (slHit){
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    if (mar<0){
      repts=mv(rs,sPx,last);
      for(let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-100){repts=-100;break;}
    }
  }
  return { total:Math.round(t1pts+repts), t1pts:Math.round(t1pts), repts:Math.round(repts), slHit, exitReason };
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
      allDays.push({date,cs});
    }
    console.log(`${Object.keys(days).length} days`);
  }

  const RS=15;
  const variants=[
    { name:'A. Current EOD (SL50)',         slT1:50, profitTrigger:9999, revBodyAbs:0,   revBodyPct:0,    consec:0 },
    { name:'B. Rev candle >300pts',          slT1:50, profitTrigger:200,  revBodyAbs:300, revBodyPct:0,    consec:0 },
    { name:'C. Rev candle >400pts',          slT1:50, profitTrigger:200,  revBodyAbs:400, revBodyPct:0,    consec:0 },
    { name:'D. Rev candle >500pts',          slT1:50, profitTrigger:200,  revBodyAbs:500, revBodyPct:0,    consec:0 },
    { name:'E. Rev 30% peak',               slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0.30, consec:0 },
    { name:'F. Rev 40% peak',               slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0.40, consec:0 },
    { name:'G. Rev 50% peak',               slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0.50, consec:0 },
    { name:'H. Rev 40%pk trig500',           slT1:50, profitTrigger:500,  revBodyAbs:0,   revBodyPct:0.40, consec:0 },
    { name:'I. 3consec trig200',             slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0,    consec:3 },
  ];

  // Accumulators per variant
  const stats = variants.map(()=>({
    totalPts:0, totalLossPts:0, totalWinPts:0,
    lDays:0, wDays:0,
    worst:0, worstDate:'',
    maxDD:0, runDD:0, runPeak:0,
    consec:0, maxConsecLoss:0,
    runDailyPnl:0,
    // track all day results for drawdown
    curve:[],
  }));

  for(const d of allDays){
    for(let vi=0;vi<variants.length;vi++){
      const s=simulate(d.cs,variants[vi]);
      const pts=s?s.total:0;
      const r=stats[vi];
      r.totalPts+=pts;
      r.curve.push({date:d.date,pts});
      if(pts<0){
        r.totalLossPts+=pts;
        r.lDays++;
        r.consec++;
        if(r.consec>r.maxConsecLoss) r.maxConsecLoss=r.consec;
        if(pts<r.worst){r.worst=pts;r.worstDate=d.date;}
      } else {
        r.totalWinPts+=pts;
        r.wDays++;
        r.consec=0;
      }
    }
  }

  // Compute max drawdown from equity curve
  for(let vi=0;vi<variants.length;vi++){
    const r=stats[vi];
    let peak=0, equity=0, maxDD=0;
    for(const {pts} of r.curve){
      equity+=pts;
      if(equity>peak) peak=equity;
      const dd=peak-equity;
      if(dd>maxDD) maxDD=dd;
    }
    r.maxDD=maxDD;
  }

  console.log('\n'+'='.repeat(115));
  console.log('LOSS ANALYSIS — 5 Years (2021–2025) | Which variant gives LEAST LOSS?');
  console.log('='.repeat(115));
  console.log(`${'Variant'.padEnd(28)} ${'Net₹'.padStart(11)} ${'TotalLoss₹'.padStart(11)} ${'TotalWin₹'.padStart(11)} ${'LossDays'.padStart(9)} ${'WinDays'.padStart(8)} ${'WorstDay'.padStart(9)} ${'WorstDate'.padStart(11)} ${'MaxDD₹'.padStart(9)} ${'ConL'.padStart(5)}`);
  console.log('-'.repeat(115));

  const baseStats=stats[0];
  for(let vi=0;vi<variants.length;vi++){
    const r=stats[vi], v=variants[vi];
    const lossImprove=r.totalLossPts-baseStats.totalLossPts; // positive = less loss
    const lossTag=lossImprove>0?`(save ₹${lossImprove*RS})`:lossImprove<0?`(extra ₹${Math.abs(lossImprove)*RS})`:'(same)';
    console.log(`${v.name.padEnd(28)} ${('₹'+(r.totalPts*RS)).padStart(11)} ${('₹'+(r.totalLossPts*RS)).padStart(11)} ${('₹'+(r.totalWinPts*RS)).padStart(11)} ${String(r.lDays).padStart(9)} ${String(r.wDays).padStart(8)} ${(r.worst+'pts').padStart(9)} ${r.worstDate.padStart(11)} ${('₹'+r.maxDD*RS).padStart(9)} ${String(r.maxConsecLoss).padStart(5)}  ${lossTag}`);
  }

  // ─── Sort by total loss (ascending = least loss) ───
  const sorted=[...stats.map((r,i)=>({...r,name:variants[i].name}))].sort((a,b)=>a.totalLossPts-b.totalLossPts);
  console.log('\n── RANKED BY LEAST TOTAL LOSS ──────────────────────────────────────────────────────');
  console.log(`${'Rank'.padEnd(5)} ${'Variant'.padEnd(28)} ${'TotalLoss₹'.padStart(11)} ${'LossDays'.padStart(9)} ${'Net₹'.padStart(11)}`);
  console.log('-'.repeat(70));
  for(let i=0;i<sorted.length;i++){
    const r=sorted[i];
    console.log(`  #${i+1}  ${r.name.padEnd(28)} ${('₹'+(r.totalLossPts*RS)).padStart(11)} ${String(r.lDays).padStart(9)} ${('₹'+(r.totalPts*RS)).padStart(11)}`);
  }

  // ─── Sorted by max drawdown ───
  const sortedDD=[...stats.map((r,i)=>({...r,name:variants[i].name}))].sort((a,b)=>a.maxDD-b.maxDD);
  console.log('\n── RANKED BY LOWEST MAX DRAWDOWN ────────────────────────────────────────────────────');
  console.log(`${'Rank'.padEnd(5)} ${'Variant'.padEnd(28)} ${'MaxDD₹'.padStart(10)} ${'Net₹'.padStart(11)}`);
  console.log('-'.repeat(60));
  for(let i=0;i<sortedDD.length;i++){
    const r=sortedDD[i];
    console.log(`  #${i+1}  ${r.name.padEnd(28)} ${('₹'+r.maxDD*RS).padStart(10)} ${('₹'+(r.totalPts*RS)).padStart(11)}`);
  }

  // ─── Sorted by fewest loss days ───
  const sortedLD=[...stats.map((r,i)=>({...r,name:variants[i].name}))].sort((a,b)=>a.lDays-b.lDays);
  console.log('\n── RANKED BY FEWEST LOSING DAYS ─────────────────────────────────────────────────────');
  console.log(`${'Rank'.padEnd(5)} ${'Variant'.padEnd(28)} ${'LossDays'.padStart(9)} ${'WinDays'.padStart(9)} ${'Net₹'.padStart(11)}`);
  console.log('-'.repeat(65));
  for(let i=0;i<sortedLD.length;i++){
    const r=sortedLD[i];
    console.log(`  #${i+1}  ${r.name.padEnd(28)} ${String(r.lDays).padStart(9)} ${String(r.wDays).padStart(9)} ${('₹'+(r.totalPts*RS)).padStart(11)}`);
  }

  // ─── Key insight: loss source breakdown ───
  console.log('\n── WHERE DO LOSSES COME FROM? (current strategy A) ─────────────────────────────────');
  let sl150=0,sl100=0,sl50=0,other=0;
  let sl150c=0,sl100c=0,sl50c=0,otherc=0;
  for(const d of allDays){
    const s=simulate(d.cs,variants[0]);
    if(!s||s.total>=0) continue;
    if(s.total===-150){sl150++;sl150c+=s.total;}
    else if(s.total===-100){sl100++;sl100c+=s.total;}
    else if(s.total===-50){sl50++;sl50c+=s.total;}
    else{other++;other+=s.total;}
  }
  console.log(`  T1 SL + re-entry SL (−150pts): ${sl150} days  ₹${sl150c*RS}  ← biggest loss category`);
  console.log(`  Re-entry SL only   (−100pts):  ${sl100} days  ₹${sl100c*RS}`);
  console.log(`  T1 SL only         (−50pts):   ${sl50} days  ₹${sl50c*RS}`);
  console.log(`  Other (partial):               ${other} days`);
  console.log(`\n  TOTAL loss days: ${sl150+sl100+sl50+other}`);
  console.log(`\n  KEY INSIGHT:`);
  console.log(`  → ${sl150} days with BOTH SLs hit (−150pts each) = ₹${sl150*150*RS} total loss`);
  console.log(`  → If we could stop re-entry on those ${sl150} days, we'd save ₹${sl150*100*RS}`);
  console.log(`  → That's the REAL lever to reduce loss — better re-entry filtering`);
}
main().catch(e=>console.error('FATAL:',e.message));

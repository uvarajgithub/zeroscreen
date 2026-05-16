'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');

const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const SL_T1 = 50, SL_RE = 100;

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

function enrich(c) {
  const [,o,h,l,cl]=c; const bull=cl>=o;
  return {open:o,high:h,low:l,close:cl,bull,body_high:Math.max(o,cl),body_low:Math.min(o,cl),body_size:Math.abs(cl-o)};
}

function rollingEntryScan(cs) {
  for (let i=0; i<cs.length-1; i++) {
    const ca=cs[i], cb=cs[i+1]; let sig=null, bl=null;
    if (ca.bull===cb.bull) { sig=ca.bull?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (cb.body_size>ca.body_size) { sig=cb.bull?'CE':'PE'; bl=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low); }
    else continue;
    for (let j=i+2; j<cs.length; j++) {
      if (sig==='CE' && cs[j].close>bl) return {sig,px:cs[j].close,idx:j};
      if (sig==='PE' && cs[j].close<bl) return {sig,px:cs[j].close,idx:j};
    }
  }
  return null;
}

// Classify day: TRENDING / REVERSAL / CHOPPY
function classifyDay(cs) {
  const open=cs[0].open, close=cs[cs.length-1].close;
  const high=Math.max(...cs.map(c=>c.high)), low=Math.min(...cs.map(c=>c.low));
  const range=high-low;
  if (range===0) return 'CHOPPY';
  const body=Math.abs(close-open);
  const bodyRatio=body/range;
  // Count candle direction flips
  let flips=0;
  for (let i=1; i<cs.length; i++) if (cs[i].bull !== cs[i-1].bull) flips++;
  const flipRatio=flips/(cs.length-1);

  if (bodyRatio > 0.45 && flipRatio < 0.50) return 'TRENDING';
  if (bodyRatio < 0.25 || flipRatio > 0.65) return 'CHOPPY';
  return 'REVERSAL';
}

function simulate(cs, alwaysRe) {
  if (cs.length < 4) return { pnlPts:0, noEntry:true };
  const entry = rollingEntryScan(cs);
  if (!entry) return { pnlPts:0, noEntry:true };
  const mv=(s,e,p)=>s==='CE'?p-e:e-p;
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  let slHit=false, sIdx=null, sPx=null, t1Pts=mv(entry.sig,entry.px,last);
  for (let i=entry.idx+1; i<cs.length; i++) {
    if (mv(entry.sig,entry.px,cs[i].close) <= -SL_T1) { slHit=true; sIdx=i; sPx=cs[i].close; t1Pts=-SL_T1; break; }
  }
  let rePts=0;
  if (slHit) {
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    if (alwaysRe || mar<0) {
      rePts=mv(rs,sPx,last);
      for (let i=sIdx+1; i<cs.length; i++) { if (mv(rs,sPx,cs[i].close)<=-SL_RE){rePts=-SL_RE;break;} }
    }
  }
  return { pnlPts:t1Pts+rePts, t1Pts, rePts, sig:entry.sig, slHit, entry };
}

async function main() {
  const resp = await kiteGet('/instruments/historical/260105/15minute?from=2026-03-01+09%3A15%3A00&to=2026-03-31+15%3A30%3A00&continuous=0&oi=0');
  if (resp.status !== 'success') { console.log('ERR:', JSON.stringify(resp).slice(0,300)); return; }

  const days = {};
  for (const c of resp.data.candles) {
    const day=c[0].slice(0,10);
    if (!days[day]) days[day]=[];
    days[day].push(c);
  }

  const sortedDays = Object.keys(days).sort();
  console.log('');
  console.log('MARCH 2026 — Day Classification & VMT vs AMINA');
  console.log('='.repeat(100));
  console.log('Date        | Type      | Entry | SL hit | VMT Pts  | VMT ₹      | AMINA Pts | AMINA ₹    | Better');
  console.log('-'.repeat(100));

  let vmtTotal=0, aminaTotal=0;
  const byType = { TRENDING:{vmt:0,amina:0,days:0,vmtW:0,aminaW:0}, REVERSAL:{vmt:0,amina:0,days:0,vmtW:0,aminaW:0}, CHOPPY:{vmt:0,amina:0,days:0,vmtW:0,aminaW:0} };

  for (const day of sortedDays) {
    const cs = days[day].map(enrich);
    const type = classifyDay(cs);
    const vmt = simulate(cs, false);
    const amina = simulate(cs, true);
    const vmtPts  = vmt.noEntry   ? 0 : Math.round(vmt.pnlPts);
    const aminaPts = amina.noEntry ? 0 : Math.round(amina.pnlPts);
    const vmtRs = vmtPts * 15, aminaRs = aminaPts * 15;
    vmtTotal += vmtPts; aminaTotal += aminaPts;
    const t = byType[type];
    t.vmt += vmtPts; t.amina += aminaPts; t.days++;
    if (vmtPts > 0) t.vmtW++; if (aminaPts > 0) t.aminaW++;

    const sig    = vmt.sig || (amina.sig) || 'NONE';
    const slStr  = vmt.slHit ? 'YES' : ' no ';
    const better = vmtPts > aminaPts ? 'VMT' : aminaPts > vmtPts ? 'AMINA' : 'TIE';
    const vPts   = (vmtPts>=0?'+':'')+vmtPts;
    const aPts   = (aminaPts>=0?'+':'')+aminaPts;
    const vRs    = (vmtRs>=0?'₹+':'₹')+Math.abs(vmtRs).toLocaleString('en-IN');
    const aRs    = (aminaRs>=0?'₹+':'₹')+Math.abs(aminaRs).toLocaleString('en-IN');
    console.log(`${day} | ${type.padEnd(9)} | ${sig.padEnd(5)} | ${slStr}   | ${vPts.padStart(7)}  | ${vRs.padStart(10)} | ${aPts.padStart(8)}  | ${aRs.padStart(10)} | ${better}`);
  }

  console.log('='.repeat(100));
  const vT=(vmtTotal>=0?'+':'')+vmtTotal, aT=(aminaTotal>=0?'+':'')+aminaTotal;
  console.log(`TOTAL (${sortedDays.length} days)                         | ${vT.padStart(7)}pts | ₹${(vmtTotal*15).toLocaleString('en-IN').padStart(8)} | ${aT.padStart(7)}pts  | ₹${(aminaTotal*15).toLocaleString('en-IN').padStart(8)}`);

  console.log('');
  console.log('BY DAY TYPE:');
  console.log('-'.repeat(70));
  for (const [type, d] of Object.entries(byType)) {
    if (d.days === 0) continue;
    const vPts=(d.vmt>=0?'+':'')+d.vmt, aPts=(d.amina>=0?'+':'')+d.amina;
    const vRs=d.vmt*15, aRs=d.amina*15;
    const winner=d.vmt>d.amina?'VMT wins':d.amina>d.vmt?'AMINA wins':'TIE';
    console.log(`  ${type.padEnd(9)} ${d.days} days → VMT: ${vPts}pts (₹${vRs.toLocaleString('en-IN')}, ${d.vmtW}W/${d.days-d.vmtW}L)  AMINA: ${aPts}pts (₹${aRs.toLocaleString('en-IN')}, ${d.aminaW}W/${d.days-d.aminaW}L)  ← ${winner}`);
  }
  console.log('');
  console.log('CLASSIFICATION LOGIC:');
  console.log('  TRENDING : Day body/range > 45% AND direction flips < 50%  (strong one-way move)');
  console.log('  REVERSAL : Body/range 25-45% OR flips 50-65%               (opened one way, closed other)');
  console.log('  CHOPPY   : Body/range < 25% OR flips > 65%                 (back and forth, no direction)');
}

main().catch(e => console.error('FATAL:', e.message));

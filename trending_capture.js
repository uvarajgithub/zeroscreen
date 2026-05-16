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
  const f = encodeURIComponent(from+' 09:15:00'), t2 = encodeURIComponent(to+' 15:30:00');
  return kiteGet(`/instruments/historical/260105/15minute?from=${f}&to=${t2}&continuous=0&oi=0`);
}

const SL_T1=50, SL_RE=100, RS=15;

function mv(sig, e, p) { return sig==='CE' ? p-e : e-p; }

function simulate(cs, alwaysReentry) {
  if (!cs || cs.length < 3) return null;
  const dayOpen = cs[0].open;
  let entry=null, slHit=false, sIdx=null, sPx=null;

  outer: for (let i=0; i<cs.length-1; i++) {
    const ca=cs[i], cb=cs[i+1];
    let sig=null, bl=null;
    const bullA=ca.close>=ca.open, bullB=cb.close>=cb.open;
    const bodyA=Math.abs(ca.close-ca.open), bodyB=Math.abs(cb.close-cb.open);
    const bhA=Math.max(ca.open,ca.close), blA=Math.min(ca.open,ca.close);
    const bhB=Math.max(cb.open,cb.close), blB=Math.min(cb.open,cb.close);
    if (bullA===bullB) {
      sig=bullA?'CE':'PE';
      bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if (bodyB>bodyA) {
      sig=bullB?'CE':'PE';
      bl=sig==='CE'?Math.max(bhA,bhB):Math.min(blA,blB);
    } else continue;
    for (let j=i+2; j<cs.length; j++) {
      if (sig==='CE' && cs[j].close>bl) { entry={sig,px:cs[j].close,idx:j,bl}; break outer; }
      if (sig==='PE' && cs[j].close<bl) { entry={sig,px:cs[j].close,idx:j,bl}; break outer; }
    }
  }

  if (!entry) return null;

  for (let i=entry.idx+1; i<cs.length; i++) {
    if (mv(entry.sig, entry.px, cs[i].close) <= -SL_T1) { slHit=true; sIdx=i; sPx=cs[i].close; break; }
  }

  let t1pts = slHit ? -SL_T1 : mv(entry.sig, entry.px, cs[cs.length-1].close);
  let repts = 0;
  let reDir = null;
  if (slHit) {
    const rs = entry.sig==='CE'?'PE':'CE';
    const mar = rs==='CE' ? sPx-dayOpen : -(sPx-dayOpen);
    const takeRe = alwaysReentry || mar<0;
    if (takeRe) {
      reDir = rs;
      repts = mv(rs, sPx, cs[cs.length-1].close);
      for (let i=sIdx+1; i<cs.length; i++) if (mv(rs,sPx,cs[i].close)<=-SL_RE){repts=-SL_RE;break;}
    }
  }
  return { entry, slHit, sIdx, sPx, t1pts, repts, reDir, total: t1pts+repts };
}

// Improved classifier using netRatio
function classify(cs) {
  const dayOpen = cs[0].open, dayClose = cs[cs.length-1].close;
  const dayHigh = Math.max(...cs.map(c=>c.high)), dayLow = Math.min(...cs.map(c=>c.low));
  const dayRange = dayHigh - dayLow;
  if (dayRange < 50) return 'FLAT';
  const netMove = Math.abs(dayClose - dayOpen);
  const netRatio = netMove / dayRange;
  if (netRatio >= 0.55) return 'TRENDING';
  let flips=0;
  for (let i=1; i<cs.length; i++) {
    if ((cs[i].close>=cs[i].open) !== (cs[i-1].close>=cs[i-1].open)) flips++;
  }
  const flipRatio = flips/(cs.length-1);
  const avgBody = cs.reduce((s,c)=>s+Math.abs(c.close-c.open),0)/cs.length;
  const bodyRatio = avgBody/dayRange;
  if (bodyRatio > 0.40 && flipRatio < 0.50) return 'TRENDING';
  if (bodyRatio < 0.20 || flipRatio > 0.65) return 'CHOPPY';
  return 'REVERSAL';
}

function splitDays(candles) {
  const days = {};
  for (const c of candles) {
    const d = c[0].slice(0,10);
    if (!days[d]) days[d]=[];
    days[d].push({ open:c[1],high:c[2],low:c[3],close:c[4] });
  }
  return days;
}

async function runYear(year) {
  const chunks=[];
  for (let m=0; m<12; m+=2) {
    const from = new Date(year,m,1);
    const to   = new Date(year,m+2,1); to.setDate(to.getDate()-1);
    const f=from.toISOString().slice(0,10), t=to.toISOString().slice(0,10);
    const r = await fetchCandles(f,t);
    if (r.status==='success') chunks.push(...r.data.candles);
    await new Promise(res=>setTimeout(res,300));
  }
  return splitDays(chunks);
}

async function main() {
  const YEARS = [2021,2022,2023,2024,2025];

  let totVMT_T=0, totAMINA_T=0, cntT=0;
  let totVMT_R=0, totAMINA_R=0, cntR=0;
  let totVMT_C=0, totAMINA_C=0, cntC=0;

  const trendDetails = [];

  for (const yr of YEARS) {
    process.stdout.write(`Fetching ${yr}... `);
    const days = await runYear(yr);
    let n=0;
    for (const [date, cs] of Object.entries(days).sort()) {
      if (cs.length < 10) continue;
      const type = classify(cs);
      const vmt   = simulate(cs, false);
      const amina = simulate(cs, true);
      if (!vmt || !amina) continue;
      n++;

      const dayClose = cs[cs.length-1].close;
      const netMove  = Math.abs(dayClose - cs[0].open);
      const dayDir   = dayClose >= cs[0].open ? 'UP' : 'DN';

      if (type==='TRENDING') {
        totVMT_T+=vmt.total; totAMINA_T+=amina.total; cntT++;
        const entryDir = vmt.entry.sig==='CE'?'UP':'DN';
        const aligned  = entryDir===dayDir;
        trendDetails.push({
          date, dayDir, netMove: Math.round(netMove),
          entryDir, aligned,
          slHit: vmt.slHit,
          vmtRe: vmt.slHit ? (vmt.repts!==0 ? 'BLOCKED' : 'no-action') : '-',
          aminaRe: amina.slHit ? (amina.reDir||'blocked') : '-',
          vPts: Math.round(vmt.total), aPts: Math.round(amina.total),
          diff: Math.round(vmt.total-amina.total)
        });
      } else if (type==='REVERSAL') {
        totVMT_R+=vmt.total; totAMINA_R+=amina.total; cntR++;
      } else {
        totVMT_C+=vmt.total; totAMINA_C+=amina.total; cntC++;
      }
    }
    console.log(`${n} trading days`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('TRENDING DAYS — One-sided market analysis (2021–2025)');
  console.log('='.repeat(80));
  console.log(`${'Date'.padEnd(12)} Day  EntDir Align SL?  VMT    AMINA  Winner`);
  console.log('-'.repeat(80));

  let vmtWins=0, aminaWins=0, ties=0;
  let vmtWinsAligned=0, vmtWinsUnaligned=0;

  for (const d of trendDetails) {
    const align = d.aligned ? '✓' : '✗';
    const sl    = d.slHit   ? 'YES' : 'no ';
    let winner;
    if (d.diff > 0) { winner='VMT  '; vmtWins++; if(d.aligned)vmtWinsAligned++;else vmtWinsUnaligned++; }
    else if (d.diff < 0) { winner='AMINA'; aminaWins++; }
    else { winner='TIE  '; ties++; }
    console.log(`${d.date.padEnd(12)} ${d.dayDir}  ${d.entryDir}    ${align}    ${sl}  ${String(d.vPts).padStart(5)}  ${String(d.aPts).padStart(5)}  ${winner} ${d.diff!==0?'('+Math.abs(d.diff)+'pts)':''}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('TRENDING DAYS — SCORECARD');
  console.log('='.repeat(80));
  console.log(`Total one-sided/trending days : ${cntT}`);
  console.log(`  VMT wins   : ${vmtWins} days  (SL hit → VMT blocked bad re-entry)`);
  console.log(`    ↳ Entry aligned with day   : ${vmtWinsAligned} days`);
  console.log(`    ↳ Entry opposite to day    : ${vmtWinsUnaligned} days`);
  console.log(`  AMINA wins : ${aminaWins} days  (SL hit → AMINA re-entry correct)`);
  console.log(`  Tie        : ${ties} days  (no SL hit — both identical)`);

  console.log(`\nVMT  pts on trending days : ${Math.round(totVMT_T).toString().padStart(6)}  ₹${Math.round(totVMT_T)*RS}`);
  console.log(`AMINA pts on trending days: ${Math.round(totAMINA_T).toString().padStart(6)}  ₹${Math.round(totAMINA_T)*RS}`);
  const diffT = Math.round(totVMT_T - totAMINA_T);
  console.log(`VMT advantage on trending : ${diffT>=0?'+':''}${diffT} pts  ₹${diffT*RS}`);

  console.log('\n' + '='.repeat(80));
  console.log('ALL DAY TYPES COMPARISON');
  console.log('='.repeat(80));
  console.log(`${'Type'.padEnd(12)} ${'Days'.padStart(5)}  ${'VMT pts'.padStart(8)}  ${'AMINA pts'.padStart(9)}  ${'Diff (VMT-AMN)'.padStart(14)}`);
  console.log('-'.repeat(80));
  const fmt=(n)=>(n>=0?'+':'')+n;
  console.log(`${'TRENDING'.padEnd(12)} ${String(cntT).padStart(5)}  ${String(Math.round(totVMT_T)).padStart(8)}  ${String(Math.round(totAMINA_T)).padStart(9)}  ${fmt(Math.round(totVMT_T-totAMINA_T)).padStart(14)}`);
  console.log(`${'REVERSAL'.padEnd(12)} ${String(cntR).padStart(5)}  ${String(Math.round(totVMT_R)).padStart(8)}  ${String(Math.round(totAMINA_R)).padStart(9)}  ${fmt(Math.round(totVMT_R-totAMINA_R)).padStart(14)}`);
  console.log(`${'CHOPPY'.padEnd(12)} ${String(cntC).padStart(5)}  ${String(Math.round(totVMT_C)).padStart(8)}  ${String(Math.round(totAMINA_C)).padStart(9)}  ${fmt(Math.round(totVMT_C-totAMINA_C)).padStart(14)}`);
  const gV=totVMT_T+totVMT_R+totVMT_C, gA=totAMINA_T+totAMINA_R+totAMINA_C;
  console.log('-'.repeat(80));
  console.log(`${'TOTAL'.padEnd(12)} ${String(cntT+cntR+cntC).padStart(5)}  ${String(Math.round(gV)).padStart(8)}  ${String(Math.round(gA)).padStart(9)}  ${fmt(Math.round(gV-gA)).padStart(14)}`);

  console.log('\n── CONCLUSION ─────────────────────────────────────────────────────────────');
  console.log('On TRENDING (one-sided) days:');
  console.log(`  • ${ties} days: No SL hit → VMT = AMINA (both hold full trade to EOD)`);
  console.log(`  • ${vmtWins} days: SL hit but VMT BLOCKED re-entry in wrong direction → VMT better`);
  console.log(`  • ${aminaWins} days: SL hit and AMINA re-entry was actually correct → AMINA better`);
  const net = totVMT_T - totAMINA_T;
  console.log(`  Net: VMT captures ${net>=0?'MORE':'LESS'} pts on trending days by ${Math.abs(Math.round(net))} pts = ₹${Math.abs(Math.round(net))*RS}`);
}

main().catch(e=>console.error('FATAL:', e.message));

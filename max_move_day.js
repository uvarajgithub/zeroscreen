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
    if (bullA===bullB) { sig=bullA?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (bodyB>bodyA) { sig=bullB?'CE':'PE'; bl=sig==='CE'?Math.max(bhA,bhB):Math.min(blA,blB); }
    else continue;
    for (let j=i+2; j<cs.length; j++) {
      if (sig==='CE' && cs[j].close>bl) { entry={sig,px:cs[j].close,idx:j,bl,pairA:i,pairB:i+1}; break outer; }
      if (sig==='PE' && cs[j].close<bl) { entry={sig,px:cs[j].close,idx:j,bl,pairA:i,pairB:i+1}; break outer; }
    }
  }
  if (!entry) return null;
  for (let i=entry.idx+1; i<cs.length; i++) {
    if (mv(entry.sig, entry.px, cs[i].close) <= -SL_T1) { slHit=true; sIdx=i; sPx=cs[i].close; break; }
  }
  let t1pts = slHit ? -SL_T1 : mv(entry.sig, entry.px, cs[cs.length-1].close);
  let repts=0, reDir=null;
  if (slHit) {
    const rs = entry.sig==='CE'?'PE':'CE';
    const mar = rs==='CE' ? sPx-dayOpen : -(sPx-dayOpen);
    const takeRe = alwaysReentry || mar<0;
    if (takeRe) {
      reDir=rs; repts=mv(rs,sPx,cs[cs.length-1].close);
      for (let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-SL_RE){repts=-SL_RE;break;}
    }
  }
  return { entry, slHit, sIdx, sPx, t1pts, repts, reDir, total: t1pts+repts };
}

function splitDays(candles) {
  const days = {};
  for (const c of candles) {
    const d = c[0].slice(0,10);
    if (!days[d]) days[d]=[];
    days[d].push({ts:c[0].slice(11,16), open:c[1],high:c[2],low:c[3],close:c[4]});
  }
  return days;
}

async function runYear(year) {
  const chunks=[];
  for (let m=0; m<12; m+=2) {
    const from=new Date(year,m,1), to=new Date(year,m+2,1); to.setDate(to.getDate()-1);
    const r=await fetchCandles(from.toISOString().slice(0,10), to.toISOString().slice(0,10));
    if (r.status==='success') chunks.push(...r.data.candles);
    await new Promise(res=>setTimeout(res,300));
  }
  return splitDays(chunks);
}

async function main() {
  const YEARS=[2021,2022,2023,2024,2025];
  const allDays=[];

  for (const yr of YEARS) {
    process.stdout.write(`Fetching ${yr}... `);
    const days=await runYear(yr);
    for (const [date,cs] of Object.entries(days).sort()) {
      if (cs.length<10) continue;
      const dayOpen=cs[0].open, dayClose=cs[cs.length-1].close;
      const dayHigh=Math.max(...cs.map(c=>c.high)), dayLow=Math.min(...cs.map(c=>c.low));
      const netMove=Math.abs(dayClose-dayOpen);
      const dayRange=dayHigh-dayLow;
      const dir=dayClose>=dayOpen?'UP':'DN';
      const vmt=simulate(cs,false), amina=simulate(cs,true);
      if (!vmt||!amina) continue;
      allDays.push({date,cs,dayOpen,dayClose,dayHigh,dayLow,netMove,dayRange,dir,vmt,amina});
    }
    console.log(`${Object.keys(days).length} days`);
  }

  // Sort by netMove descending — top 20
  allDays.sort((a,b)=>b.netMove-a.netMove);
  const top20 = allDays.slice(0,20);

  console.log('\n'+'='.repeat(100));
  console.log('TOP 20 BIGGEST MOVE DAYS (2021–2025) — Strategy Capture Analysis');
  console.log('='.repeat(100));
  console.log(`${'Date'.padEnd(12)} ${'Dir'.padEnd(4)} ${'NetMv'.padEnd(6)} ${'DayRng'.padEnd(7)} ${'Entry'.padEnd(6)} ${'SL?'.padEnd(4)} VMT_pts  VMT_cap%  AMINA_pts AMN_cap%  Winner`);
  console.log('-'.repeat(100));

  for (const d of top20) {
    const vPts=Math.round(d.vmt.total), aPts=Math.round(d.amina.total);
    const vCap=(vPts/d.netMove*100).toFixed(1)+'%';
    const aCap=(aPts/d.netMove*100).toFixed(1)+'%';
    const sl=d.vmt.slHit?'YES':'no ';
    const entry=d.vmt.entry?d.vmt.entry.sig:'none';
    const aligned=d.vmt.entry?(d.vmt.entry.sig==='CE'?'UP':'DN')===d.dir:'?';
    const w=vPts>aPts?'VMT':vPts<aPts?'AMINA':'TIE';
    console.log(`${d.date.padEnd(12)} ${d.dir.padEnd(4)} ${Math.round(d.netMove).toString().padStart(5)} ${Math.round(d.dayRange).toString().padStart(6)}  ${entry.padEnd(6)} ${sl.padEnd(4)} ${vPts.toString().padStart(7)}  ${vCap.padStart(7)}   ${aPts.toString().padStart(7)}  ${aCap.padStart(7)}  ${w}`);
  }

  // Show candle by candle for #1 day
  const best = top20[0];
  console.log('\n'+'='.repeat(90));
  console.log(`CANDLE-BY-CANDLE: ${best.date} — BIGGEST MOVE DAY (${best.dir} ${Math.round(best.netMove)}pts net)`);
  console.log(`Day: Open ${best.dayOpen}  High ${best.dayHigh}  Low ${best.dayLow}  Close ${best.dayClose}  Range ${Math.round(best.dayRange)}pts`);
  console.log('='.repeat(90));
  console.log('Time   Open      High      Low      Close    Dir    Body    Notes');
  console.log('-'.repeat(90));

  const e=best.vmt.entry;
  for (let i=0;i<best.cs.length;i++) {
    const c=best.cs[i];
    const dir2=c.close>=c.open?'▲ BUL':'▼ BEA';
    const body=Math.round(Math.abs(c.close-c.open));
    let note='';
    if (e) {
      if (i===e.pairA) note='◀ C1 of signal pair';
      else if (i===e.pairB) note=`◀ C2 of signal pair → breakout: ${Math.round(e.bl)}`;
      else if (i===e.idx)   note=`★ ENTRY ${e.sig} @ ${c.close}`;
      else if (i>e.idx && !best.vmt.slHit) {
        const pts=mv(e.sig,e.px,c.close);
        note=`P&L: ${pts>=0?'+':''}${Math.round(pts)}pts`;
      } else if (i>e.idx && best.vmt.slHit && i<=best.vmt.sIdx) {
        const pts=mv(e.sig,e.px,c.close);
        note=`P&L: ${pts>=0?'+':''}${Math.round(pts)}pts${i===best.vmt.sIdx?' ← T1 SL HIT':''}`;
      } else if (best.vmt.slHit && i>best.vmt.sIdx) {
        const rs=e.sig==='CE'?'PE':'CE';
        const mar=rs==='CE'?best.vmt.sPx-best.dayOpen:-(best.vmt.sPx-best.dayOpen);
        if (mar<0) {
          const rp=mv(rs,best.vmt.sPx,c.close);
          note=`Re-P&L: ${rp>=0?'+':''}${Math.round(rp)}pts`;
        } else {
          note=`VMT: blocked re-entry | AMINA re-P&L: ${Math.round(mv(rs,best.amina.sPx||best.vmt.sPx,c.close))}pts`;
        }
      }
    }
    console.log(`${c.ts}  ${String(c.open).padStart(8)}  ${String(c.high).padStart(8)}  ${String(c.low).padStart(8)}  ${String(c.close).padStart(8)}  ${dir2}  ${String(body).padStart(5)}   ${note}`);
  }

  console.log('='.repeat(90));
  console.log(`VMT  final: ${Math.round(best.vmt.total)} pts = ₹${Math.round(best.vmt.total)*RS}  (${(best.vmt.total/best.netMove*100).toFixed(1)}% of net move captured)`);
  console.log(`AMINA final: ${Math.round(best.amina.total)} pts = ₹${Math.round(best.amina.total)*RS}  (${(best.amina.total/best.netMove*100).toFixed(1)}% of net move captured)`);
  console.log(`Day total move available: ${Math.round(best.netMove)} pts = ₹${Math.round(best.netMove)*RS}`);

  // Also show #2 and #3 candle detail
  for (const rank of [1,2]) {
    const d2=top20[rank];
    if (!d2) continue;
    const e2=d2.vmt.entry;
    console.log('\n'+'='.repeat(90));
    console.log(`#${rank+1}: ${d2.date} — ${d2.dir} ${Math.round(d2.netMove)}pts net | Range ${Math.round(d2.dayRange)}pts`);
    console.log('='.repeat(90));
    console.log('Time   Close      Dir    Body    Notes');
    console.log('-'.repeat(90));
    for (let i=0;i<d2.cs.length;i++) {
      const c=d2.cs[i];
      const dir2=c.close>=c.open?'▲':'▼';
      const body=Math.round(Math.abs(c.close-c.open));
      let note='';
      if (e2) {
        if (i===e2.pairA) note='◀ C1';
        else if (i===e2.pairB) note=`◀ C2 → break: ${Math.round(e2.bl)}`;
        else if (i===e2.idx) note=`★ ENTRY ${e2.sig} @ ${c.close}`;
        else if (i>e2.idx && !d2.vmt.slHit) note=`P&L: ${Math.round(mv(e2.sig,e2.px,c.close))>=0?'+':''}${Math.round(mv(e2.sig,e2.px,c.close))}pts`;
        else if (i>e2.idx && d2.vmt.slHit && i<=d2.vmt.sIdx) note=`P&L: ${Math.round(mv(e2.sig,e2.px,c.close))}pts${i===d2.vmt.sIdx?' ← SL HIT':''}`;
        else if (d2.vmt.slHit && i>d2.vmt.sIdx) {
          const rs=e2.sig==='CE'?'PE':'CE';
          note=`VMT:${Math.round(d2.vmt.repts!==-SL_RE?mv(rs,d2.vmt.sPx,c.close):-100)}pts AMINA:${Math.round(mv(rs,d2.amina.sPx||d2.vmt.sPx,c.close))}pts`;
        }
      }
      console.log(`${c.ts}  ${String(c.close).padStart(9)}  ${dir2}  ${String(body).padStart(5)}   ${note}`);
    }
    console.log(`VMT: ${Math.round(d2.vmt.total)}pts ₹${Math.round(d2.vmt.total)*RS}  AMINA: ${Math.round(d2.amina.total)}pts ₹${Math.round(d2.amina.total)*RS}  Available: ${Math.round(d2.netMove)}pts`);
  }
}
main().catch(e=>console.error('FATAL:',e.message));

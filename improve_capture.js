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

// ─── find C1/C2 entry (existing logic) ───
function findEntry(cs) {
  for (let i=0; i<cs.length-1; i++) {
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
      if (sig==='CE' && cs[j].close>bl) return {sig,px:cs[j].close,idx:j,bl,pairA:i,pairB:i+1,source:'C1C2'};
      if (sig==='PE' && cs[j].close<bl) return {sig,px:cs[j].close,idx:j,bl,pairA:i,pairB:i+1,source:'C1C2'};
    }
  }
  return null;
}

// ─── simulate with options ───
// opts: { gapThresh, trailPts, alwaysReentry }
function simulate(cs, opts) {
  const { gapThresh=0, trailPts=0, alwaysReentry=false } = opts;
  if (!cs || cs.length < 3) return null;
  const dayOpen = cs[0].open;

  // GAP RULE: big first candle → enter at its close
  let entry = null;
  if (gapThresh > 0) {
    const c0 = cs[0];
    const body0 = Math.abs(c0.close - c0.open);
    if (body0 >= gapThresh) {
      const sig = c0.close >= c0.open ? 'CE' : 'PE';
      entry = { sig, px: c0.close, idx: 0, bl: null, source: 'GAP' };
    }
  }

  // If gap rule didn't fire, use C1/C2
  if (!entry) entry = findEntry(cs);
  if (!entry) return null;

  // Simulate from entry
  let slHit=false, sIdx=null, sPx=null;
  let peak=0;         // best pts seen so far (for trail)
  let exitIdx=null, exitPts=null, exitReason=null;

  for (let i=entry.idx+1; i<cs.length; i++) {
    const pts = mv(entry.sig, entry.px, cs[i].close);

    // Update peak
    if (pts > peak) peak = pts;

    // T1 SL (close-based)
    if (pts <= -SL_T1) {
      slHit=true; sIdx=i; sPx=cs[i].close;
      exitIdx=i; exitPts=-SL_T1; exitReason='T1_SL';
      break;
    }

    // Trail stop: only if we're in profit and trail > 0
    if (trailPts > 0 && peak > 0 && pts <= peak - trailPts) {
      exitIdx=i; exitPts=pts; exitReason=`TRAIL(peak+${Math.round(peak)})`;
      break;
    }
  }

  let t1pts = exitPts !== null ? exitPts : mv(entry.sig, entry.px, cs[cs.length-1].close);
  if (exitReason && exitReason !== 'T1_SL') slHit = false; // trail exit, no re-entry

  let repts=0, reDir=null;
  if (slHit) {
    const rs = entry.sig==='CE'?'PE':'CE';
    const mar = rs==='CE' ? sPx-dayOpen : -(sPx-dayOpen);
    const takeRe = alwaysReentry || mar<0;
    if (takeRe) {
      reDir=rs;
      let repeak=0;
      for (let i=sIdx+1; i<cs.length; i++) {
        const rp = mv(rs, sPx, cs[i].close);
        if (rp > repeak) repeak = rp;
        if (rp <= -SL_RE) { repts=-SL_RE; break; }
        // trail on re-entry too
        if (trailPts > 0 && repeak > 0 && rp <= repeak - trailPts) { repts=rp; break; }
        repts = rp;
      }
    }
  }
  return { entry, slHit, exitReason: exitReason||'EOD', t1pts, repts, total: t1pts+repts };
}

function splitDays(candles) {
  const days = {};
  for (const c of candles) {
    const d = c[0].slice(0,10);
    if (!days[d]) days[d]=[];
    days[d].push({ts:c[0].slice(11,16),open:c[1],high:c[2],low:c[3],close:c[4]});
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
      allDays.push({date,cs,dayOpen,dayClose,dayHigh,dayLow,netMove,dayRange,dir:dayClose>=dayOpen?'UP':'DN'});
    }
    console.log(`${Object.keys(days).length} days`);
  }

  // ─── VARIANTS TO TEST ───
  const variants = [
    { name:'Current (EOD)',          gapThresh:0,   trailPts:0,   alwaysReentry:false },
    { name:'+ Gap Rule 400',         gapThresh:400, trailPts:0,   alwaysReentry:false },
    { name:'+ Gap Rule 300',         gapThresh:300, trailPts:0,   alwaysReentry:false },
    { name:'+ Trail 150pts',         gapThresh:0,   trailPts:150, alwaysReentry:false },
    { name:'+ Trail 200pts',         gapThresh:0,   trailPts:200, alwaysReentry:false },
    { name:'Gap400 + Trail150',      gapThresh:400, trailPts:150, alwaysReentry:false },
    { name:'Gap400 + Trail200',      gapThresh:400, trailPts:200, alwaysReentry:false },
  ];

  // ─── Run all variants across all days ───
  const results = variants.map(v => ({ ...v, totalPts:0, days:0, wins:0, losses:0, gapFired:0 }));

  for (const d of allDays) {
    for (let vi=0; vi<variants.length; vi++) {
      const v=variants[vi], r=results[vi];
      const sim = simulate(d.cs, v);
      if (!sim) continue;
      r.days++;
      r.totalPts += sim.total;
      if (sim.total > 0) r.wins++; else if (sim.total < 0) r.losses++;
      if (sim.entry.source==='GAP') r.gapFired++;
    }
  }

  console.log('\n'+'='.repeat(80));
  console.log('5-YEAR P&L BY VARIANT (2021–2025)');
  console.log('='.repeat(80));
  console.log(`${'Variant'.padEnd(25)} ${'TotalPts'.padStart(9)} ${'₹ P&L'.padStart(10)} ${'W'.padStart(5)} ${'L'.padStart(5)} ${'GapDays'.padStart(8)} ${'vs Current'}`);
  console.log('-'.repeat(80));
  const base = results[0].totalPts;
  for (const r of results) {
    const diff = r.totalPts - base;
    const marker = diff > 0 ? ` ▲+${Math.round(diff)}pts ₹${Math.round(diff)*RS}` : diff < 0 ? ` ▼${Math.round(diff)}pts` : ' (baseline)';
    console.log(`${r.name.padEnd(25)} ${String(Math.round(r.totalPts)).padStart(9)} ${String('₹'+(Math.round(r.totalPts)*RS)).padStart(10)} ${String(r.wins).padStart(5)} ${String(r.losses).padStart(5)} ${String(r.gapFired).padStart(8)}${marker}`);
  }

  // ─── Show impact on top-20 move days ───
  allDays.sort((a,b)=>b.netMove-a.netMove);
  const top20 = allDays.slice(0,20);

  console.log('\n'+'='.repeat(110));
  console.log('TOP 20 MOVE DAYS — Capture by Variant');
  console.log('='.repeat(110));
  const vnames = variants.map(v=>v.name.slice(0,14).padStart(14));
  console.log(`${'Date'.padEnd(12)} ${'Dir'.padEnd(4)} ${'NetMv'.padStart(6)}  ${vnames.join('  ')}`);
  console.log('-'.repeat(110));

  for (const d of top20) {
    const sims = variants.map(v => simulate(d.cs, v));
    const pts  = sims.map(s => s ? Math.round(s.total) : 0);
    const caps = pts.map(p => (p/d.netMove*100).toFixed(0)+'%');
    const best = Math.max(...pts);
    const row  = caps.map((c,i) => {
      const mark = pts[i]===best && best > pts[0] ? '★' : ' ';
      return (mark+c).padStart(14);
    });
    console.log(`${d.date.padEnd(12)} ${d.dir.padEnd(4)} ${Math.round(d.netMove).toString().padStart(6)}  ${row.join('  ')}`);
  }

  // ─── Detail the 3 critical days with best variant ───
  const keyDates = ['2024-06-04','2024-06-05','2021-02-01'];
  for (const date of keyDates) {
    const d = allDays.find(x=>x.date===date);
    if (!d) continue;
    console.log('\n'+'='.repeat(95));
    console.log(`DETAIL: ${date} — ${d.dir} ${Math.round(d.netMove)}pts net | Range ${Math.round(d.dayRange)}pts`);
    console.log('='.repeat(95));
    console.log(`${'Time'.padEnd(6)} ${'Close'.padStart(9)} ${'Dir'.padEnd(4)} ${'Body'.padStart(5)}  Current       Gap400        Gap+Trail150  Notes`);
    console.log('-'.repeat(95));

    const sims = variants.slice(0,4).map(v=>simulate(d.cs,v));
    const entries = sims.map(s=>s?s.entry:null);

    for (let i=0; i<d.cs.length; i++) {
      const c=d.cs[i];
      const dir2=c.close>=c.open?'▲':'▼';
      const body=Math.round(Math.abs(c.close-c.open));
      const cols = [0,1,3].map(vi => {
        const s=sims[vi]; if(!s) return '      -     ';
        if (i===s.entry.idx) return `★ENTRY${s.entry.sig}@${Math.round(s.entry.px)}`.padStart(14);
        if (i<s.entry.idx) return ''.padStart(14);
        if (!s.slHit || i<=s.sIdx) {
          const pts=mv(s.entry.sig,s.entry.px,c.close);
          return (pts>=0?'+':'')+Math.round(pts)+'pts'+`(${(pts/d.netMove*100).toFixed(0)}%)`;
        }
        return 'SL/RE'.padStart(14);
      });
      console.log(`${c.ts.padEnd(6)} ${String(c.close).padStart(9)} ${dir2}   ${String(body).padStart(5)}  ${cols[0].padEnd(14)} ${cols[1].padEnd(14)} ${cols[2]}`);
    }
    console.log('');
    for (const v of variants.slice(0,5)) {
      const s=simulate(d.cs,v);
      if(!s) continue;
      const pct=(s.total/d.netMove*100).toFixed(1);
      console.log(`  ${v.name.padEnd(25)}: ${Math.round(s.total).toString().padStart(5)}pts  ₹${Math.round(s.total)*RS}  (${pct}% of ${Math.round(d.netMove)}pt move)  exit:${s.exitReason}`);
    }
  }
}
main().catch(e=>console.error('FATAL:',e.message));

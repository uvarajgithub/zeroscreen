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
function mv(sig, e, p) { return sig==='CE' ? p-e : e-p; }

function findC1C2(cs) {
  for (let i=0; i<cs.length-1; i++) {
    const ca=cs[i], cb=cs[i+1];
    const bullA=ca.close>=ca.open, bullB=cb.close>=cb.open;
    const bodyA=Math.abs(ca.close-ca.open), bodyB=Math.abs(cb.close-cb.open);
    const bhA=Math.max(ca.open,ca.close), blA=Math.min(ca.open,ca.close);
    const bhB=Math.max(cb.open,cb.close), blB=Math.min(cb.open,cb.close);
    let sig=null, bl=null;
    if (bullA===bullB) { sig=bullA?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (bodyB>bodyA) { sig=bullB?'CE':'PE'; bl=sig==='CE'?Math.max(bhA,bhB):Math.min(blA,blB); }
    else continue;
    for (let j=i+2; j<cs.length; j++) {
      if (sig==='CE' && cs[j].close>bl) return { sig, px:cs[j].close, idx:j };
      if (sig==='PE' && cs[j].close<bl) return { sig, px:cs[j].close, idx:j };
    }
  }
  return null;
}

function splitDays(raw) {
  if (!raw || !raw.data || !raw.data.candles) return {};
  const days = {};
  for (const c of raw.data.candles) {
    const dt = c[0].slice(0,10);
    if (!days[dt]) days[dt] = [];
    days[dt].push({ open:c[1], high:c[2], low:c[3], close:c[4], time:c[0] });
  }
  return days;
}

// Simulate with re-entry (VMT style: re-enter only if mar < 0)
function simulate(cs, t1sl, reSL) {
  if (!cs || cs.length < 3) return null;
  const dayOpen = cs[0].open;
  const last = cs[cs.length-1].close;
  const entry = findC1C2(cs);
  if (!entry) return null;

  // T1 trade
  let slHit=false, sIdx=null, sPx=null;
  let t1pts = null;
  for (let i=entry.idx+1; i<cs.length; i++) {
    const p = mv(entry.sig, entry.px, cs[i].close);
    if (p <= -t1sl) { slHit=true; sIdx=i; sPx=cs[i].close; t1pts=-t1sl; break; }
  }
  if (!slHit) t1pts = Math.round(mv(entry.sig, entry.px, last));

  // Re-entry (VMT filter: only if mar < 0)
  let repts = 0;
  if (slHit) {
    const rs = entry.sig==='CE' ? 'PE' : 'CE';
    const mar = rs==='CE' ? sPx - dayOpen : -(sPx - dayOpen);
    if (mar < 0) {
      // enter re-trade from sPx
      repts = mv(rs, sPx, last);
      for (let i=sIdx+1; i<cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -reSL) { repts=-reSL; break; }
      }
      repts = Math.round(repts);
    }
  }

  return { total: Math.round(t1pts + repts), t1pts: Math.round(t1pts), repts, slHit };
}

const RS = 15;
const VARIANTS = [
  { label:'Current VMT  (T1=50,  Re=100)', t1sl:50,  reSL:100 },
  { label:'New     VMT  (T1=100, Re=100)', t1sl:100, reSL:100 },
  { label:'New     VMT  (T1=100, Re=150)', t1sl:100, reSL:150 },
  { label:'New     VMT  (T1=100, Re=200)', t1sl:100, reSL:200 },
];

const CHUNKS = [
  { from:'2021-01-01', to:'2021-06-30' },
  { from:'2021-07-01', to:'2021-12-31' },
  { from:'2022-01-01', to:'2022-06-30' },
  { from:'2022-07-01', to:'2022-12-31' },
  { from:'2023-01-01', to:'2023-06-30' },
  { from:'2023-07-01', to:'2023-12-31' },
  { from:'2024-01-01', to:'2024-06-30' },
  { from:'2024-07-01', to:'2024-12-31' },
  { from:'2025-01-01', to:'2025-06-30' },
  { from:'2025-07-01', to:'2025-12-31' },
];

async function main() {
  const allDays = {};
  for (const chunk of CHUNKS) {
    process.stdout.write(`Fetching ${chunk.from.slice(0,7)}... `);
    const raw = await fetchCandles(chunk.from, chunk.to);
    const days = splitDays(raw);
    const keys = Object.keys(days).sort();
    console.log(`${keys.length} days`);
    for (const dt of keys) allDays[dt] = days[dt];
  }
  const dateList = Object.keys(allDays).sort();
  console.log(`\nTotal days: ${dateList.length}\n`);

  // Run all variants
  const results = {};
  for (const v of VARIANTS) {
    let totalPts=0, winDays=0, lossDays=0, noDays=0;
    let peak=0, running=0, maxDD=0;
    let t1Wins=0, t1Losses=0, reWins=0, reLosses=0, reSkipped=0;
    const yearly = { '2021':0,'2022':0,'2023':0,'2024':0,'2025':0 };

    for (const dt of dateList) {
      const r = simulate(allDays[dt], v.t1sl, v.reSL);
      if (!r) { noDays++; continue; }

      totalPts += r.total;
      running += r.total;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;

      const yr = dt.slice(0,4);
      if (yearly[yr] !== undefined) yearly[yr] += r.total;

      if (r.total > 0) winDays++;
      else if (r.total < 0) lossDays++;
      else noDays++;

      // T1 tracking
      if (!r.slHit) { if (r.t1pts > 0) t1Wins++; else t1Losses++; }
      else t1Losses++;

      // Re-entry tracking
      if (r.slHit) {
        if (r.repts !== 0) { if (r.repts > 0) reWins++; else reLosses++; }
        else reSkipped++;
      }
    }
    results[v.label] = { totalPts, winDays, lossDays, noDays, maxDD, yearly, t1Wins, t1Losses, reWins, reLosses, reSkipped };
  }

  // ─── MAIN TABLE ───────────────────────────────────────────────────────────
  console.log('═'.repeat(100));
  console.log('  SL100 + RE-ENTRY vs Current VMT (2021–2025)');
  console.log('═'.repeat(100));
  console.log(`\n${'Variant'.padEnd(42)} ${'Net ₹'.padStart(12)} ${'Win Days'.padStart(10)} ${'Loss Days'.padStart(10)} ${'Max DD ₹'.padStart(12)}`);
  console.log('-'.repeat(90));
  for (const v of VARIANTS) {
    const r = results[v.label];
    const winRate = ((r.winDays / (r.winDays + r.lossDays)) * 100).toFixed(1);
    console.log(
      v.label.padEnd(42),
      `₹${(r.totalPts * RS).toLocaleString('en-IN')}`.padStart(12),
      `${r.winDays} (${winRate}%)`.padStart(10),
      `${r.lossDays}`.padStart(10),
      `₹${(r.maxDD * RS).toLocaleString('en-IN')}`.padStart(12)
    );
  }

  // ─── YEARLY BREAKDOWN ─────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(100));
  console.log('  YEARLY BREAKDOWN (₹)');
  console.log('─'.repeat(100));
  const hdr = 'Year'.padEnd(8) + VARIANTS.map(v => v.label.slice(-14).padStart(18)).join('');
  console.log(hdr);
  console.log('-'.repeat(8 + 18 * VARIANTS.length));
  for (const yr of ['2021','2022','2023','2024','2025','TOTAL']) {
    let row = yr.padEnd(8);
    for (const v of VARIANTS) {
      const r = results[v.label];
      const pts = yr==='TOTAL' ? r.totalPts : (r.yearly[yr]||0);
      row += `₹${(pts * RS).toLocaleString('en-IN')}`.padStart(18);
    }
    console.log(row);
  }

  // ─── RE-ENTRY STATS ───────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(100));
  console.log('  RE-ENTRY STATS (how often re-entry wins vs loses)');
  console.log('─'.repeat(100));
  console.log(`${'Variant'.padEnd(42)} ${'Re-Wins'.padStart(10)} ${'Re-Loss'.padStart(10)} ${'Skipped'.padStart(10)} ${'Re-Win%'.padStart(10)}`);
  console.log('-'.repeat(85));
  for (const v of VARIANTS) {
    const r = results[v.label];
    const total = r.reWins + r.reLosses;
    const pct = total > 0 ? ((r.reWins/total)*100).toFixed(1) : 'n/a';
    console.log(
      v.label.padEnd(42),
      `${r.reWins}`.padStart(10),
      `${r.reLosses}`.padStart(10),
      `${r.reSkipped}`.padStart(10),
      `${pct}%`.padStart(10)
    );
  }

  // ─── LOSS DISTRIBUTION ────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(100));
  console.log('  WORST LOSS DAYS — Double SL hits');
  console.log('─'.repeat(100));
  for (const v of VARIANTS) {
    let doubleHit = 0, singleHit = 0;
    for (const dt of dateList) {
      const r = simulate(allDays[dt], v.t1sl, v.reSL);
      if (!r) continue;
      if (r.slHit && r.repts === -v.reSL) doubleHit++;
      else if (r.slHit && r.repts === 0) singleHit++;
      else if (r.slHit) singleHit++;
    }
    const worstDay = -(v.t1sl + v.reSL);
    console.log(`  ${v.label}`);
    console.log(`    Double SL (${worstDay}pts = ₹${Math.abs(worstDay)*RS}/day): ${doubleHit} days = ₹${(doubleHit * Math.abs(worstDay) * RS).toLocaleString('en-IN')} total loss`);
    console.log(`    T1 SL only (-${v.t1sl}pts): ${singleHit} days`);
    console.log();
  }
}

main().catch(console.error);

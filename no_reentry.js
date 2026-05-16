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
    const ca=cs[i], cb=cs[i+1]; let sig=null, bl=null;
    const bullA=ca.close>=ca.open, bullB=cb.close>=cb.open;
    const bodyA=Math.abs(ca.close-ca.open), bodyB=Math.abs(cb.close-cb.open);
    const bhA=Math.max(ca.open,ca.close), blA=Math.min(ca.open,ca.close);
    const bhB=Math.max(cb.open,cb.close), blB=Math.min(cb.open,cb.close);
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

function simulateNoReentry(cs, sl) {
  if (!cs || cs.length < 3) return null;
  const last = cs[cs.length-1].close;
  const entry = findC1C2(cs);
  if (!entry) return null;

  let pts = null;
  for (let i=entry.idx+1; i<cs.length; i++) {
    const p = mv(entry.sig, entry.px, cs[i].close);
    if (p <= -sl) { pts = -sl; break; }
  }
  if (pts === null) pts = Math.round(mv(entry.sig, entry.px, last));
  else pts = -sl;

  return pts;
}

function splitDays(candles) {
  if (!candles || !candles.data || !candles.data.candles) {
    console.error('API error:', JSON.stringify(candles).slice(0,200));
    return {};
  }
  const days = {};
  for (const c of candles.data.candles) {
    const dt = c[0].slice(0,10);
    if (!days[dt]) days[dt] = [];
    days[dt].push({ open:c[1], high:c[2], low:c[3], close:c[4], time:c[0] });
  }
  return days;
}

const RS = 15; // ₹15 per point
const SL_LEVELS = [50, 100, 150, 200];

// Fetch in quarterly chunks to stay under 200-day API limit
const CHUNKS = [
  { from:'2021-01-01', to:'2021-06-30', label:'2021-H1' },
  { from:'2021-07-01', to:'2021-12-31', label:'2021-H2' },
  { from:'2022-01-01', to:'2022-06-30', label:'2022-H1' },
  { from:'2022-07-01', to:'2022-12-31', label:'2022-H2' },
  { from:'2023-01-01', to:'2023-06-30', label:'2023-H1' },
  { from:'2023-07-01', to:'2023-12-31', label:'2023-H2' },
  { from:'2024-01-01', to:'2024-06-30', label:'2024-H1' },
  { from:'2024-07-01', to:'2024-12-31', label:'2024-H2' },
  { from:'2025-01-01', to:'2025-06-30', label:'2025-H1' },
  { from:'2025-07-01', to:'2025-12-31', label:'2025-H2' },
];

async function main() {
  // Fetch all chunks
  const allDays = {};
  for (const chunk of CHUNKS) {
    process.stdout.write(`Fetching ${chunk.label}... `);
    const raw = await fetchCandles(chunk.from, chunk.to);
    const days = splitDays(raw);
    const sorted = Object.keys(days).sort();
    console.log(`${sorted.length} days`);
    for (const dt of sorted) allDays[dt] = days[dt];
  }

  const dateList = Object.keys(allDays).sort();
  console.log(`\nTotal trading days: ${dateList.length}\n`);

  // For each SL level, simulate no-reentry and collect results
  const results = {};
  for (const sl of SL_LEVELS) {
    let totalPts = 0, winDays = 0, lossDays = 0, noDays = 0;
    let maxDD = 0, peak = 0, running = 0;
    const yearly = {};

    for (const dt of dateList) {
      const yr = dt.slice(0,4);
      if (!yearly[yr]) yearly[yr] = 0;

      const pts = simulateNoReentry(allDays[dt], sl);
      if (pts === null) { noDays++; continue; }

      totalPts += pts;
      running += pts;
      if (running > peak) peak = running;
      const dd = peak - running;
      if (dd > maxDD) maxDD = dd;

      yearly[yr] += pts;
      if (pts > 0) winDays++;
      else if (pts < 0) lossDays++;
      else noDays++;
    }

    results[sl] = { totalPts, winDays, lossDays, noDays, maxDD, yearly };
  }

  // ─── PRINT RESULTS ────────────────────────────────────────────────────────
  console.log('═'.repeat(90));
  console.log('  NO RE-ENTRY BACKTEST — SL Comparison (2021–2025)');
  console.log('═'.repeat(90));
  console.log(`\n${'SL'.padEnd(8)} ${'Total Pts'.padStart(10)} ${'Net ₹'.padStart(12)} ${'Win Days'.padStart(10)} ${'Loss Days'.padStart(10)} ${'No Trade'.padStart(10)} ${'Max DD ₹'.padStart(12)}`);
  console.log('-'.repeat(90));

  for (const sl of SL_LEVELS) {
    const r = results[sl];
    const totalDays = r.winDays + r.lossDays + r.noDays;
    const winRate = ((r.winDays / (r.winDays + r.lossDays)) * 100).toFixed(1);
    console.log(
      `SL${sl}`.padEnd(8),
      `${r.totalPts}pts`.padStart(10),
      `₹${(r.totalPts * RS).toLocaleString('en-IN')}`.padStart(12),
      `${r.winDays} (${winRate}%)`.padStart(10),
      `${r.lossDays}`.padStart(10),
      `${r.noDays}`.padStart(10),
      `₹${(r.maxDD * RS).toLocaleString('en-IN')}`.padStart(12)
    );
  }

  // ─── YEARLY BREAKDOWN ─────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(90));
  console.log('  YEARLY BREAKDOWN (pts)');
  console.log('─'.repeat(90));
  const header = 'Year'.padEnd(8) + SL_LEVELS.map(sl => `SL${sl}`.padStart(14)).join('');
  console.log(header);
  console.log('-'.repeat(8 + 14 * SL_LEVELS.length));

  const years = ['2021','2022','2023','2024','2025','TOTAL'];
  for (const yr of years) {
    let row = yr.padEnd(8);
    for (const sl of SL_LEVELS) {
      const r = results[sl];
      const pts = yr === 'TOTAL' ? r.totalPts : (r.yearly[yr] || 0);
      const rupees = `₹${(pts * RS).toLocaleString('en-IN')}`;
      row += rupees.padStart(14);
    }
    console.log(row);
  }

  // ─── DISTRIBUTION OF OUTCOMES ─────────────────────────────────────────────
  console.log('\n' + '─'.repeat(90));
  console.log('  OUTCOME DISTRIBUTION (pts per day)');
  console.log('─'.repeat(90));

  for (const sl of SL_LEVELS) {
    const buckets = {};
    for (const dt of dateList) {
      const pts = simulateNoReentry(allDays[dt], sl);
      if (pts === null) continue;
      const key = pts <= -sl ? `-${sl}(SL)` : pts <= 0 ? '0to-SL' : pts <= 100 ? '1-100' : pts <= 200 ? '101-200' : pts <= 400 ? '201-400' : pts <= 700 ? '401-700' : '>700';
      buckets[key] = (buckets[key] || 0) + 1;
    }
    const order = [`-${sl}(SL)`, '0to-SL', '1-100', '101-200', '201-400', '401-700', '>700'];
    console.log(`\n  SL=${sl}:`);
    for (const k of order) {
      if (buckets[k]) console.log(`    ${k.padEnd(12)}: ${buckets[k]} days`);
    }
  }

  // ─── COMPARE WITH CURRENT VMT (with re-entry) ─────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('  REFERENCE: Current VMT (SL50 + re-entry SL100) = ₹10,70,900 over 5 years');
  console.log('  (Re-entry adds value: blocks re-entry on "mar >= 0" days, enters on rest)');
  console.log('═'.repeat(90));
}

main().catch(console.error);

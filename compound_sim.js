// compound_sim.js — Compounding simulation Jun 2025–Apr 2026
// Rule: start Rs 50k = 1 lot. Every Rs 50k extra capital = +1 lot.
require('dotenv').config({ override: true });
const https = require('https');
const K = process.env.API_KEY, T = process.env.ACCESS_TOKEN;
const LOT_MARGIN = 50000; // Rs per lot threshold
const RS_PER_PT_PER_LOT = 15; // Rs 15/pt per lot

function get(p) {
  return new Promise((res, rej) => {
    const r = https.request({ hostname: 'api.kite.trade', path: p, headers: { 'X-Kite-Version': '3', 'Authorization': 'token ' + K + ':' + T }, timeout: 30000 }, re => {
      let d = ''; re.on('data', c => d += c); re.on('end', () => { try { res(JSON.parse(d)); } catch (e) { rej(e); } });
    }); r.on('error', rej); r.on('timeout', () => { r.destroy(); rej(new Error('timeout')); }); r.end();
  });
}

function scan(cs) {
  const n = cs.length;
  for (let i = 0; i < n - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    const caB = ca.c >= ca.o, cbB = cb.c >= cb.o;
    const caBH = Math.max(ca.o, ca.c), caBL = Math.min(ca.o, ca.c);
    const cbBH = Math.max(cb.o, cb.c), cbBL = Math.min(cb.o, cb.c);
    const caBS = Math.abs(ca.c - ca.o), cbBS = Math.abs(cb.c - cb.o);
    let sig = null, bl = null;
    if (caB === cbB) {
      sig = caB ? 'CE' : 'PE';
      bl = sig === 'CE' ? Math.max(ca.h, cb.h) : Math.min(ca.l, cb.l);
    } else if (cbBS > caBS) {
      sig = cbB ? 'CE' : 'PE';
      bl = sig === 'CE' ? Math.max(caBH, cbBH) : Math.min(caBL, cbBL);
    } else continue;
    for (let j = i + 2; j < n; j++) {
      const cx = cs[j];
      if (cx.hh >= 15 && cx.mm >= 15) break;
      const br = sig === 'CE' ? cx.c > bl : cx.c < bl;
      if (br) { if (j === n - 1) return { sig, px: cx.c, bl }; break; }
    }
  }
  return null;
}

function simDay(cs) {
  const SL1 = 50, SL2 = 100;
  if (cs.length < 2) return 0;
  const dayO = cs[0].o;
  let phase = 'SCAN', t1D = null, t1E = 0, reD = null, reE = 0, pts = 0;

  for (let i = 1; i < cs.length; i++) {
    const c = cs[i];
    const eod = (c.hh === 15 && c.mm >= 14) || c.hh > 15;

    if (phase === 'SCAN') {
      if (eod) break;
      const r = scan(cs.slice(0, i + 1));
      if (r) { t1D = r.sig; t1E = r.px; phase = 'T1'; }
      continue;
    }
    if (phase === 'T1') {
      const p = t1D === 'CE' ? c.c - t1E : t1E - c.c;
      if (eod) { pts += p; break; }
      if (p <= -SL1) {
        pts -= SL1;
        reD = t1D === 'CE' ? 'PE' : 'CE';
        reE = c.c; phase = 'RE'; continue;
      }
    }
    if (phase === 'RE') {
      const p = reD === 'CE' ? c.c - reE : reE - c.c;
      if (eod) { pts += p; break; }
      if (p <= -SL2) { pts -= SL2; phase = 'DONE'; continue; }
    }
  }
  return Math.round(pts);
}

function lotsForCapital(cap) {
  return Math.max(1, Math.floor(cap / LOT_MARGIN));
}

async function main() {
  console.log('\nFetching Jun 2025 – Apr 2026 candles...');
  // Need to fetch in chunks (API limit ~2000 candles per call)
  const chunks = [
    ['2025-06-01+09:00:00', '2025-09-30+15:30:00'],
    ['2025-10-01+09:00:00', '2026-01-31+15:30:00'],
    ['2026-02-01+09:00:00', '2026-04-30+15:30:00'],
  ];

  let allCandles = [];
  for (const [from, to] of chunks) {
    const r = await get(`/instruments/historical/260105/15minute?from=${from}&to=${to}&continuous=0&oi=0`);
    allCandles = allCandles.concat(r.data.candles);
  }
  console.log('Total candles: ' + allCandles.length);

  const byDay = {};
  for (const c of allCandles) {
    const dt = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const d = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push({ hh: dt.getHours(), mm: dt.getMinutes(), o: c[1], h: c[2], l: c[3], c: c[4] });
  }

  // Group days by month
  const months = {};
  for (const d of Object.keys(byDay).sort()) {
    const m = d.slice(0, 7);
    if (!months[m]) months[m] = [];
    if (byDay[d].length >= 5) months[m].push(d);
  }

  const W = 92;
  console.log('\n' + '═'.repeat(W));
  console.log('  COMPOUNDING SIMULATION  |  Jun 2025 → Apr 2026');
  console.log('  Start: Rs 50,000  |  Rule: +1 lot per Rs 50k capital  |  Rs 15/pt per lot');
  console.log('═'.repeat(W));
  console.log('  Month       │ Lots │ Rs/pt │ Pts    │ Month P&L      │ Capital        │ Lots next');
  console.log('  ' + '─'.repeat(W - 2));

  let capital = 50000;
  let totalPnl = 0;

  for (const [month, dates] of Object.entries(months)) {
    const lots = lotsForCapital(capital);
    const rsPerPt = lots * RS_PER_PT_PER_LOT;
    let monthPts = 0;
    let wins = 0;
    for (const d of dates) {
      const pts = simDay(byDay[d]);
      monthPts += pts;
      if (pts > 0) wins++;
    }
    const monthPnl = Math.round(monthPts * rsPerPt);
    capital += monthPnl;
    totalPnl += monthPnl;
    const newLots = lotsForCapital(capital);
    const pnlStr = (monthPnl >= 0 ? '+Rs ' : '-Rs ') + Math.abs(monthPnl).toLocaleString('en-IN');
    const capStr = 'Rs ' + capital.toLocaleString('en-IN');
    const arrow = newLots > lots ? ' ▲' + newLots : '';
    console.log(`  ${month}   │  ${String(lots).padEnd(3)} │  ${String(rsPerPt).padEnd(5)}│ ${String(monthPts >= 0 ? '+' + monthPts : monthPts).padEnd(6)} │ ${pnlStr.padEnd(14)} │ ${capStr.padEnd(14)} │ ${newLots} lots${arrow}`);
  }

  console.log('  ' + '─'.repeat(W - 2));
  const totalStr = (totalPnl >= 0 ? '+Rs ' : '-Rs ') + Math.abs(totalPnl).toLocaleString('en-IN');
  const retPct = ((capital - 50000) / 50000 * 100).toFixed(1);
  console.log(`  ${'TOTAL'.padEnd(12)}│      │       │        │ ${totalStr.padEnd(14)} │ Rs ${capital.toLocaleString('en-IN').padEnd(12)} │`);
  console.log(`  Return on Rs 50,000 initial capital: ${retPct}% in 11 months`);
  console.log('═'.repeat(W) + '\n');
}

main().catch(e => console.error(e.message));

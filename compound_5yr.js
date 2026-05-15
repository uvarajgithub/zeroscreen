// compound_5yr.js — 5-year compounding simulation Jan 2021 – Apr 2026
// Rule: start Rs 50k = 1 lot. Every Rs 50k extra capital = +1 lot. Rs 15/pt per lot.
require('dotenv').config({ override: true });
const https = require('https');
const K = process.env.API_KEY, T = process.env.ACCESS_TOKEN;
const LOT_MARGIN = 50000;
const RS_PER_PT_PER_LOT = 15;

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
    if (caB === cbB) { sig = caB ? 'CE' : 'PE'; bl = sig === 'CE' ? Math.max(ca.h, cb.h) : Math.min(ca.l, cb.l); }
    else if (cbBS > caBS) { sig = cbB ? 'CE' : 'PE'; bl = sig === 'CE' ? Math.max(caBH, cbBH) : Math.min(caBL, cbBL); }
    else continue;
    for (let j = i + 2; j < n; j++) {
      const cx = cs[j];
      if (cx.hh >= 15 && cx.mm >= 15) break;
      const br = sig === 'CE' ? cx.c > bl : cx.c < bl;
      if (br) { if (j === n - 1) return { sig, px: cx.c }; break; }
    }
  }
  return null;
}

function simDay(cs) {
  const SL1 = 50, SL2 = 100;
  if (cs.length < 2) return 0;
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
      if (p <= -SL1) { pts -= SL1; reD = t1D === 'CE' ? 'PE' : 'CE'; reE = c.c; phase = 'RE'; continue; }
    }
    if (phase === 'RE') {
      const p = reD === 'CE' ? c.c - reE : reE - c.c;
      if (eod) { pts += p; break; }
      if (p <= -SL2) { pts -= SL2; phase = 'DONE'; continue; }
    }
  }
  return Math.round(pts);
}

async function main() {
  // Fetch in 6-month chunks to stay within API limits
  const chunks = [
    ['2021-01-01+09:00:00', '2021-06-30+15:30:00'],
    ['2021-07-01+09:00:00', '2021-12-31+15:30:00'],
    ['2022-01-01+09:00:00', '2022-06-30+15:30:00'],
    ['2022-07-01+09:00:00', '2022-12-31+15:30:00'],
    ['2023-01-01+09:00:00', '2023-06-30+15:30:00'],
    ['2023-07-01+09:00:00', '2023-12-31+15:30:00'],
    ['2024-01-01+09:00:00', '2024-06-30+15:30:00'],
    ['2024-07-01+09:00:00', '2024-12-31+15:30:00'],
    ['2025-01-01+09:00:00', '2025-06-30+15:30:00'],
    ['2025-07-01+09:00:00', '2025-12-31+15:30:00'],
    ['2026-01-01+09:00:00', '2026-04-30+15:30:00'],
  ];

  process.stdout.write('Fetching 5-year data');
  let allCandles = [];
  for (const [from, to] of chunks) {
    const r = await get(`/instruments/historical/260105/15minute?from=${from}&to=${to}&continuous=0&oi=0`);
    allCandles = allCandles.concat(r.data.candles);
    process.stdout.write('.');
  }
  console.log(' ' + allCandles.length + ' candles\n');

  const byDay = {};
  for (const c of allCandles) {
    const dt = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const d = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push({ hh: dt.getHours(), mm: dt.getMinutes(), o: c[1], h: c[2], l: c[3], c: c[4] });
  }

  const months = {};
  for (const d of Object.keys(byDay).sort()) {
    const m = d.slice(0, 7);
    if (!months[m]) months[m] = [];
    if (byDay[d].length >= 5) months[m].push(d);
  }

  const W = 95;
  console.log('═'.repeat(W));
  console.log('  5-YEAR COMPOUNDING SIMULATION  |  Jan 2021 → Apr 2026');
  console.log('  Start: Rs 50,000  |  +1 lot per Rs 50k capital gained  |  Rs 15/pt per lot');
  console.log('═'.repeat(W));
  console.log('  Month     │ Lots │ Rs/pt │  Pts   │ Month P&L       │ Capital          │ Note');
  console.log('  ' + '─'.repeat(W - 2));

  let capital = 50000;
  let totalPnl = 0;
  let peakCapital = 50000;
  let maxDD = 0;
  let worstMonth = { m: '', pnl: 0 };
  let bestMonth = { m: '', pnl: 0 };
  let yearSummary = {};

  for (const [month, dates] of Object.entries(months)) {
    const lots = Math.max(1, Math.floor(capital / LOT_MARGIN));
    const rsPerPt = lots * RS_PER_PT_PER_LOT;
    let monthPts = 0;
    for (const d of dates) monthPts += simDay(byDay[d]);
    const monthPnl = Math.round(monthPts * rsPerPt);
    capital += monthPnl;
    totalPnl += monthPnl;

    if (capital > peakCapital) peakCapital = capital;
    const dd = peakCapital - capital;
    if (dd > maxDD) maxDD = dd;

    if (monthPnl < worstMonth.pnl) worstMonth = { m: month, pnl: monthPnl };
    if (monthPnl > bestMonth.pnl) bestMonth = { m: month, pnl: monthPnl };

    const yr = month.slice(0, 4);
    if (!yearSummary[yr]) yearSummary[yr] = { pnl: 0, startCap: capital - monthPnl };
    yearSummary[yr].pnl += monthPnl;
    yearSummary[yr].endCap = capital;

    const newLots = Math.max(1, Math.floor(capital / LOT_MARGIN));
    const pnlStr = (monthPnl >= 0 ? '+Rs ' : '-Rs ') + Math.abs(monthPnl).toLocaleString('en-IN');
    const capStr = 'Rs ' + capital.toLocaleString('en-IN');
    const note = newLots > lots ? '▲ ' + newLots + ' lots' : monthPnl < 0 ? '▼ loss' : '';
    console.log(`  ${month}  │  ${String(lots).padEnd(3)} │  ${String(rsPerPt).padEnd(5)}│ ${String(monthPts >= 0 ? '+' + monthPts : monthPts).padEnd(6)} │ ${pnlStr.padEnd(15)} │ ${capStr.padEnd(16)} │ ${note}`);
  }

  console.log('  ' + '─'.repeat(W - 2));
  const retPct = ((capital - 50000) / 50000 * 100).toFixed(0);
  console.log(`\n  FINAL CAPITAL  : Rs ${capital.toLocaleString('en-IN')}`);
  console.log(`  TOTAL P&L      : +Rs ${totalPnl.toLocaleString('en-IN')}`);
  console.log(`  RETURN         : ${retPct}% on Rs 50,000 over ~5 years`);
  console.log(`  MAX DRAWDOWN   : Rs ${maxDD.toLocaleString('en-IN')}`);
  console.log(`  BEST MONTH     : ${bestMonth.m}  +Rs ${bestMonth.pnl.toLocaleString('en-IN')}`);
  console.log(`  WORST MONTH    : ${worstMonth.m}  -Rs ${Math.abs(worstMonth.pnl).toLocaleString('en-IN')}`);

  console.log('\n  YEAR-BY-YEAR SUMMARY:');
  console.log('  ' + '─'.repeat(55));
  for (const [yr, s] of Object.entries(yearSummary)) {
    const pct = ((s.endCap - s.startCap) / s.startCap * 100).toFixed(1);
    const pnlStr = (s.pnl >= 0 ? '+Rs ' : '-Rs ') + Math.abs(s.pnl).toLocaleString('en-IN');
    console.log(`  ${yr}  │ ${pnlStr.padEnd(18)} │ ${pct}% on year-start capital`);
  }
  console.log('═'.repeat(W) + '\n');
}

main().catch(e => console.error(e.message));

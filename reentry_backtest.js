// reentry_backtest.js — 5-year backtest comparing 3 re-entry modes
// Mode 1: Immediate flip (current live)
// Mode 2: Body breakout re-entry (wait for close to break SL candle body)
// Mode 3: High/Low breakout re-entry (wait for close to break SL candle high/low)
require('dotenv').config({ override: true });
const https = require('https');
const K = process.env.API_KEY, T = process.env.ACCESS_TOKEN, RS = 15;

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

// reMode: 'immediate' | 'body' | 'highlow'
function simDay(cs, reMode) {
  const SL1 = 50, SL2 = 100;
  if (cs.length < 2) return { pts: 0, reEntry: false, reSkipped: false };
  let phase = 'SCAN', t1D = null, t1E = 0, reD = null, reE = 0, pts = 0;
  let slCandle = null; // the candle where T1 SL was hit
  let reEntry = false, reSkipped = false;

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
        slCandle = c; // save the SL candle for breakout check

        if (reMode === 'immediate') {
          reE = c.c; phase = 'RE'; reEntry = true;
        } else {
          phase = 'RE_WAIT'; // wait for breakout confirmation
        }
        continue;
      }
    }

    if (phase === 'RE_WAIT') {
      if (eod) { reSkipped = true; break; } // no confirmation before EOD
      // Body breakout: close breaks beyond SL candle body in re-entry direction
      const slBodyH = Math.max(slCandle.o, slCandle.c);
      const slBodyL = Math.min(slCandle.o, slCandle.c);
      const slHigh = slCandle.h;
      const slLow = slCandle.l;

      let triggered = false;
      if (reMode === 'body') {
        triggered = reD === 'PE' ? c.c < slBodyL : c.c > slBodyH;
      } else if (reMode === 'highlow') {
        triggered = reD === 'PE' ? c.c < slLow : c.c > slHigh;
      }

      if (triggered) {
        reE = c.c; phase = 'RE'; reEntry = true;
      }
      continue;
    }

    if (phase === 'RE') {
      const p = reD === 'CE' ? c.c - reE : reE - c.c;
      if (eod) { pts += p; break; }
      if (p <= -SL2) { pts -= SL2; phase = 'DONE'; continue; }
    }
  }
  return { pts: Math.round(pts), reEntry, reSkipped };
}

async function main() {
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

  process.stdout.write('Fetching 5yr data');
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

  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);

  const modes = [
    { key: 'immediate', label: 'Mode 1: Immediate flip (LIVE NOW)' },
    { key: 'body',      label: 'Mode 2: Body breakout re-entry' },
    { key: 'highlow',   label: 'Mode 3: High/Low breakout re-entry' },
  ];

  const results = {};
  for (const m of modes) {
    results[m.key] = { pts: 0, rs: 0, wins: 0, losses: 0, flat: 0, reEntries: 0, reSkipped: 0, maxDD: 0, peak: 0, days: dates.length };
  }

  // Also track monthly breakdown
  const monthly = {};
  for (const d of dates) {
    const mo = d.slice(0, 7);
    if (!monthly[mo]) monthly[mo] = { immediate: 0, body: 0, highlow: 0 };
    for (const m of modes) {
      const r = simDay(byDay[d], m.key);
      monthly[mo][m.key] += r.pts;
      results[m.key].pts += r.pts;
      if (r.pts > 0) results[m.key].wins++;
      else if (r.pts < 0) results[m.key].losses++;
      else results[m.key].flat++;
      if (r.reEntry) results[m.key].reEntries++;
      if (r.reSkipped) results[m.key].reSkipped++;
    }
  }

  // Compute Rs
  for (const m of modes) {
    results[m.key].rs = results[m.key].pts * RS;
  }

  const W = 80;
  console.log('═'.repeat(W));
  console.log('  5-YEAR RE-ENTRY BACKTEST  |  Jan 2021 – Apr 2026  |  1,323 trading days');
  console.log('  Rs 15/pt (1 lot fixed)');
  console.log('═'.repeat(W));

  for (const m of modes) {
    const r = results[m.key];
    const wr = (r.wins / r.days * 100).toFixed(1);
    console.log(`\n  ${m.label}`);
    console.log(`  ${'─'.repeat(W - 2)}`);
    console.log(`  Total P&L    : ${r.pts >= 0 ? '+' : ''}${r.pts} pts  =  Rs ${r.rs.toLocaleString('en-IN')}`);
    console.log(`  Win days     : ${r.wins}/${r.days} = ${wr}%`);
    console.log(`  Loss days    : ${r.losses}  |  Flat: ${r.flat}`);
    console.log(`  Re-entries   : ${r.reEntries} taken  |  ${r.reSkipped} skipped (no signal before EOD)`);
  }

  // Month-by-month comparison table
  console.log('\n\n' + '═'.repeat(W));
  console.log('  YEAR-BY-YEAR BREAKDOWN');
  console.log('═'.repeat(W));
  console.log('  Year  │ Immediate (live)   │ Body breakout      │ High/Low breakout');
  console.log('  ' + '─'.repeat(W - 2));

  const yearly = {};
  for (const [mo, v] of Object.entries(monthly)) {
    const yr = mo.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = { immediate: 0, body: 0, highlow: 0 };
    yearly[yr].immediate += v.immediate;
    yearly[yr].body += v.body;
    yearly[yr].highlow += v.highlow;
  }

  for (const [yr, v] of Object.entries(yearly)) {
    const f = x => (x >= 0 ? '+' : '') + x + 'pts Rs' + (x * RS).toLocaleString('en-IN');
    console.log(`  ${yr}  │ ${f(v.immediate).padEnd(18)} │ ${f(v.body).padEnd(18)} │ ${f(v.highlow)}`);
  }

  console.log('  ' + '─'.repeat(W - 2));
  const tot = k => Object.values(yearly).reduce((s, v) => s + v[k], 0);
  const ti = tot('immediate'), tb = tot('body'), th = tot('highlow');
  const f = x => (x >= 0 ? '+' : '') + x + 'pts Rs' + (x * RS).toLocaleString('en-IN');
  console.log(`  TOTAL │ ${f(ti).padEnd(18)} │ ${f(tb).padEnd(18)} │ ${f(th)}`);
  console.log('═'.repeat(W));

  // Winner
  const winner = tb > ti && tb > th ? 'Body breakout' : th > ti && th > tb ? 'High/Low breakout' : 'Immediate flip (current)';
  const bodyDiff = tb - ti, hlDiff = th - ti;
  console.log(`\n  WINNER: ${winner}`);
  console.log(`  Body breakout vs Immediate: ${bodyDiff >= 0 ? '+' : ''}${bodyDiff} pts = Rs ${(bodyDiff * RS).toLocaleString('en-IN')}`);
  console.log(`  High/Low vs Immediate     : ${hlDiff >= 0 ? '+' : ''}${hlDiff} pts = Rs ${(hlDiff * RS).toLocaleString('en-IN')}`);
  console.log('');
}

main().catch(e => console.error(e.message));

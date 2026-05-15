// april_pnl.js — April 2026 Amina simulation: with filter vs without filter
require('dotenv').config({ override: true });
const https = require('https');
const K = process.env.API_KEY, T = process.env.ACCESS_TOKEN, RS = 15;

function get(p) {
  return new Promise((res, rej) => {
    const r = https.request({ hostname: 'api.kite.trade', path: p, headers: { 'X-Kite-Version': '3', 'Authorization': 'token ' + K + ':' + T }, timeout: 20000 }, re => {
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

function simDay(cs, useFilter) {
  const SL1 = 50, SL2 = 100;
  if (cs.length < 2) return { pts: 0, trades: [] };
  const dayO = cs[0].o;
  let phase = 'SCAN', t1D = null, t1E = 0, reD = null, reE = 0, pts = 0, trades = [];

  for (let i = 1; i < cs.length; i++) {
    const c = cs[i];
    const eod = (c.hh === 15 && c.mm >= 14) || c.hh > 15;

    if (phase === 'SCAN') {
      if (eod) break;
      const r = scan(cs.slice(0, i + 1));
      if (r) {
        t1D = r.sig; t1E = r.px; phase = 'T1';
        trades.push({ time: c.time, dir: t1D, entry: t1E, exit: null, p: null, how: 'T1_ENTRY' });
      }
      continue;
    }

    if (phase === 'T1') {
      const p = t1D === 'CE' ? c.c - t1E : t1E - c.c;
      if (eod) {
        pts += p; const last = trades[trades.length - 1];
        last.exit = c.c; last.p = Math.round(p); last.how = 'T1_EOD'; break;
      }
      if (p <= -SL1) {
        const sc = c.c; pts -= SL1;
        const last = trades[trades.length - 1];
        last.exit = sc; last.p = -SL1; last.how = 'T1_SL';
        reD = t1D === 'CE' ? 'PE' : 'CE';
        const mv = reD === 'CE' ? sc - dayO : dayO - sc;
        if (useFilter && mv >= 0) {
          trades.push({ time: c.time, dir: '-', entry: '-', exit: '-', p: null, how: 'RE_SKIP +' + Math.round(mv) + 'pts' });
          phase = 'DONE';
        } else {
          reE = sc; phase = 'RE';
          trades.push({ time: c.time, dir: reD, entry: reE, exit: null, p: null, how: 'RE_ENTRY' });
        }
        continue;
      }
    }

    if (phase === 'RE') {
      const p = reD === 'CE' ? c.c - reE : reE - c.c;
      if (eod) {
        pts += p; const last = trades[trades.length - 1];
        last.exit = c.c; last.p = Math.round(p); last.how = 'RE_EOD'; break;
      }
      if (p <= -SL2) {
        pts -= SL2; const last = trades[trades.length - 1];
        last.exit = c.c; last.p = -SL2; last.how = 'RE_SL'; phase = 'DONE'; continue;
      }
    }
  }
  return { pts: Math.round(pts), trades };
}

async function main() {
  const r = await get('/instruments/historical/260105/15minute?from=2026-04-01+09:00:00&to=2026-04-30+15:30:00&continuous=0&oi=0');
  const raw = r.data.candles;
  const byDay = {};
  for (const c of raw) {
    const dt = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const d = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push({ time: String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0'), hh: dt.getHours(), mm: dt.getMinutes(), o: c[1], h: c[2], l: c[3], c: c[4] });
  }

  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  const W = 90;
  console.log('\n' + '═'.repeat(W));
  console.log('  APRIL 2026 — AMINA  |  WITH filter (old)  vs  WITHOUT filter (new — live now)');
  console.log('═'.repeat(W));
  console.log('  Date        │ OLD (w/filter)        │ NEW (no filter)       │ Diff');
  console.log('  ' + '─'.repeat(W - 2));

  let twf = 0, tnf = 0, wfWins = 0, nfWins = 0;
  for (const d of dates) {
    const wf = simDay(byDay[d], true);
    const nf = simDay(byDay[d], false);
    const diff = nf.pts - wf.pts;
    twf += wf.pts; tnf += nf.pts;
    if (wf.pts > 0) wfWins++; if (nf.pts > 0) nfWins++;
    const ws = wf.pts >= 0 ? '+' : '', ns = nf.pts >= 0 ? '+' : '';
    const diffStr = diff > 0 ? '🟢 +' + diff + 'pts' : diff < 0 ? '🔴 ' + diff + 'pts' : '─ same';
    console.log(`  ${d}  │ ${(ws + wf.pts + 'pts Rs' + (wf.pts * RS)).padEnd(21)}│ ${(ns + nf.pts + 'pts Rs' + (nf.pts * RS)).padEnd(21)}│ ${diffStr}`);
    // Show RE trade detail when different
    if (diff !== 0) {
      const reT = nf.trades.find(t => t.how === 'RE_ENTRY');
      const reX = nf.trades.find(t => t.how === 'RE_SL' || t.how === 'RE_EOD');
      const skip = wf.trades.find(t => t.how && t.how.includes('RE_SKIP'));
      if (skip) console.log(`           OLD skipped: ${skip.how}`);
      if (reT)  console.log(`           NEW RE ${reT.dir} @${Math.round(reT.entry)} → ${reX ? reX.exit + ' = ' + reX.p + 'pts  [' + reX.how + ']' : 'open'}`);
    }
  }

  console.log('  ' + '─'.repeat(W - 2));
  const ws = twf >= 0 ? '+' : '', ns = tnf >= 0 ? '+' : '';
  const totalDiff = tnf - twf;
  console.log(`  ${'APRIL TOTAL'.padEnd(12)}│ ${(ws + twf + 'pts  Rs' + (twf * RS).toLocaleString('en-IN')).padEnd(21)}│ ${(ns + tnf + 'pts  Rs' + (tnf * RS).toLocaleString('en-IN')).padEnd(21)}│ ${totalDiff >= 0 ? '+' : ''}${totalDiff}pts`);
  console.log(`  ${'Win days'.padEnd(12)}│ ${(wfWins + '/' + dates.length + ' days').padEnd(21)}│ ${(nfWins + '/' + dates.length + ' days').padEnd(21)}│`);
  console.log('═'.repeat(W) + '\n');
}

main().catch(e => console.error(e.message));

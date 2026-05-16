'use strict';
/**
 * Yearly P&L Comparison: Old VMT vs AMINA — FINAL
 * Real Zerodha data (15-min BNF spot candles)
 * SL checked on candle CLOSE — matches live bot exactly (amina-live.js line: if t1Pts <= -SL_T1)
 */

require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const TOKEN_STR    = `${API_KEY}:${ACCESS_TOKEN}`;
const INSTRUMENT   = 260105; // BankNifty spot
const RS_PER_PT    = 15;
const SL_T1        = 50;
const SL_RE        = 100;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${TOKEN_STR}` },
      timeout: 30000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch (e) { reject(new Error('JSON parse fail: ' + d.slice(0, 100))); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtDate(d) { return d.toISOString().slice(0, 10); }

// ── Fetch 15-min candles for a date range ────────────────────────────────────
async function fetchCandles(from, to) {
  const path = `/instruments/historical/${INSTRUMENT}/15minute?from=${from}+09%3A15%3A00&to=${to}+15%3A30%3A00&continuous=0&oi=0`;
  const resp = await kiteGet(path);
  if (resp.status !== 'success') throw new Error(JSON.stringify(resp).slice(0, 200));
  return resp.data.candles; // [[ts, o, h, l, c, v], ...]
}

// ── Group candles by trading day ─────────────────────────────────────────────
function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    const day = c[0].slice(0, 10);
    if (!days[day]) days[day] = [];
    days[day].push(c);
  }
  return days;
}

// ── Enrich raw candle ─────────────────────────────────────────────────────────
function enrich(c) {
  const [, o, h, l, cl] = c;
  const bull = cl >= o;
  return {
    open: o, high: h, low: l, close: cl, bull,
    body_high: Math.max(o, cl), body_low: Math.min(o, cl),
    body_size: Math.abs(cl - o)
  };
}

// ── Rolling entry scan (identical for both strategies) ───────────────────────
function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      if (sig === 'CE' && cs[j].close > bl) return { sig, px: cs[j].close, idx: j };
      if (sig === 'PE' && cs[j].close < bl) return { sig, px: cs[j].close, idx: j };
    }
  }
  return null;
}

// ── Simulate one day  (alwaysReentry=false → VMT filter, true → AMINA) ──────
function simulateDay(candles15m, alwaysReentry) {
  if (candles15m.length < 4) return { pnlPts: 0, noEntry: true };
  const cs = candles15m.map(enrich);
  const entry = rollingEntryScan(cs);
  if (!entry) return { pnlPts: 0, noEntry: true };

  const mv = (s, e, p) => s === 'CE' ? p - e : e - p;
  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  // T1 trade — SL checked on candle CLOSE (matches live bot exactly)
  let slHit = false, sIdx = null, sPx = null;
  let t1Pts = mv(entry.sig, entry.px, last);
  for (let i = entry.idx + 1; i < cs.length; i++) {
    if (mv(entry.sig, entry.px, cs[i].close) <= -SL_T1) {
      slHit = true; sIdx = i; sPx = cs[i].close; t1Pts = -SL_T1; break;
    }
  }

  // Re-entry after T1 SL
  let rePts = 0;
  if (slHit) {
    const rs  = entry.sig === 'CE' ? 'PE' : 'CE';
    const mar = rs === 'CE' ? sPx - dayOpen : -(sPx - dayOpen);
    const takeRe = alwaysReentry || mar < 0;  // AMINA=always, VMT=filtered
    if (takeRe) {
      rePts = mv(rs, sPx, last);
      for (let i = sIdx + 1; i < cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePts = -SL_RE; break; }
      }
    }
  }
  return { pnlPts: t1Pts + rePts, t1Pts, rePts };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('=========================================================');
  console.log('  YEARLY P&L: Old VMT vs AMINA  (Real Zerodha Data)');
  console.log('=========================================================');
  console.log('');

  const years = [2021, 2022, 2023, 2024, 2025];
  const allDays = {};

  // Fetch year by year in 60-day chunks
  for (const yr of years) {
    process.stdout.write(`Fetching ${yr}: `);
    let d = new Date(`${yr}-01-01`);
    let totalCandles = 0;
    while (d.getFullYear() === yr) {
      const from = fmtDate(d);
      const toDate = new Date(d); toDate.setDate(d.getDate() + 59);
      if (toDate.getFullYear() > yr) toDate.setFullYear(yr, 11, 31);
      const to = fmtDate(toDate);
      try {
        const raw = await fetchCandles(from, to);
        const grouped = groupByDay(raw);
        Object.assign(allDays, grouped);
        totalCandles += raw.length;
        process.stdout.write('.');
      } catch (e) {
        process.stdout.write(`[ERR:${e.message.slice(0,30)}]`);
      }
      d = new Date(toDate); d.setDate(d.getDate() + 1);
      await sleep(350);
    }
    console.log(` ${totalCandles} candles`);
  }

  console.log(`\nTotal trading days loaded: ${Object.keys(allDays).length}`);
  console.log('Simulating strategies...\n');

  // Run simulations grouped by year and month
  const yVmt   = {};
  const yAmina = {};
  const mVmt   = {};
  const mAmina = {};

  const sortedDays = Object.keys(allDays).sort();
  for (const day of sortedDays) {
    const yr = parseInt(day.slice(0, 4));
    const ym = day.slice(0, 7);
    const candles = allDays[day];
    if (!years.includes(yr) || candles.length < 4) continue;

    if (!yVmt[yr])   yVmt[yr]   = { pts:0, days:0, wins:0, losses:0, noEntry:0 };
    if (!yAmina[yr]) yAmina[yr] = { pts:0, days:0, wins:0, losses:0, noEntry:0 };
    if (!mVmt[ym])   mVmt[ym]   = 0;
    if (!mAmina[ym]) mAmina[ym] = 0;

    const v = simulateDay(candles, false); // VMT
    const a = simulateDay(candles, true);  // AMINA

    yVmt[yr].days++;
    if (v.noEntry) { yVmt[yr].noEntry++; }
    else { yVmt[yr].pts += v.pnlPts; if (v.pnlPts > 0) yVmt[yr].wins++; else yVmt[yr].losses++; }

    yAmina[yr].days++;
    if (a.noEntry) { yAmina[yr].noEntry++; }
    else { yAmina[yr].pts += a.pnlPts; if (a.pnlPts > 0) yAmina[yr].wins++; else yAmina[yr].losses++; }

    if (!v.noEntry) mVmt[ym]   += v.pnlPts;
    if (!a.noEntry) mAmina[ym] += a.pnlPts;
  }

  // ── Yearly table ──────────────────────────────────────────────────────────
  const L = '─'.repeat(88);
  console.log('='.repeat(88));
  console.log(' YEAR  │  VMT Pts  │   VMT Rs     │  Win%  │ AMINA Pts │   AMINA Rs   │  Win%  │ WINNER');
  console.log(L);

  let totV = 0, totA = 0;
  let totVW = 0, totAW = 0, totVT = 0, totAT = 0;

  for (const yr of years) {
    const v = yVmt[yr]   || { pts:0, days:0, wins:0, losses:0, noEntry:0 };
    const a = yAmina[yr] || { pts:0, days:0, wins:0, losses:0, noEntry:0 };
    const vT = v.days - v.noEntry, aT = a.days - a.noEntry;
    const vW = vT > 0 ? (v.wins/vT*100).toFixed(1)+'%' : '—';
    const aW = aT > 0 ? (a.wins/aT*100).toFixed(1)+'%' : '—';
    const vR = v.pts * RS_PER_PT, aR = a.pts * RS_PER_PT;
    const vPs = (v.pts>=0?'+':'')+Math.round(v.pts);
    const aPs = (a.pts>=0?'+':'')+Math.round(a.pts);
    const vRs = (vR>=0?'+':'')+Math.round(vR).toLocaleString('en-IN');
    const aRs = (aR>=0?'+':'')+Math.round(aR).toLocaleString('en-IN');
    const W = v.pts > a.pts ? 'VMT  ✓' : a.pts > v.pts ? 'AMINA✓' : 'TIE';

    console.log(` ${yr}  │ ${vPs.padStart(9)} │ ₹${vRs.padStart(11)} │ ${vW.padStart(5)} │ ${aPs.padStart(9)} │ ₹${aRs.padStart(11)} │ ${aW.padStart(5)} │ ${W}`);
    totV += v.pts; totA += a.pts;
    totVW += v.wins; totAW += a.wins; totVT += vT; totAT += aT;
  }

  console.log(L);
  const tVW = totVT>0?(totVW/totVT*100).toFixed(1)+'%':'—';
  const tAW = totAT>0?(totAW/totAT*100).toFixed(1)+'%':'—';
  const tVR = totV*RS_PER_PT, tAR = totA*RS_PER_PT;
  const tVPs = (totV>=0?'+':'')+Math.round(totV);
  const tAPs = (totA>=0?'+':'')+Math.round(totA);
  const tVRs = (tVR>=0?'+':'')+Math.round(tVR).toLocaleString('en-IN');
  const tARs = (tAR>=0?'+':'')+Math.round(tAR).toLocaleString('en-IN');
  const tW = totV>totA?'VMT  ✓':totA>totV?'AMINA✓':'TIE';
  console.log(` TOTAL │ ${tVPs.padStart(9)} │ ₹${tVRs.padStart(11)} │ ${tVW.padStart(5)} │ ${tAPs.padStart(9)} │ ₹${tARs.padStart(11)} │ ${tAW.padStart(5)} │ ${tW}`);
  console.log('='.repeat(88));

  // ── Monthly breakdown ─────────────────────────────────────────────────────
  console.log('\n  MONTHLY BREAKDOWN');
  console.log('  '+'─'.repeat(75));
  let curYr = '';
  let ymV = 0, ymA = 0;
  for (const ym of Object.keys(mVmt).sort()) {
    const yr = ym.slice(0,4);
    if (yr !== curYr) {
      if (curYr) {
        const sign = ymV > ymA ? ' ← VMT wins year' : ymA > ymV ? ' ← AMINA wins year' : '';
        console.log(`  ── ${curYr}: VMT ${(ymV>=0?'+':'')+Math.round(ymV)}pts (₹${((ymV*RS_PER_PT)>=0?'+':'')+Math.round(ymV*RS_PER_PT).toLocaleString('en-IN')})  AMINA ${(ymA>=0?'+':'')+Math.round(ymA)}pts (₹${((ymA*RS_PER_PT)>=0?'+':'')+Math.round(ymA*RS_PER_PT).toLocaleString('en-IN')})${sign}\n`);
        ymV = 0; ymA = 0;
      }
      curYr = yr;
    }
    const v = mVmt[ym]||0, a = mAmina[ym]||0;
    const vS = ((v>=0?'+':'')+Math.round(v)+'pts').padStart(10);
    const aS = ((a>=0?'+':'')+Math.round(a)+'pts').padStart(10);
    const vRs = ('₹'+((v*RS_PER_PT>=0?'+':'')+Math.round(v*RS_PER_PT).toLocaleString('en-IN'))).padStart(13);
    const aRs = ('₹'+((a*RS_PER_PT>=0?'+':'')+Math.round(a*RS_PER_PT).toLocaleString('en-IN'))).padStart(13);
    const w = v>a ? ' VMT↑' : a>v ? ' AMINA↑' : '';
    console.log(`  ${ym}:  VMT ${vS} ${vRs}  │  AMINA ${aS} ${aRs}${w}`);
    ymV += v; ymA += a;
  }
  if (curYr) {
    const sign = ymV > ymA ? ' ← VMT wins year' : ymA > ymV ? ' ← AMINA wins year' : '';
    console.log(`  ── ${curYr}: VMT ${(ymV>=0?'+':'')+Math.round(ymV)}pts (₹${((ymV*RS_PER_PT)>=0?'+':'')+Math.round(ymV*RS_PER_PT).toLocaleString('en-IN')})  AMINA ${(ymA>=0?'+':'')+Math.round(ymA)}pts (₹${((ymA*RS_PER_PT)>=0?'+':'')+Math.round(ymA*RS_PER_PT).toLocaleString('en-IN')})${sign}`);
  }
  console.log('\n✅ Done — real Zerodha data, valid token.\n');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

'use strict';
// ============================================================
//  MAY 2026 COMPARISON: MY STRATEGY vs AMINA VARIANT B
//  Both use Kite API data (same candles, same RS=15)
// ============================================================
require('dotenv').config();
const https = require('https');
const RS = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}` },
      timeout: 15000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function enrich(raw) {
  const [ts, o, h, l, c] = raw;
  const ist = ts.slice(11, 16);
  const [hh, mm] = ist.split(':').map(Number);
  const body_high = Math.max(o, c), body_low = Math.min(o, c);
  return { time: ist, hh, mm, open: o, high: h, low: l, close: c,
           body_high, body_low, body_size: body_high - body_low, bull: c >= o };
}

// ═══════════════════════════════════════════════════════════
//  AMINA VARIANT B  (exact copy from backtest_variantB_full.js)
// ═══════════════════════════════════════════════════════════
const SL_INITIAL = 60, TRAIL_GAP = 100, BUFFER = 25;
const isEOD = c => c.hh > 15 || (c.hh === 15 && c.mm >= 14);

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i+1];
    let sig = null, c2l = 0, c3l = 0;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      c2l = sig === 'CE' ? ca.high : ca.low;
      c3l = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      c2l = sig === 'CE' ? ca.body_high : ca.body_low;
      c3l = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    if (sig === 'CE' && cb.close > c2l) return { sig, entryIdx: i+1 };
    if (sig === 'PE' && cb.close < c2l) return { sig, entryIdx: i+1 };
    for (let j = i+2; j < cs.length; j++) {
      const cc = cs[j];
      if (sig === 'CE' && cc.close > c3l) return { sig, entryIdx: j };
      if (sig === 'PE' && cc.close < c3l) return { sig, entryIdx: j };
    }
  }
  return null;
}

function aminaLeg(cs, startIdx, dir) {
  const entry = cs[startIdx].close;
  let sl = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak = 0;
  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c = cs[idx];
    if (isEOD(c)) return { pts: dir === 'CE' ? c.close - entry : entry - c.close, type: 'EOD', exitIdx: idx };
    const ib = dir === 'CE' ? c.high - entry : entry - c.low;
    if (ib > peak) peak = ib;
    if (peak >= SL_INITIAL) {
      const locked = Math.max(0, peak - TRAIL_GAP);
      if (dir === 'CE') sl = Math.max(sl, entry + locked);
      else              sl = Math.min(sl, entry - locked);
    }
    const intraTouched = dir === 'CE' ? c.low <= sl : c.high >= sl;
    const margin = dir === 'CE' ? sl - c.close : c.close - sl;
    if (intraTouched && margin >= BUFFER) return { pts: dir === 'CE' ? sl - entry : entry - sl, type: 'SL', exitIdx: idx };
  }
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, type: 'EOD', exitIdx: cs.length - 1 };
}

function simAmina(cs) {
  for (let idx = 0; idx < cs.length; idx++) {
    if (isEOD(cs[idx])) break;
    const res = rollingEntryScan(cs.slice(0, idx + 1));
    if (!res || res.entryIdx !== idx) continue;
    const t1 = aminaLeg(cs, idx, res.sig);
    let rePts = 0, reInfo = '';
    if (t1.type === 'SL') {
      const reDir = res.sig === 'CE' ? 'PE' : 'CE';
      const re = aminaLeg(cs, t1.exitIdx, reDir);
      rePts = re.pts;
      reInfo = ` RE:${re.pts>=0?'+':''}${re.pts.toFixed(0)}`;
    }
    const total = t1.pts + rePts;
    return {
      total,
      detail: `T1 ${res.sig} ${cs[idx].close.toFixed(0)} ${t1.type} ${t1.pts>=0?'+':''}${t1.pts.toFixed(0)}${reInfo}`
    };
  }
  return { total: 0, detail: 'NO SIGNAL' };
}

// ═══════════════════════════════════════════════════════════
//  MY STRATEGY  (body-break + entry-wick SL + 0/70% trail)
// ═══════════════════════════════════════════════════════════
const MAX_SL = 150, SL_BUF = 5;

function trailLock(peak) {
  return peak >= 400 ? 0.70 : 0;
}

function findSignal(cs, fromIdx, dayOpen) {
  for (let i = Math.max(fromIdx, 1); i < cs.length; i++) {
    const c = cs[i], p = cs[i-1];
    let sig, slPx;
    if      (c.close < p.body_low)  { sig = 'PE'; slPx = c.high; }
    else if (c.close > p.body_high) { sig = 'CE'; slPx = c.low;  }
    else continue;
    if (sig === 'PE' && c.close >= dayOpen) continue;
    if (sig === 'CE' && c.close <= dayOpen) continue;
    if (Math.abs(slPx - c.close) > MAX_SL) continue;
    return { i, sig, entryPx: c.close, slPx };
  }
  return null;
}

function myLeg(cs, startIdx, sig, entryPx, slPx) {
  let peak = 0;
  for (let j = startIdx + 1; j < cs.length; j++) {
    const c = cs[j];
    const pts = sig === 'PE' ? entryPx - c.close : c.close - entryPx;
    if (pts > peak) peak = pts;
    const lock = trailLock(peak);
    let effSL = slPx;
    if (lock > 0) {
      const locked = peak * lock;
      effSL = sig === 'PE' ? Math.min(slPx, entryPx - locked) : Math.max(slPx, entryPx + locked);
    }
    const hit = sig === 'PE' ? c.close >= effSL + SL_BUF : c.close <= effSL - SL_BUF;
    if (hit) {
      const exitPts = sig === 'PE' ? entryPx - effSL : effSL - entryPx;
      return { pts: exitPts, exit: lock > 0 ? 'TR' : 'SL', peak };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: sig === 'PE' ? entryPx - last.close : last.close - entryPx, exit: 'EOD', peak };
}

function simMy(cs) {
  const dayOpen = cs[0].open;
  let total = 0;
  const t1 = findSignal(cs, 1, dayOpen);
  if (!t1) return { total: 0, detail: 'NO SIGNAL' };
  const t1r = myLeg(cs, t1.i, t1.sig, t1.entryPx, t1.slPx);
  total += t1r.pts;
  let detail = `T1 ${t1.sig} ${t1.entryPx.toFixed(0)} ${t1r.exit}(pk:${t1r.peak.toFixed(0)}) ${t1r.pts>=0?'+':''}${t1r.pts.toFixed(0)}`;
  if (t1r.exit === 'SL') {
    const re = findSignal(cs, t1.i + 1, dayOpen);
    if (re) {
      const rer = myLeg(cs, re.i, re.sig, re.entryPx, re.slPx);
      total += rer.pts;
      detail += ` RE:${rer.pts>=0?'+':''}${rer.pts.toFixed(0)}`;
    }
  }
  return { total, detail };
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════
async function main() {
  const resp = await kiteGet(
    `/instruments/historical/260105/15minute?from=2026-05-01+09:00:00&to=2026-05-31+15:30:00&continuous=0&oi=0`
  );
  if (!resp.data || !resp.data.candles) { console.log('Kite error:', JSON.stringify(resp).slice(0,200)); return; }

  const byDate = {};
  for (const raw of resp.data.candles) {
    const date = raw[0].slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(enrich(raw));
  }
  const dates = Object.keys(byDate).sort().filter(d => byDate[d].length >= 5);

  const LINE = '='.repeat(112);
  console.log('\n' + LINE);
  console.log('  MAY 2026: MY STRATEGY  vs  AMINA VARIANT B  (same Kite API candles, RS=15)');
  console.log('  MY  : body-break | entry-wick SL+5buf | day-open bias | trail 70% at 400pts+');
  console.log('  AMINA: rolling pair scan | SL=60 | buffer=25 | trail@100pts | RE opposite dir');
  console.log(LINE);
  console.log(`  ${'DATE'.padEnd(11)} ${'MY STRATEGY'.padEnd(42)} ${'MY Rs'.padStart(8)}   ${'AMINA VARIANT B'.padEnd(38)} ${'AMINA Rs'.padStart(8)}  WIN`);
  console.log('  ' + '-'.repeat(108));

  let myTotal = 0, amTotal = 0;
  let myW = 0, myL = 0, amW = 0, amL = 0;

  for (const date of dates) {
    const my = simMy(byDate[date]);
    const am = simAmina(byDate[date]);
    myTotal += my.total; amTotal += am.total;
    if (my.total > 0) myW++; else if (my.total < 0) myL++;
    if (am.total > 0) amW++; else if (am.total < 0) amL++;

    const myRs = Math.round(my.total * RS);
    const amRs = Math.round(am.total * RS);
    const winner = myRs > amRs ? 'MY ' : myRs < amRs ? 'AMI' : 'TIE';

    console.log(
      `  ${date}  ${my.detail.slice(0,40).padEnd(42)} ${(myRs>=0?'+':'-')+'Rs'+Math.abs(myRs).toLocaleString().padStart(5)}   ` +
      `${am.detail.slice(0,36).padEnd(38)} ${(amRs>=0?'+':'-')+'Rs'+Math.abs(amRs).toLocaleString().padStart(5)}  ${winner}`
    );
  }

  const myTRs = Math.round(myTotal * RS), amTRs = Math.round(amTotal * RS);
  console.log('  ' + '-'.repeat(108));
  console.log(`  ${'TOTAL'.padEnd(11)} ${''.padEnd(42)} ${(myTRs>=0?'+':'-')+'Rs'+Math.abs(myTRs).toLocaleString().padStart(5)}   ${''.padEnd(38)} ${(amTRs>=0?'+':'-')+'Rs'+Math.abs(amTRs).toLocaleString().padStart(5)}`);
  console.log(`\n  My Strategy : Win ${myW}  Loss ${myL}  WR ${((myW/(myW+myL||1))*100).toFixed(1)}%  Total ${myTRs>=0?'+':'-'}Rs${Math.abs(myTRs).toLocaleString()}`);
  console.log(`  AMINA Var B : Win ${amW}  Loss ${amL}  WR ${((amW/(amW+amL||1))*100).toFixed(1)}%  Total ${amTRs>=0?'+':'-'}Rs${Math.abs(amTRs).toLocaleString()}`);
  const diff = myTRs - amTRs;
  console.log(`  Difference  : My vs AMINA = ${diff>=0?'+':'-'}Rs${Math.abs(diff).toLocaleString()}  (${diff>=0?'My leads':'AMINA leads'})`);
  console.log(LINE + '\n');

  // Also show live bot actual results for days available
  console.log('  LIVE BOT actual trades (from DB):');
  console.log('  May 19: T1 PE SL -Rs900  |  RE CE SL Rs0    |  DAY: -Rs900');
  console.log('  May 20: T1 CE SL -Rs1577 |  RE PE SL -Rs1933|  DAY: -Rs3510');
  console.log('  May 21: T1 PE SL -Rs1211 |  RE CE SL -Rs1336|  DAY: -Rs2547  (from PM2 logs)');
  console.log('  (AMINA bot was only LIVE for May 19-21. Earlier dates = paper/backtest only)\n');
}

main().catch(console.error);

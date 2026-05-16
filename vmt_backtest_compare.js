'use strict';
/**
 * VMT Backtest — Compares two strategies on BankNifty 1-min data (5 years)
 *
 * OLD STRATEGY (backtest_5yr_clean):
 *   Signal:  2-candle pattern (same direction OR engulfing) on 15-min spot candles
 *   Entry:   Breakout above/below signal candle body
 *   SL:      Fixed 50 pts on option premium
 *   Re-entry:Opposite side after SL, 100pt SL, filtered by day open
 *
 * NEW STRATEGY (VMT v3 — vmt-shadow-v3.js):
 *   Signal:  First directional 1-min BNF SPOT candle 9:15–9:20 (body >= 20pts)
 *   Entry:   ATM option premium at signal candle close (via Black-Scholes)
 *   SL:      ATM option premium at candle low (CE) or high (PE) — dynamic
 *   Trail:   Ratchet — lock previous R-multiple as floor each time new R is hit
 *   Exit:    Trail SL hit or 11:30 time exit
 */

require('dotenv').config({path: '/home/ubuntu/trading-bot/.env'});
const https  = require('https');
const fs     = require('fs');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const LOT_SIZE     = 15;   // BNF lot size (current)
const IV_LIVE      = 20;   // IV% for BS pricing
const MIN_BODY_PTS = 20;   // min BNF spot candle body to qualify

// ── Kite fetch ────────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 30000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function fmtDate(d) { return d.toISOString().slice(0,10); }

// ── Black-Scholes ─────────────────────────────────────────────────────────────
function normalCDF(x){
  const a1=0.254829592,a2=-0.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=0.3275911;
  const sign=x<0?-1:1; x=Math.abs(x)/Math.sqrt(2);
  const t=1.0/(1.0+p*x);
  const y=1-(((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t)*Math.exp(-x*x);
  return 0.5*(1.0+sign*y);
}
function bs(S,K,T,sigma,type){
  if(T<=0) return Math.max(type==='CE'?S-K:K-S,0);
  const r=0.065;
  const d1=(Math.log(S/K)+(r+0.5*sigma*sigma)*T)/(sigma*Math.sqrt(T));
  const d2=d1-sigma*Math.sqrt(T);
  return type==='CE'
    ? S*normalCDF(d1)-K*Math.exp(-r*T)*normalCDF(d2)
    : K*Math.exp(-r*T)*normalCDF(-d2)-S*normalCDF(-d1);
}
function optPrem(spot, strike, dte, type) {
  const T = Math.max(dte/252, 0.001);
  return Math.round(bs(spot, strike, T, IV_LIVE/100, type)*100)/100;
}
function daysToThursday(dateStr) {
  const d = new Date(dateStr+'T09:15:00+05:30');
  const day = d.getDay();
  let delta = (4-day+7)%7; if(delta===0) delta=7;
  return delta;
}
function getATM(spot) { return Math.round(spot/100)*100; }

// ── Group candles by day ──────────────────────────────────────────────────────
function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    // c[0] = "2024-01-02T09:15:00+0530"
    const day = c[0].slice(0,10);
    if (!days[day]) days[day] = [];
    days[day].push(c);
  }
  return days;
}

// ── OLD STRATEGY (15-min, 2-candle pattern) ───────────────────────────────────
function runOldStrategy(candles15m) {
  // candles15m: [[ts, o, h, l, c, v], ...]
  if (candles15m.length < 4) return { pnlPts: 0, noEntry: true };

  const enrich = c => {
    const [,o,h,l,cl] = c;
    const bull = cl >= o;
    return { open:o, high:h, low:l, close:cl, bull,
             body_high: Math.max(o,cl), body_low: Math.min(o,cl),
             body_size: Math.abs(cl-o) };
  };
  const cs = candles15m.map(enrich);

  let entry = null;
  for (let i=0; i<cs.length-1; i++) {
    const ca=cs[i], cb=cs[i+1];
    let sig=null, bl=null;
    if (ca.bull===cb.bull) {
      sig = ca.bull?'CE':'PE';
      bl  = sig==='CE' ? Math.max(ca.high,cb.high) : Math.min(ca.low,cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull?'CE':'PE';
      bl  = sig==='CE' ? Math.max(ca.body_high,cb.body_high) : Math.min(ca.body_low,cb.body_low);
    } else continue;

    for (let j=i+2; j<cs.length; j++) {
      if (sig==='CE' && cs[j].close>bl) { entry={sig,px:cs[j].close,idx:j}; break; }
      if (sig==='PE' && cs[j].close<bl) { entry={sig,px:cs[j].close,idx:j}; break; }
    }
    if (entry) break;
  }
  if (!entry) return { pnlPts: 0, noEntry: true };

  const mv = (s,e,p) => s==='CE' ? p-e : e-p;
  const SL_T1=50, SL_RE=100;
  const dayOpen = cs[0].open;
  const last    = cs[cs.length-1].close;

  let slHit=false, sIdx=null, sPx=null;
  let t1Pts = mv(entry.sig, entry.px, last);
  for (let i=entry.idx+1; i<cs.length; i++) {
    if (mv(entry.sig, entry.px, cs[i].close) <= -SL_T1) {
      slHit=true; sIdx=i; sPx=cs[i].close; t1Pts=-SL_T1; break;
    }
  }
  let rePts=0;
  if (slHit) {
    const rs  = entry.sig==='CE'?'PE':'CE';
    const mar = rs==='CE' ? sPx-dayOpen : -(sPx-dayOpen);
    if (mar < 0) {
      rePts = mv(rs, sPx, last);
      for (let i=sIdx+1; i<cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePts=-SL_RE; break; }
      }
    }
  }
  return { pnlPts: t1Pts+rePts, t1Pts, rePts, slHit, noEntry: false };
}

// ── NEW STRATEGY (1-min spot candle → ATM premium → ratchet trail) ────────────
function runNewStrategy(candles1m, dateStr) {
  // candles1m: [[ts, o, h, l, c, v], ...]
  if (candles1m.length < 2) return { pnlPts: 0, noEntry: true };

  const dte0 = daysToThursday(dateStr);

  // Find open candle at 9:15 (first candle)
  const openC = candles1m[0];
  const spotOpen = openC[1];
  const atm = getATM(spotOpen);

  // Scan 1-min candles in 9:15–9:19 window
  let signal = null;
  for (const c of candles1m) {
    const ts   = c[0]; // "2024-01-02T09:16:00+0530"
    const hhmm = parseInt(ts.slice(11,13))*100 + parseInt(ts.slice(14,16));
    if (hhmm < 915 || hhmm >= 920) continue;  // only 9:15–9:19

    const [,o,h,l,cl] = c;
    const body = cl - o;
    if (Math.abs(body) < MIN_BODY_PTS) continue;  // too small

    const dir = body > 0 ? 'CE' : 'PE';
    // Time elapsed from 9:15 open for this candle
    const minFrom915 = (hhmm >= 900 ? (Math.floor(hhmm/100)-9)*60+(hhmm%100)-15
                                    : 0);
    const dteLive = Math.max(dte0 - minFrom915/(6.25*60*252), 0.05);

    const entryPrem = optPrem(cl,  atm, dteLive, dir);
    const slPrem    = dir==='CE'
      ? optPrem(l, atm, dteLive, dir)   // CE SL = prem at candle low
      : optPrem(h, atm, dteLive, dir);  // PE SL = prem at candle high
    const risk = Math.abs(entryPrem - slPrem);
    if (risk <= 0) continue;

    signal = { dir, entryPrem, slPrem, risk, candleHhmm: hhmm, dteLive };
    break;
  }

  if (!signal) return { pnlPts: 0, noEntry: true };

  // Simulate ratchet trail on subsequent 1-min candles
  let tradeSL   = signal.slPrem;
  let trailLevel = 0;
  const R = signal.risk;
  let finalPts = null;
  let exitReason = null;

  for (const c of candles1m) {
    const ts   = c[0];
    const hhmm = parseInt(ts.slice(11,13))*100 + parseInt(ts.slice(14,16));
    if (hhmm <= signal.candleHhmm) continue;  // skip candles before entry

    const [,co,ch,cl,cc] = c;
    const spotNow = cc;  // use candle close as "current price"

    // Time from 9:15
    const minFrom915 = (Math.floor(hhmm/100)-9)*60+(hhmm%100)-15;
    const dteLive = Math.max(dte0 - minFrom915/(6.25*60*252), 0.05);
    const optNow = optPrem(spotNow, atm, dteLive, signal.dir);

    const pnlPts = optNow - signal.entryPrem;

    // Ratchet trail
    const level = Math.floor(pnlPts / R);
    if (level > trailLevel && level >= 1) {
      const newFloor = signal.entryPrem + (level-1)*R;
      if (newFloor > tradeSL) { tradeSL = newFloor; trailLevel = level; }
    }

    // SL hit
    if (optNow <= tradeSL) {
      finalPts   = tradeSL - signal.entryPrem;
      exitReason = trailLevel > 0 ? 'TRAIL_SL' : 'SL';
      break;
    }
    // Time exit 11:30
    if (hhmm >= 1130) {
      finalPts   = pnlPts;
      exitReason = 'TIME_EXIT';
      break;
    }
  }

  // If still open at end of data (market close)
  if (finalPts === null) {
    const lastC = candles1m[candles1m.length-1];
    const spotEnd = lastC[4];
    const dtEnd = Math.max(dte0 - 6.25/252, 0.05);
    finalPts   = optPrem(spotEnd, atm, dtEnd, signal.dir) - signal.entryPrem;
    exitReason = 'CLOSE';
  }

  return {
    pnlPts: Math.round(finalPts*100)/100,
    dir: signal.dir, risk: R, trailLevel, exitReason, noEntry: false
  };
}

// ── Summarise results ─────────────────────────────────────────────────────────
function summarise(label, results) {
  const trades  = results.filter(r => !r.noEntry);
  const wins    = trades.filter(r => r.pnlPts > 0);
  const losses  = trades.filter(r => r.pnlPts < 0);
  const totalPts = trades.reduce((a,r) => a+r.pnlPts, 0);
  const totalRs  = Math.round(totalPts * LOT_SIZE);
  const winRate  = trades.length ? (wins.length/trades.length*100).toFixed(1) : 0;
  const avgWin   = wins.length  ? (wins.reduce((a,r)=>a+r.pnlPts,0)/wins.length).toFixed(1) : 0;
  const avgLoss  = losses.length ? (losses.reduce((a,r)=>a+r.pnlPts,0)/losses.length).toFixed(1) : 0;
  const maxLoss  = trades.length ? Math.min(...trades.map(r=>r.pnlPts)).toFixed(1) : 0;
  const maxWin   = trades.length ? Math.max(...trades.map(r=>r.pnlPts)).toFixed(1) : 0;
  const noEntry  = results.filter(r => r.noEntry).length;

  console.log(`\n${'═'.repeat(60)}`);
  console.log(` ${label}`);
  console.log('═'.repeat(60));
  console.log(` Total days       : ${results.length}`);
  console.log(` Trade days       : ${trades.length}  (no-entry: ${noEntry})`);
  console.log(` Win / Loss       : ${wins.length} / ${losses.length}  (${winRate}% win rate)`);
  console.log(` Avg win          : +${avgWin} pts   Avg loss: ${avgLoss} pts`);
  console.log(` Best day         : +${maxWin} pts   Worst: ${maxLoss} pts`);
  console.log(` Total pts        : ${totalPts > 0 ? '+' : ''}${totalPts.toFixed(0)}`);
  console.log(` Total ₹ (1 lot)  : ₹${totalRs.toLocaleString('en-IN')}`);
  console.log(` Avg ₹/month      : ₹${Math.round(totalRs/60).toLocaleString('en-IN')} (≈60 months)`);
  console.log('═'.repeat(60));
  return { label, days:results.length, trades:trades.length, wins:wins.length, losses:losses.length,
           winRate:+winRate, totalPts:+totalPts.toFixed(0), totalRs, noEntry };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  VMT 5-YEAR BACKTEST  —  OLD vs NEW STRATEGY');
  console.log('  BankNifty  |  May 2021 – May 2026  |  1 lot (15 qty)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Fetch 5 years of BNF 1-min data in chunks
  const startDate = new Date('2021-05-17');
  const endDate   = new Date('2026-05-16');
  let cursor      = new Date(startDate);
  const allCandles1m  = [];
  const allCandles15m = [];

  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(cursor.getDate() + 59);  // 60-day chunks for 1-min (API limit)
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const from = fmtDate(cursor), to = fmtDate(chunkEnd);
    process.stdout.write(`Fetching 1m  ${from} → ${to} ... `);
    try {
      const r1 = await kiteGet(`/instruments/historical/260105/minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
      if (r1.data?.candles) { allCandles1m.push(...r1.data.candles); console.log(`${r1.data.candles.length} candles`); }
      else { console.log('ERROR:', r1.message||JSON.stringify(r1).slice(0,80)); }
      await sleep(400);

      const r15 = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
      if (r15.data?.candles) allCandles15m.push(...r15.data.candles);
      await sleep(400);
    } catch(e) { console.log('FETCH ERR:', e.message); }

    cursor.setDate(cursor.getDate() + 60);
  }

  console.log(`\nTotal 1-min candles : ${allCandles1m.length}`);
  console.log(`Total 15-min candles: ${allCandles15m.length}`);

  if (allCandles1m.length === 0) {
    console.log('\n❌ No data fetched — check token'); process.exit(1);
  }

  // Group by day
  const days1m  = groupByDay(allCandles1m);
  const days15m = groupByDay(allCandles15m);
  const allDays = [...new Set([...Object.keys(days1m), ...Object.keys(days15m)])].sort();

  const oldResults = [];
  const newResults = [];

  for (const day of allDays) {
    const c1m  = days1m[day]  || [];
    const c15m = days15m[day] || [];
    if (c1m.length < 5) continue;   // skip incomplete days

    oldResults.push({ day, ...runOldStrategy(c15m) });
    newResults.push({ day, ...runNewStrategy(c1m, day) });
  }

  const oldSummary = summarise('OLD STRATEGY  (15-min 2-candle | fixed 50pt SL | re-entry)', oldResults);
  const newSummary = summarise('NEW STRATEGY  (1-min spot candle → ATM premium | ratchet trail)', newResults);

  // Monthly breakdown for new strategy
  console.log('\n── New Strategy Monthly P&L ─────────────────────────────');
  console.log(`${'Month'.padEnd(10)} ${'Trades'.padStart(6)} ${'Pts'.padStart(8)} ${'₹'.padStart(10)} ${'Win%'.padStart(6)}`);
  const months = {};
  for (const r of newResults.filter(r=>!r.noEntry)) {
    const m = r.day.slice(0,7);
    if (!months[m]) months[m]={pts:0,trades:0,wins:0};
    months[m].pts+=r.pnlPts; months[m].trades++; if(r.pnlPts>0)months[m].wins++;
  }
  for (const m of Object.keys(months).sort()) {
    const mo=months[m];
    const rs=Math.round(mo.pts*LOT_SIZE);
    const wr=(mo.wins/mo.trades*100).toFixed(0);
    console.log(`${m.padEnd(10)} ${String(mo.trades).padStart(6)} ${mo.pts.toFixed(0).padStart(8)} ${('₹'+rs.toLocaleString('en-IN')).padStart(10)} ${(wr+'%').padStart(6)}`);
  }

  // Delta comparison
  console.log('\n── Comparison ───────────────────────────────────────────');
  const ptsDelta = newSummary.totalPts - oldSummary.totalPts;
  const rsDelta  = newSummary.totalRs  - oldSummary.totalRs;
  console.log(` Points improvement : ${ptsDelta > 0 ? '+' : ''}${ptsDelta}`);
  console.log(` ₹ improvement      : ${rsDelta > 0 ? '+' : ''}₹${rsDelta.toLocaleString('en-IN')}`);
  console.log(` Win rate change    : ${oldSummary.winRate}% → ${newSummary.winRate}%`);

  // Save
  fs.writeFileSync('/home/ubuntu/trading-bot/vmt_backtest_comparison.json',
    JSON.stringify({ generated: new Date().toISOString(), old: oldSummary, new: newSummary, months }, null, 2));
  console.log('\nSaved: vmt_backtest_comparison.json\n');
}

main().catch(e => { console.error(e); process.exit(1); });

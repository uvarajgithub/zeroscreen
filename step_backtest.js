// step_backtest.js — ORB strategy: 1 day → 1 month → 1 year
// Option buying: CE or PE. Delta 0.5. Rs15/pt (qty 30 x 0.5 delta)
// SL = 100 underlying pts = 50 option pts = Rs750 max loss per trade
'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const QM = 15; // Rs per underlying pt

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); }); req.end();
  });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function fetch15(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
  if (!r.data || !r.data.candles) return [];
  return r.data.candles.map(c => {
    const d = new Date(c[0]);
    return { time: `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, h: d.getHours(), m: d.getMinutes(), open: c[1], high: c[2], low: c[3], close: c[4], date: c[0].slice(0,10) };
  });
}
function groupByDay(candles) {
  const map = {};
  for (const c of candles) { if (!map[c.date]) map[c.date] = []; map[c.date].push(c); }
  return Object.entries(map).sort(([a],[b])=>a<b?-1:1).map(([date,cs])=>({date,candles:cs}));
}
function trailLock50(sl, entry, dir, peak) {
  const lock = peak >= 200 ? 150 : peak >= 100 ? 50 : 0;
  if (!lock) return sl;
  return dir === 'CE' ? Math.max(sl, entry + lock) : Math.min(sl, entry - lock);
}

// ORB logic: OR from first 2 candles, enter on breakout, SL=100, trail, max 1 trade
function simDayVerbose(date, candles, print) {
  if (candles.length < 4) return { pnl: 0, traded: false };
  const c0 = candles[0], c1 = candles[1];
  const OR_H = Math.max(c0.high, c1.high);
  const OR_L = Math.min(c0.low, c1.low);
  const OR_W = OR_H - OR_L;

  if (print) {
    console.log(`\n  DATE: ${date}`);
    console.log(`  Opening Range (9:15 + 9:30): HIGH=${OR_H.toFixed(0)}  LOW=${OR_L.toFixed(0)}  WIDTH=${OR_W.toFixed(0)} pts`);
    if (OR_W < 100 || OR_W > 450) { console.log(`  → SKIP (OR width ${OR_W.toFixed(0)} outside 100-450)\n`); return { pnl:0, traded:false }; }
    console.log(`  → OR valid. Watching for breakout above ${(OR_H+25).toFixed(0)} or below ${(OR_L-25).toFixed(0)}`);
    console.log(`  Time  | Candle O/H/L/C              | Signal | Entry    | SL       | Peak  | Action`);
    console.log(`  ${'-'.repeat(88)}`);
  } else {
    if (OR_W < 100 || OR_W > 450) return { pnl: 0, traded: false };
  }

  let inTrade=false, entry=0, sl=0, dir=null, peak=0, dayPnl=0, traded=false;

  for (let i=2; i<candles.length; i++) {
    const c = candles[i];
    const isEOD = c.h > 15 || (c.h===15 && c.m>=15);

    if (inTrade) {
      const hp = dir==='CE' ? c.high-entry : entry-c.low;
      if (hp > peak) { peak=hp; sl=trailLock50(sl,entry,dir,peak); }
      const slHit = dir==='CE' ? c.low<=sl : c.high>=sl;

      if (slHit || isEOD) {
        const pts = isEOD ? (dir==='CE' ? c.close-entry : entry-c.close) : (dir==='CE' ? sl-entry : entry-sl);
        dayPnl = pts;
        const exitReason = isEOD ? 'EOD EXIT' : 'SL HIT';
        const exitPrice  = isEOD ? c.close : sl;
        if (print) console.log(`  ${c.time}  | O:${c.open.toFixed(0)} H:${c.high.toFixed(0)} L:${c.low.toFixed(0)} C:${c.close.toFixed(0)}  | ${exitReason} | exit@${exitPrice.toFixed(0)}  | SL:${sl.toFixed(0)}    | ${peak.toFixed(0)}    | ${pts>=0?'+':''}${pts.toFixed(0)} pts = ${pts>=0?'+':''}Rs${Math.round(pts*QM).toLocaleString('en-IN')}`);
        break;
      } else {
        if (print) console.log(`  ${c.time}  | O:${c.open.toFixed(0)} H:${c.high.toFixed(0)} L:${c.low.toFixed(0)} C:${c.close.toFixed(0)}  | IN TRADE  | @${entry.toFixed(0)}      | SL:${sl.toFixed(0)}    | ${peak.toFixed(0)}    | holding`);
      }
    } else {
      const entryOk = !isEOD && c.h < 13;
      const ceSignal = c.close > OR_H + 25;
      const peSignal = c.close < OR_L - 25;

      if (print) {
        const sig = ceSignal ? '→ CE BUY' : peSignal ? '→ PE BUY' : '-';
        console.log(`  ${c.time}  | O:${c.open.toFixed(0)} H:${c.high.toFixed(0)} L:${c.low.toFixed(0)} C:${c.close.toFixed(0)}  | ${sig.padEnd(8)} | ${entryOk&&(ceSignal||peSignal)?'ENTER':'watching'} |          |       |`);
      }

      if (entryOk && ceSignal) {
        dir='CE'; entry=c.close; sl=entry-100; peak=0; inTrade=true; traded=true;
        if (print) console.log(`  *** ENTERED CE at ${entry.toFixed(0)}, SL=${sl.toFixed(0)}, target: trail`);
      } else if (entryOk && peSignal) {
        dir='PE'; entry=c.close; sl=entry+100; peak=0; inTrade=true; traded=true;
        if (print) console.log(`  *** ENTERED PE at ${entry.toFixed(0)}, SL=${sl.toFixed(0)}, target: trail`);
      }
    }
  }

  if (print && !traded) console.log(`  → No trade triggered`);
  if (print && traded) console.log(`\n  DAY RESULT: ${dayPnl>=0?'+':''}${dayPnl.toFixed(0)} underlying pts → Option P&L = ${dayPnl>=0?'+':''}Rs${Math.round(dayPnl*QM).toLocaleString('en-IN')} (delta 0.5 × qty 30 × Rs1)`);
  return { pnl: dayPnl, traded };
}

async function main() {
  console.log('='.repeat(80));
  console.log('  ORB STRATEGY — STEP BY STEP VERIFICATION');
  console.log('  Option buying CE/PE | delta 0.5 | qty 30 | Rs15/pt');
  console.log('  Entry: OR breakout (first 2 candles) + 25pt buffer | SL: 100pts');
  console.log('='.repeat(80));

  // ── STEP 1: ONE DAY (May 13 2026) ────────────────────────────
  console.log('\n' + '─'.repeat(80));
  console.log('  STEP 1: SINGLE DAY — May 13, 2026');
  console.log('─'.repeat(80));
  const d1 = await fetch15('2026-05-13','2026-05-13');
  const day1 = groupByDay(d1);
  if (day1.length) simDayVerbose(day1[0].date, day1[0].candles, true);
  await sleep(400);

  // ── STEP 2: ONE MONTH (May 2026) ─────────────────────────────
  console.log('\n\n' + '─'.repeat(80));
  console.log('  STEP 2: ONE MONTH — May 2026 (all trading days)');
  console.log('─'.repeat(80));
  const d2 = await fetch15('2026-05-01','2026-05-13');
  const month = groupByDay([...d2, ...d1].filter((v,i,a)=>a.findIndex(x=>x.date===v.date&&x.time===v.time)===i));
  let mPnl=0, mTrades=0, mWins=0;
  console.log('  Date        | Traded | OR Width | Direction | Entry    | Exit P&L pts | Rs');
  console.log('  ' + '-'.repeat(72));
  for (const {date, candles} of month) {
    const c0=candles[0],c1=candles[1];
    const OR_H=Math.max(c0.high,c1.high), OR_L=Math.min(c0.low,c1.low), OR_W=OR_H-OR_L;
    const skip = OR_W<100||OR_W>450;
    if (skip) { console.log(`  ${date} | SKIP   | ${OR_W.toFixed(0).padStart(8)} | -         |          |              |`); continue; }
    const res = simDayVerbose(date, candles, false);
    mPnl += res.pnl;
    if (res.traded) { mTrades++; if (res.pnl>0) mWins++; }
    // find entry direction
    let entryDir = '-';
    for (let i=2;i<candles.length;i++) {
      const c=candles[i]; if (c.h>=13) break;
      if (c.close>OR_H+25){entryDir='CE';break;} if (c.close<OR_L-25){entryDir='PE';break;}
    }
    const pnlStr = res.traded ? (res.pnl>=0?'+':'')+res.pnl.toFixed(0) : 'no trade';
    const rsStr  = res.traded ? (res.pnl>=0?'+':'')+'Rs'+Math.abs(Math.round(res.pnl*QM)).toLocaleString('en-IN') : '';
    console.log(`  ${date} | YES    | ${OR_W.toFixed(0).padStart(8)} | ${entryDir.padEnd(9)} |          | ${pnlStr.padStart(12)} | ${rsStr}`);
  }
  console.log('  ' + '-'.repeat(72));
  console.log(`  MONTH TOTAL: ${mTrades} trades | ${mWins} wins | P&L = ${mPnl>=0?'+':''}${mPnl.toFixed(0)} pts = ${mPnl>=0?'+':''}Rs${Math.abs(Math.round(mPnl*QM)).toLocaleString('en-IN')} | Win rate: ${mTrades>0?Math.round(mWins/mTrades*100):0}%`);
  await sleep(400);

  // ── STEP 3: ONE YEAR (2025) ───────────────────────────────────
  console.log('\n\n' + '─'.repeat(80));
  console.log('  STEP 3: ONE YEAR — 2025 (full year)');
  console.log('─'.repeat(80));
  process.stdout.write('  Fetching 2025 data ');
  const d3a = await fetch15('2025-01-01','2025-06-30'); process.stdout.write('.');
  await sleep(400);
  const d3b = await fetch15('2025-07-01','2025-12-31'); process.stdout.write('.\n');
  const year2025 = groupByDay([...d3a,...d3b]);
  let yPnl=0, yTrades=0, yWins=0, maxDD=0, runDD=0, peakPnl=0;
  const months25 = {};
  for (const {date,candles} of year2025) {
    const mon = date.slice(0,7);
    if (!months25[mon]) months25[mon]={pnl:0,trades:0,wins:0};
    const res = simDayVerbose(date, candles, false);
    months25[mon].pnl += res.pnl; yPnl += res.pnl;
    if (res.traded) { months25[mon].trades++; yTrades++; if(res.pnl>0){months25[mon].wins++;yWins++;} }
    if (yPnl > peakPnl) peakPnl=yPnl;
    runDD = peakPnl - yPnl; if(runDD>maxDD) maxDD=runDD;
  }
  console.log('  Month   | Trades | Wins | P&L pts  | Rs P&L');
  console.log('  ' + '-'.repeat(56));
  for (const [mon,s] of Object.entries(months25).sort()) {
    const rs = s.pnl*QM;
    console.log(`  ${mon} | ${String(s.trades).padStart(6)} | ${String(s.wins).padStart(4)} | ${((s.pnl>=0?'+':'')+s.pnl.toFixed(0)).padStart(8)} | ${(rs>=0?'+':'')+'Rs'+Math.abs(Math.round(rs)).toLocaleString('en-IN')}`);
  }
  console.log('  ' + '-'.repeat(56));
  console.log(`  2025 TOTAL: ${yTrades} trades | ${yWins} wins (${Math.round(yWins/yTrades*100)}%) | P&L = ${yPnl>=0?'+':''}${yPnl.toFixed(0)} pts = ${yPnl>=0?'+':''}Rs${Math.abs(Math.round(yPnl*QM)).toLocaleString('en-IN')}`);
  console.log(`  Max Drawdown: ${maxDD.toFixed(0)} pts = Rs${Math.round(maxDD*QM).toLocaleString('en-IN')}`);

  console.log('\n' + '='.repeat(80));
  console.log('  If results look correct, reply "run 5 years" to get full backtest');
  console.log('='.repeat(80));
}
main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

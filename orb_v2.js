// orb_v2.js — ORB with direction filter + no upper OR cap
// Direction filter: only CE if today open > yesterday close, only PE if today open < yesterday close
// OR filter: width 50-999 (remove upper cap to catch trend days)
// Trail lock50, SL=100, entry window 9:45–13:00
'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const QM = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}` },
      timeout: 20000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} }); });
    req.on('error', reject); req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); }); req.end();
  });
}
async function fetch15(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
  if (!r.data || !r.data.candles) return [];
  return r.data.candles.map(c => {
    const d = new Date(c[0]);
    return { time:`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`, h:d.getHours(), m:d.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4], date:c[0].slice(0,10) };
  });
}
function groupByDay(candles) {
  const map = {};
  for (const c of candles) { if (!map[c.date]) map[c.date]=[]; map[c.date].push(c); }
  return Object.entries(map).sort(([a],[b])=>a<b?-1:1).map(([date,cs])=>({date,candles:cs}));
}
function trailLock50(sl, entry, dir, peak) {
  const lock = peak>=200?150 : peak>=100?50 : 0;
  if (!lock) return sl;
  return dir==='CE' ? Math.max(sl,entry+lock) : Math.min(sl,entry-lock);
}

// Strategy variants
const VARIANTS = {
  A: { name:'V2A — direction + no OR cap',      orMin:50,  orMax:999, dirFilter:true,  slPts:100 },
  B: { name:'V2B — direction + wide OR 50-600', orMin:50,  orMax:600, dirFilter:true,  slPts:100 },
  C: { name:'V2C — no direction + no OR cap',   orMin:50,  orMax:999, dirFilter:false, slPts:100 },
  D: { name:'V2D — direction + tighter SL 75',  orMin:50,  orMax:999, dirFilter:true,  slPts:75  },
};

function runDay(date, candles, prevClose, cfg, verbose) {
  if (candles.length < 10) return { pnl:0, traded:false };
  const c0=candles[0], c1=candles[1];
  const OR_H = Math.max(c0.high, c1.high);
  const OR_L = Math.min(c0.low,  c1.low);
  const OR_W = OR_H - OR_L;
  const todayOpen = c0.open;

  // Direction filter
  const gapUp   = prevClose && todayOpen > prevClose + 30;
  const gapDown = prevClose && todayOpen < prevClose - 30;
  const biasUp   = cfg.dirFilter ? gapUp   : true;
  const biasDown = cfg.dirFilter ? gapDown : true;

  if (OR_W < cfg.orMin || OR_W > cfg.orMax) return { pnl:0, traded:false };
  if (cfg.dirFilter && !gapUp && !gapDown) return { pnl:0, traded:false }; // flat gap → skip

  let inTrade=false, entry=0, sl=0, dir=null, peak=0, traded=false, dayPnl=0;

  for (let i=2; i<candles.length; i++) {
    const c = candles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 15);
    if (inTrade) {
      const hp = dir==='CE' ? c.high-entry : entry-c.low;
      if (hp>peak) { peak=hp; sl=trailLock50(sl,entry,dir,peak); }
      const slHit = dir==='CE' ? c.low<=sl : c.high>=sl;
      if (slHit || isEOD) {
        dayPnl = isEOD ? (dir==='CE'?c.close-entry:entry-c.close) : (dir==='CE'?sl-entry:entry-sl);
        if (verbose) console.log(`    ${c.time}  ${isEOD?'EOD':'SL '} exit → ${dayPnl>=0?'+':''}${dayPnl.toFixed(0)}pts  Rs${(dayPnl*QM>=0?'+':'-')+(Math.abs(dayPnl*QM)|0)}`);
        break;
      }
      if (verbose) console.log(`    ${c.time}  IN [${dir}] entry=${entry.toFixed(0)} SL=${sl.toFixed(0)} peak=${peak.toFixed(0)}`);
    } else {
      const entryOk = !isEOD && c.h < 13;
      if (!entryOk) continue;
      const ceBreak = biasUp   && c.close > OR_H + 25;
      const peBreak = biasDown && c.close < OR_L - 25;
      if (verbose && (ceBreak||peBreak)) console.log(`    ${c.time}  ${ceBreak?'▲ CE':'▼ PE'} breakout  close=${c.close.toFixed(0)}`);
      if (ceBreak) { dir='CE'; entry=c.close; sl=entry-cfg.slPts; peak=0; inTrade=true; traded=true; }
      else if (peBreak) { dir='PE'; entry=c.close; sl=entry+cfg.slPts; peak=0; inTrade=true; traded=true; }
    }
  }
  return { pnl:dayPnl, traded };
}

async function runVariant(label, cfg, days) {
  let pnl=0, trades=0, wins=0;
  const byYear = {};
  const byMonth = {};

  for (let i=1; i<days.length; i++) {
    const {date, candles} = days[i];
    const prevClose = days[i-1].candles[days[i-1].candles.length-1].close;
    const res = runDay(date, candles, prevClose, cfg, false);
    pnl += res.pnl;
    const yr = date.slice(0,4), mo = date.slice(0,7);
    if (!byYear[yr])  byYear[yr]  = {pnl:0,trades:0,wins:0};
    if (!byMonth[mo]) byMonth[mo] = {pnl:0,trades:0,wins:0};
    if (res.traded) {
      trades++; byYear[yr].trades++; byMonth[mo].trades++;
      if (res.pnl>0) { wins++; byYear[yr].wins++; byMonth[mo].wins++; }
      byYear[yr].pnl += res.pnl; byMonth[mo].pnl += res.pnl;
    }
  }

  const wr = trades>0?(wins/trades*100).toFixed(1):0;
  const totalRs = pnl*QM;
  console.log(`\n${'═'.repeat(68)}`);
  console.log(`  ${cfg.name}`);
  console.log(`  Trades: ${trades} | Wins: ${wins} | Win%: ${wr}% | P&L: ${(totalRs>=0?'+Rs':'-Rs')+Math.abs(Math.round(totalRs)).toLocaleString('en-IN')}`);
  console.log(`${'─'.repeat(68)}`);
  console.log(`  Year  │ Trades │ Wins │  Win% │ P&L Rs`);
  for (const [yr, s] of Object.entries(byYear).sort()) {
    const ywr = s.trades>0?(s.wins/s.trades*100).toFixed(1):0;
    const yrs = s.pnl*QM;
    console.log(`  ${yr}  │ ${String(s.trades).padStart(6)} │ ${String(s.wins).padStart(4)} │ ${ywr.padStart(5)}% │ ${(yrs>=0?'+Rs':'-Rs')+Math.abs(Math.round(yrs)).toLocaleString('en-IN')}`);
  }
  console.log(`${'─'.repeat(68)}`);

  // Show monthly detail for best year
  const bestYear = Object.entries(byYear).sort((a,b)=>b[1].pnl-a[1].pnl)[0]?.[0];
  if (bestYear) {
    console.log(`\n  Best year ${bestYear} — monthly breakdown:`);
    console.log(`  Month   │ Trades │ Wins │ Win% │ P&L Rs`);
    for (const [mo, s] of Object.entries(byMonth).filter(([m])=>m.startsWith(bestYear)).sort()) {
      const mwr = s.trades>0?(s.wins/s.trades*100).toFixed(1):0;
      const mrs = s.pnl*QM;
      console.log(`  ${mo} │ ${String(s.trades).padStart(6)} │ ${String(s.wins).padStart(4)} │ ${mwr.padStart(4)}% │ ${(mrs>=0?'+Rs':'-Rs')+Math.abs(Math.round(mrs)).toLocaleString('en-IN')}`);
    }
  }
  return { label, pnl, trades, wins, wr, totalRs };
}

async function main() {
  console.log('═'.repeat(68));
  console.log('  ORB v2 — DIRECTION FILTER + TREND DAY INCLUSION');
  console.log('  BankNifty 15min | Option CE/PE buying | Rs15/pt | 5 Years');
  console.log('═'.repeat(68));

  // Fetch all data in chunks
  process.stdout.write('\n  Fetching 5 years of data (2021-2026)... ');
  const chunks = [
    ['2021-01-01','2021-06-30'],['2021-07-01','2021-12-31'],
    ['2022-01-01','2022-06-30'],['2022-07-01','2022-12-31'],
    ['2023-01-01','2023-06-30'],['2023-07-01','2023-12-31'],
    ['2024-01-01','2024-06-30'],['2024-07-01','2024-12-31'],
    ['2025-01-01','2025-06-30'],['2025-07-01','2025-12-31'],
    ['2026-01-01','2026-05-13'],
  ];
  let all = [];
  for (const [f,t] of chunks) { const d=await fetch15(f,t); all=[...all,...d]; }
  const days = groupByDay(all);
  console.log(`done — ${days.length} trading days loaded`);

  const results = [];
  for (const [label, cfg] of Object.entries(VARIANTS)) {
    const r = await runVariant(label, cfg, days);
    results.push(r);
  }

  // Summary comparison
  console.log(`\n${'═'.repeat(68)}`);
  console.log('  SUMMARY COMPARISON');
  console.log(`${'═'.repeat(68)}`);
  console.log(`  Variant │ Trades │ Win%  │ Total P&L`);
  console.log(`  ${'─'.repeat(50)}`);
  for (const r of results) {
    const sign = r.totalRs>=0?'+Rs':'-Rs';
    console.log(`  ${r.label.padEnd(7)} │ ${String(r.trades).padStart(6)} │ ${String(r.wr).padStart(5)}% │ ${sign+Math.abs(Math.round(r.totalRs)).toLocaleString('en-IN')}`);
  }

  // Verbose walkthrough of 3 representative days using best variant
  const bestVariant = results.sort((a,b)=>b.totalRs-a.totalRs)[0];
  console.log(`\n${'═'.repeat(68)}`);
  console.log(`  DETAILED WALKTHROUGH — BEST VARIANT: ${bestVariant.label}`);
  console.log(`  April 2026 — one trend, one reversal, one normal day`);
  console.log('═'.repeat(68));

  const aprilDays = groupByDay(all.filter(c=>c.date.startsWith('2026-04')));
  const allDaysFull = groupByDay(all);

  function classifyDay(candles) {
    const open=candles[0].open, close=candles[candles.length-1].close;
    const high=Math.max(...candles.map(c=>c.high)), low=Math.min(...candles.map(c=>c.low));
    const range=high-low, move=close-open;
    if (move> 200&&(high-close)/range<0.25) return 'TREND_UP';
    if (move<-200&&(close-low)/range<0.25)  return 'TREND_DN';
    if (range>300&&Math.abs(move)<100)       return 'REVERSAL';
    return 'NORMAL';
  }

  const cfg = VARIANTS[bestVariant.label];
  for (const {date, candles} of aprilDays.slice(0,8)) {
    const idx = allDaysFull.findIndex(d=>d.date===date);
    const prevClose = idx>0 ? allDaysFull[idx-1].candles.slice(-1)[0].close : null;
    const dtype = classifyDay(candles);
    const c0=candles[0], c1=candles[1];
    const OR_H=Math.max(c0.high,c1.high), OR_L=Math.min(c0.low,c1.low);
    const OR_W=OR_H-OR_L;
    const gap = prevClose ? (candles[0].open-prevClose).toFixed(0) : 'N/A';
    const biasLabel = !prevClose ? '' : candles[0].open > prevClose+30 ? ' gap-UP→CE only' : candles[0].open < prevClose-30 ? ' gap-DN→PE only' : ' flat gap→SKIP';
    console.log(`\n  ─── ${date} [${dtype}] OR=${OR_W.toFixed(0)}pts  gap=${gap}${biasLabel}`);
    runDay(date, candles, prevClose, cfg, true);
  }
}
main().catch(e=>{ console.error('FATAL:', e.message); process.exit(1); });

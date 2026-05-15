// day_research.js — Study 3 day types from April 2026
// Then show ORB strategy performance on each
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
function classifyDay(candles) {
  if (candles.length < 10) return 'insufficient';
  const open  = candles[0].open;
  const close = candles[candles.length-1].close;
  const high  = Math.max(...candles.map(c=>c.high));
  const low   = Math.min(...candles.map(c=>c.low));
  const range = high - low;
  const move  = close - open;
  // Trend: moved 200+ pts and close is near the extreme
  const closePctFromHigh = (high - close) / range;
  const closePctFromLow  = (close - low)  / range;
  if (move >  200 && closePctFromHigh < 0.25) return 'TREND_UP';
  if (move < -200 && closePctFromLow  < 0.25) return 'TREND_DN';
  // Reversal: big swing but closed near open
  if (range > 300 && Math.abs(move) < 100)    return 'REVERSAL';
  // Choppy
  if (range < 250)                             return 'CHOPPY';
  return 'NORMAL';
}
function trailLock50(sl, entry, dir, peak) {
  const lock = peak>=200?150 : peak>=100?50 : 0;
  if (!lock) return sl;
  return dir==='CE' ? Math.max(sl,entry+lock) : Math.min(sl,entry-lock);
}

function runORB(date, candles, verbose) {
  const c0=candles[0], c1=candles[1];
  const OR_H = Math.max(c0.high, c1.high);
  const OR_L = Math.min(c0.low,  c1.low);
  const OR_W = OR_H - OR_L;
  const dayType = classifyDay(candles);
  const dayOpen  = candles[0].open;
  const dayClose = candles[candles.length-1].close;
  const dayHigh  = Math.max(...candles.map(c=>c.high));
  const dayLow   = Math.min(...candles.map(c=>c.low));
  const dayRange = dayHigh - dayLow;

  if (verbose) {
    console.log(`\n${'═'.repeat(72)}`);
    console.log(`  ${date}  [${dayType}]`);
    console.log(`  Day: Open=${dayOpen.toFixed(0)}  High=${dayHigh.toFixed(0)}  Low=${dayLow.toFixed(0)}  Close=${dayClose.toFixed(0)}  Range=${dayRange.toFixed(0)}pts  Move=${(dayClose-dayOpen>=0?'+':'')+(dayClose-dayOpen).toFixed(0)}pts`);
    console.log(`  Opening Range (9:15+9:30): HIGH=${OR_H.toFixed(0)}  LOW=${OR_L.toFixed(0)}  WIDTH=${OR_W.toFixed(0)}pts`);
    if (OR_W < 100 || OR_W > 450) {
      console.log(`  ⊘ SKIP — OR width ${OR_W.toFixed(0)} outside filter 100-450`);
      console.log(`${'─'.repeat(72)}`);
      return { pnl:0, traded:false, dayType };
    }
    console.log(`  ✓ OR valid → Watch CE above ${(OR_H+25).toFixed(0)} | PE below ${(OR_L-25).toFixed(0)}`);
    console.log(`${'─'.repeat(72)}`);
    console.log(`  Time  │ Open    High    Low     Close   │ Status`);
    console.log(`  ${'─'.repeat(68)}`);
  } else {
    if (OR_W < 100 || OR_W > 450) return { pnl:0, traded:false, dayType };
  }

  let inTrade=false, entry=0, sl=0, dir=null, peak=0, dayPnl=0, traded=false;

  for (let i=2; i<candles.length; i++) {
    const c = candles[i];
    const isEOD = c.h>15 || (c.h===15 && c.m>=15);
    if (inTrade) {
      const hp = dir==='CE' ? c.high-entry : entry-c.low;
      if (hp>peak) { peak=hp; sl=trailLock50(sl,entry,dir,peak); }
      const slHit = dir==='CE' ? c.low<=sl : c.high>=sl;
      if (slHit || isEOD) {
        const pts = isEOD ? (dir==='CE'?c.close-entry:entry-c.close) : (dir==='CE'?sl-entry:entry-sl);
        dayPnl = pts;
        if (verbose) {
          const why = isEOD ? `EOD exit @ ${c.close.toFixed(0)}` : `SL hit @ ${sl.toFixed(0)}`;
          console.log(`  ${c.time}  │ ${String(c.open.toFixed(0)).padStart(7)} ${String(c.high.toFixed(0)).padStart(7)} ${String(c.low.toFixed(0)).padStart(7)} ${String(c.close.toFixed(0)).padStart(7)} │ ${why} → ${pts>=0?'+':''}${pts.toFixed(0)}pts`);
        }
        break;
      }
      if (verbose) console.log(`  ${c.time}  │ ${String(c.open.toFixed(0)).padStart(7)} ${String(c.high.toFixed(0)).padStart(7)} ${String(c.low.toFixed(0)).padStart(7)} ${String(c.close.toFixed(0)).padStart(7)} │ IN TRADE [${dir}] entry=${entry.toFixed(0)} SL=${sl.toFixed(0)} peak=${peak.toFixed(0)}`);
    } else {
      const entryOk = !isEOD && c.h < 13;
      if (!entryOk) {
        if (verbose && !isEOD) console.log(`  ${c.time}  │ ${String(c.open.toFixed(0)).padStart(7)} ${String(c.high.toFixed(0)).padStart(7)} ${String(c.low.toFixed(0)).padStart(7)} ${String(c.close.toFixed(0)).padStart(7)} │ window closed, no trade`);
        continue;
      }
      const ceBreak = c.close > OR_H+25;
      const peBreak = c.close < OR_L-25;
      if (verbose) {
        const sig = ceBreak ? `▲ CE breakout! Close=${c.close.toFixed(0)} > ${(OR_H+25).toFixed(0)}` : peBreak ? `▼ PE breakout! Close=${c.close.toFixed(0)} < ${(OR_L-25).toFixed(0)}` : `watching...`;
        console.log(`  ${c.time}  │ ${String(c.open.toFixed(0)).padStart(7)} ${String(c.high.toFixed(0)).padStart(7)} ${String(c.low.toFixed(0)).padStart(7)} ${String(c.close.toFixed(0)).padStart(7)} │ ${sig}`);
      }
      if (ceBreak) { dir='CE'; entry=c.close; sl=entry-100; peak=0; inTrade=true; traded=true; if(verbose) console.log(`  *** ENTERED CE @ ${entry.toFixed(0)} | SL=${sl.toFixed(0)} | trail lock50`); }
      else if (peBreak) { dir='PE'; entry=c.close; sl=entry+100; peak=0; inTrade=true; traded=true; if(verbose) console.log(`  *** ENTERED PE @ ${entry.toFixed(0)} | SL=${sl.toFixed(0)} | trail lock50`); }
    }
  }

  if (verbose) {
    if (!traded) console.log(`  → No breakout signal in entry window`);
    console.log(`\n  RESULT: ${traded?(dayPnl>=0?'WIN  ':'LOSS '): 'NO TRADE'} │ ${(dayPnl>=0?'+':'')+dayPnl.toFixed(0)} underlying pts │ Option P&L ≈ ${(dayPnl>=0?'+':'')+'Rs'+Math.abs(Math.round(dayPnl*QM)).toLocaleString('en-IN')}`);
    console.log(`  (delta 0.5 × qty 30 × Rs1/pt = Rs15/underlying pt)`);
  }
  return { pnl:dayPnl, traded, dayType };
}

async function main() {
  console.log('═'.repeat(72));
  console.log('  BANKNIFTY ORB STRATEGY — DAY TYPE RESEARCH');
  console.log('  April + May 2026 | Option buying CE/PE | delta 0.5 | qty 30');
  console.log('═'.repeat(72));

  // Fetch April + May 2026
  process.stdout.write('\n  Fetching April-May 2026 data... ');
  const apr = await fetch15('2026-04-01','2026-04-30');
  const may = await fetch15('2026-05-01','2026-05-13');
  console.log('done');
  const allDays = groupByDay([...apr, ...may]);

  // Classify all days
  const classified = allDays.map(({date, candles}) => ({
    date, candles,
    type: classifyDay(candles),
    range: Math.max(...candles.map(c=>c.high)) - Math.min(...candles.map(c=>c.low)),
    move: Math.abs(candles[candles.length-1].close - candles[0].open)
  }));

  // Print day classification
  console.log('\n  ALL DAYS — APRIL + MAY 2026:');
  console.log(`  ${'Date'.padEnd(12)} ${'Type'.padEnd(12)} ${'Range'.padStart(7)} ${'Move'.padStart(8)}`);
  console.log(`  ${'─'.repeat(44)}`);
  for (const d of classified) {
    console.log(`  ${d.date.padEnd(12)} ${d.type.padEnd(12)} ${d.range.toFixed(0).padStart(7)} ${(d.move>=0?'+':'')+d.move.toFixed(0).padStart(7)}`);
  }

  // Pick best examples
  const trendUp  = classified.filter(d=>d.type==='TREND_UP' ||d.type==='TREND_DN').sort((a,b)=>b.move-a.move)[0];
  const reversal = classified.filter(d=>d.type==='REVERSAL').sort((a,b)=>b.range-a.range)[0];
  const choppy   = classified.filter(d=>d.type==='CHOPPY').sort((a,b)=>a.range-b.range)[0];

  // Detailed trade walkthrough for each type
  console.log('\n\n' + '═'.repeat(72));
  console.log('  DETAILED WALKTHROUGH — 3 DAY TYPES');
  console.log('═'.repeat(72));

  if (trendUp)  { console.log(`\n  ① TREND DAY (${trendUp.type}):`);   runORB(trendUp.date,  trendUp.candles,  true); }
  if (reversal) { console.log(`\n  ② REVERSAL DAY:`);                  runORB(reversal.date, reversal.candles, true); }
  if (choppy)   { console.log(`\n  ③ CHOPPY DAY:`);                    runORB(choppy.date,   choppy.candles,   true); }

  // Full monthly P&L for April + May
  console.log('\n\n' + '═'.repeat(72));
  console.log('  FULL MONTHLY P&L — APRIL + MAY 2026');
  console.log('═'.repeat(72));
  const months = {};
  for (const d of classified) {
    const mon = d.date.slice(0,7);
    if (!months[mon]) months[mon]={pnl:0,trades:0,wins:0,losses:0,days:0};
    months[mon].days++;
    const res = runORB(d.date, d.candles, false);
    months[mon].pnl += res.pnl;
    if (res.traded) { months[mon].trades++; if(res.pnl>0) months[mon].wins++; else months[mon].losses++; }
  }
  console.log(`\n  Month   │ Days │ Trades │ Wins │ Losses │ P&L pts   │ P&L Rs      │ Win%`);
  console.log(`  ${'─'.repeat(68)}`);
  let totPnl=0, totTrades=0, totWins=0;
  for (const [mon,s] of Object.entries(months).sort()) {
    totPnl+=s.pnl; totTrades+=s.trades; totWins+=s.wins;
    const wr = s.trades>0?Math.round(s.wins/s.trades*100):0;
    const rs = s.pnl*QM;
    console.log(`  ${mon} │ ${String(s.days).padStart(4)} │ ${String(s.trades).padStart(6)} │ ${String(s.wins).padStart(4)} │ ${String(s.losses).padStart(6)} │ ${((s.pnl>=0?'+':'')+s.pnl.toFixed(0)).padStart(9)} │ ${((rs>=0?'+':'')+'Rs'+Math.abs(Math.round(rs)).toLocaleString('en-IN')).padStart(11)} │ ${wr}%`);
  }
  console.log(`  ${'─'.repeat(68)}`);
  const totWR = totTrades>0?Math.round(totWins/totTrades*100):0;
  const totRs = totPnl*QM;
  console.log(`  TOTAL   │      │ ${String(totTrades).padStart(6)} │ ${String(totWins).padStart(4)} │ ${String(totTrades-totWins).padStart(6)} │ ${((totPnl>=0?'+':'')+totPnl.toFixed(0)).padStart(9)} │ ${((totRs>=0?'+':'')+'Rs'+Math.abs(Math.round(totRs)).toLocaleString('en-IN')).padStart(11)} │ ${totWR}%`);
  console.log('\n  → If these numbers look correct to you, say "run full 5 years"');
}
main().catch(e=>{ console.error('FATAL:', e.message); process.exit(1); });

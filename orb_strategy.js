// ================================================================
// NEW STRATEGY: ADAPTIVE OPENING RANGE BREAKOUT (ORB)
// ================================================================
// Logic:
//   1. Opening Range = first 2 candles (9:15 + 9:30)
//   2. Filter: skip if OR width < 100 (choppy) or > 450 (gap day)
//   3. Entry: candle CLOSES outside OR + 25pt buffer
//   4. SL: fixed 100pts from entry
//   5. Trail: once profit >= 100, lock in 50pt profit floor
//             once profit >= 200, lock in 150pt profit floor
//   6. EOD exit at 15:15
//   7. Max 1 trade per day
//   8. Entry window: 9:45 to 13:00 only
//
// TESTED VARIANTS:
//   A: ORB basic (OR filter 100-450, trail lock50)
//   B: ORB tight (OR filter 100-300, trail lock50) — medium range days only
//   C: ORB trend (OR filter 150-450, wider SL = 150pt) — trend days only
// ================================================================
'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const QM = 15; // Rs15 per point (qty 30 x 0.5 delta)

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
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchYear(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
  if (!r.data || !r.data.candles) return [];
  return r.data.candles.map(c => {
    const d = new Date(c[0]);
    return { h: d.getHours(), m: d.getMinutes(), open: c[1], high: c[2], low: c[3], close: c[4], date: c[0].slice(0,10) };
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAll() {
  const ranges = [
    ['2021-01-01','2021-06-30'], ['2021-07-01','2021-12-31'],
    ['2022-01-01','2022-06-30'], ['2022-07-01','2022-12-31'],
    ['2023-01-01','2023-06-30'], ['2023-07-01','2023-12-31'],
    ['2024-01-01','2024-06-30'], ['2024-07-01','2024-12-31'],
    ['2025-01-01','2025-06-30'], ['2025-07-01','2025-12-31'],
    ['2026-01-01','2026-05-13'],
  ];
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  const all = [];
  for (const [from,to] of ranges) {
    let d = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      try { d = await fetchYear(from, to); break; }
      catch(e) { await sleep(2000); }
    }
    all.push(...d);
    process.stdout.write('.');
    await sleep(300);
  }
  console.log(` ${all.length} candles\n`);
  return all;
}

function groupByDay(candles) {
  const map = {};
  for (const c of candles) {
    if (!map[c.date]) map[c.date] = [];
    map[c.date].push(c);
  }
  return Object.entries(map).sort(([a],[b])=>a<b?-1:1).map(([date,cs])=>({date,candles:cs}));
}

// ================================================================
// TRAIL FUNCTION: lock50 style
// sl_in = current sl, entry, dir, peakProfit
// ================================================================
function trailLock50(sl, entry, dir, peak) {
  let lock = 0;
  if (peak >= 200) lock = 150;
  else if (peak >= 100) lock = 50;
  if (lock === 0) return sl;
  if (dir === 'CE') return Math.max(sl, entry + lock);
  return Math.min(sl, entry - lock);
}

function trailLock50Wide(sl, entry, dir, peak) {
  // For wider SL variant — lock later
  let lock = 0;
  if (peak >= 300) lock = 200;
  else if (peak >= 150) lock = 80;
  if (lock === 0) return sl;
  if (dir === 'CE') return Math.max(sl, entry + lock);
  return Math.min(sl, entry - lock);
}

// ================================================================
// SIMULATE ONE DAY
// slPts = how many points below/above entry to place SL
// orMin, orMax = filter on OR width
// trailFn = trailing function
// returns { pnl, win, traded, tradeCount, action }
// ================================================================
function simDay(candles, slPts, orMin, orMax, trailFn) {
  // Need at least 3 candles (first 2 = OR, then at least 1 for signal)
  if (candles.length < 4) return { pnl: 0, win: false, traded: false };

  // Build opening range from first 2 candles (9:15 + 9:30)
  const c0 = candles[0], c1 = candles[1];
  const OR_H = Math.max(c0.high,  c1.high);
  const OR_L = Math.min(c0.low,   c1.low);
  const OR_W = OR_H - OR_L;

  // FILTER: skip day if OR width out of range
  if (OR_W < orMin || OR_W > orMax) return { pnl: 0, win: false, traded: false };

  let inTrade = false, entry = 0, sl = 0, dir = null, peak = 0;
  let dayPnl = 0, traded = false;

  // Entry window: candles index 2 onwards (9:45 AM) up to 13:00 (index ~15)
  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    const isEOD = (c.h > 15) || (c.h === 15 && c.m >= 15);

    if (inTrade) {
      // Update peak profit
      const hp = dir === 'CE' ? c.high - entry : entry - c.low;
      if (hp > peak) {
        peak = hp;
        sl = trailFn(sl, entry, dir, peak);
      }

      // Check SL hit (wick)
      const slHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
      if (slHit || isEOD) {
        const pts = isEOD
          ? (dir === 'CE' ? c.close - entry : entry - c.close)
          : (dir === 'CE' ? sl - entry      : entry - sl);
        dayPnl += pts;
        break; // max 1 trade per day
      }
    } else {
      // Only enter in window 9:45–13:00
      const slotOk = (c.h < 13) || (c.h === 9 && c.m >= 45);
      if (!slotOk || isEOD) continue;

      // Entry signal: candle close breaks OR + buffer
      const BUF = 25;
      if (c.close > OR_H + BUF) {
        dir = 'CE'; entry = c.close; sl = entry - slPts; peak = 0;
        inTrade = true; traded = true;
      } else if (c.close < OR_L - BUF) {
        dir = 'PE'; entry = c.close; sl = entry + slPts; peak = 0;
        inTrade = true; traded = true;
      }
    }
  }

  return { pnl: dayPnl, win: dayPnl > 0, traded };
}

// ================================================================
// MAIN
// ================================================================
async function main() {
  const all = await fetchAll();
  const days = groupByDay(all);

  // Define 3 strategy variants
  const variants = [
    { name: 'A: ORB Standard   (OR=100-450, SL=100, trail lock50)', slPts: 100, orMin: 100, orMax: 450, trailFn: trailLock50 },
    { name: 'B: ORB Selective  (OR=100-300, SL=100, trail lock50)', slPts: 100, orMin: 100, orMax: 300, trailFn: trailLock50 },
    { name: 'C: ORB Wide SL    (OR=150-450, SL=150, trail wide  )', slPts: 150, orMin: 150, orMax: 450, trailFn: trailLock50Wide },
  ];

  const header = ['2021','2022','2023','2024','2025','2026'];

  console.log('='.repeat(100));
  console.log('  NEW STRATEGY: ADAPTIVE OPENING RANGE BREAKOUT (ORB)');
  console.log('  BankNifty 5 Years — Jan 2021 to May 2026 | Rs15/pt (qty 30 x delta 0.5)');
  console.log('  Rule: Build OR from first 2 candles. Enter on breakout. Max 1 trade/day.');
  console.log('  NO C1 logic. NO re-entry. Pure ORB with adaptive filter.');
  console.log('='.repeat(100));

  for (const v of variants) {
    const yearStats = {};
    for (const yr of header) yearStats[yr] = { pnl:0, days:0, traded:0, wins:0, losses:0 };

    let maxDD = 0, runDD = 0, peak = 0;

    for (const {date, candles} of days) {
      const yr = date.slice(0,4);
      if (!yearStats[yr]) continue;
      yearStats[yr].days++;

      const res = simDay(candles, v.slPts, v.orMin, v.orMax, v.trailFn);
      yearStats[yr].pnl += res.pnl;
      if (res.traded) {
        yearStats[yr].traded++;
        if (res.win) yearStats[yr].wins++; else yearStats[yr].losses++;
      }

      // Track max drawdown
      const cumPnl = Object.values(yearStats).reduce((s,y)=>s+y.pnl,0);
      if (cumPnl > peak) peak = cumPnl;
      runDD = peak - cumPnl;
      if (runDD > maxDD) maxDD = runDD;
    }

    console.log(`\n  ${v.name}`);
    console.log('  ' + '-'.repeat(96));
    console.log('  Year  | Days | Traded | Skipped% | Total Pts  | Total Rs        | WinDay% | Trade WR');
    console.log('  ' + '-'.repeat(96));

    let totDays=0, totTraded=0, totPts=0, totWins=0, totTrades=0;
    for (const yr of header) {
      const y = yearStats[yr];
      if (!y.days) continue;
      const skippedPct = Math.round((y.days - y.traded) / y.days * 100);
      const winDayPct  = y.traded > 0 ? Math.round(y.wins / y.traded * 100) : 0;
      const tradeWR    = y.traded > 0 ? Math.round(y.wins / y.traded * 100) : 0;
      const rs         = y.pnl * QM;
      const pnlStr     = (y.pnl >= 0 ? '+' : '') + y.pnl.toFixed(0);
      const rsStr      = (rs >= 0 ? '+' : '') + 'Rs' + Math.abs(Math.round(rs)).toLocaleString('en-IN');
      console.log(`  ${yr}  | ${String(y.days).padStart(4)} | ${String(y.traded).padStart(6)} | ${String(skippedPct).padStart(7)}% | ${pnlStr.padStart(10)} | ${rsStr.padStart(15)} | ${String(winDayPct).padStart(6)}%  | ${tradeWR}%`);
      totDays+=y.days; totTraded+=y.traded; totPts+=y.pnl; totWins+=y.wins; totTrades+=y.traded;
    }
    const totRs       = totPts * QM;
    const totSkip     = Math.round((totDays-totTraded)/totDays*100);
    const totWinDay   = totTrades > 0 ? Math.round(totWins/totTrades*100) : 0;
    const totPtsStr   = (totPts>=0?'+':'')+totPts.toFixed(0);
    const totRsStr    = (totRs>=0?'+':'')+' Rs'+Math.abs(Math.round(totRs)).toLocaleString('en-IN');
    console.log('  ' + '-'.repeat(96));
    console.log(`  TOTAL | ${String(totDays).padStart(4)} | ${String(totTraded).padStart(6)} | ${String(totSkip).padStart(7)}% | ${totPtsStr.padStart(10)} | ${totRsStr.padStart(15)} | ${String(totWinDay).padStart(6)}%  |`);
    console.log(`  Max Drawdown: ${maxDD.toFixed(0)} pts = Rs${Math.round(maxDD*QM).toLocaleString('en-IN')}  |  Avg per traded day: ${totTrades>0?(totPts/totTrades).toFixed(1):0} pts`);
  }

  console.log('\n' + '='.repeat(100));
  console.log('  BENCHMARK (previous TICK TRAIL): Rs2,54,850 over 5 years | Win days: 45%');
  console.log('='.repeat(100));
}

main().catch(e => { console.error('FATAL:', e.message, e.stack); process.exit(1); });

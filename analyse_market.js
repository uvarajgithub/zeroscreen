// analyse_market.js — Pure BankNifty candle analysis
// No strategy. Just understand the data.
// What does a trend day look like vs choppy vs reversal?

'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const API_KEY = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

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

async function fetch15min(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
  if (!r.data?.candles) throw new Error('No candles');
  return r.data.candles.map(c => ({
    ts: new Date(c[0]),
    h: new Date(c[0]).getHours(),
    m: new Date(c[0]).getMinutes(),
    open: c[1], high: c[2], low: c[3], close: c[4]
  }));
}

function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    const key = c.ts.toISOString().slice(0, 10);
    if (!days[key]) days[key] = [];
    days[key].push(c);
  }
  return Object.entries(days).sort(([a],[b]) => a<b?-1:1).map(([date,cs]) => ({date,candles:cs}));
}

async function main() {
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  const all = [];
  for (const [from,to] of [
    ['2021-01-01','2021-12-31'],['2022-01-01','2022-12-31'],
    ['2023-01-01','2023-12-31'],['2024-01-01','2024-12-31'],
    ['2025-01-01','2025-12-31'],['2026-01-01','2026-05-13'],
  ]) { all.push(...await fetch15min(from, to)); process.stdout.write('.'); }
  console.log(` ${all.length} candles\n`);

  const days = groupByDay(all);

  // --- Per-day analysis ---
  const stats = {
    trend_up: 0, trend_dn: 0, choppy: 0, reversal: 0, total: 0,
    // on breakout trades: did price continue or reverse?
    breakout_success: 0, breakout_fail: 0,
    // early range distribution
    early_range_buckets: Array(10).fill(0), // 0-100, 100-200 ... 900-1000+
    // time of best entry (which 15-min slot produces the most pts after entry)
    slot_pnl: Array(25).fill(0), slot_trades: Array(25).fill(0),
  };

  // Per-day classification:
  // - TREND UP:   close > open + 200 AND close near day high (within 20%)
  // - TREND DN:   close < open - 200 AND close near day low
  // - REVERSAL:   moved 200+ early, then reversed 150+
  // - CHOPPY:     day range < 300 OR oscillating

  let totalDays = 0;
  const yearBreakdown = {};

  for (const {date, candles} of days) {
    if (candles.length < 10) continue;
    totalDays++;
    const yr = date.slice(0,4);
    if (!yearBreakdown[yr]) yearBreakdown[yr] = {trend_up:0,trend_dn:0,reversal:0,choppy:0,days:0,
      avg_range:0, avg_first_candle:0, early_range_sum:0, day_range_sum:0,
      // breakout: if price breaks ref candle high/low+25, does it continue 100pts or hit -100?
      breakout_continue:0, breakout_fail:0, breakout_total:0};

    const dayOpen  = candles[0].open;
    const dayClose = candles[candles.length-1].close;
    const dayHigh  = Math.max(...candles.map(c=>c.high));
    const dayLow   = Math.min(...candles.map(c=>c.low));
    const dayRange = dayHigh - dayLow;
    const firstCandle = candles[0];
    const firstRange  = firstCandle.high - firstCandle.low;

    // Early (first 4 candles 9:15–10:15)
    const early = candles.slice(0, Math.min(4, candles.length));
    const earlyH = Math.max(...early.map(c=>c.high));
    const earlyL = Math.min(...early.map(c=>c.low));
    const earlyRange = earlyH - earlyL;

    // Bucket early range
    const bucket = Math.min(9, Math.floor(earlyRange / 100));
    stats.early_range_buckets[bucket]++;

    // Day type
    const moveFromOpen = dayClose - dayOpen;
    const highFromOpen = dayHigh - dayOpen;
    const lowFromOpen  = dayLow  - dayOpen;
    // Did price first go up then come back significantly (reversal)?
    let maxUp = 0, maxDn = 0, revType = 'none';
    let runningHigh = dayOpen, runningLow = dayOpen;
    for (const c of candles) {
      if (c.high > runningHigh) runningHigh = c.high;
      if (c.low  < runningLow)  runningLow  = c.low;
      const upMove = runningHigh - dayOpen;
      const dnMove = dayOpen - runningLow;
      if (upMove > maxUp) maxUp = upMove;
      if (dnMove > maxDn) maxDn = dnMove;
    }
    const isReversalUp = maxUp > 200 && maxDn > 200 && Math.abs(moveFromOpen) < 150;
    const isChoppy     = dayRange < 300;
    const isTrendUp    = moveFromOpen > 200 && (dayHigh - dayClose) < dayRange * 0.3;
    const isTrendDn    = moveFromOpen < -200 && (dayClose - dayLow) < dayRange * 0.3;
    let dayType = 'choppy';
    if (isReversalUp)    dayType = 'reversal';
    else if (isTrendUp)  dayType = 'trend_up';
    else if (isTrendDn)  dayType = 'trend_dn';
    else if (!isChoppy)  dayType = 'normal';

    const yb = yearBreakdown[yr];
    yb.days++;
    yb[dayType] = (yb[dayType]||0) + 1;
    yb.day_range_sum   += dayRange;
    yb.early_range_sum += earlyRange;

    // Breakout simulation: for each candle, if it breaks ref candle body ± 25,
    // does the trade go +100 before hitting -100?
    let ref = candles[0];
    for (let i = 1; i < candles.length-2; i++) {
      const c = candles[i];
      if (c.h > 15 || (c.h===15 && c.m>=15)) break;
      const refBH = Math.max(ref.open, ref.close);
      const refBL = Math.min(ref.open, ref.close);
      let signal = null;
      if (c.close > refBH + 25) signal = 'CE';
      else if (c.close < refBL - 25) signal = 'PE';
      if (!signal) continue;

      ref = c; // advance ref
      const entry = c.close;
      // Look forward: does it hit +100 or -100 first?
      let hit100 = false, hitSL = false;
      for (let j = i+1; j < candles.length; j++) {
        const fwd = candles[j];
        const prof = signal==='CE' ? fwd.high - entry : entry - fwd.low;
        const loss = signal==='CE' ? entry - fwd.low  : fwd.high - entry;
        if (prof >= 100) { hit100 = true; break; }
        if (loss >= 100) { hitSL  = true; break; }
      }
      if (hit100) yb.breakout_continue++;
      else if (hitSL) yb.breakout_fail++;
      yb.breakout_total++;
      // Only analyse first breakout per ref update
    }

    // Time-of-day slot analysis: for each 15-min slot, if we enter here,
    // what is the avg P&L over the next 4 candles?
    for (let i = 1; i < Math.min(candles.length, 22); i++) {
      const c = candles[i];
      const slot = i - 1; // slot 0 = 9:30, slot 1 = 9:45, ...
      // Entry at close of candle i, hold for next 4 candles, exit at close
      const exitIdx = Math.min(i + 4, candles.length - 1);
      const exitC = candles[exitIdx];
      // Measure: did price move in a consistent direction over next 4 candles?
      const fwdHigh = Math.max(...candles.slice(i, exitIdx+1).map(c=>c.high));
      const fwdLow  = Math.min(...candles.slice(i, exitIdx+1).map(c=>c.low));
      stats.slot_pnl[slot]   += (fwdHigh - fwdLow);
      stats.slot_trades[slot]++;
    }
  }

  // --- Print results ---
  console.log('='.repeat(90));
  console.log('  MARKET STRUCTURE ANALYSIS — 5 Years BankNifty 15-min');
  console.log('='.repeat(90));

  console.log('\n  DAY TYPE BREAKDOWN PER YEAR:');
  console.log('  Year  | Days | TrendUp | TrendDn | Reversal | Choppy | Normal | AvgRange | EarlyR | Breakout%');
  console.log('  ' + '-'.repeat(88));
  let totDays=0, totTU=0, totTD=0, totRev=0, totChop=0, totNorm=0, totBT=0, totBC=0;
  for (const yr of Object.keys(yearBreakdown).sort()) {
    const y = yearBreakdown[yr];
    const norm   = y.days - (y.trend_up||0) - (y.trend_dn||0) - (y.reversal||0) - (y.choppy||0);
    const avgR   = Math.round(y.day_range_sum / y.days);
    const avgER  = Math.round(y.early_range_sum / y.days);
    const boPct  = y.breakout_total > 0 ? Math.round(y.breakout_continue/y.breakout_total*100) : 0;
    console.log(`  ${yr}  | ${String(y.days).padStart(4)} | ${String(y.trend_up||0).padStart(7)} | ${String(y.trend_dn||0).padStart(7)} | ${String(y.reversal||0).padStart(8)} | ${String(y.choppy||0).padStart(6)} | ${String(norm<0?0:norm).padStart(6)} | ${String(avgR).padStart(8)} | ${String(avgER).padStart(6)} | ${boPct}% (${y.breakout_continue}/${y.breakout_total})`);
    totDays+=y.days; totTU+=(y.trend_up||0); totTD+=(y.trend_dn||0); totRev+=(y.reversal||0);
    totChop+=(y.choppy||0); totNorm+=Math.max(0,norm); totBT+=y.breakout_total; totBC+=y.breakout_continue;
  }
  const boPctTot = totBT > 0 ? Math.round(totBC/totBT*100) : 0;
  console.log(`  TOTAL | ${String(totDays).padStart(4)} | ${String(totTU).padStart(7)} | ${String(totTD).padStart(7)} | ${String(totRev).padStart(8)} | ${String(totChop).padStart(6)} | ${String(totNorm).padStart(6)} | ${' '.repeat(8)} | ${' '.repeat(6)} | ${boPctTot}% (${totBC}/${totBT})`);

  console.log('\n  EARLY RANGE DISTRIBUTION (first 4 candles = 9:15 to 10:15):');
  console.log('  Range bucket   | Count | % days | Implication');
  const labels = ['0-100','100-200','200-300','300-400','400-500','500-600','600-700','700-800','800-900','900+'];
  for (let i=0; i<10; i++) {
    const cnt = stats.early_range_buckets[i];
    const pct = Math.round(cnt/totalDays*100);
    const bar = '█'.repeat(Math.round(pct/2));
    const impl = i===0?'VERY CHOPPY - skip':i===1?'Choppy - risky':i===2?'Normal':i>=3?'Trending - best':'';
    console.log(`  ${labels[i].padEnd(15)}| ${String(cnt).padStart(5)} | ${String(pct).padStart(5)}%  | ${bar} ${impl}`);
  }

  console.log('\n  BEST TIME SLOTS FOR ENTRY (avg range in next 4 candles):');
  console.log('  Slot | Time  | AvgRange | Trades');
  const times = ['9:30','9:45','10:00','10:15','10:30','10:45','11:00','11:15','11:30','11:45','12:00','12:15','12:30','12:45','13:00','13:15','13:30','13:45','14:00','14:15','14:30','14:45','15:00','15:15'];
  for (let i=0; i<Math.min(20, times.length); i++) {
    if (!stats.slot_trades[i]) continue;
    const avg = Math.round(stats.slot_pnl[i] / stats.slot_trades[i]);
    const bar = '█'.repeat(Math.min(30, Math.round(avg/20)));
    console.log(`  ${String(i).padStart(4)} | ${times[i]} | ${String(avg).padStart(8)} | ${stats.slot_trades[i]}  ${bar}`);
  }

  console.log('\n='.repeat(90));
  console.log(`  KEY INSIGHT: Breakout success rate = ${boPctTot}% (${totBC} of ${totBT} breakouts hit +100 before -100)`);
  console.log(`  Choppy days (range<300): ${totChop} (${Math.round(totChop/totDays*100)}%) — these should be SKIPPED`);
  console.log(`  Trend days (up+dn): ${totTU+totTD} (${Math.round((totTU+totTD)/totDays*100)}%) — these should use wider SL`);
  console.log(`  Reversal days: ${totRev} (${Math.round(totRev/totDays*100)}%) — need counter-trend entry`);
  console.log('='.repeat(90));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

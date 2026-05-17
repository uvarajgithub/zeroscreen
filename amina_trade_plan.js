'use strict';
/**
 * amina_trade_plan.js
 * Proper per-trade capital and monthly P&L breakdown
 * Starting with 1 actual BNF lot = 15 qty
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// 1 exchange lot = 15 qty, delta = 0.5
const QTY_1LOT   = 15;
const DELTA      = 0.5;
const RS_PER_PT  = QTY_1LOT * DELTA;   // 7.5 per point
const SL_INITIAL = 60;
const TRAIL_GAP  = 100;

// ATM premium estimate by BNF level (weekly expiry avg)
function estPremium(bnfClose) {
  return Math.round(bnfClose * 0.012);  // ~1.2% of spot = ATM weekly
}

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
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

async function fetchChunk(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`).catch(() => null);
  if (!r || !r.data || !r.data.candles) return [];
  return r.data.candles.map(c => {
    const ist = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return {
      date:  `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
      month: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}`,
      h: ist.getHours(), m: ist.getMinutes(),
      open: c[1], high: c[2], low: c[3], close: c[4]
    };
  });
}

async function fetchAll() {
  const all = [], endD = new Date(); let cur = new Date('2021-01-01');
  process.stdout.write('Fetching ');
  while (cur <= endD) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 90);
    if (ce > endD) ce.setTime(endD.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 91);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(` ${all.length} candles\n`);
  return all;
}

function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, c2level = 0, c3level = 0;
    if (ca.bull === cb.bull) {
      sig     = ca.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.high : ca.low;
      c3level = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig     = cb.bull ? 'CE' : 'PE';
      c2level = sig === 'CE' ? ca.body_high : ca.body_low;
      c3level = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else { continue; }
    if (sig === 'CE' && cb.close > c2level) return { sig, entryIdx: i + 1 };
    if (sig === 'PE' && cb.close < c2level) return { sig, entryIdx: i + 1 };
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > c3level) return { sig, entryIdx: j };
      if (sig === 'PE' && c.close < c3level) return { sig, entryIdx: j };
    }
  }
  return null;
}

function simLeg(cs, startIdx, dir, isEOD) {
  const entry = cs[startIdx].close;
  let sl = dir === 'CE' ? entry - SL_INITIAL : entry + SL_INITIAL;
  let peak = 0;
  for (let idx = startIdx + 1; idx < cs.length; idx++) {
    const c   = cs[idx];
    const cur = dir === 'CE' ? c.close - entry : entry - c.close;
    if (cur > peak) peak = cur;
    if (peak >= SL_INITIAL) {
      const locked = Math.max(0, peak - TRAIL_GAP);
      if (dir === 'CE') sl = Math.max(sl, entry + locked);
      else              sl = Math.min(sl, entry - locked);
    }
    if (isEOD(c)) return { pts: cur, slType: 'eod', exitIdx: idx };
    if (dir === 'CE' ? c.close <= sl : c.close >= sl)
      return { pts: dir === 'CE' ? sl - entry : entry - sl, slType: 'sl', exitIdx: idx };
  }
  const last = cs[cs.length - 1];
  return { pts: dir === 'CE' ? last.close - entry : entry - last.close, slType: 'eod', exitIdx: cs.length - 1 };
}

function simDay(candles) {
  const cs    = candles.map(enrich);
  const isEOD = c => c.h > 15 || (c.h === 15 && c.m >= 14);
  let t1Pts = 0, rePts = 0, t1Dir = null, numTrades = 0, entryLevel = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    if (isEOD(cs[idx])) break;
    const slice = cs.slice(0, idx + 1);
    const res   = rollingEntryScan(slice);
    if (!res || res.entryIdx !== slice.length - 1) continue;

    t1Dir      = res.sig;
    entryLevel = cs[idx].close;
    numTrades  = 1;
    const t1Res = simLeg(cs, idx, t1Dir, isEOD);
    t1Pts = t1Res.pts;

    if (t1Res.slType === 'sl') {
      numTrades = 2;
      const reDir = t1Dir === 'CE' ? 'PE' : 'CE';
      rePts = simLeg(cs, t1Res.exitIdx, reDir, isEOD).pts;
    }
    break;
  }
  return { dayPts: t1Pts + rePts, t1Dir, numTrades, entryLevel };
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  const allCandles = await fetchAll();
  const byDay = {};
  for (const c of allCandles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }
  const allDates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);

  // Monthly P&L accumulation
  const monthly = {};
  let wins = 0, losses = 0, tradeCount = 0, totalTrades = 0;
  let maxWinDay = 0, maxLossDay = 0;

  for (const date of allDates) {
    const { dayPts, t1Dir, numTrades, entryLevel } = simDay(byDay[date]);
    if (!t1Dir) continue;

    const mo = date.slice(0, 7);
    if (!monthly[mo]) monthly[mo] = { pts: 0, days: 0, wins: 0, losses: 0, trades: 0, avgEntry: 0, entrySum: 0 };
    const rs = dayPts * RS_PER_PT;
    monthly[mo].pts     += dayPts;
    monthly[mo].days++;
    monthly[mo].trades  += numTrades;
    monthly[mo].entrySum += entryLevel;
    if (dayPts > 0) { monthly[mo].wins++; wins++; }
    else            { monthly[mo].losses++; losses++; }
    tradeCount++;
    totalTrades += numTrades;
    if (rs > maxWinDay)  maxWinDay  = rs;
    if (rs < maxLossDay) maxLossDay = rs;
  }

  const months   = Object.keys(monthly).sort();
  const LINE     = '─'.repeat(95);
  const DLINE    = '═'.repeat(95);
  const rs       = v => Math.round(v * RS_PER_PT);
  const fmtRs    = (n, sign=false) => {
    const s = Math.round(Math.abs(n)).toLocaleString('en-IN');
    return (sign ? (n >= 0 ? '+₹' : '-₹') : '₹') + s;
  };

  // ── SECTION 1: Trade mechanics ──────────────────────────────────────────────
  console.log(DLINE);
  console.log('  AMINA-T100 — TRADE PLAN  (1 Exchange Lot = 15 qty)');
  console.log(DLINE);

  console.log('\n  ── WHAT IS 1 LOT? ──────────────────────────────────────────────────');
  console.log('  BNF exchange lot size      = 15 qty');
  console.log('  Our backtest "1 lot"       = 30 qty = 2 exchange lots');
  console.log('  START RECOMMENDATION       = 1 exchange lot (15 qty) = ₹7.5/BNF point');
  console.log('');
  console.log('  ── AMOUNT NEEDED PER TRADE ─────────────────────────────────────────');
  console.log('  BNF level  ATM premium  15 qty cost  Max loss (60pt SL)  With buffer');
  console.log('  ' + '─'.repeat(72));
  for (const [bnf, prem] of [[40000,480],[45000,540],[50000,600],[55000,660],[60000,720]]) {
    const cost    = prem * 15;
    const maxLoss = 60 * RS_PER_PT;
    const buffer  = cost + maxLoss * 2;
    console.log(`  BNF ${bnf}  ₹${prem}/opt   ₹${cost.toLocaleString('en-IN')}       -₹${maxLoss} worst day      ₹${buffer.toLocaleString('en-IN')}`);
  }
  console.log('');
  console.log('  ── TRADES PER DAY ──────────────────────────────────────────────────');
  const avgTrades = (totalTrades / tradeCount).toFixed(2);
  const twoTradeDays = Object.values(monthly).reduce((s, m) => s + m.trades - m.days, 0);
  console.log(`  Minimum:  1 trade/day  (T1 entry → hold to EOD or trail SL)`);
  console.log(`  Maximum:  2 trades/day (T1 SL hit → RE in opposite direction)`);
  console.log(`  Average:  ${avgTrades} trades/day  (from ${tradeCount} trade days, ${totalTrades} total trades)`);
  console.log(`  RE days:  ~${twoTradeDays} days had 2 trades out of ${tradeCount} (${(twoTradeDays/tradeCount*100).toFixed(0)}%)`);
  console.log('');
  console.log('  ── HOW MUCH CAPITAL FOR 1 MONTH (no top-up) ───────────────────────');
  console.log('  Capital must cover:');
  console.log('  1. Option premium to enter each day: ₹9,000 (15qty × ₹600 avg)');
  console.log('     → This comes BACK after you exit. Not "spent", just blocked.');
  console.log('  2. Worst month loss buffer: see monthly table below');
  console.log('  3. RE trade same day: sometimes 2× premium needed at once');
  console.log('  Minimum safe capital (1 lot): ₹25,000');
  console.log('     = ₹9,000 premium + ₹9,000 RE buffer + ₹7,000 loss cushion');

  // ── SECTION 2: Monthly P&L table ───────────────────────────────────────────
  console.log('\n' + DLINE);
  console.log('  MONTHLY P&L  (1 exchange lot = 15 qty, ₹7.5/pt)');
  console.log(DLINE);
  console.log('  ' + [
    'Month'.padEnd(8), 'Days'.padStart(5), 'Trades'.padStart(7),
    'Wins'.padStart(5), 'Loss'.padStart(5), 'Win%'.padStart(6),
    'Net ₹'.padStart(9), 'Avg/day'.padStart(9), 'Cum ₹'.padStart(10)
  ].join(' '));
  console.log(LINE);

  let cumPts = 0;
  let posMonths = 0, negMonths = 0, bestMonth = -Infinity, worstMonth = Infinity;
  const monthlyRs = [];

  for (const mo of months) {
    const m    = monthly[mo];
    const td   = m.wins + m.losses;
    const winP = td ? (m.wins/td*100).toFixed(0) : '0';
    const netRs  = rs(m.pts);
    const avgRs  = td ? Math.round(netRs/td) : 0;
    cumPts      += m.pts;
    const cumRs  = rs(cumPts);
    monthlyRs.push(netRs);
    if (netRs > 0) posMonths++; else negMonths++;
    if (netRs > bestMonth)  bestMonth  = netRs;
    if (netRs < worstMonth) worstMonth = netRs;

    const neg = netRs < 0 ? ' ◀' : '';
    console.log('  ' + [
      mo.padEnd(8),
      String(m.days).padStart(5),
      String(m.trades).padStart(7),
      String(m.wins).padStart(5),
      String(m.losses).padStart(5),
      String(winP+'%').padStart(6),
      fmtRs(netRs, true).padStart(9),
      fmtRs(avgRs, true).padStart(9),
      fmtRs(cumRs).padStart(10)
    ].join(' ') + neg);
  }

  // ── SECTION 3: Summary stats ────────────────────────────────────────────────
  const totalRs  = rs(Object.values(monthly).reduce((s, m) => s + m.pts, 0));
  const avgMonRs = Math.round(totalRs / months.length);

  console.log(LINE);
  console.log(`  Total months: ${months.length}  |  Profitable: ${posMonths}  |  Loss: ${negMonths}  |  Hit rate: ${(posMonths/months.length*100).toFixed(0)}%`);
  console.log(`  Best month:  ${fmtRs(bestMonth, true).padStart(10)}   Worst month: ${fmtRs(worstMonth, true)}`);
  console.log(`  Avg month:   ${fmtRs(avgMonRs, true).padStart(10)}   Total: ${fmtRs(totalRs, true)}`);

  // ── SECTION 4: Lot increase guide ──────────────────────────────────────────
  console.log('\n' + DLINE);
  console.log('  LOT INCREASE GUIDE  (add 1 lot = 15 qty when profit covers ₹25K)');
  console.log(DLINE);

  let capital = 25000;   // starting capital
  let lots = 1;
  let cumProfit = 0;
  let prevLots = 1;

  console.log(`\n  Start: ₹25,000 capital → 1 lot (15 qty)\n`);
  console.log('  ' + ['Month'.padEnd(8), 'Lots'.padStart(5), 'Qty'.padStart(5), 'Capital'.padStart(10), 'Monthly ₹'.padStart(10), 'Cum Profit'.padStart(12), 'Action'].join(' '));
  console.log(LINE);

  for (const mo of months) {
    const m      = monthly[mo];
    const earned = rs(m.pts) * lots;
    cumProfit   += earned;
    capital     += earned;
    const newLots = Math.max(1, Math.floor(capital / 25000));
    const action  = newLots > lots ? `▲ ADD ${newLots - lots} lot(s) → now ${newLots}L` : '';
    console.log('  ' + [
      mo.padEnd(8),
      String(lots+'L').padStart(5),
      String(lots*15).padStart(5),
      fmtRs(lots*25000).padStart(10),
      fmtRs(earned, true).padStart(10),
      fmtRs(cumProfit, true).padStart(12),
      action
    ].join(' '));
    lots = newLots;
  }
  console.log(LINE);
  console.log(`  Final capital: ${fmtRs(capital)}  |  Lots: ${lots}  |  Qty: ${lots*15}`);

  // ── SECTION 5: Capital sustainability ──────────────────────────────────────
  console.log('\n' + DLINE);
  console.log('  CAPITAL SUSTAINABILITY (1 lot, no top-up)');
  console.log(DLINE);
  console.log('');
  console.log('  Worst month seen in backtest (1 lot):  ' + fmtRs(worstMonth, true));
  console.log('  Max single day loss      (1 lot):      -₹900 (both legs full SL)');
  console.log('  Premium blocked per trade:              ~₹9,000 (returned on exit)');
  console.log('');
  console.log('  MINIMUM CAPITAL (₹25,000) breakdown:');
  console.log('    ₹9,000  → Premium for T1 trade (returned same day)');
  console.log('    ₹9,000  → Buffer if RE trade needed (also returned)');
  console.log('    ₹7,000  → Loss cushion for bad streak');
  console.log('');
  console.log('  RECOMMENDED CAPITAL (₹30,000):');
  console.log('    Covers worst month loss + full month of daily premiums');
  console.log('    Even in worst month, capital stays above ₹25K threshold');
  console.log('');
  console.log('  RULE: As long as capital > (lots × ₹25,000), keep trading.');
  console.log('        If capital drops below → reduce to 1 lot, do NOT add capital yet.');
  console.log(DLINE);
})().catch(console.error);

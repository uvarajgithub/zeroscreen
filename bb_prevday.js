'use strict';
/**
 * bb_prevday.js — Previous Day BB%B Bias Strategy
 *
 * Rule (TREND CONTINUATION):
 *   Look at PREVIOUS day's candles → find the LAST candle where %B hit a band
 *     - Last band hit was UPPER (>=1) → trend is UP   → today: enter CE on first GREEN candle
 *     - Last band hit was LOWER (<=0) → trend is DOWN → today: enter PE on first RED  candle
 *     - Previous day had NO band hit  → no trade today
 *   SL = entry candle low (CE) / high (PE)
 *   Exit = SL hit or EOD close
 */

const fs      = require('fs');
const https   = require('https');
require('dotenv').config();

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const BROKERAGE    = 4;
const BB_LEN       = 20;
const BB_MULT      = 2;

// ── Kite fetch ────────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let buf = ''; res.on('data', d => buf += d);
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch(e) { reject(e); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchRange(from, to) {
  const r = await kiteGet(
    `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`
  ).catch(() => null);
  if (!r || r.status !== 'success') return [];
  return r.data.candles.map(([dt, open, high, low, close]) => ({
    date: String(dt).slice(0, 10),
    time: String(dt).slice(11, 16),
    open, high, low, close
  }));
}

// ── BB%B calculation (continuous across all candles) ─────────────────────────
function calcBB(closes) {
  const result = new Array(closes.length).fill(null);
  for (let i = BB_LEN - 1; i < closes.length; i++) {
    const slice = closes.slice(i - BB_LEN + 1, i + 1);
    const mean  = slice.reduce((s, v) => s + v, 0) / BB_LEN;
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / BB_LEN);
    const upper = mean + BB_MULT * std;
    const lower = mean - BB_MULT * std;
    result[i]   = std === 0 ? 0.5 : (closes[i] - lower) / (upper - lower);
  }
  return result;
}

// SMMA(7) — Smoothed Moving Average, period 7
// SMMA[0] = SMA of first 7; SMMA[i] = (SMMA[i-1]*6 + close[i]) / 7
const SMMA_LEN = 7;
function calcSMMA(closes) {
  const result = new Array(closes.length).fill(null);
  // Seed with SMA of first SMMA_LEN values
  const seed = closes.slice(0, SMMA_LEN).reduce((s, v) => s + v, 0) / SMMA_LEN;
  result[SMMA_LEN - 1] = seed;
  for (let i = SMMA_LEN; i < closes.length; i++) {
    result[i] = (result[i - 1] * (SMMA_LEN - 1) + closes[i]) / SMMA_LEN;
  }
  return result;
}

function isEOD(time) { return time >= '15:00'; }

// ── Backtest ──────────────────────────────────────────────────────────────────
function runBacktest(allDates, byDay) {
  let net = 0, wins = 0, losses = 0, noSignal = 0;
  let equity = 0, peak = 0, maxDD = 0;
  const yearly = {}, tradeLog = [];

  for (let di = 1; di < allDates.length; di++) {
    const date    = allDates[di];
    const prevDay = allDates[di - 1];
    const prevCs  = byDay[prevDay];
    const cs      = byDay[date];

    // Find LAST band hit on previous day — TREND CONTINUATION
    let prevBias = null; // 'CE' or 'PE'
    for (let i = prevCs.length - 1; i >= 0; i--) {
      const c = prevCs[i];
      if (c.bb === null) continue;
      if (c.bb >= 1.0) { prevBias = 'CE'; break; }  // upper band → trend UP → CE
      if (c.bb <= 0.0) { prevBias = 'PE'; break; }  // lower band → trend DOWN → PE
    }

    if (!prevBias) { noSignal++; continue; }

    // Today: enter on first confirming candle
    let entered = false, dir = null, entryPx = null, slPx = null;
    let exitPts = null, exitTime = null, exitReason = null;

    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (isEOD(c.time)) break;

      if (!entered) {
        const isGreen = c.close >= c.open;
        const confirms = (prevBias === 'CE' && isGreen) || (prevBias === 'PE' && !isGreen);
        if (!confirms) continue;
        entered = true;
        dir = prevBias;
        entryPx = c.close;
        slPx    = c.smma;  // SMMA7 as SL
      } else {
        // Check SL using candle low/high vs SMMA7
        if (dir === 'CE' ? c.low <= slPx : c.high >= slPx) {
          exitPts = dir === 'CE' ? slPx - entryPx : entryPx - slPx;
          exitTime = c.time; exitReason = 'SL'; break;
        }
        if (isEOD(c.time)) {
          exitPts = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
          exitTime = c.time; exitReason = 'EOD'; break;
        }
      }
    }

    // EOD fallback if still in trade
    if (entered && exitPts === null) {
      const last = cs.find(c => isEOD(c.time));
      if (last) {
        exitPts = dir === 'CE' ? last.close - entryPx : entryPx - last.close;
        exitTime = last.time; exitReason = 'EOD';
      }
    }

    if (!entered) { noSignal++; continue; }

    const dayNet = exitPts - BROKERAGE;
    net    += dayNet;
    equity += dayNet;
    if (equity > peak) peak = equity;
    if (peak - equity > maxDD) maxDD = peak - equity;

    const yr = date.slice(0, 4);
    yearly[yr] = (yearly[yr] || 0) + dayNet;
    if (dayNet > 0) wins++; else losses++;

    tradeLog.push({ date, prevDay, prevBias, dir, entryPx, slPx, exitPts, exitTime, exitReason,
      net: dayNet, netRs: Math.round(dayNet * RS_PER_PT) });
  }

  const total = wins + losses;
  return {
    netRs  : Math.round(net * RS_PER_PT),
    maxDDRs: Math.round(maxDD * RS_PER_PT),
    winPct : total ? (wins / total * 100).toFixed(1) : '0',
    avgDay : total ? Math.round(net * RS_PER_PT / total) : 0,
    wins, losses, noSignal, yearly, tradeLog
  };
}

(async () => {
  // ── Load cache for full backtest ──────────────────────────────────────────
  const CACHE = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
  const raw = JSON.parse(fs.readFileSync(CACHE, 'utf-8'));
  const allCandles = raw.map(c => ({
    day    : String(c.date).slice(0, 10),
    timeIST: (() => { const d = new Date(c.date); d.setMinutes(d.getMinutes() + 330); return d.toISOString().slice(11, 16); })(),
    open: c.open, high: c.high, low: c.low, close: c.close,
  })).sort((a, b) => (a.day + a.timeIST) < (b.day + b.timeIST) ? -1 : 1);

  const byDayCache = {};
  for (const c of allCandles) {
    if (!byDayCache[c.day]) byDayCache[c.day] = [];
    byDayCache[c.day].push({ time: c.timeIST, open: c.open, high: c.high, low: c.low, close: c.close, bb: null });
  }

  const allDatesCache = Object.keys(byDayCache).sort();
  const allCloses = allCandles.map(c => c.close);
  const allBB     = calcBB(allCloses);
  const allSMMA   = calcSMMA(allCloses);
  let idx = 0;
  for (const date of allDatesCache) {
    for (const c of byDayCache[date]) { c.bb = allBB[idx]; c.smma = allSMMA[idx]; idx++; }
  }

  console.log(`Cache: ${CACHE} | ${allCandles.length} candles | ${allDatesCache.length} days`);
  process.stdout.write('Running backtest...');
  const result = runBacktest(allDatesCache, byDayCache);
  console.log(' done\n');

  const LINE  = '─'.repeat(100);
  const years = ['2021', '2022', '2023', '2024', '2025', '2026'];

  console.log('PREV DAY BB%B TREND CONTINUATION STRATEGY');
  console.log('Rule: prev day last band = UPPER \u2192 trend UP   \u2192 today enter CE on 1st GREEN candle');
  console.log('                         = LOWER \u2192 trend DOWN \u2192 today enter PE on 1st RED  candle');
  console.log('SL: SMMA(7) value at entry candle');
  console.log(LINE);
  console.log(`Net ₹: ₹${result.netRs.toLocaleString('en-IN')}  |  Win%: ${result.winPct}%  |  MaxDD: ₹${result.maxDDRs.toLocaleString('en-IN')}  |  Avg/trade: ₹${result.avgDay.toLocaleString('en-IN')}`);
  console.log(`Trades: ${result.wins + result.losses}  |  Wins: ${result.wins}  |  Losses: ${result.losses}  |  No signal days: ${result.noSignal}`);
  console.log(LINE);

  console.log('\nYEARLY BREAKDOWN:');
  for (const yr of years) {
    const rs = Math.round((result.yearly[yr] || 0) * RS_PER_PT);
    const bar = '█'.repeat(Math.max(0, Math.round(Math.abs(rs) / 5000)));
    console.log(`  ${yr}: ${(rs >= 0 ? '+' : '')}₹${rs.toLocaleString('en-IN').padStart(12)}  ${rs >= 0 ? bar : '─'.repeat(bar.length) + ' ❌'}`);
  }

  // ── March 2026 drill-down ─────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(100));
  console.log('MARCH 2026 DRILL-DOWN — fetching from Kite API');
  console.log('═'.repeat(100));

  const recent = await fetchRange('2026-02-01', '2026-03-31');
  if (!recent.length) { console.log('No Kite data — token expired'); return; }

  recent.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);
  const closes2 = recent.map(c => c.close);
  const bb2   = calcBB(closes2);
  const smma2 = calcSMMA(closes2);
  for (let i = 0; i < recent.length; i++) { recent[i].bb = bb2[i]; recent[i].smma = smma2[i]; }

  const byDay2 = {};
  for (const c of recent) { if (!byDay2[c.date]) byDay2[c.date] = []; byDay2[c.date].push(c); }
  const marchDays = Object.keys(byDay2).filter(d => d.startsWith('2026-03')).sort();
  // Include the last Feb day for prev-day lookup
  const allFebDays = Object.keys(byDay2).filter(d => d.startsWith('2026-02')).sort();

  let monthPts = 0, mWins = 0, mLosses = 0, mNoSig = 0;
  const mLog = [];

  const allDays2 = [...allFebDays, ...marchDays];

  for (let di = 0; di < allDays2.length; di++) {
    const date = allDays2[di];
    if (!date.startsWith('2026-03')) continue;

    const prevDate = allDays2[di - 1];
    if (!prevDate) { mNoSig++; continue; }

    const prevCs = byDay2[prevDate];
    const cs     = byDay2[date];

    // Last band hit on previous day — TREND CONTINUATION
    let prevBias = null;
    for (let i = prevCs.length - 1; i >= 0; i--) {
      const c = prevCs[i];
      if (c.bb === null) continue;
      if (c.bb >= 1.0) { prevBias = 'CE'; break; }  // upper → trend UP → CE
      if (c.bb <= 0.0) { prevBias = 'PE'; break; }  // lower → trend DOWN → PE
    }

    const dayOfWeek = new Date(date).toLocaleDateString('en-IN', { weekday: 'short' });

    if (!prevBias) {
      // Find min/max %B of prev day for context
      const prevBBs = prevCs.filter(c => c.bb !== null).map(c => c.bb);
      const minPB = prevBBs.length ? Math.min(...prevBBs).toFixed(3) : 'N/A';
      const maxPB = prevBBs.length ? Math.max(...prevBBs).toFixed(3) : 'N/A';
      console.log(`\n${date} ${dayOfWeek} | NO SIGNAL — prev day (${prevDate}) had no band hit  %B range:[${minPB},${maxPB}]`);
      mNoSig++;
      mLog.push({ date, prevDate, prevBias: null, entered: false });
      continue;
    }

    // Enter on first confirming candle today
    let entered = false, dir = null, entryPx = null, slPx = null;
    let exitPts = null, exitTime = null, exitReason = null;

    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!entered) {
        if (isEOD(c.time)) break;
        const isGreen = c.close >= c.open;
        const confirms = (prevBias === 'CE' && isGreen) || (prevBias === 'PE' && !isGreen);
        if (!confirms) continue;
        entered = true; dir = prevBias; entryPx = c.close;
        slPx = c.smma;  // SMMA7 as SL
      } else {
        if (dir === 'CE' ? c.low <= slPx : c.high >= slPx) {
          exitPts = dir === 'CE' ? slPx - entryPx : entryPx - slPx;
          exitTime = c.time; exitReason = 'SL'; break;
        }
        if (isEOD(c.time)) {
          exitPts = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
          exitTime = c.time; exitReason = 'EOD'; break;
        }
      }
    }

    if (entered && exitPts === null) {
      const last = cs.find(c => isEOD(c.time));
      if (last) { exitPts = dir === 'CE' ? last.close - entryPx : entryPx - last.close; exitTime = last.time; exitReason = 'EOD'; }
    }

    if (!entered) {
      console.log(`\n${date} ${dayOfWeek} | BIAS=${prevBias} (from ${prevDate}) — no confirming candle all day → NO TRADE`);
      mNoSig++;
      mLog.push({ date, prevDate, prevBias, entered: false });
      continue;
    }

    const dayNet = exitPts - BROKERAGE;
    const dayRs  = Math.round(dayNet * RS_PER_PT);
    monthPts += dayNet;
    if (dayNet > 0) mWins++; else mLosses++;

    const pnlStr = dayRs >= 0 ? `+₹${dayRs.toLocaleString('en-IN')} ✅` : `-₹${Math.abs(dayRs).toLocaleString('en-IN')} ❌`;
    console.log(`\n${date} ${dayOfWeek} | BIAS=${dir} (prev:${prevDate} last hit ${prevBias==='CE'?'LOWER':'UPPER'})  Entry:${entryPx?.toFixed(0)}  SL:${slPx?.toFixed(0)}  Exit@${exitTime}(${exitReason})  ${exitPts >= 0 ? '+' : ''}${exitPts?.toFixed(0)}pts  ${pnlStr}`);

    const LINE2 = '─'.repeat(90);
    console.log(LINE2);
    console.log(`${'Time'.padEnd(7)} ${'Color'.padEnd(7)} ${'Open'.padStart(9)} ${'High'.padStart(9)} ${'Low'.padStart(9)} ${'Close'.padStart(9)} ${'%B'.padStart(7)}  Status`);
    console.log(LINE2);

    let ent2 = false, dir2 = null, e2 = null, sl2 = null, done2 = false;
    for (const c of cs) {
      const bbStr   = c.bb   !== null ? c.bb.toFixed(3)   : '  ---';
      const smmaStr = c.smma !== null ? c.smma.toFixed(0) : '  ---';
      const isGreen = c.close >= c.open;
      const color   = isGreen ? 'GREEN' : 'RED  ';
      let status = '';

      if (!ent2 && !done2) {
        const confirms = (prevBias === 'CE' && isGreen) || (prevBias === 'PE' && !isGreen);
        if (!isEOD(c.time) && confirms) {
          ent2 = true; dir2 = prevBias; e2 = c.close; sl2 = c.smma;
          status = `⚡ ENTER ${dir2} @ ${e2.toFixed(0)}  SL@SMMA7=${sl2.toFixed(0)}`;
        } else {
          const waitStr = isEOD(c.time) ? 'EOD' : `waiting ${prevBias==='CE'?'GREEN':'RED'}`;
          status = `  ${waitStr}  SMMA7=${smmaStr}`;
        }
      } else if (ent2 && !done2) {
        const slHit = dir2 === 'CE' ? c.low <= sl2 : c.high >= sl2;
        const unreal = dir2 === 'CE' ? c.close - e2 : e2 - c.close;
        if (slHit) {
          const pts = dir2 === 'CE' ? sl2 - e2 : e2 - sl2;
          status = `🛑 SL HIT (SMMA7=${sl2.toFixed(0)})  P&L: ${pts.toFixed(0)} pts = ₹${Math.round((pts-BROKERAGE)*RS_PER_PT).toLocaleString('en-IN')}  ← EXIT`;
          done2 = true;
        } else if (isEOD(c.time)) {
          const pts = dir2 === 'CE' ? c.close - e2 : e2 - c.close;
          const pnl = Math.round((pts-BROKERAGE)*RS_PER_PT);
          status = `🏁 EOD EXIT @ ${c.close.toFixed(0)}  P&L: ${pts.toFixed(0)} pts = ₹${pnl.toLocaleString('en-IN')} ${pnl>=0?'✅':'❌'}`;
          done2 = true;
        } else {
          status = `  in trade  SMMA7=${smmaStr}  SL@${sl2.toFixed(0)}  unreal: ${unreal>=0?'+':''}${unreal.toFixed(0)}`;
        }
      }

      console.log(`${c.time.padEnd(7)} ${color.padEnd(7)} ${String(c.open.toFixed(0)).padStart(9)} ${String(c.high.toFixed(0)).padStart(9)} ${String(c.low.toFixed(0)).padStart(9)} ${String(c.close.toFixed(0)).padStart(9)} ${bbStr.padStart(7)} SMMA7:${smmaStr.padStart(6)}  ${status}`);
    }

    mLog.push({ date, prevDate, prevBias, entered: true, dir, entryPx, slPx, exitPts, exitTime, exitReason, netRs: dayRs });
  }

  // March summary
  const mTotalRs = Math.round(monthPts * RS_PER_PT);
  console.log('\n' + '═'.repeat(90));
  console.log('MARCH 2026 SUMMARY — Prev Day BB%B TREND CONTINUATION');
  console.log('═'.repeat(90));
  console.log(`Days: 19 | Traded: ${mWins+mLosses} | No signal/confirm: ${mNoSig} | Wins: ${mWins} | Losses: ${mLosses} | Win%: ${(mWins+mLosses)?((mWins/(mWins+mLosses))*100).toFixed(1):0}%`);
  console.log(`Net ₹: ${mTotalRs >= 0 ? '+' : ''}₹${mTotalRs.toLocaleString('en-IN')}`);
  console.log('─'.repeat(90));
  for (const s of mLog) {
    if (!s.entered) { console.log(`  ${s.date}  NO SIGNAL (prev:${s.prevDate} bias:${s.prevBias||'none'})`); continue; }
    const pnl = s.netRs >= 0 ? `+₹${s.netRs.toLocaleString('en-IN')}` : `-₹${Math.abs(s.netRs).toLocaleString('en-IN')}`;
    console.log(`  ${s.date}  ${s.dir}  entry:${s.entryPx?.toFixed(0)}  SL:${s.slPx?.toFixed(0)}  ${s.exitReason}@${s.exitTime}  ${s.exitPts>=0?'+':''}${s.exitPts?.toFixed(0)}pts  ${pnl}`);
  }
  console.log('═'.repeat(90));
  console.log(`\nAMINA cache baseline: ₹11,17,894 | Full 33K: ₹14,24,023`);
  console.log(`This strategy (5yr): ₹${result.netRs.toLocaleString('en-IN')}`);
})();

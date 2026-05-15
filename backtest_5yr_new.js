'use strict';
require('dotenv').config();
const https  = require('https');
const fs     = require('fs');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// ─── Kite fetch ───────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

// ─── Enrich candle ────────────────────────────────────────────
function enrich(c) {
  const bull       = c.close >= c.open;
  const body_high  = Math.max(c.open, c.close);
  const body_low   = Math.min(c.open, c.close);
  const body_size  = body_high - body_low;
  const upper_wick = c.high  - body_high;
  const lower_wick = body_low - c.low;
  const dt         = new Date(c.raw_time);
  const h          = dt.getHours();   // IST hours (server is UTC+5:30)
  const m          = dt.getMinutes();
  // Convert UTC to IST: UTC+5:30
  const ist = new Date(dt.getTime() + 5.5 * 3600000);
  const hIST = ist.getUTCHours(), mIST = ist.getUTCMinutes();
  const time = `${String(hIST).padStart(2,'0')}:${String(mIST).padStart(2,'0')}`;
  return { ...c, bull, body_high, body_low, body_size, upper_wick, lower_wick, time, h: hIST, m: mIST };
}

// ─── Strategy ─────────────────────────────────────────────────
const SL_T1 = 50, SL_RE = 100;

function findEntry(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    if (ca.h > 11 || (ca.h === 11 && ca.m >= 30)) break;
    let sig = null, bl = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (c.h > 15 || (c.h === 15 && c.m >= 15)) break;
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, idx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, idx: j };
    }
  }
  return null;
}

const mv  = (s, e, p) => s === 'CE' ? p - e : e - p;
const opp = s => s === 'CE' ? 'PE' : 'CE';

function runDay(cs) {
  const e = findEntry(cs);
  if (!e) return { pts: 0, noEntry: true };
  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  let slHit = false, sIdx = null, sPx = null;
  let t1Pts = mv(e.sig, e.px, last);
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL_T1) { slHit = true; sIdx = i; sPx = c.close; t1Pts = -SL_T1; break; }
  }

  let rePts = 0;
  if (slHit) {
    const rs  = opp(e.sig);
    const mar = rs === 'CE' ? (sPx - dayOpen) : -(sPx - dayOpen);
    if (mar < 0) {
      rePts = mv(rs, sPx, last);
      for (let i = sIdx + 1; i < cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePts = -SL_RE; break; }
      }
    }
  }
  return { pts: t1Pts + rePts, t1Pts, rePts, slHit };
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Fetching 5 years of BankNifty 15-min data from Kite API ===\n');

  const endDate   = new Date('2026-05-13');
  const startDate = new Date('2021-05-13');
  let cursor      = new Date(startDate);
  const allRaw    = [];

  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(cursor.getDate() + 190);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());

    const from = fmtDate(cursor), to = fmtDate(chunkEnd);
    process.stdout.write(`  Fetching ${from} → ${to} ... `);
    try {
      const resp = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
      if (resp.data && resp.data.candles) {
        allRaw.push(...resp.data.candles.map(c => ({
          raw_time: c[0], open: c[1], high: c[2], low: c[3], close: c[4],
          date: c[0].slice(0, 10)
        })));
        console.log(`${resp.data.candles.length} candles`);
      } else {
        console.log(`ERROR: ${JSON.stringify(resp).slice(0, 80)}`);
      }
    } catch(e) { console.log(`FAILED: ${e.message}`); }

    cursor.setDate(cursor.getDate() + 191);
    await sleep(400);
  }

  console.log(`\nTotal raw candles fetched: ${allRaw.length}`);

  // Group by date and enrich
  const byDate = {};
  for (const c of allRaw) {
    const ec = enrich(c);
    // Keep only 9:15 to 15:15 candles
    if (ec.h < 9 || (ec.h === 9 && ec.m < 15)) continue;
    if (ec.h > 15 || (ec.h === 15 && ec.m > 15)) continue;
    if (!byDate[ec.date]) byDate[ec.date] = [];
    byDate[ec.date].push(ec);
  }

  const tradingDays = Object.entries(byDate).filter(([,cs]) => cs.length >= 10).sort();
  console.log(`\nTrading days with data: ${tradingDays.length}`);

  // Run strategy on each day
  let totalPts = 0;
  const monthly = {};
  let noEntryDays = 0, profitDays = 0, lossDays = 0;

  for (const [date, cs] of tradingDays) {
    const month = date.slice(0, 7);
    if (!monthly[month]) monthly[month] = { days: 0, pts: 0, profit: 0, loss: 0 };

    const result = runDay(cs);
    totalPts += result.pts;
    monthly[month].days++;
    monthly[month].pts += result.pts;
    if (result.noEntry) noEntryDays++;
    else if (result.pts > 0) { profitDays++; monthly[month].profit++; }
    else if (result.pts < 0) { lossDays++;   monthly[month].loss++; }
  }

  const RS_PER_PT = 15;
  const totalRs   = totalPts * RS_PER_PT;

  // ─── Print monthly table ───────────────────────────────────
  console.log('\n=== MONTHLY RESULTS ===\n');
  console.log('Month      Days  Points     Rs        Win  Loss');
  console.log('─'.repeat(52));
  let cumRs = 0;
  for (const [month, m] of Object.entries(monthly).sort()) {
    cumRs += m.pts * RS_PER_PT;
    const ptsStr = (m.pts >= 0 ? '+' : '') + m.pts.toFixed(0);
    const rsStr  = (m.pts >= 0 ? '+' : '') + (m.pts * RS_PER_PT).toFixed(0);
    console.log(`${month}   ${String(m.days).padStart(3)}   ${ptsStr.padStart(7)}  ${rsStr.padStart(9)}   ${m.profit}    ${m.loss}    cumRs:${cumRs.toFixed(0)}`);
  }

  // ─── Final summary ────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('  5-YEAR BACKTEST SUMMARY (Real Kite Data)');
  console.log('═'.repeat(60));
  console.log(`  Period           : May 2021 – May 2026`);
  console.log(`  Trading days     : ${tradingDays.length}`);
  console.log(`  No entry days    : ${noEntryDays}`);
  console.log(`  Profitable days  : ${profitDays}`);
  console.log(`  Loss days        : ${lossDays}`);
  console.log(`  Win rate         : ${(profitDays/(profitDays+lossDays)*100).toFixed(1)}%`);
  console.log(``);
  console.log(`  Total Points     : ${(totalPts >= 0 ? '+' : '') + totalPts.toFixed(0)}`);
  console.log(`  Rs per point     : Rs ${RS_PER_PT} (1 lot)`);
  console.log(`  TOTAL PROFIT     : Rs ${totalRs.toFixed(0)}`);
  console.log(`  Avg per day      : Rs ${(totalRs / tradingDays.length).toFixed(0)}`);
  console.log(`  Avg per month    : Rs ${(totalRs / (tradingDays.length / 21)).toFixed(0)}`);
  console.log(``);

  // Compare with old fake result
  let oldResult = null;
  try { oldResult = JSON.parse(fs.readFileSync('5year-backtest-result.json')); } catch(e) {}
  if (oldResult) {
    console.log('─'.repeat(60));
    console.log('  COMPARISON vs OLD BACKTEST (different strategy):');
    console.log(`  Old strategy (bodyBreakout) total pts : +${oldResult.totals.bodyBreakout.toFixed(0)}`);
    console.log(`  Old strategy Rs                       : Rs ${(oldResult.totals.bodyBreakout * RS_PER_PT).toFixed(0)}`);
    console.log(`  NEW strategy total pts                : ${(totalPts >= 0 ? '+' : '') + totalPts.toFixed(0)}`);
    console.log(`  NEW strategy Rs                       : Rs ${totalRs.toFixed(0)}`);
    const diff = totalRs - (oldResult.totals.bodyBreakout * RS_PER_PT);
    console.log(`  Difference                            : ${diff >= 0 ? '+' : ''}Rs ${diff.toFixed(0)}`);
  }
  console.log('═'.repeat(60));

  // Save result
  fs.writeFileSync('5year_new_strategy_result.json', JSON.stringify({
    generated: new Date().toISOString(),
    period: { from: '2021-05-13', to: '2026-05-13' },
    tradingDays: tradingDays.length, totalPts, totalRs, monthly
  }, null, 2));
  console.log('\nSaved to 5year_new_strategy_result.json');
}

main().catch(console.error);

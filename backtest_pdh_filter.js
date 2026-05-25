'use strict';
// ============================================================
// PDH/PDL FILTER BACKTEST — BankNifty 5 years
// Tests: Original body-breakout vs PDH-context-filtered version
// PDH filter: if first 15-min candle close > prev day HIGH → BULLISH → block PE entries
//             if first 15-min candle close < prev day LOW  → BEARISH → block CE entries
//             else NEUTRAL → trade both directions as normal
// Cache: saves fetched candles to candles_pdh_cache.json (re-use without re-fetching)
// ============================================================
require('dotenv').config();
const https = require('https');
const fs    = require('fs');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const CACHE_FILE   = 'candles_pdh_cache.json';
const RS_PER_PT    = 15;   // qty=30, delta=0.5 → 1 pt = Rs15
const SL_T1        = 100;  // BHAV SL = 100 pts (not 50 like old backtest)
const SL_RE        = 100;

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
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }

function enrich(c) {
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull: c.close >= c.open, body_high, body_low, body_size: body_high - body_low };
}

// Find first body-breakout entry, optionally restricted to allowedDir
// allowedDir = 'CE' | 'PE' | null (null = both)
function findEntry(cs, allowedDir = null) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;

    if (allowedDir && sig !== allowedDir) continue;  // PDH filter: skip wrong direction

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, idx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, idx: j };
    }
  }
  return null;
}

const mv  = (s, e, p) => s === 'CE' ? p - e : e - p;
const opp = s => s === 'CE' ? 'PE' : 'CE';

function runDay(cs, allowedDir = null) {
  if (cs.length < 5) return { pts: 0, noEntry: true, blocked: false };
  const e = findEntry(cs, allowedDir);
  if (!e) return { pts: 0, noEntry: true, blocked: allowedDir !== null };

  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  // T1: 100pt SL, no target, hold to close
  let slHit = false, sIdx = null, sPx = null;
  let t1Pts = mv(e.sig, e.px, last);
  for (let i = e.idx + 1; i < cs.length; i++) {
    if (mv(e.sig, e.px, cs[i].close) <= -SL_T1) {
      slHit = true; sIdx = i; sPx = cs[i].close; t1Pts = -SL_T1; break;
    }
  }

  // Re-entry: opposite, filter (price vs day open), 100pt SL, hold to close
  let rePts = 0;
  if (slHit) {
    const rs  = opp(e.sig);
    // PDH filter on re-entry too: if BULLISH, only CE re-entry allowed; if BEARISH, only PE
    if (allowedDir && rs !== allowedDir) {
      // re-entry blocked by PDH context
    } else {
      const mar = rs === 'CE' ? (sPx - dayOpen) : -(sPx - dayOpen);
      if (mar < 0) {
        rePts = mv(rs, sPx, last);
        for (let i = sIdx + 1; i < cs.length; i++) {
          if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePts = -SL_RE; break; }
        }
      }
    }
  }
  return { pts: t1Pts + rePts, t1Pts, rePts, slHit, noEntry: false, blocked: false, dir: e.sig };
}

// ─── Fetch data ────────────────────────────────────────────────────────────
async function fetchAllCandles() {
  // Check cache
  if (fs.existsSync(CACHE_FILE)) {
    console.log(`Loading from cache: ${CACHE_FILE}`);
    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    console.log(`  15-min candles: ${cache.min15.length}`);
    console.log(`  Daily candles:  ${cache.daily.length}`);
    return cache;
  }

  console.log('No cache found. Fetching from Zerodha API...\n');
  const startDate = new Date('2021-05-01');
  const endDate   = new Date();

  // Fetch 15-min candles
  const min15 = [];
  let cursor = new Date(startDate);
  process.stdout.write('15-min candles: ');
  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(cursor.getDate() + 190);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
    const from = fmtDate(cursor), to = fmtDate(chunkEnd);
    process.stdout.write(`${from}.. `);
    try {
      const resp = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`);
      if (resp.data && resp.data.candles) {
        min15.push(...resp.data.candles.map(c => ({ date: c[0].slice(0, 10), open: c[1], high: c[2], low: c[3], close: c[4] })));
        process.stdout.write(`(${resp.data.candles.length}) `);
      }
    } catch(e) { process.stdout.write(`ERR:${e.message} `); }
    cursor.setDate(cursor.getDate() + 191);
    await sleep(400);
  }
  console.log(`\nTotal 15-min candles: ${min15.length}`);

  // Fetch daily candles (for PDH/PDL)
  const daily = [];
  cursor = new Date(startDate);
  process.stdout.write('\nDaily candles: ');
  while (cursor <= endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setFullYear(cursor.getFullYear() + 2);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
    const from = fmtDate(cursor), to = fmtDate(chunkEnd);
    process.stdout.write(`${from}.. `);
    try {
      const resp = await kiteGet(`/instruments/historical/260105/day?from=${from}&to=${to}&continuous=0&oi=0`);
      if (resp.data && resp.data.candles) {
        daily.push(...resp.data.candles.map(c => ({ date: c[0].slice(0, 10), open: c[1], high: c[2], low: c[3], close: c[4] })));
        process.stdout.write(`(${resp.data.candles.length}) `);
      }
    } catch(e) { process.stdout.write(`ERR:${e.message} `); }
    cursor.setFullYear(cursor.getFullYear() + 2);
    await sleep(400);
  }
  console.log(`\nTotal daily candles: ${daily.length}`);

  // Save cache
  const cache = { min15, daily };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache));
  console.log(`\nCache saved: ${CACHE_FILE}\n`);
  return cache;
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║     PDH/PDL FILTER BACKTEST — BankNifty 5yr (2021-2026) ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const { min15, daily } = await fetchAllCandles();

  // Group 15-min by date
  const byDate = {};
  for (const c of min15) {
    if (!byDate[c.date]) byDate[c.date] = [];
    byDate[c.date].push(enrich(c));
  }

  // Build daily lookup: date → { high, low, close }
  const dailyMap = {};
  for (const d of daily) dailyMap[d.date] = d;

  // Get sorted trading days (>= 20 candles for full day)
  const tradingDays = Object.entries(byDate).filter(([, cs]) => cs.length >= 20).sort();
  console.log(`Trading days (>=20 candles): ${tradingDays.length}\n`);

  // Build prev-day lookup
  const sortedDailyDates = Object.keys(dailyMap).sort();
  const prevDayMap = {};
  for (let i = 1; i < sortedDailyDates.length; i++) {
    prevDayMap[sortedDailyDates[i]] = dailyMap[sortedDailyDates[i - 1]];
  }

  // ── Simulate both strategies ──
  const origStats  = { pts: 0, wins: 0, losses: 0, noEntry: 0, monthly: {} };
  const pdhStats   = { pts: 0, wins: 0, losses: 0, noEntry: 0, blocked: 0, monthly: {} };

  // Track PDH context distribution
  const contextCount = { BULLISH: 0, BEARISH: 0, NEUTRAL: 0 };
  const blockedDays  = [];  // days where first signal was blocked

  for (const [date, cs] of tradingDays) {
    const month = date.slice(0, 7);
    if (!origStats.monthly[month]) origStats.monthly[month]  = { pts: 0, wins: 0, losses: 0 };
    if (!pdhStats.monthly[month])  pdhStats.monthly[month]   = { pts: 0, wins: 0, losses: 0, blocked: 0 };

    // ── Original ──
    const ro = runDay(cs, null);
    origStats.pts += ro.pts;
    if (ro.noEntry) origStats.noEntry++;
    else if (ro.pts > 0) { origStats.wins++; origStats.monthly[month].wins++; }
    else { origStats.losses++; origStats.monthly[month].losses++; }
    origStats.monthly[month].pts += ro.pts;

    // ── PDH filter ──
    const prev = prevDayMap[date];
    let allowedDir = null;
    let context = 'NEUTRAL';
    if (prev) {
      const firstClose = cs[0].close;
      if (firstClose > prev.high) { context = 'BULLISH'; allowedDir = 'CE'; }
      else if (firstClose < prev.low) { context = 'BEARISH'; allowedDir = 'PE'; }
    }
    contextCount[context]++;

    const rp = runDay(cs, allowedDir);
    pdhStats.pts += rp.pts;
    if (rp.noEntry) {
      pdhStats.noEntry++;
      if (rp.blocked) {
        pdhStats.blocked++;
        pdhStats.monthly[month].blocked++;
        // Track what original would have done on this blocked day
        blockedDays.push({ date, context, orig_pts: ro.pts, orig_dir: ro.dir });
      }
    } else if (rp.pts > 0) { pdhStats.wins++; pdhStats.monthly[month].wins++; }
    else { pdhStats.losses++; pdhStats.monthly[month].losses++; }
    pdhStats.monthly[month].pts += rp.pts;
  }

  // ─── Monthly comparison table ───────────────────────────────────────────
  console.log('Month      | Original                  | PDH Filter               | Diff');
  console.log('           | pts     Rs      W  L      | pts     Rs      W  L  Blk| ');
  console.log('─'.repeat(85));

  let cumOrig = 0, cumPdh = 0;
  for (const month of Object.keys(origStats.monthly).sort()) {
    const o = origStats.monthly[month];
    const p = pdhStats.monthly[month] || { pts: 0, wins: 0, losses: 0, blocked: 0 };
    cumOrig += o.pts; cumPdh += p.pts;
    const diff = p.pts - o.pts;
    console.log(
      `${month} | ` +
      `${((o.pts >= 0 ? '+' : '') + o.pts.toFixed(0)).padStart(6)} ` +
      `${((o.pts >= 0 ? '+' : '') + (o.pts * RS_PER_PT).toFixed(0)).padStart(8)} ` +
      `${String(o.wins).padStart(3)} ${String(o.losses).padStart(2)} ` +
      `     | ` +
      `${((p.pts >= 0 ? '+' : '') + p.pts.toFixed(0)).padStart(6)} ` +
      `${((p.pts >= 0 ? '+' : '') + (p.pts * RS_PER_PT).toFixed(0)).padStart(8)} ` +
      `${String(p.wins).padStart(3)} ${String(p.losses).padStart(2)} ` +
      `${String(p.blocked || 0).padStart(3)} ` +
      `| ${diff >= 0 ? '+' : ''}${diff.toFixed(0)}`
    );
  }

  // ─── Final summary ──────────────────────────────────────────────────────
  const totalDays = tradingDays.length;
  const origWR = (origStats.wins / (origStats.wins + origStats.losses) * 100).toFixed(1);
  const pdhWR  = (pdhStats.wins  / (pdhStats.wins  + pdhStats.losses)  * 100).toFixed(1);
  const diff   = pdhStats.pts - origStats.pts;

  console.log('\n' + '═'.repeat(85));
  console.log('  FINAL COMPARISON — 5 YEARS — Qty 30 (Rs15/pt)');
  console.log('═'.repeat(85));
  console.log(`  Metric               Original          PDH Filter        Difference`);
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  Total pts          ${String(origStats.pts.toFixed(0)).padStart(10)}       ${String(pdhStats.pts.toFixed(0)).padStart(10)}       ${diff >= 0 ? '+' : ''}${diff.toFixed(0)}`);
  console.log(`  Total Rs           ${('Rs' + (origStats.pts * RS_PER_PT).toFixed(0)).padStart(10)}       ${('Rs' + (pdhStats.pts * RS_PER_PT).toFixed(0)).padStart(10)}       ${diff >= 0 ? '+' : ''}Rs${(diff * RS_PER_PT).toFixed(0)}`);
  console.log(`  Win rate           ${(origWR + '%').padStart(10)}       ${(pdhWR + '%').padStart(10)}`);
  console.log(`  Win days           ${String(origStats.wins).padStart(10)}       ${String(pdhStats.wins).padStart(10)}`);
  console.log(`  Loss days          ${String(origStats.losses).padStart(10)}       ${String(pdhStats.losses).padStart(10)}`);
  console.log(`  No entry days      ${String(origStats.noEntry).padStart(10)}       ${String(pdhStats.noEntry).padStart(10)}`);
  console.log(`  Total trading days ${String(totalDays).padStart(10)}`);

  console.log('\n  PDH Context Distribution:');
  console.log(`    BULLISH (above PDH): ${contextCount.BULLISH} days`);
  console.log(`    BEARISH (below PDL): ${contextCount.BEARISH} days`);
  console.log(`    NEUTRAL (in range) : ${contextCount.NEUTRAL} days`);

  const totalBlocked = blockedDays.length;
  const blockedLosses = blockedDays.filter(d => d.orig_pts < 0).length;
  const blockedWins   = blockedDays.filter(d => d.orig_pts > 0).length;
  const blockedPts    = blockedDays.reduce((s, d) => s + d.orig_pts, 0);
  console.log(`\n  Days where first signal was blocked by PDH filter: ${totalBlocked}`);
  console.log(`    Of those — original would have WON:  ${blockedWins} days`);
  console.log(`    Of those — original would have LOST: ${blockedLosses} days`);
  console.log(`    P&L saved/lost by blocking: ${blockedPts >= 0 ? '+' : ''}${blockedPts.toFixed(0)} pts (Rs${(blockedPts * RS_PER_PT).toFixed(0)})`);

  if (blockedDays.length > 0) {
    console.log('\n  Last 20 blocked days (context → what original would have done):');
    console.log('  Date       Context   Orig Dir  Orig P&L');
    for (const d of blockedDays.slice(-20)) {
      console.log(`  ${d.date}  ${d.context.padEnd(8)}  ${(d.orig_dir || '?').padEnd(8)}  ${(d.orig_pts >= 0 ? '+' : '') + d.orig_pts.toFixed(0)}`);
    }
  }

  console.log('\n' + '═'.repeat(85));
  if (diff > 0) {
    console.log(`  ✅ PDH filter IMPROVED results by +${diff.toFixed(0)} pts (Rs${(diff * RS_PER_PT).toFixed(0)}) over 5 years`);
  } else {
    console.log(`  ❌ PDH filter HURT results by ${diff.toFixed(0)} pts (Rs${(diff * RS_PER_PT).toFixed(0)}) over 5 years`);
  }
  console.log('═'.repeat(85) + '\n');
}

main().catch(console.error);

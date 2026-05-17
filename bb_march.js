'use strict';
const https = require('https');
require('dotenv').config();

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;
const BROKERAGE    = 4;
const BB_LEN       = 20;
const BB_MULT      = 2;

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

function isEOD(time) { return time >= '15:00'; }

(async () => {
  // Fetch Feb (warmup for BB) + March 2026
  console.log('Fetching Feb-Mar 2026 candles from Kite...');
  const candles = await fetchRange('2026-02-01', '2026-03-31');
  if (!candles.length) { console.log('No data — check token'); return; }

  candles.sort((a, b) => (a.date + a.time) < (b.date + b.time) ? -1 : 1);

  // Compute %B across all candles (cross-day, continuous)
  const closes = candles.map(c => c.close);
  const bb = calcBB(closes);
  for (let i = 0; i < candles.length; i++) candles[i].bb = bb[i];

  // Group by day
  const byDay = {};
  for (const c of candles) { if (!byDay[c.date]) byDay[c.date] = []; byDay[c.date].push(c); }

  // Only show March days
  const marchDays = Object.keys(byDay).filter(d => d.startsWith('2026-03')).sort();
  console.log(`\nFound ${marchDays.length} trading days in March 2026\n`);

  const LINE = '─'.repeat(90);
  let monthPts = 0, tradeDays = 0, wins = 0, losses = 0, noTrade = 0;
  const summary = [];

  for (const date of marchDays) {
    const dayCandles = byDay[date];
    let watchDir = null, entered = false;
    let dir = null, entryPx = null, slPx = null, exitPts = null, exitTime = null, exitReason = null;

    for (let i = 0; i < dayCandles.length; i++) {
      const c = dayCandles[i];
      if (!entered) {
        if (!watchDir) {
          if (c.bb !== null && c.bb <= 0.0) watchDir = 'CE';
          else if (c.bb !== null && c.bb >= 1.0) watchDir = 'PE';
        }
        if (watchDir) {
          const isGreen = c.close >= c.open;
          const confirms = (watchDir === 'CE' && isGreen) || (watchDir === 'PE' && !isGreen);
          if (confirms) {
            entered = true;
            dir = watchDir;
            entryPx = c.close;
            slPx = dir === 'CE' ? c.low : c.high;
          }
        }
      } else {
        // Check SL hit
        if (dir === 'CE' ? c.low <= slPx : c.high >= slPx) {
          exitPts = dir === 'CE' ? slPx - entryPx : entryPx - slPx;
          exitTime = c.time;
          exitReason = 'SL';
          break;
        }
        if (isEOD(c.time)) {
          exitPts = dir === 'CE' ? c.close - entryPx : entryPx - c.close;
          exitTime = c.time;
          exitReason = 'EOD';
          break;
        }
      }
    }

    const net = entered ? exitPts - BROKERAGE : 0;
    const netRs = Math.round(net * RS_PER_PT);
    if (entered) {
      monthPts += net;
      tradeDays++;
      if (net > 0) wins++; else losses++;
    } else {
      noTrade++;
    }

    summary.push({ date, entered, dir, entryPx, slPx, exitPts, exitTime, exitReason, net, netRs });
  }

  // ── Print each day detail ──────────────────────────────────────────────────
  console.log('MARCH 2026 — BB%B Strategy  (Candle SL: entry candle low/high)');
  console.log(LINE);

  for (const s of summary) {
    const dayCandles = byDay[s.date];
    const dayOfWeek  = new Date(s.date).toLocaleDateString('en-IN', { weekday: 'short' });

    if (!s.entered) {
      // Quick single line for no-signal days
      const bbVals = dayCandles.filter(c => c.bb !== null).map(c => c.bb);
      const minBB  = bbVals.length ? Math.min(...bbVals).toFixed(3) : 'N/A';
      const maxBB  = bbVals.length ? Math.max(...bbVals).toFixed(3) : 'N/A';
      console.log(`\n${s.date} ${dayOfWeek} | NO SIGNAL  %B range: [${minBB}, ${maxBB}]`);
      continue;
    }

    const pnlStr = s.netRs >= 0 ? `+₹${s.netRs.toLocaleString('en-IN')} ✅` : `-₹${Math.abs(s.netRs).toLocaleString('en-IN')} ❌`;
    console.log(`\n${s.date} ${dayOfWeek} | ${s.dir}  Entry:${s.entryPx}  SL:${s.slPx}  Exit@${s.exitTime}(${s.exitReason})  ${s.exitPts > 0 ? '+' : ''}${s.exitPts?.toFixed(0)} pts  ${pnlStr}`);
    console.log(LINE);
    console.log(`${'Time'.padEnd(7)} ${'Color'.padEnd(7)} ${'Open'.padStart(9)} ${'High'.padStart(9)} ${'Low'.padStart(9)} ${'Close'.padStart(9)} ${'%B'.padStart(7)}  Status`);
    console.log(LINE);

    let watchDir2 = null, entered2 = false, dir2 = null, entry2 = null, sl2 = null, done2 = false;
    for (const c of dayCandles) {
      const bbStr   = c.bb !== null ? c.bb.toFixed(3) : '  ---';
      const isGreen = c.close >= c.open;
      const color   = isGreen ? 'GREEN' : 'RED  ';
      let status = '';

      if (!entered2 && !done2) {
        if (!watchDir2) {
          if (c.bb !== null && c.bb <= 0.0) { watchDir2 = 'CE'; status = '🔵 LOWER BAND → wait GREEN'; }
          else if (c.bb !== null && c.bb >= 1.0) { watchDir2 = 'PE'; status = '🔴 UPPER BAND → wait RED'; }
          else if (c.bb !== null) status = `  %B=${c.bb.toFixed(3)}`;
        } else {
          const confirms = (watchDir2 === 'CE' && isGreen) || (watchDir2 === 'PE' && !isGreen);
          if (confirms) {
            dir2 = watchDir2; entry2 = c.close; sl2 = dir2 === 'CE' ? c.low : c.high;
            status = `⚡ ENTER ${dir2} @ ${entry2}  SL @ ${sl2} (candle ${dir2 === 'CE' ? 'low' : 'high'})`;
            entered2 = true;
          } else {
            if (c.bb !== null && c.bb <= 0.0) status = `🔵 still lower, waiting CE`;
            else if (c.bb !== null && c.bb >= 1.0) status = `🔴 still upper, waiting PE`;
            else status = `waiting for ${watchDir2 === 'CE' ? 'GREEN' : 'RED'}`;
          }
        }
      } else if (entered2 && !done2) {
        const slHit = dir2 === 'CE' ? c.low <= sl2 : c.high >= sl2;
        const unrealised = dir2 === 'CE' ? c.close - entry2 : entry2 - c.close;
        if (slHit) {
          const pts = dir2 === 'CE' ? sl2 - entry2 : entry2 - sl2;
          status = `🛑 SL HIT @ ${sl2}  P&L: ${pts.toFixed(0)} pts = ₹${Math.round((pts - BROKERAGE) * RS_PER_PT).toLocaleString('en-IN')}  ← EXIT`;
          done2 = true;
        } else if (isEOD(c.time)) {
          const pts = dir2 === 'CE' ? c.close - entry2 : entry2 - c.close;
          const pnl = Math.round((pts - BROKERAGE) * RS_PER_PT);
          status = `🏁 EOD EXIT @ ${c.close}  P&L: ${pts.toFixed(0)} pts = ₹${pnl.toLocaleString('en-IN')} ${pnl >= 0 ? '✅' : '❌'}`;
          done2 = true;
        } else {
          status = `  in trade  SL@${sl2}  unreal: ${unrealised >= 0 ? '+' : ''}${unrealised.toFixed(0)}`;
        }
      }

      console.log(
        `${c.time.padEnd(7)} ${color.padEnd(7)} ${String(c.open.toFixed(0)).padStart(9)} ${String(c.high.toFixed(0)).padStart(9)} ${String(c.low.toFixed(0)).padStart(9)} ${String(c.close.toFixed(0)).padStart(9)} ${bbStr.padStart(7)}  ${status}`
      );
    }
  }

  // ── Monthly Summary ────────────────────────────────────────────────────────
  const totalRs = Math.round(monthPts * RS_PER_PT);
  console.log('\n' + '═'.repeat(90));
  console.log('MARCH 2026 SUMMARY — BB%B (Candle SL)');
  console.log('═'.repeat(90));
  console.log(`Trading days : ${marchDays.length}  |  Traded: ${tradeDays}  |  No signal: ${noTrade}`);
  console.log(`Wins: ${wins}  |  Losses: ${losses}  |  Win%: ${tradeDays ? (wins/tradeDays*100).toFixed(1) : 0}%`);
  console.log(`Net pts: ${monthPts.toFixed(0)}  |  Net ₹: ${totalRs >= 0 ? '+' : ''}₹${totalRs.toLocaleString('en-IN')}`);
  console.log('─'.repeat(90));
  console.log('Day-by-day:');
  for (const s of summary) {
    if (!s.entered) { console.log(`  ${s.date}  NO SIGNAL`); continue; }
    const pnl = s.netRs >= 0 ? `+₹${s.netRs.toLocaleString('en-IN')}` : `-₹${Math.abs(s.netRs).toLocaleString('en-IN')}`;
    console.log(`  ${s.date}  ${s.dir}  entry:${s.entryPx}  SL:${s.slPx}  ${s.exitReason}@${s.exitTime}  ${s.exitPts >= 0 ? '+' : ''}${s.exitPts?.toFixed(0)}pts  ${pnl}`);
  }
  console.log('═'.repeat(90));
})();

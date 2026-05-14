// 5-YEAR BACKTEST: Original vs Improved strategy on BANKNIFTY 15-min candles
require('dotenv').config();
const https = require('https');

const API_KEY = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade',
      path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 15000
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

async function fetchChunk(from, to) {
  const url = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const resp = await kiteGet(url);
    if (!resp.data || !resp.data.candles) return [];
    return resp.data.candles.map(c => ({
      date: c[0].slice(0, 10),
      time: new Date(c[0]).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
      open: c[1], high: c[2], low: c[3], close: c[4]
    }));
  } catch(e) { console.error(`Chunk ${from}→${to} failed: ${e.message}`); return []; }
}

async function fetchAllCandles() {
  const allCandles = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(endDate.getFullYear() - 5);

  // Kite: max 200 days per 15-min request
  let cursor = new Date(startDate);
  process.stdout.write('Fetching 5 years of 15-min data ');
  while (cursor < endDate) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(cursor.getDate() + 190);
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
    const chunk = await fetchChunk(fmtDate(cursor), fmtDate(chunkEnd));
    allCandles.push(...chunk);
    process.stdout.write('.');
    cursor.setDate(cursor.getDate() + 191);
    await new Promise(r => setTimeout(r, 300)); // rate limit
  }
  console.log(` Done. Total candles: ${allCandles.length}`);
  return allCandles;
}

function groupByDay(candles) {
  const days = {};
  for (const c of candles) {
    if (!days[c.date]) days[c.date] = [];
    days[c.date].push(c);
  }
  return days;
}

// ── ORIGINAL STRATEGY ──────────────────────────────────────
function simulateDay_Original(candles, slPts = 100, maxTrades = 5) {
  let pnl = 0, trades = 0, wins = 0;
  let inTrade = null;
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1], curr = candles[i];
    const pH = Math.max(prev.open, prev.close), pL = Math.min(prev.open, prev.close);
    if (inTrade) {
      if (inTrade.dir === 'CE' && curr.low <= inTrade.sl) {
        pnl += inTrade.sl - inTrade.entry; trades++; if (inTrade.sl - inTrade.entry > 0) wins++;
        inTrade = null;
      } else if (inTrade.dir === 'PE' && curr.high >= inTrade.sl) {
        pnl += inTrade.entry - inTrade.sl; trades++; if (inTrade.entry - inTrade.sl > 0) wins++;
        inTrade = null;
      }
      if (inTrade && inTrade.dir === 'CE' && curr.close < pL) {
        pnl += curr.close - inTrade.entry; trades++; if (curr.close - inTrade.entry > 0) wins++;
        inTrade = null;
        if (trades < maxTrades) inTrade = { dir: 'PE', entry: curr.close, sl: curr.close + slPts };
      } else if (inTrade && inTrade.dir === 'PE' && curr.close > pH) {
        pnl += inTrade.entry - curr.close; trades++; if (inTrade.entry - curr.close > 0) wins++;
        inTrade = null;
        if (trades < maxTrades) inTrade = { dir: 'CE', entry: curr.close, sl: curr.close - slPts };
      }
    }
    if (!inTrade && trades < maxTrades) {
      if (curr.close > pH && curr.close - pH > 5) inTrade = { dir: 'CE', entry: curr.close, sl: curr.close - slPts };
      else if (curr.close < pL && pL - curr.close > 5) inTrade = { dir: 'PE', entry: curr.close, sl: curr.close + slPts };
    }
  }
  if (inTrade) {
    const last = candles[candles.length - 1];
    const p = inTrade.dir === 'CE' ? last.close - inTrade.entry : inTrade.entry - last.close;
    pnl += p; trades++; if (p > 0) wins++;
    inTrade = null;
  }
  return { pnl: Math.round(pnl), trades, wins };
}

// ── IMPROVED STRATEGY ──────────────────────────────────────
function simulateDay_Improved(candles, slPts = 100, maxTrades = 5) {
  let pnl = 0, trades = 0, wins = 0;
  let inTrade = null;
  let waitConfirm = null;

  function choppy(i) {
    if (i < 3) return false;
    for (let k = i - 2; k <= i; k++) {
      if (Math.abs(candles[k].close - candles[k].open) >= 40) return false;
    }
    return true;
  }
  function hour(t) {
    const [hm, ap] = t.trim().split(' ');
    let h = parseInt(hm.split(':')[0]);
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return h;
  }

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1], curr = candles[i];
    const pH = Math.max(prev.open, prev.close), pL = Math.min(prev.open, prev.close);
    const h = hour(curr.time);

    // Confirm pending reverse
    if (waitConfirm && !inTrade) {
      const { dir } = waitConfirm;
      waitConfirm = null;
      const confirmed = (dir === 'CE' && curr.close > curr.open) || (dir === 'PE' && curr.close < curr.open);
      if (confirmed && trades < maxTrades && h < 14) {
        inTrade = { dir, entry: curr.close, sl: dir === 'CE' ? curr.close - slPts : curr.close + slPts };
      }
    }
    if (inTrade) {
      if (inTrade.dir === 'CE' && curr.low <= inTrade.sl) {
        const p = inTrade.sl - inTrade.entry;
        pnl += p; trades++; if (p > 0) wins++; inTrade = null;
      } else if (inTrade.dir === 'PE' && curr.high >= inTrade.sl) {
        const p = inTrade.entry - inTrade.sl;
        pnl += p; trades++; if (p > 0) wins++; inTrade = null;
      }
      if (inTrade && inTrade.dir === 'CE' && curr.close < pL) {
        pnl += curr.close - inTrade.entry; trades++; if (curr.close - inTrade.entry > 0) wins++;
        inTrade = null;
        if (trades < maxTrades && h < 14) waitConfirm = { dir: 'PE' };
      } else if (inTrade && inTrade.dir === 'PE' && curr.close > pH) {
        pnl += inTrade.entry - curr.close; trades++; if (inTrade.entry - curr.close > 0) wins++;
        inTrade = null;
        if (trades < maxTrades && h < 14) waitConfirm = { dir: 'CE' };
      }
    }
    if (h >= 14) continue;
    if (choppy(i)) continue;
    if (!inTrade && !waitConfirm && trades < maxTrades) {
      if (curr.close > pH && curr.close - pH > 5) inTrade = { dir: 'CE', entry: curr.close, sl: curr.close - slPts };
      else if (curr.close < pL && pL - curr.close > 5) inTrade = { dir: 'PE', entry: curr.close, sl: curr.close + slPts };
    }
  }
  if (inTrade) {
    const last = candles[candles.length - 1];
    const p = inTrade.dir === 'CE' ? last.close - inTrade.entry : inTrade.entry - last.close;
    pnl += p; trades++; if (p > 0) wins++;
  }
  return { pnl: Math.round(pnl), trades, wins };
}

async function main() {
  const allCandles = await fetchAllCandles();
  const byDay = groupByDay(allCandles);
  const dates = Object.keys(byDay).sort();

  console.log(`\nTotal trading days fetched: ${dates.length}`);
  console.log('Running simulation...\n');

  // Per-year summary
  const yearStats = {};
  let totOrig = 0, totImpr = 0;
  let origWinDays = 0, imprWinDays = 0;
  let origLossDays = 0, imprLossDays = 0;
  let origMaxDD = 0, imprMaxDD = 0;
  let origEq = 0, imprEq = 0, origPeak = 0, imprPeak = 0;

  for (const date of dates) {
    const candles = byDay[date];
    if (candles.length < 5) continue;
    const year = date.slice(0, 4);
    if (!yearStats[year]) yearStats[year] = { orig: 0, impr: 0, days: 0, origW: 0, imprW: 0 };

    const orig = simulateDay_Original(candles);
    const impr = simulateDay_Improved(candles);

    totOrig += orig.pnl; totImpr += impr.pnl;
    yearStats[year].orig += orig.pnl;
    yearStats[year].impr += impr.pnl;
    yearStats[year].days++;
    if (orig.pnl > 0) { origWinDays++; yearStats[year].origW++; }
    if (orig.pnl < 0) origLossDays++;
    if (impr.pnl > 0) { imprWinDays++; yearStats[year].imprW++; }
    if (impr.pnl < 0) imprLossDays++;

    origEq += orig.pnl; if (origEq > origPeak) origPeak = origEq;
    imprEq += impr.pnl; if (imprEq > imprPeak) imprPeak = imprEq;
    const origDD = origPeak - origEq; if (origDD > origMaxDD) origMaxDD = origDD;
    const imprDD = imprPeak - imprEq; if (imprDD > imprMaxDD) imprMaxDD = imprDD;
  }

  const W = 80;
  console.log('='.repeat(W));
  console.log('  5-YEAR BACKTEST RESULTS  (BANKNIFTY 15-min, 5 trades/day, 100pt SL)');
  console.log('='.repeat(W));
  console.log('Year  | ORIGINAL P&L  | Win Days | IMPROVED P&L  | Win Days | Days');
  console.log('------|---------------|----------|---------------|----------|-----');
  for (const [yr, s] of Object.entries(yearStats).sort()) {
    console.log(`${yr}  | ${(s.orig>=0?'+':'')+s.orig} pts`.padEnd(22) +
      `| ${s.origW}/${s.days}`.padEnd(10) +
      `| ${(s.impr>=0?'+':'')+s.impr} pts`.padEnd(16) +
      `| ${s.imprW}/${s.days}`.padEnd(10) +
      `| ${s.days}`);
  }
  console.log('='.repeat(W));
  console.log(`TOTAL | ${(totOrig>=0?'+':'')+Math.round(totOrig)} pts`.padEnd(22) +
    `| ${origWinDays}/${origWinDays+origLossDays}`.padEnd(10) +
    `| ${(totImpr>=0?'+':'')+Math.round(totImpr)} pts`.padEnd(16) +
    `| ${imprWinDays}/${imprWinDays+imprLossDays}`.padEnd(10));
  console.log('='.repeat(W));
  console.log(`\nORIGINAL:  Total ${(totOrig>=0?'+':'')+Math.round(totOrig)} pts | Max Drawdown: ${Math.round(origMaxDD)} pts | Win rate: ${Math.round(origWinDays/(origWinDays+origLossDays)*100)}%`);
  console.log(`IMPROVED:  Total ${(totImpr>=0?'+':'')+Math.round(totImpr)} pts | Max Drawdown: ${Math.round(imprMaxDD)} pts | Win rate: ${Math.round(imprWinDays/(imprWinDays+imprLossDays)*100)}%`);
  console.log(`\nDifference: ${(totImpr-totOrig>=0?'+':'')+(Math.round(totImpr-totOrig))} pts in favour of IMPROVED strategy over 5 years`);
}

main().catch(console.error);

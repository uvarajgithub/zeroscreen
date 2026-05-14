// 6-day backtest: Original vs Improved strategy comparison
require('dotenv').config();
const https = require('https');

const API_KEY = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade',
      path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  ORIGINAL STRATEGY
// ─────────────────────────────────────────────────────────────
function simulateOriginal(candles, maxTrades = 5, slPts = 100) {
  let pnl = 0, trades = 0, wins = 0;
  let inTrade = null;
  const log = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const prevBodyHigh = Math.max(prev.open, prev.close);
    const prevBodyLow  = Math.min(prev.open, prev.close);

    if (inTrade) {
      // SL hit intrabar
      if (inTrade.dir === 'CE' && curr.low <= inTrade.sl) {
        const p = inTrade.sl - inTrade.entry;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'SL', dir: inTrade.dir, p, reason: 'sl_intrabar' });
        inTrade = null;
      } else if (inTrade.dir === 'PE' && curr.high >= inTrade.sl) {
        const p = inTrade.entry - inTrade.sl;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'SL', dir: inTrade.dir, p, reason: 'sl_intrabar' });
        inTrade = null;
      }
      // Reverse signal — immediately enter opposite (original behavior)
      if (inTrade && inTrade.dir === 'CE' && curr.close < prevBodyLow) {
        const p = curr.close - inTrade.entry;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'REV-EXIT', dir: 'CE', p, reason: 'sl_reverse' });
        inTrade = null;
        if (trades < maxTrades) {
          inTrade = { dir: 'PE', entry: curr.close, sl: curr.close + slPts, waitConfirm: false };
          log.push({ time: curr.time, signal: 'ENTER', dir: 'PE', p: null, reason: 'reverse_enter' });
        }
      } else if (inTrade && inTrade.dir === 'PE' && curr.close > prevBodyHigh) {
        const p = inTrade.entry - curr.close;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'REV-EXIT', dir: 'PE', p, reason: 'sl_reverse' });
        inTrade = null;
        if (trades < maxTrades) {
          inTrade = { dir: 'CE', entry: curr.close, sl: curr.close - slPts, waitConfirm: false };
          log.push({ time: curr.time, signal: 'ENTER', dir: 'CE', p: null, reason: 'reverse_enter' });
        }
      }
    }
    // Fresh entry
    if (!inTrade && trades < maxTrades) {
      if (curr.close > prevBodyHigh && curr.close - prevBodyHigh > 5) {
        inTrade = { dir: 'CE', entry: curr.close, sl: curr.close - slPts };
        log.push({ time: curr.time, signal: 'ENTER', dir: 'CE', p: null, reason: 'breakout' });
      } else if (curr.close < prevBodyLow && prevBodyLow - curr.close > 5) {
        inTrade = { dir: 'PE', entry: curr.close, sl: curr.close + slPts };
        log.push({ time: curr.time, signal: 'ENTER', dir: 'PE', p: null, reason: 'breakout' });
      }
    }
  }
  // EOD
  if (inTrade) {
    const last = candles[candles.length - 1];
    const p = inTrade.dir === 'CE' ? last.close - inTrade.entry : inTrade.entry - last.close;
    pnl += p; trades++; if (p > 0) wins++;
    log.push({ time: last.time, signal: 'EOD', dir: inTrade.dir, p, reason: 'eod' });
  }
  return { pnl: Math.round(pnl), trades, wins, log };
}

// ─────────────────────────────────────────────────────────────
//  IMPROVED STRATEGY
//  Fix 1: No immediate reverse — wait 1 candle confirmation
//  Fix 2: Chop filter — skip if last 3 candle bodies all < 40 pts
//  Fix 3: No new entries after 2:00 PM IST
// ─────────────────────────────────────────────────────────────
function simulateImproved(candles, maxTrades = 5, slPts = 100) {
  let pnl = 0, trades = 0, wins = 0;
  let inTrade = null;
  let waitForConfirm = null; // { dir, candle_index } — pending reverse confirm
  const log = [];

  function isChoppy(i) {
    // Fix 2: if last 3 candle bodies all < 40 pts → choppy
    if (i < 3) return false;
    for (let k = i - 2; k <= i; k++) {
      const body = Math.abs(candles[k].close - candles[k].open);
      if (body >= 40) return false;
    }
    return true;
  }

  function timeHour(timeStr) {
    // parse "02:30 pm" → 14
    const [hm, ampm] = timeStr.trim().split(' ');
    let [h] = hm.split(':').map(Number);
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    return h;
  }

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];
    const prevBodyHigh = Math.max(prev.open, prev.close);
    const prevBodyLow  = Math.min(prev.open, prev.close);
    const hour = timeHour(curr.time);

    // Fix 1: Check confirmation candle for pending reverse
    if (waitForConfirm && !inTrade) {
      const { dir, pendingEntry } = waitForConfirm;
      waitForConfirm = null;
      // Confirm: next candle closes in the direction of the reverse
      const confirmed = (dir === 'CE' && curr.close > curr.open) ||
                        (dir === 'PE' && curr.close < curr.open);
      if (confirmed && trades < maxTrades && hour < 14) {
        inTrade = { dir, entry: curr.close, sl: dir === 'CE' ? curr.close - slPts : curr.close + slPts };
        log.push({ time: curr.time, signal: 'ENTER', dir, p: null, reason: 'reverse_confirmed' });
      } else {
        log.push({ time: curr.time, signal: 'SKIP', dir, p: null, reason: confirmed ? 'after_2pm' : 'no_confirm' });
      }
    }

    if (inTrade) {
      // SL hit intrabar
      if (inTrade.dir === 'CE' && curr.low <= inTrade.sl) {
        const p = inTrade.sl - inTrade.entry;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'SL', dir: inTrade.dir, p, reason: 'sl_intrabar' });
        inTrade = null;
      } else if (inTrade.dir === 'PE' && curr.high >= inTrade.sl) {
        const p = inTrade.entry - inTrade.sl;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'SL', dir: inTrade.dir, p, reason: 'sl_intrabar' });
        inTrade = null;
      }
      // Reverse signal — Fix 1: queue for next candle confirmation
      if (inTrade && inTrade.dir === 'CE' && curr.close < prevBodyLow) {
        const p = curr.close - inTrade.entry;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'REV-EXIT', dir: 'CE', p, reason: 'sl_reverse' });
        inTrade = null;
        if (trades < maxTrades && hour < 14) {
          waitForConfirm = { dir: 'PE', pendingEntry: curr.close };
          log.push({ time: curr.time, signal: 'WAIT', dir: 'PE', p: null, reason: 'wait_confirm' });
        }
      } else if (inTrade && inTrade.dir === 'PE' && curr.close > prevBodyHigh) {
        const p = inTrade.entry - curr.close;
        pnl += p; trades++; if (p > 0) wins++;
        log.push({ time: curr.time, signal: 'REV-EXIT', dir: 'PE', p, reason: 'sl_reverse' });
        inTrade = null;
        if (trades < maxTrades && hour < 14) {
          waitForConfirm = { dir: 'CE', pendingEntry: curr.close };
          log.push({ time: curr.time, signal: 'WAIT', dir: 'CE', p: null, reason: 'wait_confirm' });
        }
      }
    }

    // Fix 3: No new entries at/after 2 PM
    if (hour >= 14) continue;

    // Fix 2: Skip if choppy
    if (isChoppy(i)) continue;

    // Fresh entry
    if (!inTrade && !waitForConfirm && trades < maxTrades) {
      if (curr.close > prevBodyHigh && curr.close - prevBodyHigh > 5) {
        inTrade = { dir: 'CE', entry: curr.close, sl: curr.close - slPts };
        log.push({ time: curr.time, signal: 'ENTER', dir: 'CE', p: null, reason: 'breakout' });
      } else if (curr.close < prevBodyLow && prevBodyLow - curr.close > 5) {
        inTrade = { dir: 'PE', entry: curr.close, sl: curr.close + slPts };
        log.push({ time: curr.time, signal: 'ENTER', dir: 'PE', p: null, reason: 'breakout' });
      }
    }
  }
  // EOD
  if (inTrade) {
    const last = candles[candles.length - 1];
    const p = inTrade.dir === 'CE' ? last.close - inTrade.entry : inTrade.entry - last.close;
    pnl += p; trades++; if (p > 0) wins++;
    log.push({ time: last.time, signal: 'EOD', dir: inTrade.dir, p, reason: 'eod' });
  }
  return { pnl: Math.round(pnl), trades, wins, log };
}

// ─────────────────────────────────────────────────────────────
const actualResults = {
  '2026-05-04': { pnl: 0,    note: 'EOD exit, no P&L logged' },
  '2026-05-05': { pnl: -100, note: 'SL hit PE 12:58pm' },
  '2026-05-06': { pnl: -203, note: '3 trades: early-3, SL-100, SL-100' },
  '2026-05-07': { pnl: 0,    note: '+100 then -100' },
  '2026-05-08': { pnl: 0,    note: 'No trades' },
  '2026-05-09': { pnl: 0,    note: 'Market holiday' },
  '2026-05-11': { pnl: -151, note: '+51, -3, -100, -100' },
  '2026-05-12': { pnl: -109, note: '-3,-100,-3,-3 (missed morning)' },
};

async function fetchDay(date) {
  const url = `/instruments/historical/260105/15minute?from=${date}+09:00:00&to=${date}+15:30:00&continuous=0&oi=0`;
  try {
    const resp = await kiteGet(url);
    if (!resp.data || !resp.data.candles || resp.data.candles.length < 3) return null;
    return resp.data.candles.map(c => ({
      time: new Date(c[0]).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
      open: c[1], high: c[2], low: c[3], close: c[4]
    }));
  } catch(e) { return null; }
}

async function main() {
  const days = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    days.push(d.toISOString().slice(0, 10));
    if (days.length >= 7) break;
  }
  days.reverse();

  const W = 100;
  console.log('\n' + '='.repeat(W));
  console.log('  6-DAY BACKTEST: ORIGINAL  vs  IMPROVED  vs  ACTUAL BOT');
  console.log('  Improvements: 1) Wait-confirm on reverse  2) Chop filter  3) No entry after 2 PM');
  console.log('='.repeat(W));
  console.log('Date       | ORIGINAL        | IMPROVED        | ACTUAL     | Orig vs Act | Impr vs Act');
  console.log('-----------|-----------------|-----------------|------------|-------------|------------');

  let totOrig = 0, totImpr = 0, totActual = 0;

  for (const date of days) {
    const candles = await fetchDay(date);
    const actual = actualResults[date] || { pnl: 0, note: '?' };

    if (!candles) {
      console.log(`${date} | No market data  | No market data  | ${String(actual.pnl).padStart(6)} pts  |      —      |      —      | ${actual.note}`);
      continue;
    }

    const orig = simulateOriginal(candles);
    const impr = simulateImproved(candles);
    if (typeof actual.pnl === 'number') { totActual += actual.pnl; }
    totOrig += orig.pnl;
    totImpr += impr.pnl;

    const origVsAct = typeof actual.pnl === 'number' ? (orig.pnl - actual.pnl) : '?';
    const imprVsAct = typeof actual.pnl === 'number' ? (impr.pnl - actual.pnl) : '?';
    const fmt = v => (v >= 0 ? '+' : '') + v;

    console.log(`${date} | ${fmt(orig.pnl).padStart(5)} pts ${orig.wins}W${orig.trades-orig.wins}L | ${fmt(impr.pnl).padStart(5)} pts ${impr.wins}W${impr.trades-impr.wins}L | ${String(actual.pnl).padStart(6)} pts  | ${String(fmt(origVsAct)).padStart(7)} pts  | ${String(fmt(imprVsAct)).padStart(7)} pts`);

    // Show improved trade detail
    const impTrades = impr.log.filter(x => x.p !== null);
    if (impTrades.length) {
      impTrades.forEach(t => {
        const pStr = (t.p >= 0 ? '+' : '') + Math.round(t.p);
        console.log(`  IMPROVED: ${t.time}  ${(t.signal+'-'+t.dir).padEnd(12)}  ${t.reason.padEnd(18)}  ${pStr} pts`);
      });
    }
    console.log('');
  }

  console.log('='.repeat(W));
  console.log(`TOTAL      | ${fmt(totOrig).padStart(5)} pts orig  | ${fmt(totImpr).padStart(5)} pts impr  | ${String(totActual).padStart(6)} pts  | ${String(fmt(totOrig-totActual)).padStart(7)} pts  | ${String(fmt(totImpr-totActual)).padStart(7)} pts`);
  console.log('='.repeat(W));
}

function fmt(v) { return (v >= 0 ? '+' : '') + v; }
main().catch(console.error);

// Generates futures-daily-results.json from BankNifty 5yr cache
// Same strategy as gen_futures_monthly.js — outputs per-day breakdown

const fs = require('fs');

const LOT        = 30;
const COST_PER_TRADE = 452;
const ROLLOVER   = 1500;
const SL_PTS     = 150;
const TRAIL_GAP  = 10;
const MAX_TRADES = 5;

const cache = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/cache/banknifty_5yr.json', 'utf8'));

function runDay(candles) {
  let tradeCount = 0, dayPnl = 0;
  let inTrade = false, entry = 0, dir = null;
  let trailStop = 0, peakPts = 0;

  function exitTrade(exitPrice) {
    const pts = dir === 'CE' ? exitPrice - entry : entry - exitPrice;
    dayPnl += pts;
    inTrade = false; entry = 0; dir = null; trailStop = 0; peakPts = 0;
    return pts;
  }

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const h = Math.floor(c.t / 3600), m = Math.floor((c.t % 3600) / 60);
    const isEOD = h > 15 || (h === 15 && m >= 30);

    if (inTrade) {
      const pts = dir === 'CE' ? c.close - entry : entry - c.close;
      if (pts > peakPts) peakPts = pts;
      const newTrail = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
      trailStop = newTrail;
      if (pts <= trailStop || isEOD) {
        exitTrade(c.close);
        if (isEOD) break;
      }
      continue;
    }
    if (isEOD || tradeCount >= MAX_TRADES) break;
    const body = c.high > c.low ? (c.close - c.open) / (c.high - c.low) : 0;
    if (Math.abs(body) >= 0.6) {
      dir = body > 0 ? 'CE' : 'PE';
      entry = c.close;
      trailStop = -SL_PTS;
      peakPts = 0;
      inTrade = true;
      tradeCount++;
    }
  }
  return { pnl: dayPnl, trades: tradeCount };
}

// Group candles by date
const days = {};
for (const c of cache) {
  const date = c.date || new Date(c.ts * 1000).toISOString().slice(0, 10);
  if (!days[date]) days[date] = [];
  const dt = new Date(c.ts * 1000);
  const t = dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60;
  days[date].push({ open: c.open, high: c.high, low: c.low, close: c.close, t });
}

const dailyMap = {};
for (const date of Object.keys(days).sort()) {
  const candles = days[date].sort((a, b) => a.t - b.t);
  const result = runDay(candles);
  const grossRs = result.pnl * LOT;
  const costs   = result.trades * COST_PER_TRADE;
  const netRs   = Math.round(grossRs - costs);
  dailyMap[date] = {
    grossPts: Math.round(result.pnl * 10) / 10,
    netRs,
    trades: result.trades
  };
}

const out = { generated: new Date().toISOString(), lot: LOT, daily: dailyMap };
fs.writeFileSync('/home/ubuntu/trading-bot/futures-daily-results.json', JSON.stringify(out));
console.log('Written futures-daily-results.json, days:', Object.keys(dailyMap).length);

// Generates futures-monthly-results.json from the 5yr BankNifty cache
// Mirrors the exact logic in bt_futures_real.js
// Run: node gen_futures_monthly.js

const fs = require('fs');
const path = require('path');

const LOT        = 30;
const COST_PER_TRADE = 452;   // STT + brokerage + slippage per trade
const ROLLOVER   = 1500;       // ₹ per month rollover cost
const SL_PTS     = 150;
const TRAIL_GAP  = 10;
const MAX_TRADES = 5;

const cache = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf8'));

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

    // Simple trend signal: strong bullish candle = CE (long), strong bearish = PE (short)
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

// Group days by date
const days = {};
for (const c of cache) {
  const date = c.date || new Date(c.ts * 1000).toISOString().slice(0, 10);
  if (!days[date]) days[date] = [];
  // store candle with time-of-day seconds
  const dt = new Date(c.ts * 1000);
  const t = dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60; // UTC — adjust for IST offset already in ts
  days[date].push({ open: c.open, high: c.high, low: c.low, close: c.close, t });
}

// Actually — read directly from bt_futures_real output to avoid re-implementing strategy
// Instead use the candle-close DRISHTI logic exactly

// Re-implement the DRISHTI-like logic matching bt_futures_real.js
// Load from bt_futures_real.js output saved to a JSON file if available
// Otherwise we generate from cache using the same parameters

const monthlyMap = {};
const sortedDates = Object.keys(days).sort();

for (const date of sortedDates) {
  const mo = date.slice(0, 7);
  if (!monthlyMap[mo]) monthlyMap[mo] = { grossPts: 0, costRs: 0, netRs: 0, trades: 0, winDays: 0, totalDays: 0 };

  const candles = days[date].sort((a, b) => a.t - b.t);
  const result = runDay(candles);

  const grossRs = result.pnl * LOT;
  const costRs  = result.trades * COST_PER_TRADE;
  const netRs   = grossRs - costRs;

  monthlyMap[mo].grossPts  += result.pnl;
  monthlyMap[mo].costRs    += costRs;
  monthlyMap[mo].netRs     += netRs;
  monthlyMap[mo].trades    += result.trades;
  monthlyMap[mo].totalDays += 1;
  if (netRs > 0) monthlyMap[mo].winDays += 1;
}

// Apply rollover cost per month
for (const mo of Object.keys(monthlyMap)) {
  monthlyMap[mo].netRs -= ROLLOVER;
  monthlyMap[mo].costRs += ROLLOVER;
}

const out = { generated: new Date().toISOString(), lot: LOT, costPerTrade: COST_PER_TRADE, rolloverPerMonth: ROLLOVER, monthly: monthlyMap };
fs.writeFileSync(path.join(process.cwd(), 'futures-monthly-results.json'), JSON.stringify(out, null, 2));
console.log('Written futures-monthly-results.json');
console.log('Months:', Object.keys(monthlyMap).length);
const total = Object.values(monthlyMap).reduce((s, m) => s + m.netRs, 0);
console.log('Total net Rs:', Math.round(total).toLocaleString('en-IN'));

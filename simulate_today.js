// Simulate today's DRISHTI V1 trades using actual candle data from VPS
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require('./dist/src/drishti_strategy.js');

const fs   = require('fs');
const path = require('path');

// ── Load candles ──────────────────────────────────────────────────────────────
const BOT_DIR  = '/home/ubuntu/trading-bot';
const clogRaw  = JSON.parse(fs.readFileSync(`${BOT_DIR}/candle-log.json`, 'utf8'));

let todayCandles = [];
let prevDayCandles = [];

// Try to reconstruct from trades.json + bot logs
// Actually the best source is the VPS market API — but we can rebuild from what we have

// The candle-log has idx, time, close, bodyPct. We need OHLC.
// Let's fetch from the Kite historical data the bot has cached, or use the actual
// OHLC from the bot output logs we already read.

// From the bot logs we have exact OHLC for each candle:
const todayCandleData = [
  // Seed (not in drishtiTodayCandles)
  // C0  (09:30-09:45) — first pushed candle
  { open:53234.60, high:53247.70, low:53127.50, close:53204.40 },  // C0
  { open:53214.25, high:53317.30, low:53139.70, close:53192.75 },  // C1
  { open:53212.90, high:53302.30, low:53173.90, close:53180.60 },  // C2
  { open:53182.05, high:53274.90, low:53169.85, close:53192.55 },  // C3
  { open:53209.80, high:53220.60, low:53091.45, close:53181.75 },  // C4
  { open:53142.40, high:53171.85, low:53101.65, close:53145.85 },  // C5
  { open:53135.70, high:53174.85, low:53070.05, close:53113.80 },  // C6
  { open:53091.80, high:53236.60, low:53087.60, close:53169.70 },  // C7
  { open:53199.05, high:53245.70, low:53126.30, close:53164.10 },  // C8
  { open:53151.70, high:53213.00, low:53142.55, close:53173.50 },  // C9
  { open:53151.10, high:53187.25, low:53027.15, close:53082.20 },  // C10
  { open:53092.25, high:53218.25, low:53067.00, close:53213.60 },  // C11
  { open:53298.05, high:53724.20, low:53296.85, close:53693.35 },  // C12
  { open:53662.40, high:53733.45, low:53540.00, close:53577.85 },  // C13
  { open:53577.15, high:53652.80, low:53525.25, close:53578.60 },  // C14
  { open:53623.95, high:53834.50, low:53622.40, close:53763.80 },  // C15
  { open:53806.60, high:53828.65, low:53717.40, close:53748.90 },  // C16
  { open:53702.35, high:53951.50, low:53694.70, close:53846.25 },  // C17
  { open:53886.25, high:54003.20, low:53860.30, close:53883.40 },  // C18
  { open:53940.60, high:54048.90, low:53909.00, close:53953.70 },  // C19
  { open:53938.20, high:54155.90, low:53926.60, close:54092.75 },  // C20 (C21 in new restart)
  { open:54096.15, high:54257.85, low:54086.10, close:54158.05 },  // C21
  { open:54204.60, high:54299.35, low:54049.25, close:54112.65 },  // C22
  { open:54149.55, high:54271.20, low:54149.55, close:54217.85 },  // C23 (3:30 EOD)
];

// Prev day candles (PDH=53934, PDL=53122) — from the bot log
// We only need these for findDrishtiEntry (context detection)
prevDayCandles = [
  { open:53200, high:53934, low:53122, close:53500 },  // simplified prev day, preserving PDH/PDL
];

const SL = 150, TRAIL_GAP = 10, MAX_TRADES = 5, DAILY_LOSS_CAP = 150;
const QTY = 30;

const bp = c => (c.high - c.low) > 0 ? Math.round((c.close - c.open) / (c.high - c.low) * 100) : 0;

console.log('\n' + '═'.repeat(85));
console.log(' DRISHTI V1 — June 3, 2026 — FULL SIMULATION');
console.log(` PDH: 53,934  PDL: 53,122  Context: INSIDE (gap-down open ~53,541)`);
console.log(' SL=150 pts | TRAIL_GAP=10 (LOCK10) | MAX_TRADES=5 | DAILY_LOSS_CAP=150');
console.log('═'.repeat(85));
console.log('C#   Time    Close     Body   Action                                      Day P&L');
console.log('─'.repeat(85));

const state  = createDrishtiState();
let tradeCount = 0, dayPts = 0;
const candles = [];
const IST_OFFSET = 5.5 * 60; // minutes
const baseMinutes = 9*60+45; // 9:45 AM for C0

for (let i = 0; i < todayCandleData.length; i++) {
  const c = todayCandleData[i];
  candles.push(c);

  const timeMin = baseMinutes + i * 15;
  const hh = Math.floor(timeMin / 60).toString().padStart(2,'0');
  const mm = (timeMin % 60).toString().padStart(2,'0');
  const time = `${hh}:${mm}`;
  const h = Math.floor(timeMin / 60);
  const m = timeMin % 60;
  const isEOD = h > 15 || (h === 15 && m >= 30);
  const bodyStr = `${bp(c) >= 0 ? '+' : ''}${bp(c)}%`;

  let action = '';

  // ── Trail management ─────────────────────────────────────────────────────
  if (state.inTrade) {
    const trail = updateDrishtiTrail(state, c, isEOD);
    state.peakPts   = trail.peakPts;
    state.trailStop = trail.trailStop;

    if (trail.action !== 'HOLD') {
      const pts = trail.pts;
      dayPts += pts;
      const exitType = trail.action === 'EXIT_EOD' ? 'EOD' : trail.action === 'EXIT_SL' ? 'SL' : 'TRAIL';
      action = `EXIT ${state.dir} @ ${trail.exitPrice.toFixed(1)}  ${exitType}  ${pts >= 0 ? '+' : ''}${pts.toFixed(1)} pts`;

      state.lastExitPts = trail.pts;
      state.lastExitIdx = candles.length - 1;
      state.lastExitDir = state.dir;
      state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -150;

      if (trail.action === 'EXIT_EOD') {
        console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(1).padStart(8)}  ${bodyStr.padStart(5)}  ${action.padEnd(42)} ${dayPts >= 0 ? '+' : ''}${dayPts.toFixed(1)} pts`);
        break;
      }
    } else {
      action = `  in-trade ${state.dir} | peak ${trail.peakPts.toFixed(0)} | trail ${trail.trailStop.toFixed(0)} | unrealized ${trail.pts >= 0 ? '+' : ''}${trail.pts.toFixed(0)} pts`;
    }

    console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(1).padStart(8)}  ${bodyStr.padStart(5)}  ${action.padEnd(42)} ${dayPts >= 0 ? '+' : ''}${dayPts.toFixed(1)} pts`);
    continue;
  }

  // ── Entry logic ──────────────────────────────────────────────────────────
  if (isEOD || tradeCount >= MAX_TRADES || dayPts <= -DAILY_LOSS_CAP) {
    action = isEOD ? 'EOD — no new entries' : tradeCount >= MAX_TRADES ? 'max trades reached' : 'daily loss cap';
    console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(1).padStart(8)}  ${bodyStr.padStart(5)}  ${action.padEnd(42)} ${dayPts >= 0 ? '+' : ''}${dayPts.toFixed(1)} pts`);
    if (isEOD) break;
    continue;
  }

  let sig = null;
  if (state.firstDone && state.lastExitIdx >= 0 && state.lastExitDir && state.reCount < 5) {
    const re = findDrishtiReEntry(candles, state.lastExitIdx, state.lastExitDir, true);
    if (re && re.idx === candles.length - 1) sig = { side: re.side, reason: re.reason };
  } else if (!state.firstDone) {
    const e = findDrishtiEntry(candles, prevDayCandles);
    if (e) sig = { side: e.side, reason: e.reason };
  }

  if (sig) {
    state.inTrade   = true;
    state.dir       = sig.side;
    state.entry     = c.close;
    state.entryIdx  = candles.length - 1;
    state.trailStop = -SL;
    state.peakPts   = 0;
    state.firstDone = true;
    if (tradeCount > 0) state.reCount++;
    tradeCount++;
    action = `ENTER ${sig.side} @ ${c.close.toFixed(1)}  [${sig.reason}]  T${tradeCount}`;
  } else {
    action = '─';
  }

  console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(1).padStart(8)}  ${bodyStr.padStart(5)}  ${action.padEnd(42)} ${dayPts >= 0 ? '+' : ''}${dayPts.toFixed(1)} pts`);
}

// Force EOD exit if still in trade
if (state.inTrade) {
  const lastC = todayCandleData[todayCandleData.length - 1];
  const trail = updateDrishtiTrail(state, lastC, true);
  dayPts += trail.pts;
  console.log(`\n⚠  EOD forced exit: ${state.dir} @ ${trail.exitPrice.toFixed(1)} → ${trail.pts >= 0 ? '+' : ''}${trail.pts.toFixed(1)} pts`);
}

console.log('─'.repeat(85));
console.log(`\n  SIMULATION RESULT — ${tradeCount} trades`);
console.log(`  Day P&L : ${dayPts >= 0 ? '+' : ''}${dayPts.toFixed(1)} pts`);
console.log(`  ₹ P&L   : ₹${(dayPts * QTY).toLocaleString('en-IN', {maximumFractionDigits:0})}`);
console.log('');

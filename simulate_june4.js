'use strict';
// Simulate June 4, 2026 using ACTUAL candle data from bot logs
// Compare: Backtest simulation vs Live bot actual

const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require('./dist/src/drishti_strategy.js');

const QTY = 30;
const IV  = 0.20;
const SPREAD = 3;
const DELTA  = 0.5;
const DTE    = 26;  // June 4 → June 30 = 26 days

// ── Actual June 4 candle data from bot logs ───────────────────────────────
// Seed: 9:15-9:30 (discarded by bot). C0 = 9:30-9:45
const todayCandles = [
  { open:53970.35, high:54077.30, low:53879.60, close:54004.90 }, // C0  9:30-9:45
  { open:54040.70, high:54333.70, low:54040.70, close:54242.30 }, // C1  9:45-10:00  ← T1
  { open:54230.90, high:54342.15, low:54215.60, close:54254.10 }, // C2  10:00-10:15
  { open:54253.85, high:54307.00, low:54198.25, close:54243.65 }, // C3  10:15-10:30
  { open:54205.85, high:54234.35, low:54107.65, close:54192.70 }, // C4  10:30-10:45
  { open:54236.75, high:54396.40, low:54229.80, close:54379.75 }, // C5  10:45-11:00 ← T2
  { open:54358.15, high:54387.75, low:54198.95, close:54252.85 }, // C6  11:00-11:15
  { open:54254.60, high:54271.80, low:54173.70, close:54201.05 }, // C7  11:15-11:30
  { open:54202.25, high:54356.55, low:54110.30, close:54319.10 }, // C8  11:30-11:45 ← T3
  { open:54302.35, high:54310.70, low:54140.20, close:54224.85 }, // C9  11:45-12:00 ← T4 PE
  { open:54224.00, high:54355.10, low:54196.20, close:54294.40 }, // C10 12:00-12:15 ← T5 CE
  { open:54307.55, high:54339.85, low:54255.45, close:54318.60 }, // C11 12:15-12:30
  { open:54341.20, high:54344.65, low:54202.50, close:54259.65 }, // C12 12:30-12:45
  { open:54243.95, high:54315.00, low:54235.85, close:54282.30 }, // C13 12:45-1:00
  { open:54288.80, high:54310.80, low:54086.50, close:54115.65 }, // C14 1:00-1:15
  { open:54043.15, high:54112.05, low:53995.20, close:54053.50 }, // C15 1:15-1:30
  { open:54051.60, high:54095.90, low:54014.35, close:54071.90 }, // C16 1:30-1:45
  { open:54058.15, high:54110.20, low:54026.45, close:54085.35 }, // C17 1:45-2:00
  { open:54088.50, high:54271.95, low:54079.75, close:54221.40 }, // C18 2:00-2:15
  { open:54229.85, high:54287.75, low:54208.05, close:54271.90 }, // C19 2:15-2:30
  { open:54268.30, high:54395.40, low:54251.55, close:54360.05 }, // C20 2:30-2:45
  { open:54379.75, high:54461.00, low:54241.45, close:54263.30 }, // C21 2:45-3:00
  { open:54270.00, high:54339.65, low:54229.95, close:54316.40 }, // C22 3:00-3:15
  { open:54308.75, high:54354.45, low:54276.45, close:54324.30 }, // C23 3:15-3:30 EOD
];

// Prev day candles (June 3): PDH=54299, PDL=53027
const prevDayCandles = [
  { open:53541.10, high:54299.00, low:53027.00, close:54217.85 }, // simplified with correct PDH/PDL
];

const bp = c => (c.high-c.low)>0 ? Math.round((c.close-c.open)/(c.high-c.low)*100) : 0;
const atmPrem = (idx) => Math.max(50, Math.round(IV * Math.sqrt(DTE/365) * idx * 0.4));

// Times
const times = todayCandles.map((_, i) => {
  const m = 9*60+30 + i*15;
  return `${Math.floor(m/60).toString().padStart(2,'0')}:${(m%60).toString().padStart(2,'0')}`;
});

console.log('\n' + '═'.repeat(100));
console.log(' JUNE 4, 2026 — FULL SIMULATION vs LIVE BOT COMPARISON');
console.log(` PDH: 54,299  PDL: 53,027  Context: ABOVE PDH (C0.open 53970 < PDH 54299? No → INSIDE)`);
console.log(` SL: 150 pts (current) | TRAIL_GAP: 10 (LOCK10) | DTE: ${DTE} days`);
console.log('═'.repeat(100));

// ── Run simulation ─────────────────────────────────────────────────────────
const state = createDrishtiState();
let dayIdxPts = 0, dayFutRs = 0, dayOptRs = 0;
let tradeNum = 0;
const candles = [];
const simTrades = [];

console.log('\nC#   Time    Close    Body%   Simulation Action                                Idx Pts    Fut Rs    Opt Rs');
console.log('─'.repeat(100));

for (let i = 0; i < todayCandles.length; i++) {
  const c = todayCandles[i];
  candles.push(c);
  const isEOD = i === todayCandles.length - 1;
  const time = times[i];
  const bodyPct = bp(c);
  let action = '';

  if (state.inTrade) {
    const trail = updateDrishtiTrail(state, c, isEOD);
    state.peakPts = trail.peakPts;
    state.trailStop = trail.trailStop;

    if (trail.action !== 'HOLD') {
      const idxPts = trail.pts;
      dayIdxPts += idxPts;

      // Futures Rs (actual LTP at exit ≈ entry + index move since premium stable)
      const futEntryLTP = state.entry + Math.round(state.entry * 0.07 * DTE / 365); // approx
      const futExitLTP  = trail.exitPrice + Math.round(trail.exitPrice * 0.07 * DTE / 365);
      const futRs = state.dir === 'CE' ? Math.round((futExitLTP-futEntryLTP)*QTY) : Math.round((futEntryLTP-futExitLTP)*QTY);
      dayFutRs += futRs;

      // Options Rs: delta × idxPts - theta × candles - spread
      const entryPrem = atmPrem(state.entry);
      const thetaPerCandle = entryPrem / (DTE * 26);
      const held = Math.max(1, i - state.entryIdx);
      const optPts = DELTA * idxPts - thetaPerCandle * held - SPREAD * 2;
      const optRs  = Math.round(optPts * QTY);
      dayOptRs += optRs;

      const exitType = trail.action === 'EXIT_EOD' ? 'EOD' : trail.action === 'EXIT_SL' ? 'SL' : 'TRAIL';
      action = `EXIT ${state.dir} @ ${trail.exitPrice.toFixed(0)}  ${exitType}  ${idxPts>=0?'+':''}${idxPts.toFixed(1)} pts`;
      simTrades.push({ t: tradeNum, dir: state.dir, entry: state.entry, exit: trail.exitPrice, idxPts, futRs, optRs, reason: exitType, held });

      state.lastExitPts = trail.pts; state.lastExitIdx = candles.length-1; state.lastExitDir = state.dir;
      state.inTrade = false; state.dir = null; state.peakPts = 0; state.trailStop = -150;

      console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(0).padStart(8)}  ${(bodyPct>=0?'+':'')+bodyPct+'%'.padStart(5)}  ${action.padEnd(48)} ${(dayIdxPts>=0?'+':'')+dayIdxPts.toFixed(1).padStart(7)} ${(dayFutRs>=0?'+':'')+dayFutRs.toLocaleString('en-IN').padStart(8)} ${(dayOptRs>=0?'+':'')+dayOptRs.toLocaleString('en-IN').padStart(8)}`);
      if (isEOD) break;
      continue;
    }
    action = `  HOLD ${state.dir} | peak ${trail.peakPts.toFixed(0)} | lock ${trail.trailStop.toFixed(0)} | unreal ${trail.pts>=0?'+':''}${trail.pts.toFixed(0)}`;
    console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(0).padStart(8)}  ${(bodyPct>=0?'+':'')+bodyPct+'%'.padStart(5)}  ${action}`);
    continue;
  }

  if (isEOD || tradeNum >= 5) {
    console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(0).padStart(8)}  ${(bodyPct>=0?'+':'')+bodyPct+'%'.padStart(5)}  ${isEOD?'EOD':'max trades'}`);
    if (isEOD) break;
    continue;
  }

  let sig = null;
  if (!state.firstDone) {
    sig = findDrishtiEntry(candles, prevDayCandles);
  } else if (state.lastExitIdx >= 0 && state.lastExitDir) {
    sig = findDrishtiReEntry(candles, state.lastExitIdx, state.lastExitDir, true);
  }

  if (sig) {
    tradeNum++;
    state.inTrade = true; state.dir = sig.side; state.entry = c.close;
    state.entryIdx = candles.length-1; state.peakPts = 0; state.trailStop = -150;
    state.firstDone = true;
    action = `ENTER ${sig.side} @ ${c.close.toFixed(0)}  [${sig.reason}]  T${tradeNum}`;
  } else {
    action = '─';
  }
  console.log(`C${i.toString().padStart(2)} ${time}  ${c.close.toFixed(0).padStart(8)}  ${(bodyPct>=0?'+':'')+bodyPct+'%'.padStart(5)}  ${action.padEnd(48)} ${(dayIdxPts>=0?'+':'')+dayIdxPts.toFixed(1).padStart(7)} ${(dayFutRs>=0?'+':'')+dayFutRs.toLocaleString('en-IN').padStart(8)} ${(dayOptRs>=0?'+':'')+dayOptRs.toLocaleString('en-IN').padStart(8)}`);
}

// ── Results ────────────────────────────────────────────────────────────────
console.log('─'.repeat(100));
console.log('\n SIMULATION RESULT: ' + (dayIdxPts>=0?'+':'')+dayIdxPts.toFixed(1) + ' pts  Fut: ' + (dayFutRs>=0?'+':'')+dayFutRs.toLocaleString('en-IN') + '  Opt: ' + (dayOptRs>=0?'+':'')+dayOptRs.toLocaleString('en-IN'));

// ── Live bot actual result ─────────────────────────────────────────────────
console.log('\n' + '═'.repeat(100));
console.log(' LIVE BOT ACTUAL vs SIMULATION COMPARISON');
console.log('═'.repeat(100));

const liveBot = [
  { t:1, dir:'CE', entry:54242.3, exit:54332.2, idxPts:89.8,  futRsActual:2707,  futLTP_in:54534.8, futLTP_out:54550.0, optRsActual:null },
  { t:2, dir:'CE', entry:54379.8, exit:54229.8, idxPts:-150.0, futRsActual:-4520, futLTP_in:54598.2, futLTP_out:54460.2, optRsActual:null },
  { t:3, dir:'CE', entry:54559.1, exit:54586.6, idxPts:27.5,  futRsActual:824,   futLTP_in:54559.1, futLTP_out:54586.6, optRsActual:null },
  { t:4, dir:'PE', entry:54463.8, exit:54389.2, idxPts:74.7,  futRsActual:2240,  futLTP_in:54463.8, futLTP_out:54389.2, optRsActual:null },
  { t:5, dir:'CE', entry:54533.4, exit:54585.1, idxPts:50.7,  futRsActual:1551,  futLTP_in:54533.4, futLTP_out:54585.1, optRsActual:1256.75 },
];

console.log('\nT#  Dir  Sim Entry   Sim Exit   Sim idx   Act Entry(LTP)  Act Exit(LTP)   Act idx   Fut Rs Actual');
console.log('─'.repeat(100));

let totSimIdx=0, totSimFut=0, totActIdx=0, totActFut=0;
for (let i=0; i<Math.max(simTrades.length, liveBot.length); i++) {
  const s = simTrades[i] || {};
  const l = liveBot[i] || {};
  const sIdx = s.idxPts !== undefined ? `${s.idxPts>=0?'+':''}${s.idxPts.toFixed(1)}` : '—';
  const lIdx = l.idxPts !== undefined ? `${l.idxPts>=0?'+':''}${l.idxPts.toFixed(1)}` : '—';
  const lFut = l.futRsActual !== undefined ? `${l.futRsActual>=0?'+':'-'}₹${Math.abs(l.futRsActual).toLocaleString('en-IN')}` : '—';
  console.log(`T${(i+1)+'  '}${(l.dir||s.dir||'').padEnd(4)} ${(s.entry||0).toFixed(0).padStart(10)} ${(s.exit||0).toFixed(0).padStart(10)} ${sIdx.padStart(8)}  ${(l.futLTP_in||0).toFixed(0).padStart(14)} ${(l.futLTP_out||0).toFixed(0).padStart(14)} ${lIdx.padStart(8)} ${lFut.padStart(14)}`);
  if (s.idxPts !== undefined) { totSimIdx += s.idxPts; totSimFut += s.futRs; }
  if (l.idxPts !== undefined) { totActIdx += l.idxPts; totActFut += l.futRsActual; }
}
console.log('─'.repeat(100));
console.log('TOTAL' + '      ' + '          ' + '           ' + ((totSimIdx>=0?'+':'')+totSimIdx.toFixed(1)).padStart(8) + '  ' + '              ' + '              ' + ((totActIdx>=0?'+':'')+totActIdx.toFixed(1)).padStart(8) + ' ' + ((totActFut>=0?'+':'-')+'₹'+Math.abs(totActFut).toLocaleString('en-IN')).padStart(14));

console.log(`\n SIMULATION:  ${totSimIdx>=0?'+':''}${totSimIdx.toFixed(1)} index pts`);
console.log(` LIVE BOT:    ${totActIdx>=0?'+':''}${totActIdx.toFixed(1)} index pts  |  Futures Rs: ${totActFut>=0?'+':'-'}₹${Math.abs(totActFut).toLocaleString('en-IN')}`);
console.log(` DISCREPANCY: Sim=${totSimIdx.toFixed(1)} vs Live=${totActIdx.toFixed(1)} = ${(totActIdx-totSimIdx).toFixed(1)} pts`);

// Real futures P&L using actual LTPs
const realFutPL = liveBot.reduce((s,t) => {
  if (t.dir==='CE') return s + (t.futLTP_out - t.futLTP_in) * QTY;
  return s + (t.futLTP_in - t.futLTP_out) * QTY;
}, 0);
console.log(`\n REAL FUTURES P&L (actual LTPs): ${realFutPL>=0?'+':'-'}₹${Math.abs(Math.round(realFutPL)).toLocaleString('en-IN')}`);
console.log(` (T1: +(54550-54534)×30=+₹456  T2: +(54460-54598)×30=-₹4,140  T3: +₹825  T4: +₹2,238  T5: +₹1,551)`);

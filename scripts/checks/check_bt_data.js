const fs = require('fs');
const { findDrishtiEntry, findDrishtiReEntry, updateDrishtiTrail, createDrishtiState } =
  require('../../dist/src/drishti_strategy.js');

const raw   = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json','utf-8'));
const dates = Object.keys(raw).sort();

// ── Check C0 offset: does backtest include the 9:15 candle? ──────────────────
const lastDay = raw[dates[dates.length-2]];  // June 2
console.log('=== BACKTEST CANDLE STRUCTURE (June 2) ===');
console.log('Total candles:', lastDay.length);
lastDay.slice(0,4).forEach((c,i) => {
  const bp = (c.high-c.low)>0 ? Math.round((c.close-c.open)/(c.high-c.low)*100) : 0;
  console.log(`  C${i}: h=${c.h} m=${c.m} O=${c.open} H=${c.high} L=${c.low} C=${c.close} body=${bp}%`);
});
console.log('  ...');
lastDay.slice(-2).forEach((c,i) => {
  const bp = (c.high-c.low)>0 ? Math.round((c.close-c.open)/(c.high-c.low)*100) : 0;
  const idx = lastDay.length-2+i;
  console.log(`  C${idx}: h=${c.h} m=${c.m} O=${c.open} H=${c.high} L=${c.low} C=${c.close} body=${bp}%`);
});

// ── Key question: C0 context ──────────────────────────────────────────────────
const prevDay = raw[dates[dates.length-3]];  // June 1 as prev day
const todayC  = lastDay.map(c => ({ open:c.open, high:c.high, low:c.low, close:c.close }));
const prevC   = prevDay.map(c => ({ open:c.open, high:c.high, low:c.low, close:c.close }));

const PH = Math.max(...prevC.map(c=>c.high));
const PL = Math.min(...prevC.map(c=>c.low));
const C0_backtest = todayC[0];   // backtest C0 = 9:15 candle
const C0_livebot  = todayC[1];   // live bot C0 = 9:30 candle (seed=C0, first pushed=C1)

const gap_bt   = C0_backtest.open - prevC[prevC.length-1].close;
const gap_live = C0_livebot.open  - prevC[prevC.length-1].close;
const ctx_bt   = (C0_backtest.open-PH)>120 ? 'ABOVE_PDH' : (C0_backtest.open-PL)<0 ? 'BELOW_PDL' : 'INSIDE';
const ctx_live = (C0_livebot.open-PH)>120  ? 'ABOVE_PDH' : (C0_livebot.open-PL)<0  ? 'BELOW_PDL' : 'INSIDE';
const bp_bt    = (C0_backtest.high-C0_backtest.low)>0 ? Math.round((C0_backtest.close-C0_backtest.open)/(C0_backtest.high-C0_backtest.low)*100) : 0;
const bp_live  = (C0_livebot.high-C0_livebot.low)>0   ? Math.round((C0_livebot.close-C0_livebot.open)/(C0_livebot.high-C0_livebot.low)*100) : 0;

console.log('\n=== C0 DIFFERENCE (backtest vs live bot) ===');
console.log(`PDH: ${PH}  PDL: ${PL}`);
console.log(`Backtest C0  (9:15 candle): open=${C0_backtest.open} close=${C0_backtest.close} body=${bp_bt}% ctx=${ctx_bt} gap=${gap_bt.toFixed(0)}`);
console.log(`Live bot C0  (9:30 candle): open=${C0_livebot.open}  close=${C0_livebot.close} body=${bp_live}% ctx=${ctx_live} gap=${gap_live.toFixed(0)}`);
console.log(`Context same? ${ctx_bt===ctx_live}`);
console.log(`Gap direction same? bt_gapDown=${gap_bt<-50} live_gapDown=${gap_live<-50}`);

// ── Run both and compare signals ──────────────────────────────────────────────
console.log('\n=== SIGNAL COMPARISON (June 2, same day) ===');

function runSignals(candles, label) {
  const state = createDrishtiState();
  const entries = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const partial = candles.slice(0, i+1);
    const isEOD = false; // skip for signal scan only
    if (state.inTrade) {
      const trail = updateDrishtiTrail(state, c, (i===candles.length-1));
      state.peakPts = trail.peakPts; state.trailStop = trail.trailStop;
      if (trail.action !== 'HOLD') {
        entries.push({i, type:'EXIT', dir:state.dir, pts:trail.pts, reason:trail.action});
        state.lastExitPts=trail.pts; state.lastExitIdx=i; state.lastExitDir=state.dir;
        state.inTrade=false; state.dir=null; state.peakPts=0; state.trailStop=-150;
      }
      continue;
    }
    if (i >= candles.length-1) continue;
    let sig = null;
    if (!state.firstDone) {
      sig = findDrishtiEntry(partial, prevC);
    } else if (state.lastExitIdx >= 0) {
      sig = findDrishtiReEntry(partial, state.lastExitIdx, state.lastExitDir, true);
    }
    if (sig && sig.idx === i) {
      entries.push({i, type:'ENTRY', dir:sig.side, entry:c.close, reason:sig.reason});
      state.inTrade=true; state.dir=sig.side; state.entry=c.close;
      state.entryIdx=i; state.peakPts=0; state.trailStop=-150; state.firstDone=true;
    }
  }
  return entries;
}

const bt_signals   = runSignals(todayC, 'backtest');
const live_signals = runSignals(todayC.slice(1), 'livebot');  // live bot starts from C1

console.log('Backtest signals (C0=9:15):');
bt_signals.forEach(s => console.log(`  C${s.i}: ${s.type} ${s.dir} ${s.entry||''} ${s.reason||''} ${s.pts!=null?'pts:'+s.pts.toFixed(1):''}`));
console.log('Live bot signals (C0=9:30):');
live_signals.forEach(s => console.log(`  C${s.i}: ${s.type} ${s.dir} ${s.entry||''} ${s.reason||''} ${s.pts!=null?'pts:'+s.pts.toFixed(1):''}`));

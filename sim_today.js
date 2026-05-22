'use strict';
// Today May 20 2026 — actual candles from bot log
// Entry: CE at C3 close (53054), as bot took it
const candles = [
  { t:'09:30', o:53015.7,  h:53020.5,  l:52836.1,  c:52923.4  }, // C1 RED
  { t:'09:45', o:52954.9,  h:53041.95, l:52913.35, c:52960.3  }, // C2 GREEN
  { t:'10:00', o:52985.5,  h:53061.05, l:52942.2,  c:53053.75 }, // C3 GREEN → entry
  { t:'10:15', o:53049.3,  h:53060.3,  l:52899.75, c:52976.7  },
  { t:'10:30', o:52966.85, h:52985.3,  l:52885.7,  c:52960.8  },
  { t:'10:45', o:52990.1,  h:53127.55, l:52984.3,  c:53016.35 },
  { t:'11:00', o:53016.0,  h:53049.15, l:52925.5,  c:53037.2  },
  { t:'11:15', o:53071.55, h:53254.65, l:53071.55, c:53221.3  },
  { t:'11:30', o:53194.9,  h:53302.25, l:53185.25, c:53291.7  },
  { t:'11:45', o:53297.85, h:53344.05, l:53267.7,  c:53274.05 },
  { t:'12:00', o:53281.8,  h:53410.65, l:53281.8,  c:53321.7  },
  { t:'12:15', o:53314.9,  h:53331.1,  l:53228.15, c:53255.85 },
  { t:'12:30', o:53236.35, h:53344.25, l:53232.9,  c:53251.15 },
  { t:'12:45', o:53262.95, h:53301.55, l:53251.15, c:53257.25 },
  { t:'13:00', o:53257.85, h:53295.35, l:53225.2,  c:53259.05 },
  { t:'13:15', o:53264.55, h:53279.4,  l:53163.6,  c:53213.5  },
  { t:'13:30', o:53211.1,  h:53221.6,  l:53099.65, c:53100.15 },
  { t:'13:45', o:53081.15, h:53222.4,  l:53074.55, c:53159.2  },
  { t:'14:00', o:53150.4,  h:53218.05, l:53120.4,  c:53215.7  },
  { t:'14:15', o:53270.55, h:53434.2,  l:53270.55, c:53399.75 }, // EOD
];

const ENTRY     = 53053.75;  // C3 close
const DIR       = 'CE';
const SL_FIXED  = 60;        // current strategy SL
const SL_C2LOW  = 52913.35;  // C2 low
const TRAIL_GAP = 100;
const QTY       = 30;
const RS_PT     = 15;        // approx Rs per index pt

function simCE(slLevel, exitMode, label) {
  let sl   = slLevel;
  let peak = 0;
  let exitCandle = null, exitPx = null, exitPts = null, exitReason = '';

  for (let i = 3; i < candles.length; i++) { // start from 10:15 candle
    const c = candles[i];
    const isEOD = c.t === '14:15' || c.t >= '15:14';

    // Update peak with intrabar high
    const intraHigh = c.h - ENTRY;
    if (intraHigh > peak) peak = intraHigh;

    // Update trail SL
    if (peak >= SL_FIXED) {
      const locked = Math.max(0, peak - TRAIL_GAP);
      sl = Math.max(sl, ENTRY + locked);
    }

    if (isEOD) {
      exitPx = c.c; exitPts = c.c - ENTRY; exitCandle = c.t; exitReason = 'EOD';
      break;
    }

    const intraTouched = c.l <= sl;
    const closeBelow   = c.c <= sl;

    let hit = false;
    if (exitMode === 'candle_close') hit = closeBelow;
    if (exitMode === 'tick_single')  hit = intraTouched;
    if (exitMode === 'tick_double')  hit = intraTouched && closeBelow;

    if (hit) {
      exitPx     = exitMode === 'candle_close' ? c.c : sl;
      exitPts    = exitPx - ENTRY;
      exitCandle = c.t;
      exitReason = 'SL @ ' + sl.toFixed(0) + (peak >= SL_FIXED ? ' (trail, peak=+'+peak.toFixed(0)+')' : ' (hard SL)');
      break;
    }
  }

  const rs = Math.round(exitPts * QTY * (exitPts > 0 ? 0.5 : 0.3)); // approx delta
  const rsPt = Math.round(exitPts * RS_PT);
  console.log('  ' + label.padEnd(36) + '| Exit: ' + (exitCandle||'?').padEnd(6) + ' | Pts: ' + (exitPts >= 0 ? '+' : '') + exitPts.toFixed(0).padStart(5) + ' | Rs(~): ' + (rsPt>=0?'+':'')+rsPt + ' | ' + exitReason);
}

// Today's ACTUAL result (from bot log)
const actualResult = () => {
  console.log('  ' + 'ACTUAL BOT (fixed SL=60, candle-close)'.padEnd(36) + '| Exit: 10:15  | Pts:   -77 | Rs: -1577 | T1_SL at candle close');
  console.log('  ' + '  RE-ENTRY PE at 52977'.padEnd(36) + '| Exit: 10:45  | Pts:  ~-60 | Rs: ~-900 | RE_SL (market reversed up)');
  console.log('  ' + '  DAY TOTAL'.padEnd(36) + '|              |            | Rs: ~-2477');
};

const SEP = '='.repeat(90);
const LINE = '-'.repeat(90);
console.log(SEP);
console.log('  MAY 20 2026 — WHAT-IF SIMULATION');
console.log('  CE entry at 53054  |  C2 low = 52913  |  QTY=30');
console.log(SEP);
console.log('');
console.log('  TODAY\'S ACTUAL RESULT:');
actualResult();
console.log('');
console.log('  WHAT-IF SCENARIOS (T1 CE only, no RE):');
console.log(LINE);
simCE(ENTRY - SL_FIXED, 'candle_close', 'Fixed SL=60 + candle-close');
simCE(ENTRY - SL_FIXED, 'tick_double',  'Fixed SL=60 + tick double-confirm');
simCE(SL_C2LOW,         'candle_close', 'C2-low SL + candle-close');
simCE(SL_C2LOW,         'tick_double',  'C2-low SL + tick double-confirm');
console.log(SEP);

console.log('\n  CANDLE-BY-CANDLE (C2-low SL, candle-close — the "big win" scenario):');
console.log(LINE);
console.log('  Candle | High   | Low    | Close  | Pts vs Entry | SL Level | Note');
console.log(LINE);
let sl2 = SL_C2LOW, peak2 = 0;
for (let i = 3; i < candles.length; i++) {
  const c = candles[i];
  const intraHigh = c.h - ENTRY;
  if (intraHigh > peak2) peak2 = intraHigh;
  if (peak2 >= SL_FIXED) {
    const locked = Math.max(0, peak2 - TRAIL_GAP);
    sl2 = Math.max(sl2, ENTRY + locked);
  }
  const intraTouched = c.l <= sl2;
  const closeBelow   = c.c <= sl2;
  const pts = (c.c - ENTRY).toFixed(0);
  let note = '';
  if (intraTouched && !closeBelow) note = '<- wick touched SL (close recovered!) STAYS IN';
  if (intraTouched && closeBelow)  note = '<- SL EXITS at ' + sl2.toFixed(0);
  if (c.t === '14:15') note = '<- EOD exit';
  console.log('  ' + c.t + '   | ' + c.h.toFixed(0).padStart(6) + ' | ' + c.l.toFixed(0).padStart(6) + ' | ' + c.c.toFixed(0).padStart(6) + ' | ' + (parseFloat(pts)>=0?'+':'')+pts.padStart(5) + '          | ' + sl2.toFixed(0).padStart(8) + ' | ' + note);
  if (intraTouched && closeBelow) break;
  if (c.t === '14:15') break;
}
console.log(SEP);

'use strict';
// YOUR STRATEGY — clean, no mixing:
// Signal : C1 Red + C2 Green + C3 Green -> CE entry at C3 close
// SL      : C2 low (structural)
// Trail   : after +100 pts peak, trail 100 pts behind peak
// Exit    : candle closes below SL (traditional TA rule)
// No RE entry

const candles = [
  { t:'10:15', h:53060.3,  l:52899.75, c:52976.7  },
  { t:'10:30', h:52985.3,  l:52885.7,  c:52960.8  },
  { t:'10:45', h:53127.55, l:52984.3,  c:53016.35 },
  { t:'11:00', h:53049.15, l:52925.5,  c:53037.2  },
  { t:'11:15', h:53254.65, l:53071.55, c:53221.3  },
  { t:'11:30', h:53302.25, l:53185.25, c:53291.7  },
  { t:'11:45', h:53344.05, l:53267.7,  c:53274.05 },
  { t:'12:00', h:53410.65, l:53281.8,  c:53321.7  },
  { t:'12:15', h:53331.1,  l:53228.15, c:53255.85 },
  { t:'12:30', h:53344.25, l:53232.9,  c:53251.15 },
  { t:'12:45', h:53301.55, l:53251.15, c:53257.25 },
  { t:'13:00', h:53295.35, l:53225.2,  c:53259.05 },
  { t:'13:15', h:53279.4,  l:53163.6,  c:53213.5  },
  { t:'13:30', h:53221.6,  l:53099.65, c:53100.15 },
  { t:'13:45', h:53222.4,  l:53074.55, c:53159.2  },
  { t:'14:00', h:53218.05, l:53120.4,  c:53215.7  },
  { t:'14:15', h:53434.2,  l:53270.55, c:53399.75 }, // EOD
];

const ENTRY  = 53053.75;
const C2_LOW = 52913.35;
const TRAIL  = 100;
const RS_PT  = 15;

let sl   = C2_LOW;
let peak = 0;

console.log('='.repeat(80));
console.log(' YOUR STRATEGY — MAY 20 2026');
console.log(' CE entry at 53054  |  SL at C2 low = 52913');
console.log('='.repeat(80));
console.log(' Entry  : CE @ 53054');
console.log(' Hard SL: 52913  (risk = ' + (ENTRY - C2_LOW).toFixed(0) + ' pts)');
console.log('');
console.log(' Time  | High   | Low    | Close  | Pts    | SL     | Action');
console.log('-'.repeat(80));

let result = null;

for (const c of candles) {
  // Update peak using intrabar high
  const intraHigh = c.h - ENTRY;
  if (intraHigh > peak) peak = intraHigh;

  // Update trail SL (only after peak >= 100 pts)
  if (peak >= TRAIL) {
    const locked = Math.max(0, peak - TRAIL);
    sl = Math.max(sl, ENTRY + locked);
  }

  const pts    = (c.c - ENTRY).toFixed(0);
  const slHit  = c.c <= sl;   // candle CLOSE below SL -> exit
  const isEOD  = c.t === '14:15';

  let action = '';
  if (slHit) {
    action = '<-- SL EXIT at close ' + c.c.toFixed(0);
  } else if (isEOD) {
    action = '<-- EOD EXIT';
  }

  console.log(
    ' ' + c.t + ' | ' + c.h.toFixed(0).padStart(6) +
    ' | ' + c.l.toFixed(0).padStart(6) +
    ' | ' + c.c.toFixed(0).padStart(6) +
    ' | ' + (parseFloat(pts)>=0?'+':'')+pts.padStart(5) +
    ' | ' + sl.toFixed(0).padStart(6) +
    ' | ' + action
  );

  if (slHit || isEOD) {
    result = { pts: c.c - ENTRY, exit: c.t, sl: sl, reason: slHit ? 'SL' : 'EOD' };
    break;
  }
}

const rs = Math.round(result.pts * RS_PT);
console.log('='.repeat(80));
console.log(' EXIT    : ' + result.exit + '  (' + result.reason + ')');
console.log(' Pts     : ' + (result.pts >= 0 ? '+' : '') + result.pts.toFixed(0));
console.log(' Rs(idx) : ' + (rs >= 0 ? '+' : '') + '₹' + Math.abs(rs).toLocaleString('en-IN') + '  (index pts × 15, approx)');
console.log('');
console.log(' vs ACTUAL BOT today : -₹2,477 (T1 + RE both stopped out)');
console.log(' DIFFERENCE          : ' + (rs >= 0 ? '+' : '') + '₹' + Math.abs(rs - (-2477)).toLocaleString('en-IN') + ' ' + (rs > -2477 ? 'BETTER' : 'WORSE'));
console.log('='.repeat(80));

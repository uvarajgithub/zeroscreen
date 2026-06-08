// Analyse all TRAIL exits: locked (trailStop) vs actual candle close P&L
// Same logic as calcPL() in backtest_bhav.js
const fs = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || 'cache/banknifty_5yr.json';
const SL_PTS     = 150;
const TRAIL_GAP  = 20;

const cachePath = path.isAbsolute(CACHE_FILE) ? CACHE_FILE : path.join(process.cwd(), CACHE_FILE);
const cache = JSON.parse(fs.readFileSync(cachePath));

// --- BHAV entry detection (minimal version matching backtest_bhav.js) ---
// We just need to find entry days and their exit type/prices
// Re-use backtest_bhav.js approach: import relevant functions or inline them

// Load the backtest module approach - just run the full backtest and capture TRAIL exits
// We'll inline calcPL with BOTH locked and actual close tracked

function calcPLDetail(candles, entryIdx, side) {
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peakPts   = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TRAIL_GAP ? peakPts - TRAIL_GAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      const exitType = trailStop <= 0 ? 'SL' : 'TRAIL';
      // Backtest records trailStop, actual is closePts
      return {
        exitType,
        trailStopPts: trailStop,
        actualClosePts: closePts,
        diff: closePts - trailStop,   // negative = actual worse than locked
        peakPts,
        exitIdx: i
      };
    }
  }
  const exitPrice = candles[candles.length - 1].close;
  const closePts  = sign * (exitPrice - candles[entryIdx].close);
  return { exitType: 'EOD', trailStopPts: closePts, actualClosePts: closePts, diff: 0, peakPts, exitIdx: candles.length - 1 };
}

// Replicate entry detection from backtest_bhav.js
// We'll just load and exec backtest_bhav.js with a patched calcPL that records results
// Instead, use a simpler approach: patch the backtest output using the cache directly

// Actually: load backtest_bhav.js, patch calcPL, run it, capture TRAIL exits
// Easiest: use require() and monkey-patch. But calcPL is not exported.
// So: inline the full backtest logic for TRAIL exit tracking only.

// ---- Simplified: load backtest_bhav.js output (5year-backtest-result.json) 
// We know which days had trades. For each day with bbPnL != 0 and bbPnL > 0,
// re-simulate the entry + exit and check if it was TRAIL or EOD and if locked != actual.

// For days that are in the daily results with bbPnL > 0, we need to know if exit was TRAIL.
// The only way is to re-run the entry detection. Let's do that.

// Since we can't easily import backtest_bhav.js (it's not modular), 
// run it as a child process and capture output, OR inline the relevant parts.

// APPROACH: pipe stdout from backtest_bhav.js with added logging
// Patch: write a wrapper that requires backtest logic and logs TRAIL exits

// SIMPLEST: modify backtest_bhav.js inline temporarily to log trail exits
// We won't modify it. Instead: re-implement entry + exit for trail analysis only.

// ---- We'll load the known daily results and for positive-pnl days, re-run candles ----

const results = JSON.parse(fs.readFileSync(path.join(process.cwd(), '5year-backtest-result.json')));
const dailyMap = {};
for (const d of results.daily) dailyMap[d.date] = d.bbPnL;

// Helper: body percentage
function bodyPct(c) {
  const range = c.high - c.low;
  if (range < 1) return 0;
  return ((c.close - c.open) / range) * 100;
}

// Simplified entry detection - just enough to find the entry candle index and side
// (mirrors the most common paths in backtest_bhav.js)
function findEntry(candles) {
  // We only need to handle the case where bbPnL is recorded
  // The backtest finds ONE entry per day. We need to reproduce it.
  // For brevity: try common entry patterns and pick the first one found
  // This won't be 100% accurate for all 103 no-signal or complex cases
  // BUT for profit-side analysis: we just need to iterate over TRADED days
  // and find what the actual close was at exit vs locked.

  // We'll use a shortcut: for any traded day, find the ENTRY by trying all candles
  // and checking if running calcPLDetail gives a non-EOD consistent exit.
  // This is approximate but good enough for the comparison.
  return null; // not used - see below
}

// ---- MAIN ANALYSIS ----
// For each positive-pnl day, re-simulate to find TRAIL exits and compare
// We need entry finding logic. Let's inline a minimal version.

// Since implementing full BHAV entry detection inline is complex (hundreds of lines),
// use a different approach: run node with backtest_bhav.js modified to log trail exits.
// Write a patch wrapper.

console.log("Building wrapper...");

const btCode = fs.readFileSync(path.join(process.cwd(), 'backtest_bhav.js'), 'utf8');

// Patch calcPL to also record actual close in trail exits
const patched = btCode
  .replace(
    '      const lockedPL = trailStop * PTS_PER_RS;\n      return { pl: lockedPL, peakPts, exitIdx: i, exitType,\n               entryPrice, exitPrice: entryPrice + sign * trailStop };',
    `      const lockedPL = trailStop * PTS_PER_RS;
      const actualPL = closePts * PTS_PER_RS;
      if (exitType === 'TRAIL') {
        process.stdout.write('TRAIL_EXIT:' + JSON.stringify({
          trailPts: Math.round(trailStop * 10)/10,
          actualPts: Math.round(closePts * 10)/10,
          diff: Math.round((closePts - trailStop) * 10)/10,
          peakPts: Math.round(peakPts * 10)/10,
          trailPL: Math.round(lockedPL),
          actualPL: Math.round(actualPL)
        }) + '\\n');
      }
      return { pl: lockedPL, peakPts, exitIdx: i, exitType,
               entryPrice, exitPrice: entryPrice + sign * trailStop };`
  );

fs.writeFileSync('/tmp/bt_trail_analysis.js', patched);
console.log("Wrapper written to /tmp/bt_trail_analysis.js");

// Run it and capture TRAIL_EXIT lines
const { execSync } = require('child_process');
const output = execSync('node /tmp/bt_trail_analysis.js cache/banknifty_5yr.json 2>/dev/null').toString();

const trailLines = output.split('\n').filter(l => l.startsWith('TRAIL_EXIT:'));
console.log('Total TRAIL exits:', trailLines.length);

let totalDiff = 0;
let worseCases = [];
for (const line of trailLines) {
  const t = JSON.parse(line.replace('TRAIL_EXIT:', ''));
  totalDiff += t.diff;
  if (t.diff < -5) worseCases.push(t);
}

worseCases.sort((a, b) => a.diff - b.diff);

console.log('\nTrail exits where actual close worse than locked level (diff < -5pts):');
console.log('TrailPts | ActualPts | Diff | PeakPts | TrailPL | ActualPL');
console.log('---------------------------------------------------------------');
for (const t of worseCases.slice(0, 30)) {
  console.log(`${t.trailPts} | ${t.actualPts} | ${t.diff} | ${t.peakPts} | ${t.trailPL} | ${t.actualPL}`);
}

console.log('\nTotal extra loss on TRAIL exits:', Math.round(totalDiff * 10)/10, 'pts = Rs', Math.round(totalDiff * 15));
console.log('(negative = profits overstated in backtest)');

// Cleanup
fs.unlinkSync('/tmp/bt_trail_analysis.js');

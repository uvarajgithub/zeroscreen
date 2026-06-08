'use strict';
// crash_audit.js — Find candles where price crashed THROUGH the trail stop level
// These are the realistic risk cases where stop order might not fill at trail level
const fs = require('fs');
const path = require('path');
const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'),'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const PTS_PER_RS = 15, SL_PTS = 150, TGAP = 10;

// Scan every possible entry in every day to find TRAIL exits where close was far below stop level
// Gap > 50 pts = price blew through trail stop by 50+ pts in ONE 15-min candle
// These are the "market impact" scenarios where real fill would be worse than backtest credits

let gaps = [];
for (const date of ALL) {
  const cs = raw[date];
  for (const side of ['CE','PE']) {
    const sign = side === 'CE' ? 1 : -1;
    for (let entryIdx = 0; entryIdx < cs.length - 2; entryIdx++) {
      const entryPrice = cs[entryIdx].close;
      let peakPts = 0, trailStop = -SL_PTS;
      for (let i = entryIdx + 1; i < cs.length; i++) {
        const c = cs[i];
        const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
        if (favPts > peakPts) {
          peakPts   = favPts;
          trailStop = peakPts >= TGAP ? peakPts - TGAP : -SL_PTS;
        }
        const closePts = sign * (c.close - entryPrice);
        if (closePts <= trailStop) {
          if (trailStop > 0) {
            // TRAIL exit: close is below trail level
            const gap = trailStop - closePts; // how far below trail stop the candle closed
            if (gap > 50) {
              gaps.push({
                date, side,
                peakPts: Math.round(peakPts),
                trailStop: Math.round(trailStop),
                closePts: Math.round(closePts),
                gap: Math.round(gap),
                // candle range for context
                candleRange: Math.round(c.high - c.low),
                entryIdx
              });
            }
          }
          break;
        }
      }
    }
  }
}

gaps.sort((a, b) => b.gap - a.gap);

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  CRASH-THROUGH AUDIT: Candles where close went FAR below trail stop');
console.log('  These are the risk cases for trail stop fill accuracy');
console.log('══════════════════════════════════════════════════════════════════');
console.log(`${'Date'.padEnd(12)} ${'Side'} ${'Peak'.padStart(6)} ${'Trail'.padStart(6)} ${'Close'.padStart(7)} ${'Gap(pts)'.padStart(9)} ${'Rs at risk'.padStart(11)}`);
console.log('─'.repeat(70));
gaps.slice(0, 25).forEach(g => {
  const rsAtRisk = g.gap * PTS_PER_RS;
  console.log(
    g.date.padEnd(12) + ' ' + g.side + '  ' +
    String(g.peakPts).padStart(6) + ' ' +
    String(g.trailStop).padStart(6) + ' ' +
    String(g.closePts).padStart(7) + ' ' +
    String(g.gap).padStart(9) + ' ' +
    ('Rs ' + rsAtRisk.toLocaleString('en-IN')).padStart(11)
  );
});

// Distribution of gap sizes
const dist = { '50-100': 0, '100-200': 0, '200-500': 0, '500+': 0 };
gaps.forEach(g => {
  if (g.gap < 100)       dist['50-100']++;
  else if (g.gap < 200)  dist['100-200']++;
  else if (g.gap < 500)  dist['200-500']++;
  else                   dist['500+']++;
});

console.log('\n  Gap distribution (all entries scanned, not just V15 trades):');
for (const [k,v] of Object.entries(dist)) console.log(`    ${k.padEnd(10)} pts gap: ${v} events`);
console.log(`  Total crash-through events (gap>50 pts): ${gaps.length}`);

// Worst 5 in detail
console.log('\n  Worst 5 crash-through events in detail:');
gaps.slice(0, 5).forEach((g, i) => {
  // Find the actual candle
  const cs = raw[g.date];
  const entryPrice = cs[g.entryIdx].close;
  // find the exit candle
  let exitCandle = null, exitIdx = -1;
  const sign = g.side === 'CE' ? 1 : -1;
  let peakPts = 0, trailStop = -SL_PTS;
  for (let i = g.entryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const favPts = g.side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) { peakPts = favPts; trailStop = peakPts >= TGAP ? peakPts - TGAP : -SL_PTS; }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) { exitCandle = c; exitIdx = i; break; }
  }
  if (!exitCandle) return;
  const candleRange = exitCandle.high - exitCandle.low;
  const percentCrash = ((exitCandle.high - exitCandle.close) / candleRange * 100).toFixed(0);
  console.log(`\n  ${i+1}. ${g.date} [${g.side}] entry:${Math.round(entryPrice)}`);
  console.log(`     Exit candle: open=${Math.round(exitCandle.open)} high=${Math.round(exitCandle.high)} low=${Math.round(exitCandle.low)} close=${Math.round(exitCandle.close)}`);
  console.log(`     Candle range: ${Math.round(candleRange)} pts  |  Price dropped ${percentCrash}% from high to close`);
  console.log(`     Trail stop AT: ${Math.round(entryPrice + sign*(peakPts-TGAP))} (=${g.trailStop} pts profit)`);
  console.log(`     Close AT:      ${Math.round(exitCandle.close)} (=${g.closePts} pts profit)`);
  console.log(`     Gap: ${g.gap} pts → If real fill was at close: would have lost Rs ${(g.gap * PTS_PER_RS).toLocaleString('en-IN')} MORE`);
});

// Key summary
const totalRiskIfAllFillAtClose = gaps.reduce((s, g) => s + g.gap * PTS_PER_RS, 0);
const top100Risk = gaps.slice(0, 100).reduce((s, g) => s + g.gap * PTS_PER_RS, 0);
console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  SUMMARY (across ALL possible entry points, not just V15 trades):');
console.log(`  If ALL ${gaps.length} crash-throughs filled at close: extra loss = Rs ${totalRiskIfAllFillAtClose.toLocaleString('en-IN')}`);
console.log(`  If TOP 100 filled at close: extra loss = Rs ${top100Risk.toLocaleString('en-IN')}`);
console.log('  In reality: BankNifty futures are liquid. A 15-min candle that');
console.log('  has a 200-pt range will have millions of shares trading at every');
console.log('  price level. A stop ORDER at trail level WILL fill near that price.');
console.log('  Only circuit breakers / auction situations cause real gaps.');
console.log('══════════════════════════════════════════════════════════════════');

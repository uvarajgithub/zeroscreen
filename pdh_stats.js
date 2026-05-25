const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_5yr.json'));

// Cache format: { "YYYY-MM-DD": [{open,high,low,close,h,m}, ...] }
const days = raw; // already grouped by date
const dates = Object.keys(days).sort();
let abovePDH = 0, belowPDL = 0;
let peFadeWin = 0, peFadeLoss = 0;
let ceContinueWin = 0, ceContinueLoss = 0;

// Track gap sizes for ABOVE_PDH days
const abovePDH_gaps = [];
const abovePDH_outcomes = [];

for (let i = 1; i < dates.length; i++) {
  const prev = days[dates[i-1]];
  const today = days[dates[i]];
  if (!prev || !today || today.length < 4) continue;

  const pdh = Math.max(...prev.map(c => c.high));
  const pdl = Math.min(...prev.map(c => c.low));
  const open = today[0].open;

  if (open - pdh < 120) continue; // Only ABOVE_PDH (>120 pts above)
  abovePDH++;

  const dayHigh = Math.max(...today.map(c => c.high));
  const dayLow = Math.min(...today.map(c => c.low));
  const close = today[today.length-1].close;

  const gap = open - pdh;
  const downFromOpen = open - dayLow;
  const upFromOpen = dayHigh - open;
  const netMove = close - open; // +ve = closed higher than open, -ve = reversed

  abovePDH_gaps.push(gap);
  abovePDH_outcomes.push({ date: dates[i], gap: Math.round(gap), netMove: Math.round(netMove), downFromOpen: Math.round(downFromOpen), upFromOpen: Math.round(upFromOpen) });

  // PE (fade): win if price came down 150+ pts from open
  const peFadeHit = downFromOpen >= 150;
  if (peFadeHit) peFadeWin++; else peFadeLoss++;

  // CE (continuation): win if price went up 150+ pts from open
  const ceContinueHit = upFromOpen >= 150;
  if (ceContinueHit) ceContinueWin++; else ceContinueLoss++;
}

console.log('='.repeat(60));
console.log('  ABOVE_PDH ANALYSIS (open > PDH + 120)  — 5yr data');
console.log('='.repeat(60));
console.log(`Total ABOVE_PDH days : ${abovePDH}`);
console.log('');
console.log('PE (fade/reversal) — price dropped 150+ pts from open:');
console.log(`  Win: ${peFadeWin}  |  Loss: ${peFadeLoss}  |  WR: ${(peFadeWin/abovePDH*100).toFixed(1)}%`);
console.log('');
console.log('CE (continuation) — price rose 150+ pts from open:');
console.log(`  Win: ${ceContinueWin}  |  Loss: ${ceContinueLoss}  |  WR: ${(ceContinueWin/abovePDH*100).toFixed(1)}%`);

// Net direction: how many days closed above vs below open
const closedUp = abovePDH_outcomes.filter(o => o.netMove > 0).length;
const closedDown = abovePDH_outcomes.filter(o => o.netMove < 0).length;
console.log('');
console.log('Day close vs open direction:');
console.log(`  Closed ABOVE open (continued up) : ${closedUp} (${(closedUp/abovePDH*100).toFixed(1)}%)`);
console.log(`  Closed BELOW open (reversed)     : ${closedDown} (${(closedDown/abovePDH*100).toFixed(1)}%)`);

// Average gap size
const avgGap = abovePDH_gaps.reduce((a,b)=>a+b,0)/abovePDH;
console.log('');
console.log(`Avg gap above PDH : ${avgGap.toFixed(0)} pts`);
console.log(`Min gap           : ${Math.min(...abovePDH_gaps).toFixed(0)} pts`);
console.log(`Max gap           : ${Math.max(...abovePDH_gaps).toFixed(0)} pts`);

// Show gap buckets: 120-200, 200-400, 400+
const small = abovePDH_outcomes.filter(o => o.gap < 200);
const mid   = abovePDH_outcomes.filter(o => o.gap >= 200 && o.gap < 400);
const big   = abovePDH_outcomes.filter(o => o.gap >= 400);
const fadeWR = (arr) => (arr.filter(o => o.downFromOpen >= 150).length / arr.length * 100).toFixed(1);
const contWR = (arr) => (arr.filter(o => o.upFromOpen >= 150).length / arr.length * 100).toFixed(1);

console.log('');
console.log('By gap size:');
console.log(`  120-200 pts  (${small.length} days): PE fade WR ${fadeWR(small)}%  |  CE cont WR ${contWR(small)}%`);
console.log(`  200-400 pts  (${mid.length} days):   PE fade WR ${fadeWR(mid)}%  |  CE cont WR ${contWR(mid)}%`);
console.log(`  400+ pts     (${big.length} days):   PE fade WR ${fadeWR(big)}%  |  CE cont WR ${contWR(big)}%`);
console.log('='.repeat(60));

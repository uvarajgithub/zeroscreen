// Analyse all TRAIL exits: locked (trailStop) vs actual candle close
const fs = require('fs');
const { execSync } = require('child_process');

let btCode = fs.readFileSync('backtest_bhav.js', 'utf8');

// Inject logging right after "const lockedPL = trailStop * PTS_PER_RS;"
const needle = 'const lockedPL = trailStop * PTS_PER_RS;';
const inject = `
      const _actualClose = closePts;
      if (exitType === 'TRAIL') {
        process.stderr.write('T:' + trailStop.toFixed(1) + ':' + closePts.toFixed(1) + ':' + peakPts.toFixed(1) + '\\n');
      }`;

if (!btCode.includes(needle)) {
  console.error('ERROR: needle not found in backtest_bhav.js');
  process.exit(1);
}

btCode = btCode.replace(needle, needle + inject);
console.log('Patch applied:', btCode.includes('process.stderr.write'));

fs.writeFileSync('/tmp/bt_trail2.js', btCode);

// Run and capture stderr (TRAIL lines) while suppressing stdout
const raw = execSync('node /tmp/bt_trail2.js cache/banknifty_5yr.json 2>&1 1>/dev/null').toString();
const lines = raw.split('\n').filter(l => l.startsWith('T:'));
console.log('Total TRAIL exits:', lines.length);

let totalDiff = 0;
const worst = [];

for (const l of lines) {
  const parts = l.split(':');
  const trail  = parseFloat(parts[1]);
  const actual = parseFloat(parts[2]);
  const peak   = parseFloat(parts[3]);
  const diff   = actual - trail; // negative = actual worse (less profit)
  totalDiff += diff;
  if (diff < -5) worst.push({ trail, actual, peak, diff });
}

worst.sort((a, b) => a.diff - b.diff);

console.log('\nCases where actual close < trail level by >5pts (top 30):');
console.log('TrailPts | ActualPts | Diff | PeakPts');
console.log('-----------------------------------------------');
for (const t of worst.slice(0, 30)) {
  console.log(`${t.trail} | ${t.actual} | ${t.diff} | ${t.peak}`);
}

console.log('\n=== SUMMARY ===');
console.log('Total TRAIL exits:', lines.length);
console.log('Cases actual < trail by >5pts:', worst.length);
console.log('Total diff ALL exits (pts):', Math.round(totalDiff * 10) / 10);
console.log('Total diff ALL exits (Rs):', Math.round(totalDiff * 15));
console.log('(negative = profits overstated in backtest)');

fs.unlinkSync('/tmp/bt_trail2.js');

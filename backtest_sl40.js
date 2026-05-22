// Run exact AMINA T100 backtest with SL=40 vs SL=60
// SL=40 is equivalent to PREM_SL=20 with delta=0.5

const fs = require('fs');
const src = fs.readFileSync('/home/ubuntu/trading-bot/backtest_t100_compare.js', 'utf8');

// Extract everything up to "const variants = [" line
const cutAt = src.indexOf('\n// ── Run 4 variants');
const setup = src.slice(0, cutAt);
eval(setup);

const fmt  = n => (n >= 0 ? '+' : '−') + '₹' + (Math.abs(n) / 100000).toFixed(2) + 'L';
const fmtD = n => (n >= 0 ? '+' : '−') + '₹' + Math.abs(n).toLocaleString('en-IN');

const variants = [
  { sl: 60, exit: 'sl_level',    label: 'SL=60  exit@SL-level    [backtest ideal / ₹19.25L ref]' },
  { sl: 60, exit: 'candle_close',label: 'SL=60  exit@CandleClose  [live reality, current bot]   ' },
  { sl: 40, exit: 'sl_level',    label: 'SL=40  exit@SL-level    [PREM_SL=20 ideal]             ' },
  { sl: 40, exit: 'candle_close',label: 'SL=40  exit@CandleClose  [PREM_SL=20 live reality]     ' },
];

console.log('\n══════════════════════════════════════════════════════════════════════════');
console.log(' AMINA T100  —  SL=60 vs SL=40 (PREM_SL=20 equivalent)');
console.log(' Dataset: Apr 2021 → Apr 2026  |  qty=30  |  trail 100pts behind peak');
console.log('══════════════════════════════════════════════════════════════════════════');
console.log(
  ' Variant'.padEnd(56),
  'Net ₹'.padStart(12),
  'Win%'.padStart(7),
  'Avg/Day'.padStart(9),
  'MaxDD'.padStart(10)
);
console.log(' ' + '─'.repeat(95));

const results = [];
for (const v of variants) {
  const r = runBacktest(v.sl, v.exit);
  results.push({ ...v, ...r });
  const winPct = r.winPct + '%';
  console.log(
    (' ' + v.label).padEnd(56),
    fmt(r.netRs).padStart(12),
    winPct.padStart(7),
    fmtD(r.avgDay).padStart(9),
    ('−₹' + (r.maxDDRs / 100000).toFixed(2) + 'L').padStart(10)
  );
}

console.log(' ' + '─'.repeat(95));

// Key comparison
const [sl60ideal, sl60live, sl40ideal, sl40live] = results;
const diff = sl40live.netRs - sl60live.netRs;
const sign = diff >= 0 ? 'BETTER' : 'WORSE';

console.log(`\n  Changing to SL=40 (PREM_SL=20): ${diff >= 0 ? '+' : ''}₹${(diff/100000).toFixed(2)}L vs SL=60 live reality  →  ${sign}`);
console.log(`  Slippage cost SL=60: ₹${((sl60ideal.netRs - sl60live.netRs)/100000).toFixed(2)}L over 5 yrs  (exits 60 pts late each time)`);
console.log(`  Slippage cost SL=40: ₹${((sl40ideal.netRs - sl40live.netRs)/100000).toFixed(2)}L over 5 yrs  (exits 40 pts late — smaller gap)\n`);

// Year by year
const yrs = [...new Set(results.flatMap(r => Object.keys(r.yearly)))].sort();
console.log('  Year-by-year net ₹:');
console.log('  ' + 'Year'.padEnd(6) + 'SL60-live'.padStart(12) + 'SL40-live'.padStart(12) + 'Diff'.padStart(10));
console.log('  ' + '─'.repeat(42));
let totalDiff = 0;
for (const yr of yrs) {
  const v60 = Math.round((sl60live.yearly[yr] || 0) * RS_PER_PT);
  const v40 = Math.round((sl40live.yearly[yr] || 0) * RS_PER_PT);
  const d   = v40 - v60;
  totalDiff += d;
  const s60 = (v60 >= 0 ? '+₹' : '−₹') + Math.abs(v60).toLocaleString('en-IN');
  const s40 = (v40 >= 0 ? '+₹' : '−₹') + Math.abs(v40).toLocaleString('en-IN');
  const sd  = (d  >= 0 ? '+₹' : '−₹') + Math.abs(d).toLocaleString('en-IN');
  console.log('  ' + yr.padEnd(6) + s60.padStart(12) + s40.padStart(12) + sd.padStart(10));
}
console.log('  ' + '─'.repeat(42));
const tots60 = fmt(sl60live.netRs);
const tots40 = fmt(sl40live.netRs);
const totd   = (totalDiff >= 0 ? '+₹' : '−₹') + Math.abs(totalDiff).toLocaleString('en-IN');
console.log('  ' + 'TOTAL'.padEnd(6) + tots60.padStart(12) + tots40.padStart(12) + totd.padStart(10));
console.log();

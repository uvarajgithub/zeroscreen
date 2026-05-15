const n = require('./5yr_clean_result.json');
const o = require('./5year-backtest-result.json');

// New strategy: year-wise from monthly
const yearly = {};
for (const [m, v] of Object.entries(n.monthly)) {
  const y = m.slice(0, 4);
  if (!yearly[y]) yearly[y] = { pts: 0, rs: 0, days: 0, win: 0, loss: 0 };
  yearly[y].pts  += v.pts;
  yearly[y].rs   += v.pts * 15;
  yearly[y].days += v.days;
  yearly[y].win  += v.profit;
  yearly[y].loss += v.loss;
}

// Old strategy: year-wise from monthly (bodyBreakout)
const oyearly = {};
for (const [m, v] of Object.entries(o.monthly)) {
  const y = m.slice(0, 4);
  if (!oyearly[y]) oyearly[y] = 0;
  oyearly[y] += v.bbTotal;
}

console.log('\n=== YEAR-WISE COMPARISON: New Strategy vs Old (BodyBreakout) ===\n');
console.log('Year  Days  Win  Loss  WinRate   New-Rs        Old-Rs      Difference   Cumul-New');
console.log('─'.repeat(90));

let cumNew = 0, cumOld = 0;
for (const y of Object.keys(yearly).sort()) {
  const nRs  = yearly[y].rs;
  const oRs  = (oyearly[y] || 0) * 15;
  const diff = nRs - oRs;
  cumNew    += nRs;
  cumOld    += oRs;
  const wr   = (yearly[y].win / (yearly[y].win + yearly[y].loss) * 100).toFixed(0);

  console.log(
    `${y}  ${String(yearly[y].days).padStart(3)}  ` +
    `${String(yearly[y].win).padStart(3)}  ${String(yearly[y].loss).padStart(3)}  ` +
    `${wr.padStart(3)}%     ` +
    `Rs${(nRs >= 0 ? '+' : '') + nRs.toFixed(0).padStart(8)}   ` +
    `Rs${(oRs >= 0 ? '+' : '') + oRs.toFixed(0).padStart(8)}   ` +
    `${(diff >= 0 ? '+' : '') + diff.toFixed(0).padStart(8)}   ` +
    `Rs${cumNew.toFixed(0).padStart(9)}`
  );
}

console.log('─'.repeat(90));
const totalDiff = cumNew - cumOld;
console.log(`TOTAL ${String(n.tradingDays).padStart(4)}                    Rs${cumNew.toFixed(0).padStart(9)}   Rs${cumOld.toFixed(0).padStart(9)}   ${(totalDiff >= 0 ? '+' : '') + totalDiff.toFixed(0).padStart(8)}`);

console.log('\n=== SUMMARY ===');
console.log(`  New strategy 5yr profit : Rs ${cumNew.toFixed(0)}`);
console.log(`  Old strategy 5yr profit : Rs ${cumOld.toFixed(0)}`);
console.log(`  New is better by        : Rs ${totalDiff.toFixed(0)} (${(totalDiff / Math.abs(cumOld) * 100).toFixed(0)}% more)`);

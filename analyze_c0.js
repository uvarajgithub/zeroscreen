const fs = require('fs');
const data = JSON.parse(fs.readFileSync('5year-backtest-result.json', 'utf-8'));
console.log('Keys:', Object.keys(data));
if (data.trades && data.trades.length > 0) {
  console.log('Total trades:', data.trades.length);
  console.log('Sample trade:', JSON.stringify(data.trades[0]));

  const c0only = ['inside_c0_breaks_above_pdh','inside_c0_breaks_below_pdl',
    'inside_c0_momentum','inside_c0_moderate_c1_confirmed','inside_c0_momentum_no_reversal'];

  let c0count=0, c0pnl=0, lateCount=0, latePnl=0;
  const reasonMap = {};
  data.trades.forEach(t => {
    reasonMap[t.reason] = (reasonMap[t.reason]||0) + 1;
    if (c0only.includes(t.reason)) { c0count++; c0pnl += t.pnl||0; }
    else { lateCount++; latePnl += t.pnl||0; }
  });
  console.log('\nC0-only trades:', c0count, '| PnL:', c0pnl.toFixed(0));
  console.log('C1+ trades:', lateCount, '| PnL:', latePnl.toFixed(0));
  console.log('\nReason breakdown:');
  Object.entries(reasonMap).sort((a,b)=>b[1]-a[1]).forEach(([r,n]) => console.log(' ', n, r));
} else {
  console.log('No trades array. Keys found:', Object.keys(data));
  if (data.daily) console.log('Sample daily:', JSON.stringify(data.daily[0]));
}

const d = require(process.argv[2]);
console.log(JSON.stringify({
  days: d.days,
  totalPts: d.totalPts,
  totalRs: d.totalRs,
  avgPts: d.avgPts,
  green: d.green,
  red: d.red,
  trades: d.trades,
  rule: d.rule,
  buffer: d.buffer,
  markCandle: d.markCandle,
}, null, 2));

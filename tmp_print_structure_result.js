const d = require("/tmp/structure_trail_2026-07-08.json");
console.log(JSON.stringify({
  day: d.day,
  old: { totalPts: d.old.totalPts, totalRs: d.old.totalRs, trades: d.old.trades, log: d.old.log },
  structure: { totalPts: d.structure.totalPts, totalRs: d.structure.totalRs, trades: d.structure.trades, log: d.structure.log },
}, null, 2));

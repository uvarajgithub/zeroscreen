const data = require(process.argv[2] || "./research-banknifty-15m-1y.json");
const counts = {};
const short = [];
for (const day of data.sessions || []) {
  const n = (data.days[day] || []).length;
  counts[n] = (counts[n] || 0) + 1;
  if (n < 20) short.push([day, n]);
}
console.log(JSON.stringify({
  sessions: data.sessionCount,
  candles: data.candleCount,
  counts,
  short,
}, null, 2));

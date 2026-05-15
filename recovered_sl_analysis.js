const fs = require('fs');
const data = JSON.parse(fs.readFileSync('candles_detail.json'));
const days = data.days;

// 6 ONE-SIDE recovered days
const recovered = [
  { date:'2026-04-07', sig:'CE', entryTime:'04:45' },
  { date:'2026-04-09', sig:'PE', entryTime:'04:15' },
  { date:'2026-04-10', sig:'CE', entryTime:'04:15' },
  { date:'2026-04-16', sig:'PE', entryTime:'04:15' },
  { date:'2026-04-20', sig:'PE', entryTime:'07:45' },
  { date:'2026-05-04', sig:'PE', entryTime:'05:15' },
];

console.log('\n=== 6 ONE-SIDE Recovered Days — Candle-by-Candle Adverse vs Favorable ===\n');

for (const { date, sig, entryTime } of recovered) {
  const candles = days[date];
  const entryIdx = candles.findIndex(c => c.time === entryTime);
  const entryPx = candles[entryIdx].close;

  let maxFav = 0, maxFavTime = null;
  let maxAdvBeforeFav = 0, maxAdvBeforeFavTime = null;
  let maxAdvTotal = 0, maxAdvTotalTime = null;

  // Track candle by candle
  const moves = [];
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const move = sig === 'CE' ? c.close - entryPx : entryPx - c.close;
    moves.push({ time: c.time, move });
    if (move > maxFav) { maxFav = move; maxFavTime = c.time; }
    if (move < -maxAdvTotal) { maxAdvTotal = -move; maxAdvTotalTime = c.time; }
  }

  // Find max adverse that occurs BEFORE max favorable candle
  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const move = sig === 'CE' ? c.close - entryPx : entryPx - c.close;
    if (c.time === maxFavTime) break; // stop at max fav candle
    if (move < -maxAdvBeforeFav) { maxAdvBeforeFav = -move; maxAdvBeforeFavTime = c.time; }
  }

  console.log(`${date}  ${sig}  Entry:${entryPx.toFixed(0)} @${entryTime}`);
  console.log(`  MaxFav        : +${maxFav.toFixed(0)} @${maxFavTime}`);
  console.log(`  MaxAdv BEFORE fav: -${maxAdvBeforeFav.toFixed(0)} ${maxAdvBeforeFavTime ? '@'+maxAdvBeforeFavTime : '(none)'}`);
  console.log(`  MaxAdv TOTAL  : -${maxAdvTotal.toFixed(0)} @${maxAdvTotalTime}`);
  console.log(`  SL needed to survive (reach max fav): > ${maxAdvBeforeFav.toFixed(0)} pts`);
  console.log(`  Move sequence (every candle):`);

  // Print candle moves
  moves.forEach(m => {
    const bar = m.move >= 0 ? '+' : '';
    console.log(`    ${m.time}  ${bar}${m.move.toFixed(0)}`);
  });
  console.log();
}

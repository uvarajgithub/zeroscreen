const fs = require('fs');
const data = JSON.parse(fs.readFileSync('candles_detail.json'));
const days = data.days;

// From big_adverse_breakdown.js results — 18 big adverse days with entry info
const bigAdverse = [
  { date:'2026-04-01', sig:'PE', entryTime:'04:45' },
  { date:'2026-04-02', sig:'PE', entryTime:'05:45' },
  { date:'2026-04-07', sig:'CE', entryTime:'04:45' },
  { date:'2026-04-09', sig:'PE', entryTime:'04:15' },
  { date:'2026-04-10', sig:'CE', entryTime:'04:15' },
  { date:'2026-04-15', sig:'PE', entryTime:'05:30' },
  { date:'2026-04-16', sig:'PE', entryTime:'04:15' },
  { date:'2026-04-20', sig:'PE', entryTime:'07:45' },
  { date:'2026-04-22', sig:'CE', entryTime:'05:15' },
  { date:'2026-04-24', sig:'PE', entryTime:'04:15' },
  { date:'2026-04-29', sig:'CE', entryTime:'04:30' },
  { date:'2026-04-30', sig:'PE', entryTime:'04:45' },
  { date:'2026-05-04', sig:'PE', entryTime:'05:15' },
  { date:'2026-05-05', sig:'CE', entryTime:'07:30' },
  { date:'2026-05-06', sig:'PE', entryTime:'04:30' },
  { date:'2026-05-07', sig:'PE', entryTime:'05:45' },
  { date:'2026-05-11', sig:'PE', entryTime:'04:15' },
  { date:'2026-05-13', sig:'CE', entryTime:'04:45' },
];

const SL = 50;

console.log('\n=== 50pt SL Applied on 18 BIG ADVERSE Days (candle close basis) ===\n');
console.log('Date         Sig  EntryPx  EntryTime  SLHit?  ExitTime  ExitPx   P&L   FinalClose  DayType');
console.log('─'.repeat(100));

let slHitCount = 0;
let noSlCount = 0;

for (const { date, sig, entryTime } of bigAdverse) {
  const candles = days[date];
  if (!candles) { console.log(`${date} — no candle data`); continue; }

  // Find entry candle index (the candle AT entryTime — that's the signal candle)
  const entryIdx = candles.findIndex(c => c.time === entryTime);
  if (entryIdx < 0) { console.log(`${date} — entry candle not found`); continue; }

  const entryCandle = candles[entryIdx];
  const entryPx = entryCandle.close; // entry at close of signal candle

  const slLevel = sig === 'CE' ? entryPx - SL : entryPx + SL;

  // Walk candles AFTER entry candle
  let slHit = false;
  let exitTime = null;
  let exitPx = null;
  let pnl = null;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const move = sig === 'CE' ? c.close - entryPx : entryPx - c.close;

    if (move <= -SL) {
      slHit = true;
      exitTime = c.time;
      exitPx = c.close;
      pnl = -SL;
      break;
    }
  }

  const lastCandle = candles[candles.length - 1];
  const finalClose = lastCandle.close;
  const finalPnl = sig === 'CE' ? finalClose - entryPx : entryPx - finalClose;

  if (!slHit) {
    exitTime = lastCandle.time;
    exitPx = finalClose;
    pnl = finalPnl;
    noSlCount++;
  } else {
    slHitCount++;
  }

  const dayType = slHit
    ? (finalPnl > 0 ? 'SL-HIT (mkt recovered)' : 'SL-HIT (mkt reversed)')
    : 'NO SL (ran free)';

  const pnlStr = pnl >= 0 ? `+${pnl.toFixed(0)}` : `${pnl.toFixed(0)}`;
  const finalStr = finalPnl >= 0 ? `+${finalPnl.toFixed(0)}` : `${finalPnl.toFixed(0)}`;

  console.log(
    `${date}  ${sig}  ${entryPx.toFixed(0)}     @${entryTime}      ` +
    `${slHit ? 'YES' : 'NO '}    ${exitTime}   ${exitPx ? exitPx.toFixed(0) : '     '}  ${pnlStr.padStart(5)}  ${finalStr.padStart(7)}     ${dayType}`
  );
}

console.log('─'.repeat(100));
console.log(`  SL HIT    : ${slHitCount} days`);
console.log(`  NO SL HIT : ${noSlCount} days (held to close)`);
console.log(`  Total     : 18 days`);

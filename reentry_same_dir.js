'use strict';
// Simulation: Entry → 50pt SL → Re-entry SAME direction (hold to close)
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const SL1 = 50;

function findRollingEntry(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i];
    const cb = cs[i + 1];
    if (ca.h > 11 || (ca.h === 11 && ca.m >= 30)) break;

    let signal = null, breakLevel = null;

    if (ca.bull === cb.bull) {
      signal     = ca.bull ? 'CE' : 'PE';
      breakLevel = signal === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      signal     = cb.bull ? 'CE' : 'PE';
      breakLevel = signal === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else {
      continue;
    }

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (c.h > 15 || (c.h === 15 && c.m >= 15)) break;
      if (signal === 'CE' && c.close > breakLevel) return { signal, entryPx: c.close, entryTime: c.time, entryIdx: j };
      if (signal === 'PE' && c.close < breakLevel) return { signal, entryPx: c.close, entryTime: c.time, entryIdx: j };
    }
  }
  return null;
}

function move(sig, entryPx, px) {
  return sig === 'CE' ? px - entryPx : entryPx - px;
}

console.log('\n=== SIMULATION: Entry → 50pt SL → Re-entry SAME DIRECTION (hold to close) ===\n');

let totalT1 = 0;
let totalRe = 0;

console.log('Date         Sig  EntryPx@T    T1-PnL  SLHit@T    ReEntryPx  Re-PnL(close)  Combined');
console.log('─'.repeat(95));

for (const [date, cs] of days) {
  const e = findRollingEntry(cs);
  if (!e) { console.log(`${date}  -- NO ENTRY FOUND`); continue; }

  const { signal, entryPx, entryTime, entryIdx } = e;
  const lastClose = cs[cs.length - 1].close;

  // Walk after entry — check 50pt SL
  let slHit = false;
  let slExitIdx = null, slExitPx = null, slExitTime = null;

  for (let i = entryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (move(signal, entryPx, c.close) <= -SL1) {
      slHit = true;
      slExitIdx  = i;
      slExitPx   = c.close;
      slExitTime = c.time;
      break;
    }
  }

  const t1Pnl = slHit ? -SL1 : move(signal, entryPx, lastClose);
  totalT1 += t1Pnl;

  if (!slHit) {
    const t1Str = t1Pnl >= 0 ? `+${t1Pnl.toFixed(0)}` : `${t1Pnl.toFixed(0)}`;
    console.log(`${date}  ${signal}  ${entryPx.toFixed(0)}@${entryTime}  ${t1Str.padStart(6)}  NO SL`);
    continue;
  }

  // Re-entry SAME direction at SL exit candle close
  const reEntryPx  = slExitPx;
  const rePnl      = move(signal, reEntryPx, lastClose); // hold to close
  totalRe += rePnl;

  const t1Str   = `-50`;
  const reStr   = rePnl >= 0 ? `+${rePnl.toFixed(0)}` : `${rePnl.toFixed(0)}`;
  const combPnl = -50 + rePnl;
  const combStr = combPnl >= 0 ? `+${combPnl.toFixed(0)}` : `${combPnl.toFixed(0)}`;

  console.log(
    `${date}  ${signal}  ${entryPx.toFixed(0)}@${entryTime}  ${t1Str.padStart(6)}  @${slExitTime}  ${signal}  ${reEntryPx.toFixed(0)}       ${reStr.padStart(7)}        ${combStr.padStart(7)}`
  );
}

console.log('─'.repeat(95));
const total = totalT1 + totalRe;
console.log(`\n  Trade1 total P&L        : ${totalT1 >= 0 ? '+' : ''}${totalT1.toFixed(0)} pts`);
console.log(`  Re-entry (same dir) P&L : ${totalRe >= 0 ? '+' : ''}${totalRe.toFixed(0)} pts`);
console.log(`  TOTAL combined          : ${total >= 0 ? '+' : ''}${total.toFixed(0)} pts`);
console.log(`  Rs (×15)                : Rs ${(total * 15).toFixed(0)}`);

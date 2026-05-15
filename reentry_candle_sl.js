'use strict';
// Full simulation: Entry → 50pt SL → Re-entry opposite with SL = breakout candle low/high
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
      if (signal === 'CE' && c.close > breakLevel) return { signal, entryPx: c.close, entryTime: c.time, entryIdx: j, entryCandle: c };
      if (signal === 'PE' && c.close < breakLevel) return { signal, entryPx: c.close, entryTime: c.time, entryIdx: j, entryCandle: c };
    }
  }
  return null;
}

function move(sig, entryPx, px) {
  return sig === 'CE' ? px - entryPx : entryPx - px;
}

function oppSig(sig) { return sig === 'CE' ? 'PE' : 'CE'; }

console.log('\n=== FULL SIMULATION: Entry → 50pt SL → Re-entry with CANDLE SL (breakout candle low/high) ===\n');

let totalTrade1 = 0;
let totalReCandle = 0;

console.log('Date         Sig  EntryPx@T  T1-PnL  SLHit@T    ReDir  ReEntryPx  CandleSL  SL-pts  Re-PnL  Combined');
console.log('─'.repeat(110));

for (const [date, cs] of days) {
  const e = findRollingEntry(cs);
  if (!e) {
    console.log(`${date}  -- NO ENTRY FOUND`);
    continue;
  }

  const { signal, entryPx, entryTime, entryIdx } = e;
  const lastClose = cs[cs.length - 1].close;

  // Walk after entry — check 50pt SL
  let slHit = false;
  let slExitIdx = null, slExitPx = null, slExitTime = null, slExitCandle = null;

  for (let i = entryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (move(signal, entryPx, c.close) <= -SL1) {
      slHit = true;
      slExitIdx    = i;
      slExitPx     = c.close;
      slExitTime   = c.time;
      slExitCandle = c;
      break;
    }
  }

  const t1Pnl = slHit ? -SL1 : move(signal, entryPx, lastClose);
  totalTrade1 += t1Pnl;

  if (!slHit) {
    const t1Str = t1Pnl >= 0 ? `+${t1Pnl.toFixed(0)}` : `${t1Pnl.toFixed(0)}`;
    console.log(
      `${date}  ${signal}  ${entryPx.toFixed(0)}@${entryTime}  ${t1Str.padStart(6)}  NO SL`
    );
    continue;
  }

  // Re-entry opposite at SL exit candle close
  const reSig      = oppSig(signal);
  const reEntryPx  = slExitPx;
  const reEntryIdx = slExitIdx;
  const reCandle   = slExitCandle;

  // Candle SL: for CE re-entry → SL = reCandle.low; for PE re-entry → SL = reCandle.high
  const candleSlLevel = reSig === 'CE' ? reCandle.low : reCandle.high;
  const candleSlPts   = Math.abs(reEntryPx - candleSlLevel);

  // Walk after re-entry — exit if close crosses candleSlLevel
  let reSlHit = false;
  let rePnl = move(reSig, reEntryPx, lastClose); // default: hold to close

  for (let i = reEntryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const reMv = move(reSig, reEntryPx, c.close);
    // SL: price crosses candle SL level
    if (reSig === 'CE' && c.close < candleSlLevel) { rePnl = c.close - reEntryPx; reSlHit = true; break; }
    if (reSig === 'PE' && c.close > candleSlLevel) { rePnl = reEntryPx - c.close; reSlHit = true; break; }
  }

  totalReCandle += rePnl;

  const t1Str  = `-50`;
  const reStr  = rePnl >= 0 ? `+${rePnl.toFixed(0)}` : `${rePnl.toFixed(0)}`;
  const combPnl = -50 + rePnl;
  const combStr = combPnl >= 0 ? `+${combPnl.toFixed(0)}` : `${combPnl.toFixed(0)}`;
  const slNote  = reSlHit ? `SL-hit` : `to-close`;

  console.log(
    `${date}  ${signal}  ${entryPx.toFixed(0)}@${entryTime}  ${t1Str.padStart(6)}  @${slExitTime}  ${reSig}  ${reEntryPx.toFixed(0)}     ${candleSlLevel.toFixed(0)}  (${candleSlPts.toFixed(0)}pts)  ${reStr.padStart(7)} (${slNote})  ${combStr.padStart(7)}`
  );
}

console.log('─'.repeat(110));
const total = totalTrade1 + totalReCandle;
console.log(`\n  Trade1 total P&L        : ${totalTrade1 >= 0 ? '+' : ''}${totalTrade1.toFixed(0)} pts`);
console.log(`  Re-entry candle SL P&L  : ${totalReCandle >= 0 ? '+' : ''}${totalReCandle.toFixed(0)} pts`);
console.log(`  TOTAL combined          : ${total >= 0 ? '+' : ''}${total.toFixed(0)} pts`);
console.log(`  Rs (×15)                : Rs ${(total * 15).toFixed(0)}`);

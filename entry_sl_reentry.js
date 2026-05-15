'use strict';
// Full simulation: Entry → 50pt SL → Re-entry opposite (with SL vs without SL)
const data = require('./candles_detail.json');
const days = Object.entries(data.days);

const SL1 = 50; // first entry SL

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

function oppSig(sig) { return sig === 'CE' ? 'PE' : 'CE'; }

console.log('\n=== FULL SIMULATION: Entry → 50pt SL → Re-entry Opposite ===');
console.log('=== Re-entry: NO SL (hold to close) vs WITH 50pt SL        ===\n');

let totalTrade1 = 0;
let totalReNoSL = 0;
let totalReWithSL = 0;
let slHitDays = 0, noSlDays = 0;

console.log('Date         Sig  T1-Entry  T1-PnL  SLHit?  ReEntry  ReDir  Re-NoSL  Re-WithSL');
console.log('─'.repeat(95));

for (const [date, cs] of days) {
  const e = findRollingEntry(cs);
  if (!e) {
    console.log(`${date}  -- NO ENTRY FOUND`);
    continue;
  }

  const { signal, entryPx, entryTime, entryIdx } = e;
  const lastClose = cs[cs.length - 1].close;

  // Walk candles after entry — check 50pt SL
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
  totalTrade1 += t1Pnl;

  if (!slHit) {
    noSlDays++;
    const t1Str = t1Pnl >= 0 ? `+${t1Pnl.toFixed(0)}` : `${t1Pnl.toFixed(0)}`;
    console.log(
      `${date}  ${signal}  ${entryPx.toFixed(0)}@${entryTime}  ${t1Str.padStart(6)}  NO SL   --       --     --       --`
    );
    continue;
  }

  // SL hit → re-enter opposite at same candle close
  slHitDays++;
  const reSig   = oppSig(signal);
  const reEntryPx = slExitPx;
  const reEntryIdx = slExitIdx;

  // Re-entry NO SL → hold to EOD
  const reNoSlPnl = move(reSig, reEntryPx, lastClose);
  totalReNoSL += reNoSlPnl;

  // Re-entry WITH 50pt SL → exit at -50 or hold to EOD
  let reSlPnl = reNoSlPnl; // default: held to close
  for (let i = reEntryIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (move(reSig, reEntryPx, c.close) <= -SL1) {
      reSlPnl = -SL1;
      break;
    }
  }
  totalReWithSL += reSlPnl;

  const t1Str    = `-50`;
  const reNoStr  = reNoSlPnl  >= 0 ? `+${reNoSlPnl.toFixed(0)}`  : `${reNoSlPnl.toFixed(0)}`;
  const reSlStr  = reSlPnl    >= 0 ? `+${reSlPnl.toFixed(0)}`    : `${reSlPnl.toFixed(0)}`;

  console.log(
    `${date}  ${signal}  ${entryPx.toFixed(0)}@${entryTime}  ${t1Str.padStart(6)}  @${slExitTime}  ${reEntryPx.toFixed(0)}  ${reSig}  ${reNoStr.padStart(7)}  ${reSlStr.padStart(9)}`
  );
}

console.log('─'.repeat(95));
console.log(`\n  Days SL hit (re-entry taken) : ${slHitDays}`);
console.log(`  Days no SL (held to close)   : ${noSlDays}`);
console.log(`\n  Trade1 total P&L   : ${totalTrade1 >= 0 ? '+' : ''}${totalTrade1.toFixed(0)} pts`);
console.log(`\n  === SCENARIO A: T1 + Re-entry NO SL ===`);
const scenA = totalTrade1 + totalReNoSL;
console.log(`  Re-entry NoSL P&L  : ${totalReNoSL >= 0 ? '+' : ''}${totalReNoSL.toFixed(0)} pts`);
console.log(`  TOTAL combined     : ${scenA >= 0 ? '+' : ''}${scenA.toFixed(0)} pts`);
console.log(`\n  === SCENARIO B: T1 + Re-entry WITH 50pt SL ===`);
const scenB = totalTrade1 + totalReWithSL;
console.log(`  Re-entry WithSL P&L: ${totalReWithSL >= 0 ? '+' : ''}${totalReWithSL.toFixed(0)} pts`);
console.log(`  TOTAL combined     : ${scenB >= 0 ? '+' : ''}${scenB.toFixed(0)} pts`);
console.log(`\n  Rs per pt = 15`);
console.log(`  Scenario A Rs      : Rs ${(scenA * 15).toFixed(0)}`);
console.log(`  Scenario B Rs      : Rs ${(scenB * 15).toFixed(0)}`);

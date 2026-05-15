'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);
const SL1 = 50, SL_RE = 100;

function findEntry(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    if (ca.h > 11 || (ca.h === 11 && ca.m >= 30)) break;
    let sig = null, bl = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE';
      bl  = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
    } else continue;
    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (c.h > 15 || (c.h === 15 && c.m >= 15)) break;
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, t: c.time, idx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, t: c.time, idx: j };
    }
  }
  return null;
}

const mv  = (s, e, p) => s === 'CE' ? p - e : e - p;
const opp = s => s === 'CE' ? 'PE' : 'CE';

let t1Total = 0, reTotal = 0;

console.log('\n=== Entry(50SL) → Re-entry OPPOSITE with 100pt SL ===\n');
console.log('Date         Sig  T1-PnL  SLHit@T   ReDir  Re-PnL   Combined');
console.log('─'.repeat(70));

for (const [date, cs] of days) {
  const e = findEntry(cs);
  if (!e) { console.log(`${date}  NO ENTRY`); continue; }

  const last = cs[cs.length - 1].close;

  // T1: walk with 50pt SL
  let slHit = false, sIdx = null, sPx = null, sT = null;
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL1) { slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
  }

  const t1p = slHit ? -SL1 : mv(e.sig, e.px, last);
  t1Total += t1p;

  if (!slHit) {
    console.log(`${date}  ${e.sig}  ${(t1p >= 0 ? '+' : '') + t1p.toFixed(0).padStart(5)}  NO SL`);
    continue;
  }

  // Re-entry opposite with 100pt SL
  const rs = opp(e.sig);
  let rep = mv(rs, sPx, last); // default hold to close
  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(rs, sPx, c.close) <= -SL_RE) { rep = -SL_RE; break; }
  }
  reTotal += rep;

  const comb    = -50 + rep;
  const repStr  = (rep  >= 0 ? '+' : '') + rep.toFixed(0);
  const combStr = (comb >= 0 ? '+' : '') + comb.toFixed(0);
  console.log(`${date}  ${e.sig}    -50  @${sT}   ${rs}   ${repStr.padStart(6)}   ${combStr.padStart(7)}`);
}

console.log('─'.repeat(70));
const tot = t1Total + reTotal;
console.log(`\n  T1 P&L            : ${(t1Total >= 0 ? '+' : '') + t1Total.toFixed(0)} pts`);
console.log(`  Re-entry(100SL)   : ${(reTotal >= 0 ? '+' : '') + reTotal.toFixed(0)} pts`);
console.log(`  TOTAL             : ${(tot >= 0 ? '+' : '') + tot.toFixed(0)} pts`);
console.log(`  Rs (×15)          : Rs ${(tot * 15).toFixed(0)}`);

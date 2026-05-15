'use strict';
// Find optimal target on re-entry: test multiple target levels + show max favorable per day
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

// --- Step 1: Show max favorable on re-entry for each SL-hit day ---
console.log('\n=== Re-entry Max Favorable (per day, after 50pt SL hit) ===\n');
console.log('Date         Sig  SLHit@T   ReDir  MaxFav  ClosePnl  (100SL hit?)');
console.log('─'.repeat(75));

const reEntries = []; // store for target sweep

for (const [date, cs] of days) {
  const e = findEntry(cs);
  if (!e) continue;
  const last = cs[cs.length - 1].close;

  let slHit = false, sIdx = null, sPx = null, sT = null;
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL1) { slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
  }
  if (!slHit) continue;

  const rs = opp(e.sig);
  let maxFav = 0, closePnl = mv(rs, sPx, last), sl100Hit = false;

  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(rs, sPx, c.close);
    if (m > maxFav) maxFav = m;
    if (m <= -SL_RE) { sl100Hit = true; break; }
  }

  reEntries.push({ date, sig: e.sig, rs, sPx, sT, sIdx, maxFav, closePnl, sl100Hit, cs });
  const slNote = sl100Hit ? 'YES-SL-hit' : 'no-sl-hit';
  console.log(`${date}  ${e.sig}  @${sT}   ${rs}   +${maxFav.toFixed(0).padStart(4)}  ${(closePnl >= 0 ? '+' : '') + closePnl.toFixed(0).padStart(5)}   ${slNote}`);
}

// --- Step 2: Sweep target levels ---
const targets = [50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 9999];
const T1_FIXED = 2310; // fixed across all scenarios

console.log('\n\n=== Target Sweep on Re-entry (SL=100pt fixed) ===\n');
console.log('Target   Re-PnL   Total-PnL   Rs(×15)   Days-hit-target / Days-SL / Days-close');
console.log('─'.repeat(80));

for (const tgt of targets) {
  let reTot = 0, hitTgt = 0, hitSL = 0, hitClose = 0;
  for (const { rs, sPx, sIdx, maxFav, closePnl, cs } of reEntries) {
    let rep = closePnl;
    let outcome = 'close';
    // walk candle by candle
    for (let i = sIdx + 1; i < cs.length; i++) {
      const c = cs[i];
      const m = mv(rs, sPx, c.close);
      if (m >= tgt) { rep = tgt; outcome = 'target'; break; }
      if (m <= -SL_RE) { rep = -SL_RE; outcome = 'sl'; break; }
    }
    reTot += rep;
    if (outcome === 'target') hitTgt++;
    else if (outcome === 'sl') hitSL++;
    else hitClose++;
  }
  const tot = T1_FIXED + reTot;
  const tgtLabel = tgt === 9999 ? 'NO-TGT' : `+${tgt}`;
  console.log(`${tgtLabel.padEnd(8)} ${(reTot >= 0 ? '+' : '') + reTot.toFixed(0).padStart(6)}   ${(tot >= 0 ? '+' : '') + tot.toFixed(0).padStart(7)}   Rs${(tot * 15).toFixed(0).padStart(8)}   tgt:${hitTgt}  sl:${hitSL}  close:${hitClose}`);
}

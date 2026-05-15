'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);
const SL1 = 50, SL_RE = 100, FILTER = 0; // moveAgainstRe < 0

function findEntry(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    if (ca.h > 11 || (ca.h === 11 && ca.m >= 30)) break;
    let sig = null, bl = null;
    if (ca.bull === cb.bull) {
      sig = ca.bull ? 'CE' : 'PE'; bl = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
    } else if (cb.body_size > ca.body_size) {
      sig = cb.bull ? 'CE' : 'PE'; bl = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
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
const T1_FIXED = 2310;

const targets = [50, 75, 100, 125, 150, 175, 200, 250, 300, 400, 500, 9999];

console.log('\n=== Re-entry Target Sweep (filter: moveAgainstRe < 0, SL_RE=100) ===\n');
console.log('Target   Re-PnL   Total-PnL   Rs(×15)   tgt:sl:close');
console.log('─'.repeat(60));

// Collect all valid re-entries first
const reEntries = [];
for (const [date, cs] of days) {
  const e = findEntry(cs);
  if (!e) continue;
  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  let slHit = false, sIdx = null, sPx = null;
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL1) { slHit = true; sIdx = i; sPx = c.close; break; }
  }
  if (!slHit) continue;

  const rs = opp(e.sig);
  const moveFromOpen  = sPx - dayOpen;
  const moveAgainstRe = rs === 'CE' ? moveFromOpen : -moveFromOpen;
  if (moveAgainstRe >= FILTER) continue; // skip filtered days

  reEntries.push({ date, rs, sPx, sIdx, cs, closePnl: mv(rs, sPx, last) });
}

for (const tgt of targets) {
  let reTot = 0, hitTgt = 0, hitSL = 0, hitClose = 0;
  for (const { rs, sPx, sIdx, closePnl, cs } of reEntries) {
    let rep = closePnl, outcome = 'close';
    for (let i = sIdx + 1; i < cs.length; i++) {
      const c = cs[i];
      const m = mv(rs, sPx, c.close);
      if (tgt !== 9999 && m >= tgt)    { rep = tgt;    outcome = 'target'; break; }
      if (m <= -SL_RE)                  { rep = -SL_RE; outcome = 'sl';     break; }
    }
    reTot += rep;
    if (outcome === 'target') hitTgt++;
    else if (outcome === 'sl') hitSL++;
    else hitClose++;
  }
  const tot = T1_FIXED + reTot;
  const tgtLabel = tgt === 9999 ? 'NO-TGT' : `+${tgt}`;
  console.log(`${tgtLabel.padEnd(8)} ${(reTot >= 0 ? '+' : '') + reTot.toFixed(0).padStart(6)}   ${(tot >= 0 ? '+' : '') + tot.toFixed(0).padStart(7)}   Rs${(tot * 15).toFixed(0).padStart(8)}   ${hitTgt}:${hitSL}:${hitClose}`);
}

// Day-by-day for best (no target = hold to close) already shown above
// Now show day-by-day for +100 target for comparison
console.log('\n\n=== Day-by-day: filter < 0, SL_RE=100, TARGET=+100 ===\n');
console.log('Date         ReDir  RePx     Re-PnL   Outcome');
console.log('─'.repeat(55));
for (const { date, rs, sPx, sIdx, closePnl, cs } of reEntries) {
  let rep = closePnl, outcome = 'close';
  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(rs, sPx, c.close);
    if (m >= 100)    { rep = 100;    outcome = 'TARGET'; break; }
    if (m <= -SL_RE) { rep = -SL_RE; outcome = 'SL-hit'; break; }
  }
  const reStr = (rep >= 0 ? '+' : '') + rep.toFixed(0);
  console.log(`${date}  ${rs}  ${sPx.toFixed(0)}   ${reStr.padStart(6)}   ${outcome}`);
}

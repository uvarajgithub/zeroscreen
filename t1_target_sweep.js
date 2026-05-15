'use strict';
const data = require('./candles_detail.json');
const days = Object.entries(data.days);
const SL1 = 50, SL_RE = 100, FILTER = 0;

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

const t1Targets = [100, 150, 200, 250, 300, 400, 500, 750, 1000, 9999];

console.log('\n=== T1 Target Sweep + Re-entry (filter<0, SL_RE=100, no re-entry target) ===\n');
console.log('T1-Target   T1-PnL   Re-PnL   Total-PnL   Rs(×15)   t1tgt:t1sl:t1close');
console.log('─'.repeat(72));

for (const T1TGT of t1Targets) {
  let t1Tot = 0, reTot = 0;
  let hitTgt = 0, hitSL = 0, hitClose = 0;

  for (const [date, cs] of days) {
    const e = findEntry(cs);
    if (!e) continue;
    const dayOpen = cs[0].open;
    const last    = cs[cs.length - 1].close;

    // T1 with target + 50pt SL
    let slHit = false, tgtHit = false, sIdx = null, sPx = null, sT = null;
    let t1p = mv(e.sig, e.px, last); // default: hold to close

    for (let i = e.idx + 1; i < cs.length; i++) {
      const c = cs[i];
      const m = mv(e.sig, e.px, c.close);
      if (T1TGT !== 9999 && m >= T1TGT) { t1p = T1TGT; tgtHit = true; break; }
      if (m <= -SL1) { t1p = -SL1; slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
    }

    if (tgtHit)      hitTgt++;
    else if (slHit)  hitSL++;
    else             hitClose++;

    t1Tot += t1p;
    if (!slHit) continue;

    // Re-entry: filter + 100pt SL + no target
    const rs = opp(e.sig);
    const moveFromOpen  = sPx - dayOpen;
    const moveAgainstRe = rs === 'CE' ? moveFromOpen : -moveFromOpen;
    if (moveAgainstRe >= FILTER) continue;

    let rep = mv(rs, sPx, last);
    for (let i = sIdx + 1; i < cs.length; i++) {
      const c = cs[i];
      if (mv(rs, sPx, c.close) <= -SL_RE) { rep = -SL_RE; break; }
    }
    reTot += rep;
  }

  const tot = t1Tot + reTot;
  const lbl = T1TGT === 9999 ? 'NO-TGT' : `+${T1TGT}`;
  console.log(`${lbl.padEnd(10)}  ${(t1Tot >= 0 ? '+' : '') + t1Tot.toFixed(0).padStart(6)}   ${(reTot >= 0 ? '+' : '') + reTot.toFixed(0).padStart(6)}   ${(tot >= 0 ? '+' : '') + tot.toFixed(0).padStart(7)}   Rs${(tot * 15).toFixed(0).padStart(8)}   ${hitTgt}:${hitSL}:${hitClose}`);
}

// Day-by-day for NO-TGT on T1 (baseline) vs best T1 target
console.log('\n\n=== Day-by-day: T1 NO-TARGET vs T1 +300 (re-entry: filter<0, 100SL, no tgt) ===\n');
console.log('Date         Sig  EntryPx@T    T1(no-tgt)  T1(+300)  Re-PnL  Combined(no-tgt)  Combined(+300)');
console.log('─'.repeat(100));

for (const [date, cs] of days) {
  const e = findEntry(cs);
  if (!e) continue;
  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  // T1 no target
  let slHit = false, sIdx = null, sPx = null, sT = null;
  let t1NoTgt = mv(e.sig, e.px, last);
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(e.sig, e.px, c.close);
    if (m <= -SL1) { t1NoTgt = -SL1; slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
  }

  // T1 +300 target
  let t1Tgt300 = mv(e.sig, e.px, last);
  let slHit300 = false, sIdx300 = null, sPx300 = null, sT300 = null;
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(e.sig, e.px, c.close);
    if (m >= 300) { t1Tgt300 = 300; break; }
    if (m <= -SL1) { t1Tgt300 = -SL1; slHit300 = true; sIdx300 = i; sPx300 = c.close; sT300 = c.time; break; }
  }

  // Re-entry for no-tgt scenario
  let rePnl = 0;
  if (slHit) {
    const rs = opp(e.sig);
    const mar = rs === 'CE' ? (sPx - dayOpen) : -(sPx - dayOpen);
    if (mar < FILTER) {
      rePnl = mv(rs, sPx, last);
      for (let i = sIdx + 1; i < cs.length; i++) {
        if (mv(rs, sPx, cs[i].close) <= -SL_RE) { rePnl = -SL_RE; break; }
      }
    }
  }

  // Re-entry for +300 scenario
  let rePnl300 = 0;
  if (slHit300) {
    const rs = opp(e.sig);
    const mar = rs === 'CE' ? (sPx300 - dayOpen) : -(sPx300 - dayOpen);
    if (mar < FILTER) {
      rePnl300 = mv(rs, sPx300, last);
      for (let i = sIdx300 + 1; i < cs.length; i++) {
        if (mv(rs, sPx300, cs[i].close) <= -SL_RE) { rePnl300 = -SL_RE; break; }
      }
    }
  }

  const s = (v) => (v >= 0 ? '+' : '') + v.toFixed(0);
  console.log(
    `${date}  ${e.sig}  ${e.px.toFixed(0)}@${e.t}  ${s(t1NoTgt).padStart(7)}     ${s(t1Tgt300).padStart(6)}  ${s(rePnl).padStart(7)}  ${s(t1NoTgt + rePnl).padStart(8)}          ${s(t1Tgt300 + rePnl300).padStart(8)}`
  );
}

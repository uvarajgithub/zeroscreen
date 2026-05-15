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

// Test multiple negative thresholds for moveAgainstRe
const thresholds = [0, -50, -100, -150, -200];

for (const THRESH of thresholds) {
  let t1Total = 0, reTotal = 0, reTaken = 0, reSkipped = 0;

  for (const [date, cs] of days) {
    const e = findEntry(cs);
    if (!e) continue;
    const dayOpen = cs[0].open;
    const last    = cs[cs.length - 1].close;

    let slHit = false, sIdx = null, sPx = null, sT = null;
    for (let i = e.idx + 1; i < cs.length; i++) {
      const c = cs[i];
      if (mv(e.sig, e.px, c.close) <= -SL1) { slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
    }
    const t1p = slHit ? -SL1 : mv(e.sig, e.px, last);
    t1Total += t1p;
    if (!slHit) continue;

    const rs = opp(e.sig);
    const moveFromOpen    = sPx - dayOpen;
    const moveAgainstRe   = rs === 'CE' ? moveFromOpen : -moveFromOpen;

    // FILTER: only take re-entry if moveAgainstRe < THRESH (strictly negative)
    if (moveAgainstRe >= THRESH) { reSkipped++; continue; }

    reTaken++;
    let rep = mv(rs, sPx, last);
    for (let i = sIdx + 1; i < cs.length; i++) {
      const c = cs[i];
      if (mv(rs, sPx, c.close) <= -SL_RE) { rep = -SL_RE; break; }
    }
    reTotal += rep;
  }

  const tot = t1Total + reTotal;
  console.log(`Filter moveAgainstRe < ${String(THRESH).padStart(4)}:  T1=${t1Total.toFixed(0).padStart(5)}  Re=${reTotal.toFixed(0).padStart(6)}  TOTAL=${tot.toFixed(0).padStart(6)}  Rs=${(tot*15).toFixed(0).padStart(7)}  reTaken=${reTaken}  reSkipped=${reSkipped}`);
}

// Also show day-by-day for best threshold
const BEST = -50;
console.log(`\n\n=== Day-by-day with filter moveAgainstRe < ${BEST} ===\n`);
console.log('Date         Sig  T1-PnL  SLHit@T  MoveAgainstRe  Decision   Re-PnL  Combined');
console.log('─'.repeat(85));
let t1Tot2 = 0, reTot2 = 0;
for (const [date, cs] of days) {
  const e = findEntry(cs);
  if (!e) continue;
  const dayOpen = cs[0].open;
  const last    = cs[cs.length - 1].close;

  let slHit = false, sIdx = null, sPx = null, sT = null;
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL1) { slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
  }
  const t1p = slHit ? -SL1 : mv(e.sig, e.px, last);
  t1Tot2 += t1p;
  const t1Str = (t1p >= 0 ? '+' : '') + t1p.toFixed(0);

  if (!slHit) { console.log(`${date}  ${e.sig}  ${t1Str.padStart(6)}  NO SL`); continue; }

  const rs = opp(e.sig);
  const moveFromOpen  = sPx - dayOpen;
  const moveAgainstRe = rs === 'CE' ? moveFromOpen : -moveFromOpen;
  const maStr = (moveAgainstRe >= 0 ? '+' : '') + moveAgainstRe.toFixed(0);

  if (moveAgainstRe >= BEST) {
    console.log(`${date}  ${e.sig}    -50  @${sT}  ${maStr.padStart(6)}           SKIP       --      -50`);
    continue;
  }

  let rep = mv(rs, sPx, last);
  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(rs, sPx, c.close) <= -SL_RE) { rep = -SL_RE; break; }
  }
  reTot2 += rep;
  const reStr   = (rep >= 0 ? '+' : '') + rep.toFixed(0);
  const combStr = ((-50 + rep) >= 0 ? '+' : '') + (-50 + rep).toFixed(0);
  console.log(`${date}  ${e.sig}    -50  @${sT}  ${maStr.padStart(6)}  ${rs}  TAKE  ${reStr.padStart(7)}  ${combStr.padStart(7)}`);
}
console.log('─'.repeat(85));
const tot2 = t1Tot2 + reTot2;
console.log(`\nT1=${t1Tot2.toFixed(0)}  Re=${reTot2.toFixed(0)}  TOTAL=${tot2.toFixed(0)} pts  Rs=${(tot2*15).toFixed(0)}`);

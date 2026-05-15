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

const results = [];

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
  if (!slHit) continue;

  const rs = opp(e.sig);

  // At time of re-entry: price vs day open
  const moveFromOpen = sPx - dayOpen; // positive = UP from open, negative = DOWN from open

  // Is this move AGAINST re-entry direction?
  // rs=CE (want up) → moveFromOpen should ideally be negative (price came down, ready to bounce)
  // rs=PE (want down) → moveFromOpen should ideally be positive (price came up, ready to fall)
  const moveAgainstReEntry = rs === 'CE' ? moveFromOpen : -moveFromOpen;
  // negative = price already moved IN re-entry direction (dangerous)
  // positive = price moved AGAINST re-entry direction (good — has room to go)

  let maxFav = 0, reSlHit = false;
  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(rs, sPx, c.close);
    if (m > maxFav) maxFav = m;
    if (m <= -SL_RE) { reSlHit = true; break; }
  }

  results.push({
    date, sig: e.sig, rs, slTime: sT,
    dayOpen: dayOpen.toFixed(0),
    rePx: sPx.toFixed(0),
    moveFromOpen: moveFromOpen.toFixed(0),
    moveAgainstRe: moveAgainstReEntry.toFixed(0), // + means price is ON OUR SIDE (away from re-entry dir)
    maxFav: maxFav.toFixed(0),
    failed: reSlHit
  });
}

// Sort by moveAgainstRe descending (most favorable re-entry context first)
results.sort((a, b) => parseFloat(b.moveAgainstRe) - parseFloat(a.moveAgainstRe));

console.log('\n=== Price vs Day Open at Re-entry Time vs Outcome ===');
console.log('(moveAgainstRe: + = price moved away from re-entry dir = good context)');
console.log('(moveAgainstRe: - = price already moved IN re-entry dir = bad context)\n');
console.log('Date         T1Sig  ReDir  DayOpen  RePx   MoveFromOpen  MoveAgainstRe  MaxFav   Outcome');
console.log('─'.repeat(95));

for (const r of results) {
  const outcome = r.failed ? 'FAIL(-100)' : `SUCCESS(+${r.maxFav})`;
  const sign = r.moveAgainstRe >= 0 ? '+' : '';
  console.log(
    `${r.date}  ${r.sig}    ${r.rs}  ${r.dayOpen}  ${r.rePx}  ${(r.moveFromOpen >= 0 ? '+' : '') + r.moveFromOpen.padStart(5)}  ${(sign + r.moveAgainstRe).padStart(14)}   +${String(r.maxFav).padStart(4)}   ${outcome}`
  );
}

// Threshold test
console.log('\n=== Threshold: Take re-entry only if moveAgainstRe >= X ===\n');
for (const thresh of [-300, -200, -100, -50, 0, 50, 100, 150, 200]) {
  const take = results.filter(r => parseFloat(r.moveAgainstRe) >= thresh);
  const skip = results.filter(r => parseFloat(r.moveAgainstRe) <  thresh);
  const takeFail = take.filter(r => r.failed).length;
  const takeSucc = take.filter(r => !r.failed).length;
  const skipFail = skip.filter(r => r.failed).length;
  const skipSucc = skip.filter(r => !r.failed).length;
  console.log(`>= ${String(thresh).padStart(4)}: TAKE ${take.length} (fail:${takeFail} succ:${takeSucc}) | SKIP ${skip.length} (fail:${skipFail} succ:${skipSucc})`);
}

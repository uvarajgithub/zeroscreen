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
  const last = cs[cs.length - 1].close;

  let slHit = false, sIdx = null, sPx = null, sT = null;
  for (let i = e.idx + 1; i < cs.length; i++) {
    const c = cs[i];
    if (mv(e.sig, e.px, c.close) <= -SL1) { slHit = true; sIdx = i; sPx = c.close; sT = c.time; break; }
  }
  if (!slHit) continue;

  const sc = cs[sIdx]; // SL candle
  const rs = opp(e.sig);
  let maxFav = 0, reSlHit = false;
  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(rs, sPx, c.close);
    if (m > maxFav) maxFav = m;
    if (m <= -SL_RE) { reSlHit = true; break; }
  }

  results.push({
    date, sig: e.sig, rs,
    slTime: sT,
    body: Math.abs(sc.close - sc.open),
    range: sc.high - sc.low,
    bull: sc.bull,
    maxFav,
    failed: reSlHit
  });
}

// Sort by body size
results.sort((a, b) => a.body - b.body);

console.log('\n=== SL Candle Body Size vs Re-entry Outcome (sorted by body size) ===\n');
console.log('Date         ReDir  SLTime  Body   Range  BullCandle  MaxFav   Outcome');
console.log('─'.repeat(75));
for (const r of results) {
  const outcome = r.failed ? 'FAIL(-100)' : `SUCCESS(+${r.maxFav.toFixed(0)})`;
  console.log(
    `${r.date}  ${r.rs}   @${r.slTime}  ${r.body.toFixed(0).padStart(4)}   ${r.range.toFixed(0).padStart(4)}   bull=${r.bull ? 'Y' : 'N'}       +${r.maxFav.toFixed(0).padStart(4)}   ${outcome}`
  );
}

// Summary by body threshold
console.log('\n=== Body Size Threshold Test ===\n');
for (const thresh of [50, 75, 100, 125, 150]) {
  const skipDays    = results.filter(r => r.body >= thresh);
  const takeDays    = results.filter(r => r.body <  thresh);
  const skipFails   = skipDays.filter(r => r.failed).length;
  const skipSuccess = skipDays.filter(r => !r.failed).length;
  const takeFails   = takeDays.filter(r => r.failed).length;
  const takeSuccess = takeDays.filter(r => !r.failed).length;
  console.log(`Body >= ${thresh}: SKIP ${skipDays.length} days (${skipFails} fail, ${skipSuccess} success avoided) | TAKE ${takeDays.length} days (${takeFails} fail, ${takeSuccess} success)`);
}

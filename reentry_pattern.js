'use strict';
// Find pattern in days where re-entry fails (market never moves in our favor)
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

const good = [], bad = [];

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
  let maxFav = 0, reSlHit = false;
  const firstMoves = [];

  for (let i = sIdx + 1; i < cs.length; i++) {
    const c = cs[i];
    const m = mv(rs, sPx, c.close);
    if (firstMoves.length < 4) firstMoves.push({ time: c.time, m: m.toFixed(0) });
    if (m > maxFav) maxFav = m;
    if (m <= -SL_RE) { reSlHit = true; break; }
  }

  // entry candle info
  const ec = cs[e.idx];
  // SL candle info
  const sc = cs[sIdx];
  // candle before re-entry (the SL candle)
  const slCandleBody = Math.abs(sc.close - sc.open);
  const slCandleRange = sc.high - sc.low;

  const obj = {
    date, sig: e.sig, entryTime: e.t,
    slTime: sT, slCandle: sc.time,
    slCandleBody: slCandleBody.toFixed(0),
    slCandleRange: slCandleRange.toFixed(0),
    slCandleBull: sc.bull,
    rs, rePx: sPx.toFixed(0),
    maxFav: maxFav.toFixed(0),
    reSlHit,
    firstMoves
  };

  if (reSlHit) bad.push(obj);
  else good.push(obj);
}

console.log('\n=== RE-ENTRY FAILED DAYS (100pt SL hit — market never went our way) ===\n');
console.log('Date         T1Sig  Entry@T  SLHit@T  SLcandle(bull?  body  range)  ReDir  First 4 moves after re-entry');
console.log('─'.repeat(105));
for (const d of bad) {
  const mv1 = d.firstMoves.map(m => `${m.time}:${m.m >= 0 ? '+' : ''}${m.m}`).join('  ');
  console.log(`${d.date}  ${d.sig}    @${d.entryTime}  @${d.slTime}   bull=${d.slCandleBull?'Y':'N'}  body=${d.slCandleBody.padStart(3)}  rng=${d.slCandleRange.padStart(3)}   ${d.rs}  ${mv1}`);
}

console.log('\n\n=== RE-ENTRY SUCCESS DAYS (100pt SL NOT hit) ===\n');
console.log('Date         T1Sig  Entry@T  SLHit@T  SLcandle(bull?  body  range)  ReDir  MaxFav  First 4 moves');
console.log('─'.repeat(105));
for (const d of good) {
  const mv1 = d.firstMoves.map(m => `${m.time}:${m.m >= 0 ? '+' : ''}${m.m}`).join('  ');
  console.log(`${d.date}  ${d.sig}    @${d.entryTime}  @${d.slTime}   bull=${d.slCandleBull?'Y':'N'}  body=${d.slCandleBody.padStart(3)}  rng=${d.slCandleRange.padStart(3)}   ${d.rs}  +${String(d.maxFav).padStart(4)}  ${mv1}`);
}

console.log(`\nFailed: ${bad.length} days | Success: ${good.length} days`);

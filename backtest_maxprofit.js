'use strict';
// backtest_maxprofit.js — find max 1-lot P&L with OPEN entry
// Gap days: enter at C0.open. Inside days: enter at signal candle close.
const fs  = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);
const P   = 15;

const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

function calcPL(cs, idx, ep, side, T, SL) {
  const sign = side === 'CE' ? 1 : -1;
  for (let i = idx + 1; i < cs.length; i++) {
    const c   = cs[i];
    const op  = sign * (c.open - ep);
    const fav = sign * (side === 'CE' ? c.high - ep : ep - c.low);
    const adv = sign * (side === 'CE' ? ep - c.low  : c.high - ep);
    if (!(fav >= T || adv >= SL)) continue;
    if (fav >= T && !(adv >= SL)) return { pl: (op >= T ? op : T) * P };
    if (adv >= SL && !(fav >= T)) return { pl: (op <= -SL ? op : -SL) * P };
    return Math.abs(T - op) <= Math.abs(-SL - op)
      ? { pl: (op >= T ? op : T) * P }
      : { pl: (op <= -SL ? op : -SL) * P };
  }
  return { pl: sign * (cs[cs.length - 1].close - ep) * P };
}

function run(SL, T) {
  let pl = 0, pk = 0, dd = 0, traded = 0, wins = 0;
  const yr = {};
  for (let di = 1; di < ALL.length; di++) {
    const cs = raw[ALL[di]], pv = raw[ALL[di - 1]];
    if (!cs || !pv || cs.length < 2) continue;
    const PH = pdh(pv), PL = pdl(pv);
    if (PH - PL < 150) continue;
    const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
    let w = 0;
    for (let i = 1; i < bps.length; i++)
      if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) w++;
    if (w >= 2) continue;
    const open = cs[0].open;
    let side = null, idx = 0, ep = 0;
    if (open > PH) { side = 'CE'; idx = 0; ep = cs[0].open; }
    else if (open < PL) { side = 'PE'; idx = 0; ep = cs[0].open; }
    else {
      for (let i = 0; i < Math.min(6, cs.length - 1); i++) {
        const cbp = bp(cs[i]);
        if (cbp >  60) { side = 'CE'; idx = i; ep = cs[i].close; break; }
        if (cbp < -60) { side = 'PE'; idx = i; ep = cs[i].close; break; }
      }
    }
    if (!side) continue;
    const r = calcPL(cs, idx, ep, side, T, SL);
    pl += r.pl; traded++;
    if (r.pl > 0) wins++;
    if (pl > pk) pk = pl;
    const d = pk - pl; if (d > dd) dd = d;
    const y = ALL[di].slice(0, 4);
    if (!yr[y]) yr[y] = 0; yr[y] += r.pl;
  }
  return { pl, dd, traded, wr: (wins / traded * 100).toFixed(1), yr };
}

const SLS = [10, 12, 15, 18, 20, 25, 30, 40, 50];
const TGS = [75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500];
const res = [];
for (const s of SLS)
  for (const t of TGS) {
    if (t <= s) continue;
    const r = run(s, t);
    res.push({ s, t, rr: (t / s).toFixed(1), ...r });
  }
res.sort((a, b) => b.pl - a.pl);

console.log('\n  MAX PROFIT SEARCH — SINGLE LOT — OPEN entry (gap) / CLOSE entry (inside)');
console.log('  ' + '═'.repeat(80));
console.log(`  ${'SL'.padStart(4)} ${'Tgt'.padStart(5)} ${'R:R'.padStart(5)} ${'5yr P&L'.padStart(14)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(10)}`);
console.log('  ' + '─'.repeat(80));
for (const r of res.slice(0, 20)) {
  console.log(
    `  ${r.s.toString().padStart(4)} ${r.t.toString().padStart(5)} ${r.rr.padStart(5)}` +
    `  ₹${Math.round(r.pl).toLocaleString('en-IN').padStart(12)}` +
    `  ${r.wr.padStart(5)}%` +
    `  ${r.traded.toString().padStart(6)}` +
    `  ₹${Math.round(r.dd).toLocaleString('en-IN').padStart(8)}`
  );
}

const best = res[0];
console.log('\n  ' + '═'.repeat(80));
console.log(`  BEST: SL=${best.s}  Target=${best.t}  R:R=${best.rr}`);
console.log(`  5yr P&L  : ₹${Math.round(best.pl).toLocaleString('en-IN')} (single lot)`);
console.log(`  Win Rate : ${best.wr}%  (${best.traded} trades)`);
console.log(`  Max DD   : ₹${Math.round(best.dd).toLocaleString('en-IN')}`);
console.log('\n  YEARLY:');
for (const [y, p] of Object.entries(best.yr).sort())
  console.log(`    ${y}: ₹${Math.round(p).toLocaleString('en-IN').padStart(12)}  ${p > 0 ? '+' : '-'}`);
console.log('  ' + '═'.repeat(80) + '\n');

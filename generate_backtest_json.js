// generate_backtest_json.js
// Runs BHAV V3 (Act=15 Gap=5, HYB-10, SL=200, RE) and outputs 5year-backtest-result.json
// for the ZeroScreen dashboard

'use strict';
const fs = require('fs');
const raw = JSON.parse(fs.readFileSync(process.argv[2] || 'cache/banknifty_5yr.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k] && raw[k].length > 0);
const PTS = 15;    // ₹15 per index pt per lot
const SL  = 200;   // 200 pts max loss
const ACT = 15;    // trail activates at +15 pts
const GAP = 5;     // trail = peak - 5

const bp  = c => c.high > c.low ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const pdh = cs => Math.max(...cs.map(c => c.high));
const pdl = cs => Math.min(...cs.map(c => c.low));
const pdc = cs => cs[cs.length - 1].close;
const firstBear = (cs, f, t = 30) => { for (let i = f; i < cs.length; i++) if (bp(cs[i]) < -t) return i; return -1; };
const firstStrong = (cs, f, t = 55) => { for (let i = f; i < cs.length; i++) { const b = bp(cs[i]); if (Math.abs(b) > t) return { i, side: b > 0 ? 'CE' : 'PE' }; } return null; };

function findEntry(cs, prev) {
  if (!cs || cs.length < 2 || !prev || !prev.length) return null;
  const PH = pdh(prev), PL_ = pdl(prev), PC = pdc(prev);
  const C0 = cs[0];
  const vsPDH = C0.open - PH, vsPDL = C0.open - PL_;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0);
  const bps4 = cs.slice(0, Math.min(4, cs.length)).map(bp);
  let w = 0;
  for (let i = 1; i < bps4.length; i++) if (bps4[i] * bps4[i - 1] < 0 && Math.abs(bps4[i]) > 65 && Math.abs(bps4[i - 1]) > 65) w++;
  if (w >= 2) return null;
  if (ctx === 'ABOVE_PDH') {
    if (vsPDH > 1000) return { idx: 0, side: 'CE', ctx };
    if (C0bp > 85) return { idx: 0, side: 'CE', ctx };
    if (C0bp < -20) return { idx: 0, side: 'PE', ctx };
    const b = firstBear(cs, 1, 35); if (b > 0 && b <= 7) return { idx: b, side: 'PE', ctx };
    const c = firstStrong(cs, 2, 55); if (c) return { idx: c.i, side: c.side, ctx };
    return null;
  }
  if (ctx === 'BELOW_PDL') {
    if (C0bp < -80) return { idx: 0, side: 'PE', ctx };
    if (C0bp < -65) return null;
    if (C0bp > 65) { const i = firstBear(cs, 1, 30); if (i > 0) return { idx: i, side: 'PE', ctx }; }
    const b = firstBear(cs, 1, 35); if (b > 0 && b <= 7) return { idx: b, side: 'PE', ctx };
    const c = firstStrong(cs, 2, 55); if (c) return { idx: c.i, side: c.side, ctx };
    return null;
  }
  if (Math.abs(C0bp) > 90) return { idx: 0, side: C0bp > 0 ? 'CE' : 'PE', ctx };
  if (Math.abs(C0bp) < 10 && cs[1]) { const s = firstStrong(cs, 1, 65); if (s) return { idx: s.i, side: s.side, ctx }; }
  const s = firstStrong(cs, 1, 55); if (s) return { idx: s.i, side: s.side, ctx };
  return null;
}

function findReEntry(cs, from, side) {
  for (let i = from + 1; i < cs.length - 2; i++) {
    const b = bp(cs[i]);
    if (side === 'CE' && b > 35) return i;
    if (side === 'PE' && b < -35) return i;
  }
  return -1;
}

function doExit(cs, ei, side) {
  const ep = cs[ei].close, sg = side === 'CE' ? 1 : -1;
  let trail = -SL, peak = 0;
  for (let i = ei + 1; i < cs.length; i++) {
    const c = cs[i];
    const op = sg * (c.open - ep);
    if (trail > 0 && op < trail) return { pl: op * PTS, i };
    if (trail <= 0 && op < -SL)  return { pl: -SL * PTS, i };
    const adv = side === 'CE' ? (c.low - ep) : (ep - c.high);
    const cls = sg * (c.close - ep);
    const fav = side === 'CE' ? (c.high - ep) : (ep - c.low);
    const np = Math.max(peak, fav), nt = np >= ACT ? np - GAP : -SL;
    if (trail > 0 && adv <= trail)    return { pl: trail * PTS, i };
    if (nt > 0 && adv <= nt && cls <= nt) return { pl: nt * PTS, i };
    if (trail <= 0 && adv <= -SL && cls <= -SL + 10) return { pl: cls * PTS, i };
    peak = np; trail = nt;
  }
  return { pl: sg * (cs[cs.length - 1].close - ep) * PTS, i: cs.length - 1 };
}

function getPrev(d) { const idx = ALL.indexOf(d); return idx > 0 ? raw[ALL[idx - 1]] : null; }

// Run and collect per-day stats
const monthly = {};
let totalPl = 0, totalTrades = 0, totalWins = 0;
let maxDD = 0, runningPl = 0, peak = 0;
let allPls = [];

for (const date of ALL) {
  const cs = raw[date], prev = getPrev(date);
  if (!prev) continue;
  const entry = findEntry(cs, prev);
  if (!entry) continue;

  const ym = date.slice(0, 7); // "2021-01"
  if (!monthly[ym]) monthly[ym] = { days: 0, bhavPts: 0, bhavPl: 0, trades: 0, wins: 0 };
  monthly[ym].days++;

  const r1 = doExit(cs, entry.idx, entry.side);
  totalTrades++; monthly[ym].trades++;
  if (r1.pl > 0) { totalWins++; monthly[ym].wins++; }
  allPls.push(r1.pl);

  let dayPl = r1.pl, cei = r1.i, cp = r1.pl, cs2 = entry.side;

  // Reverse re-entry after profitable T1
  if (r1.pl > 0 && r1.i < cs.length - 1) {
    const rev = entry.side === 'CE' ? 'PE' : 'CE';
    let ri = -1;
    for (let i = r1.i + 1; i <= cs.length - 3; i++) {
      const b = bp(cs[i]);
      if ((rev === 'CE' && b > 65) || (rev === 'PE' && b < -65)) { ri = i; break; }
    }
    const sf = findReEntry(cs, r1.i, entry.side);
    if (ri > 0 && (sf < 0 || ri < sf)) {
      const rr = doExit(cs, ri, rev);
      dayPl += rr.pl; cei = rr.i; cp = rr.pl; cs2 = rev;
      totalTrades++; monthly[ym].trades++;
      if (rr.pl > 0) { totalWins++; monthly[ym].wins++; }
    }
  }

  // Continuing re-entries
  for (let i = 0; i < 3; i++) {
    if (cp > 0 && cei < cs.length - 1) {
      const ri = findReEntry(cs, cei, cs2);
      if (ri > 0) {
        const rr = doExit(cs, ri, cs2);
        dayPl += rr.pl; cei = rr.i; cp = rr.pl;
        totalTrades++; monthly[ym].trades++;
        if (rr.pl > 0) { totalWins++; monthly[ym].wins++; }
      } else break;
    } else break;
  }

  monthly[ym].bhavPl += dayPl;
  monthly[ym].bhavPts += dayPl / PTS;
  totalPl += dayPl;
  runningPl += dayPl;
  if (runningPl > peak) peak = runningPl;
  const dd = peak - runningPl;
  if (dd > maxDD) maxDD = dd;
}

// Yearly summary
const yearly = {};
for (const [ym, m] of Object.entries(monthly)) {
  const yr = ym.slice(0, 4);
  if (!yearly[yr]) yearly[yr] = { pl: 0, trades: 0, wins: 0, days: 0 };
  yearly[yr].pl += m.bhavPl;
  yearly[yr].trades += m.trades;
  yearly[yr].wins += m.wins;
  yearly[yr].days += m.days;
}

const tradingDays = Object.values(monthly).reduce((s, m) => s + m.days, 0);
const dayWinRate = (Object.values(monthly).filter(m => m.bhavPl > 0).length / Object.keys(monthly).length * 100).toFixed(1);

// Build output JSON
const out = {
  strategy: "BHAV V3",
  params: { activation: ACT, gap: GAP, sl: SL, slType: "HYB-10", reEntry: true },
  period: {
    from: ALL[0].slice(0, 7).replace('-', ' '),
    to:   ALL[ALL.length - 1].slice(0, 7).replace('-', ' ')
  },
  tradingDays,
  totals: {
    bodyBreakout:   Math.round(totalPl / PTS * 10) / 10,   // pts (mapped to "Model A" in dashboard)
    rcConfirm:      0,                                       // no second model
    totalPnlRs:     Math.round(totalPl),
    dayWinRate:     parseFloat(dayWinRate),
    tradeWinRate:   parseFloat((totalWins / totalTrades * 100).toFixed(1)),
    maxDDRs:        Math.round(maxDD),
    profitFactor:   parseFloat((allPls.filter(p => p > 0).reduce((a, b) => a + b, 0) /
                     Math.abs(allPls.filter(p => p < 0).reduce((a, b) => a + b, 0) || 1)).toFixed(2)),
    totalTrades,
    totalWins
  },
  liveEstimate: {
    totalPnlRs: Math.round(totalPl)  // same — bot already uses up to 5 trades/day
  },
  yearly: Object.fromEntries(
    Object.entries(yearly).map(([yr, y]) => [yr, {
      pl: Math.round(y.pl),
      plL: parseFloat((y.pl / 1e5).toFixed(2)),
      trades: y.trades,
      wins: y.wins,
      days: y.days,
      winRate: parseFloat((y.wins / y.trades * 100).toFixed(1))
    }])
  ),
  monthly: Object.fromEntries(
    Object.entries(monthly).map(([ym, m]) => [ym, {
      days: m.days,
      bbTotal:  parseFloat(m.bhavPts.toFixed(1)),  // pts (mapped as "Model A")
      bbTrades: m.trades,
      bbWins:   m.wins,
      rcTotal:  0,    // no second model
      rcTrades: 0,
      rcWins:   0
    }])
  )
};

const outPath = process.argv[3] || '5year-backtest-result.json';
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

console.log('\n=== BHAV V3 Backtest JSON Generated ===');
console.log(`Output: ${outPath}`);
console.log(`Trading days : ${tradingDays}`);
console.log(`Total P&L    : ₹${(totalPl / 1e5).toFixed(2)}L`);
console.log(`Trade WR     : ${out.totals.tradeWinRate}%`);
console.log(`Max DD       : ₹${out.totals.maxDDRs.toLocaleString('en-IN')}`);
console.log(`Profit Factor: ${out.totals.profitFactor}`);
console.log('\nYearly breakdown:');
for (const [yr, y] of Object.entries(out.yearly)) {
  const tag = y.pl > 0 ? '✅' : '❌';
  console.log(`  ${yr}: ₹${y.plL}L (${y.trades} trades, ${y.winRate}% WR) ${tag}`);
}
console.log('\nJSON ready — copy to /root/zeroscreen/5year-backtest-result.json');

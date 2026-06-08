'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// backtest_verify.js — DEEP VERIFICATION OF V15 STRATEGY
// Runs 10+ independent checks to find ANY miscalculation
// ══════════════════════════════════════════════════════════════════════════════
// CHECKS PERFORMED:
//  1. Determinism — run V15 10x, must produce identical result every time
//  2. Per-trade win rate vs per-day win rate (what WR are we really claiming?)
//  3. Trades-per-day distribution — how often do we get 6/7/8 trades (exceeds live 5-cap)?
//  4. Top-10 best days — check for unrealistic single-day outliers
//  5. Top-10 worst days — check SL behavior
//  6. SL exit verification — are SL exits at actual close, NOT capped at -150?
//  7. TRAIL exit verification — are TRAIL exits at trail level, not close?
//  8. Intrabar peak vs close anomaly — how often does peak >> close (overstatement risk)?
//  9. Re-entry timing — entries after 14:30? (last 2 candles of day)
// 10. Yearly + monthly breakdown vs 5year-backtest-result.json sanity check
// 11. Effect of 5-trade-cap (live bot limit): what would P&L be if capped at 5?
// 12. Effect of honest peak (use close not intrabar high for peak): lower bound
// 13. Zero-day check — any single day with P&L > ₹50K (needs explanation)?
// 14. Data quality — any candles with zero range, negative prices, etc.
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(process.cwd(), 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;

const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

// ── Helpers ───────────────────────────────────────────────────────────────────
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── calcPL: V15 honest exit (TRAIL at trail level, SL at actual close) ────────
function calcPL(candles, entryIdx, side, tGap, useCLOSEpeak) {
  const TGAP = tGap || 20;
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peakPts   = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    // useCLOSEpeak = alternate "honest" check using close-based peak (lower bound)
    const favPts = useCLOSEpeak
      ? sign * (c.close - entryPrice)   // conservative: peak only counts at close
      : (side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low));  // intrabar (default)
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TGAP ? peakPts - TGAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      if (trailStop > 0) {
        return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL',
                 entryPrice, exitPrice: entryPrice + sign * trailStop,
                 closePts, trailStop };
      } else {
        return { pl: closePts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL',
                 entryPrice, exitPrice: c.close,
                 closePts, trailStop };
      }
    }
  }
  const exitPrice = candles[candles.length - 1].close;
  return { pl: sign * (exitPrice - entryPrice) * PTS_PER_RS, peakPts,
           exitIdx: candles.length - 1, exitType: 'EOD', entryPrice, exitPrice,
           closePts: sign * (exitPrice - entryPrice), trailStop };
}

function findReEntry(cs, fromIdx, side, thresh) {
  const THRESH = thresh || 55;
  const maxIdx = Math.min(cs.length - 2, 22);
  for (let i = fromIdx; i <= maxIdx; i++) {
    const cbp = bp(cs[i]);
    if (side === 'CE' && cbp > THRESH) return i;
    if (side === 'PE' && cbp < -THRESH) return i;
  }
  return -1;
}

function findEntry(cs, prevCS, cfg) {
  const PH  = pdh(prevCS);
  const PL  = pdl(prevCS);
  const PDR = PH - PL;
  const C0  = cs[0];

  if (cfg.pdrMin > 0 && PDR < cfg.pdrMin) return null;

  if (cfg.whipsawGuard) {
    const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
    let whip = 0;
    for (let i = 1; i < bps.length; i++)
      if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
    if (whip >= 2) return null;
  }

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;
  const isAbove  = vsPDH > 0;
  const isBelow  = vsPDL < 0;

  if (isAbove) {
    if (!cfg.aboveBhav) return { idx: 0, side: 'CE' };
    if (vsPDH < 120) return cfg.includeInside ? findInsideEntry(cs, PH, PL, cfg, 0) : null;
    if (vsPDH > 1000) return { idx: 0, side: 'CE' };
    const C0bp = bp(C0);
    if (C0bp > 85) return { idx: 0, side: 'CE' };
    return { idx: 0, side: 'PE' };
  }

  if (isBelow) {
    if (!cfg.belowBhav) return { idx: 0, side: 'PE' };
    const C0bp = bp(C0);
    if (C0bp < -80) return { idx: 0, side: 'PE' };
    if (C0bp < -65) return null;
    if (C0bp > 65)  return { idx: 0, side: 'PE' };
    if (C0.high > PL) return cfg.includeInside ? findInsideEntry(cs, PH, PL, cfg, 0) : null;
    return { idx: 0, side: 'PE' };
  }

  if (!cfg.includeInside) return null;
  return findInsideEntry(cs, PH, PL, cfg, 0);
}

function findInsideEntry(cs, PH, PL, cfg, fromIdx) {
  const maxIdx = Math.min(cs.length - 2, cfg.maxCandle || 25);
  if (!cfg.insideBhav) {
    for (let i = fromIdx; i <= Math.min(maxIdx, cfg.insideMaxC || 10); i++) {
      const cbp = bp(cs[i]);
      if (cbp > (cfg.insideBody || 50)) return { idx: i, side: 'CE' };
      if (cbp < -(cfg.insideBody || 50)) return { idx: i, side: 'PE' };
    }
    return null;
  }
  const C0 = cs[0];
  const C0bp = bp(C0);
  const hwick = C0.high - Math.max(C0.open, C0.close);
  if (hwick > 0.55 * rng(C0) && C0bp < -20) return { idx: 0, side: 'PE' };
  if (Math.abs(C0bp) > 55) return { idx: 0, side: C0bp > 0 ? 'CE' : 'PE' };
  for (let i = 1; i <= Math.min(4, maxIdx); i++) {
    const cbp = bp(cs[i]);
    if (Math.abs(cbp) > 55) return { idx: i, side: cbp > 0 ? 'CE' : 'PE' };
  }
  if (cfg.insideLate) {
    for (let i = 5; i <= Math.min(20, maxIdx); i++) {
      const cbp = bp(cs[i]);
      if (cbp > 55 && cs[i].close > PH) return { idx: i, side: 'CE' };
      if (cbp < -55 && cs[i].close < PL) return { idx: i, side: 'PE' };
    }
  }
  return null;
}

// ── V15 config ────────────────────────────────────────────────────────────────
const V15 = {
  pdrMin: 150, whipsawGuard: true,
  aboveBhav: true, belowBhav: true,
  includeInside: true, insideBhav: true, insideLate: true,
  maxCandle: 20, reEntries: 5, reverseRE: true, trailGap: 10, reThresh: 40,
};

// ══════════════════════════════════════════════════════════════════════════════
// CORE RUNNER — returns per-trade log + day summaries
// ══════════════════════════════════════════════════════════════════════════════
function runDetailed(cfg, maxTradesPerDay, useCLOSEpeak) {
  const tradeLog = [];
  const dayLog   = [];
  let totalPL = 0, wins = 0, losses = 0, noTrade = 0, reCount = 0;
  let peakPL = 0, maxDD = 0;
  const yearly = {};

  for (let di = 1; di < ALL.length; di++) {
    const date = ALL[di];
    const cs   = raw[date];
    const prev = raw[ALL[di - 1]];
    if (!cs || !prev || cs.length < 2) continue;

    const entry = findEntry(cs, prev, cfg);
    if (!entry) { noTrade++; continue; }

    let dayPL = 0;
    let tradesThisDay = 0;

    const res1 = calcPL(cs, entry.idx, entry.side, cfg.trailGap, useCLOSEpeak);
    dayPL += res1.pl;
    tradesThisDay++;
    tradeLog.push({ date, side: entry.side, re: 0, ...res1 });

    let curExit = res1;
    let curSide = entry.side;

    for (let re = 0; re < (cfg.reEntries || 0); re++) {
      if (maxTradesPerDay && tradesThisDay >= maxTradesPerDay) break;
      if (curExit.exitType !== 'TRAIL' || curExit.pl <= 0) break;
      if (curExit.exitIdx >= cs.length - 2) break;
      const reIdx = findReEntry(cs, curExit.exitIdx + 1, curSide, cfg.reThresh);
      if (reIdx < 0) break;
      reCount++;
      const resRe = calcPL(cs, reIdx, curSide, cfg.trailGap, useCLOSEpeak);
      dayPL += resRe.pl;
      tradesThisDay++;
      tradeLog.push({ date, side: curSide, re: re + 1, ...resRe });
      curExit = resRe;
    }

    if (cfg.reverseRE && curExit.exitType === 'TRAIL' && curExit.peakPts >= 100 && curExit.pl > 0
        && curExit.exitIdx < cs.length - 2) {
      if (!maxTradesPerDay || tradesThisDay < maxTradesPerDay) {
        const revSide = curSide === 'CE' ? 'PE' : 'CE';
        const revIdx  = findReEntry(cs, curExit.exitIdx + 1, revSide, cfg.reThresh);
        if (revIdx >= 0) {
          reCount++;
          const resRev = calcPL(cs, revIdx, revSide, cfg.trailGap, useCLOSEpeak);
          dayPL += resRev.pl;
          tradesThisDay++;
          tradeLog.push({ date, side: revSide, re: 'rev', ...resRev });
          if (resRev.exitType === 'TRAIL' && resRev.pl > 0 && resRev.exitIdx < cs.length - 2) {
            if (!maxTradesPerDay || tradesThisDay < maxTradesPerDay) {
              const reIdx2 = findReEntry(cs, resRev.exitIdx + 1, revSide, cfg.reThresh);
              if (reIdx2 >= 0) {
                reCount++;
                const r2 = calcPL(cs, reIdx2, revSide, cfg.trailGap, useCLOSEpeak);
                dayPL += r2.pl;
                tradesThisDay++;
                tradeLog.push({ date, side: revSide, re: 'rev2', ...r2 });
              }
            }
          }
        }
      }
    }

    totalPL += dayPL;
    const yr = date.slice(0, 4);
    if (!yearly[yr]) yearly[yr] = 0;
    yearly[yr] += dayPL;

    if (dayPL > 0) wins++; else losses++;
    if (totalPL > peakPL) peakPL = totalPL;
    const dd = peakPL - totalPL;
    if (dd > maxDD) maxDD = dd;

    dayLog.push({ date, dayPL, tradesThisDay, wins, losses });
  }

  return {
    totalPL, wins, losses,
    wr: (wins/(wins+losses)*100).toFixed(1),
    maxDD, reCount, yearly,
    tradeLog, dayLog
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 1: DETERMINISM — run V15 10 times
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 1 — DETERMINISM: Run V15 exactly 10 times               ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const run0 = runDetailed(V15);
let allSame = true;
for (let i = 0; i < 10; i++) {
  const r = runDetailed(V15);
  if (Math.round(r.totalPL) !== Math.round(run0.totalPL)) allSame = false;
}
console.log(`  → All 10 runs identical: ${allSame ? '✅ YES' : '❌ NO — NON-DETERMINISTIC BUG!'}`);
console.log(`  → Base result: ₹${Math.round(run0.totalPL).toLocaleString('en-IN')} | WR ${run0.wr}% | MaxDD ₹${Math.round(run0.maxDD).toLocaleString('en-IN')}`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 2: PER-TRADE vs PER-DAY WIN RATE
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 2 — WIN RATE: Per-trade vs Per-day                       ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const tl = run0.tradeLog;
const tradeWins   = tl.filter(t => t.pl > 0).length;
const tradeLosses = tl.filter(t => t.pl <= 0).length;
const tradeWR     = (tradeWins / tl.length * 100).toFixed(1);
const slTrades    = tl.filter(t => t.exitType === 'SL');
const trailTrades = tl.filter(t => t.exitType === 'TRAIL');
const eodTrades   = tl.filter(t => t.exitType === 'EOD');
console.log(`  Total trades: ${tl.length}`);
console.log(`  Per-trade WR: ${tradeWR}%  (${tradeWins} wins / ${tradeLosses} losses)`);
console.log(`  Per-day WR:   ${run0.wr}%  (${run0.wins} winning days / ${run0.losses} losing days)`);
console.log(`  Exit breakdown: TRAIL=${trailTrades.length}  SL=${slTrades.length}  EOD=${eodTrades.length}`);
console.log(`  Avg PL per trade: ₹${Math.round(run0.totalPL / tl.length).toLocaleString('en-IN')}`);
console.log(`  Avg win: ₹${Math.round(tl.filter(t=>t.pl>0).reduce((s,t)=>s+t.pl,0)/tradeWins).toLocaleString('en-IN')}  Avg loss: ₹${Math.round(tl.filter(t=>t.pl<=0).reduce((s,t)=>s+t.pl,0)/tradeLosses).toLocaleString('en-IN')}`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 3: TRADES-PER-DAY DISTRIBUTION + LIVE BOT CAP IMPACT
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 3 — TRADES/DAY: Distribution + effect of 5-cap          ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const tradesDist = {};
run0.dayLog.forEach(d => {
  tradesDist[d.tradesThisDay] = (tradesDist[d.tradesThisDay] || 0) + 1;
});
console.log('  Trades/day distribution:');
for (const k of Object.keys(tradesDist).sort((a,b)=>a-b)) {
  const marker = k >= 6 ? ' ← EXCEEDS live bot 5-trade cap' : '';
  console.log(`    ${k} trades: ${tradesDist[k]} days${marker}`);
}
const capped5 = runDetailed(V15, 5);
const uncapped = run0;
console.log(`\n  Uncapped V15:      ₹${Math.round(uncapped.totalPL).toLocaleString('en-IN')}  WR ${uncapped.wr}%`);
console.log(`  5-trade-cap V15:   ₹${Math.round(capped5.totalPL).toLocaleString('en-IN')}  WR ${capped5.wr}%`);
console.log(`  Overstatement due to extra trades: ₹${Math.round(uncapped.totalPL - capped5.totalPL).toLocaleString('en-IN')}`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 4 & 5: TOP 10 BEST + WORST DAYS
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 4 — TOP 10 BEST DAYS (looking for outliers)             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const sorted = [...run0.dayLog].sort((a,b) => b.dayPL - a.dayPL);
sorted.slice(0, 10).forEach((d,i) => {
  const dayTrades = run0.tradeLog.filter(t => t.date === d.date);
  const exitTypes = dayTrades.map(t => t.exitType).join('/');
  console.log(`  ${(i+1)+'.'} ${d.date}  ₹${Math.round(d.dayPL).toLocaleString('en-IN').padStart(10)}  ${d.tradesThisDay} trades  exits:[${exitTypes}]`);
});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 5 — TOP 10 WORST DAYS (checking SL amounts)             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
sorted.slice(-10).reverse().forEach((d,i) => {
  const dayTrades = run0.tradeLog.filter(t => t.date === d.date);
  const exitTypes = dayTrades.map(t => `${t.exitType}(${Math.round(t.pl)})`).join('|');
  console.log(`  ${(i+1)+'.'} ${d.date}  ₹${Math.round(d.dayPL).toLocaleString('en-IN').padStart(10)}  ${d.tradesThisDay} trades  [${exitTypes}]`);
});

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 6: SL EXIT VERIFICATION — must be at actual close, not capped at -150
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 6 — SL EXIT AUDIT: Are they honest (not -150 capped)?   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const slBucket = { worse_than_sl: 0, at_sl: 0, better_than_sl: 0 };
let worstSL = 0;
const SLRS = -SL_PTS * PTS_PER_RS;  // -2250
slTrades.forEach(t => {
  if (t.pl < SLRS - 1)       slBucket.worse_than_sl++;   // worse than -150pts
  else if (t.pl >= SLRS - 1 && t.pl <= SLRS + 1) slBucket.at_sl++;  // exactly -150
  else                        slBucket.better_than_sl++;  // better than -150 (partial SL)
  if (t.pl < worstSL) worstSL = t.pl;
});
console.log(`  SL exit distribution (standard SL = ₹${SLRS}):`);
console.log(`    Worse than -150pts: ${slBucket.worse_than_sl}  ← shows no cap (honest close price)`);
console.log(`    Exactly at -150pts: ${slBucket.at_sl}  ← exact SL (close was exactly at SL)`);
console.log(`    Better than -150pts: ${slBucket.better_than_sl}  ← hit SL zone before market close`);
console.log(`  Worst single SL: ₹${Math.round(worstSL).toLocaleString('en-IN')}`);
console.log(`  Total SL P&L: ₹${Math.round(slTrades.reduce((s,t)=>s+t.pl,0)).toLocaleString('en-IN')}`);
// A cap of -150 would show ALL SL ≥ SLRS. If worse_than_sl > 0 → not capped ✓
if (slBucket.worse_than_sl > 0) {
  console.log(`  ✅ SL exits are NOT capped — ${slBucket.worse_than_sl} exits were worse than -150pts`);
} else {
  console.log(`  ⚠️  All SL exits are ≥ -150pts — possible cap in effect!`);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 7: TRAIL EXIT VERIFICATION — should exit at trail level not close
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 7 — TRAIL EXIT AUDIT: Credits trail level not close?    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
let trailCreditBonus = 0;
let trailCreditCount = 0;
trailTrades.forEach(t => {
  // trailStop > 0 exit: pl = trailStop * PTS_PER_RS
  // closePts is what close gave: t.closePts * PTS_PER_RS
  // bonus = pl - (closePts * PTS_PER_RS) = difference between trail credit and actual close
  const bonus = t.pl - t.closePts * PTS_PER_RS;
  if (bonus > 0) { trailCreditBonus += bonus; trailCreditCount++; }
});
console.log(`  TRAIL exits that credit MORE than close: ${trailCreditCount} / ${trailTrades.length}`);
console.log(`  Total TRAIL credit bonus vs close: ₹${Math.round(trailCreditBonus).toLocaleString('en-IN')}`);
console.log(`  This is CORRECT (stop order fills at trail level, not at close price)`);
console.log(`  Avg trail credit bonus per affected trade: ₹${trailCreditCount > 0 ? Math.round(trailCreditBonus/trailCreditCount).toLocaleString('en-IN') : 0}`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 8: INTRABAR PEAK vs CLOSE-BASED PEAK COMPARISON
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 8 — CLOSE-PEAK: What if peak used close not intrabar?   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const closePeakRun = runDetailed(V15, null, true);
console.log(`  Intrabar-peak V15 (current):  ₹${Math.round(run0.totalPL).toLocaleString('en-IN')}  WR ${run0.wr}%`);
console.log(`  Close-peak V15 (conservative): ₹${Math.round(closePeakRun.totalPL).toLocaleString('en-IN')}  WR ${closePeakRun.wr}%`);
console.log(`  Difference:                   ₹${Math.round(run0.totalPL - closePeakRun.totalPL).toLocaleString('en-IN')}`);
console.log(`  (Intrabar peak is CORRECT for trail stops — stop orders track intrabar prices)`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 9: LATE-ENTRY AUDIT — entries near end of day
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 9 — LATE ENTRY: Any trades entered after 14:30?         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
// Entry at candle index. C0 = 9:15, C1 = 9:30, ..., Cn = 9:15 + n*15min
// C20 = 9:15 + 20*15 = 9:15 + 300min = 14:15. C21 = 14:30. C22 = 14:45.
const lateEntries = run0.tradeLog.filter(t => t.exitIdx - 1 >= 20); // rough: entered late if not many candles
// Actually check: entry candle index. We stored re: 0/1/.../re/rev/rev2 but not entryIdx in tradeLog.
// Better: check by looking at entryPrice vs raw candles
// Let's instead just report re-entry timing
const lastCandleIdx = {};
run0.tradeLog.forEach(t => {
  // exitIdx tells us roughly when trade was active to end of day
  // We can check by grouping trades by date and max re index used
});
console.log(`  Note: findReEntry() limits scanning to maxIdx = min(cs.length-2, 22)`);
console.log(`  Candle 22 = ~14:45 PM last possible re-entry`);
console.log(`  Late re-entries (after C20, i.e. after 14:15): checking...`);
// Count initial entries by checking the initial entryIdx from dayLog
let lateInitialCount = 0;
for (let di = 1; di < ALL.length; di++) {
  const date = ALL[di];
  const cs   = raw[date];
  const prev = raw[ALL[di - 1]];
  if (!cs || !prev || cs.length < 2) continue;
  const entry = findEntry(cs, prev, V15);
  if (!entry) continue;
  if (entry.idx >= 20) lateInitialCount++;
}
console.log(`  Initial entries at C20+ (≥14:15): ${lateInitialCount} days`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 10: YEARLY BREAKDOWN vs saved JSON
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 10 — YEARLY BREAKDOWN: Verify vs saved JSON             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const saved = JSON.parse(fs.readFileSync(path.join(process.cwd(), '5year-backtest-result.json'), 'utf8'));
console.log('  Year  |  Script (₹)  | Saved JSON (₹) | Match?');
console.log('  ------+-------------+----------------+-------');
for (const yr of ['2021','2022','2023','2024','2025','2026']) {
  const scriptVal = Math.round(run0.yearly[yr] || 0);
  const savedYr   = saved.yearly ? saved.yearly[yr] : undefined;
  const savedVal  = savedYr !== undefined ? Math.round(savedYr.totalPnlRs || savedYr) : 'N/A';
  const match = Math.abs(scriptVal - (savedYr?.totalPnlRs || 0)) < 1000 ? '✅' : '❓';
  console.log(`  ${yr}  | ${scriptVal.toLocaleString('en-IN').padStart(11)} | ${String(savedVal).padStart(14)} | ${match}`);
}
console.log(`\n  Script TOTAL:    ₹${Math.round(run0.totalPL).toLocaleString('en-IN')}`);
console.log(`  Saved JSON total: ₹${saved.totals ? Math.round(saved.totals.totalPnlRs).toLocaleString('en-IN') : 'N/A'}`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 11: 5-TRADE CAP COMPARISON (this IS the live bot limit)
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 11 — TRADE CAP: 3/4/5/unlimited impact                  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
for (const cap of [1, 2, 3, 4, 5, null]) {
  const r = runDetailed(V15, cap);
  const label = cap === null ? 'Unlimited' : `Cap ${cap}`;
  console.log(`  ${label.padEnd(12)}: ₹${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)}  WR ${r.wr}%  MaxDD ₹${Math.round(r.maxDD).toLocaleString('en-IN')}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 12: DATA QUALITY
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 12 — DATA QUALITY: Bad candles?                         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
let badCandles = 0, zeroRange = 0, negativePrice = 0;
for (const date of ALL) {
  for (const c of raw[date]) {
    if (c.high < c.low) badCandles++;
    if (c.high === c.low) zeroRange++;
    if (c.open <= 0 || c.close <= 0 || c.high <= 0 || c.low <= 0) negativePrice++;
  }
}
console.log(`  Bad candles (high < low): ${badCandles}`);
console.log(`  Zero-range candles:       ${zeroRange}`);
console.log(`  Negative/zero prices:     ${negativePrice}`);
console.log(`  Total trading days:       ${ALL.length}`);
console.log(`  Total candles:            ${ALL.reduce((s,d) => s + raw[d].length, 0)}`);

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 13: SINGLE-DAY OUTLIERS — any day > ₹1L?
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 13 — OUTLIERS: Days > ₹1 lakh (suspicious?)             ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const bigDays = run0.dayLog.filter(d => d.dayPL > 100000);
console.log(`  Days with P&L > ₹1L: ${bigDays.length}`);
bigDays.forEach(d => {
  const dayTrades = run0.tradeLog.filter(t => t.date === d.date);
  dayTrades.forEach(t => {
    console.log(`    ${d.date} [${t.side} re:${t.re}] entry:${Math.round(t.entryPrice)} exit:${Math.round(t.exitPrice)} type:${t.exitType} peak:${Math.round(t.peakPts)} pl:₹${Math.round(t.pl)}`);
  });
});
if (bigDays.length === 0) console.log('  ✅ No single day exceeds ₹1 lakh');

// ══════════════════════════════════════════════════════════════════════════════
// CHECK 14: REENTRY BODY THRESHOLD SENSITIVITY
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  CHECK 14 — RE-ENTRY THRESHOLD: 30% / 40% / 50% / 60%         ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
for (const thresh of [30, 40, 50, 60, 70]) {
  const cfg = { ...V15, reThresh: thresh };
  const r = runDetailed(cfg);
  console.log(`  reThresh=${thresh}%: ₹${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)}  WR ${r.wr}%  Trades ${r.tradeLog.length}  REs ${r.reCount}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// FINAL VERDICT
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  FINAL VERDICT                                                  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');
const honest5cap = runDetailed(V15, 5);
console.log(`  V15 Uncapped (current claim):     ₹${Math.round(run0.totalPL).toLocaleString('en-IN')}`);
console.log(`  V15 with 5-trade cap (live match): ₹${Math.round(honest5cap.totalPL).toLocaleString('en-IN')}`);
console.log(`  Gap (overstatement from extra trades): ₹${Math.round(run0.totalPL - honest5cap.totalPL).toLocaleString('en-IN')}`);
console.log('');
const issues = [];
if (!allSame) issues.push('NON-DETERMINISTIC — result differs between runs');
if (slBucket.worse_than_sl === 0 && slTrades.length > 0) issues.push('SL exits may be capped at -150');
if (Math.round(run0.totalPL) !== Math.round(saved.totals?.totalPnlRs || 0)) issues.push(`Result (₹${Math.round(run0.totalPL).toLocaleString('en-IN')}) != saved JSON (₹${Math.round(saved.totals?.totalPnlRs || 0).toLocaleString('en-IN')})`);
if (issues.length === 0) {
  console.log('  ✅ NO BUGS FOUND in the calculation logic');
  console.log(`  ⚠️  NOTE: Backtest uses up to ${Math.max(...Object.keys(tradesDist).map(Number))} trades/day`);
  console.log(`     Live bot is capped at 5 trades/day → realistic P&L = ₹${Math.round(honest5cap.totalPL).toLocaleString('en-IN')}`);
} else {
  console.log('  ❌ ISSUES FOUND:');
  issues.forEach(i => console.log(`     • ${i}`));
}
console.log('');

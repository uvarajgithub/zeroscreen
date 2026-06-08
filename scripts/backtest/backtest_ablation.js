'use strict';
// ════════════════════════════════════════════════════════════════════════════
// backtest_ablation.js — BHAV ENTRY FILTER ABLATION STUDY
// ════════════════════════════════════════════════════════════════════════════
// Starts with ZERO filters on current BHAV strategy.
// Adds one filter at a time to show P&L impact.
// Goal: find the combination that beats ₹30L.
//
// Exit logic (fixed, honest for all configs):
//   TRAIL: candle-close check, exit at TRAIL LEVEL (stop order analogy)
//   SL:    candle-close check, exit at ACTUAL CLOSE (honest, no -150 cap)
//   This mirrors live bot candle-close processing with honest SL.
//
// Usage: node backtest_ablation.js cache/banknifty_5yr.json

const fs   = require('fs');
const path = require('path');

const CACHE_FILE = process.argv[2] || path.join(process.cwd(), 'cache', 'banknifty_5yr.json');
const PTS_PER_RS = 15;
const SL_PTS     = 150;
const TRAIL_GAP  = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;
const body = c  => c.close - c.open;
const rng  = c  => c.high - c.low;
const bp   = c  => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;

// ── Exit: TRAIL at trail level + SL at actual close (honest) ─────────────────
function calcPL(candles, entryIdx, side, tGap) {
  const TGAP = tGap || TRAIL_GAP;
  const entryPrice = candles[entryIdx].close;
  const sign = side === 'CE' ? 1 : -1;
  let trailStop = -SL_PTS;
  let peakPts   = 0;

  for (let i = entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];
    const favPts = side === 'CE' ? (c.high - entryPrice) : (entryPrice - c.low);
    if (favPts > peakPts) {
      peakPts   = favPts;
      trailStop = peakPts >= TGAP ? peakPts - TGAP : -SL_PTS;
    }
    const closePts = sign * (c.close - entryPrice);
    if (closePts <= trailStop) {
      if (trailStop > 0) {
        // TRAIL exit: stop order would fill at trail level (credit trail, not close)
        return { pl: trailStop * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'TRAIL',
                 entryPrice, exitPrice: entryPrice + sign * trailStop };
      } else {
        // SL exit: actual close price (honest — no -150 cap)
        return { pl: closePts * PTS_PER_RS, peakPts, exitIdx: i, exitType: 'SL',
                 entryPrice, exitPrice: c.close };
      }
    }
  }
  const exitPrice = candles[candles.length - 1].close;
  return { pl: sign * (exitPrice - entryPrice) * PTS_PER_RS, peakPts,
           exitIdx: candles.length - 1, exitType: 'EOD', entryPrice, exitPrice };
}

// ── Re-entry scanner: next strong candle in same direction ───────────────────
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

// ── Entry logic (configurable) ───────────────────────────────────────────────
function findEntry(cs, prevCS, cfg) {
  const PH  = pdh(prevCS);
  const PL  = pdl(prevCS);
  const PDR = PH - PL;
  const C0  = cs[0];

  // PDR filter
  if (cfg.pdrMin > 0 && PDR < cfg.pdrMin) return null;

  // Whipsaw guard
  if (cfg.whipsawGuard) {
    const bps = cs.slice(0, Math.min(3, cs.length)).map(bp);
    let whip = 0;
    for (let i = 1; i < bps.length; i++)
      if (bps[i] * bps[i-1] < 0 && Math.abs(bps[i]) > 65 && Math.abs(bps[i-1]) > 65) whip++;
    if (whip >= 2) return null;
  }

  const vsPDH = C0.open - PH;
  const vsPDL = C0.open - PL;  // negative = gap down

  // Context
  const isAbove  = vsPDH > 0;
  const isBelow  = vsPDL < 0;
  const isInside = !isAbove && !isBelow;

  const maxIdx = Math.min(cs.length - 2, cfg.maxCandle || 25);

  // ── ABOVE PDH ──────────────────────────────────────────────────────────────
  if (isAbove) {
    if (!cfg.aboveBhav) {
      // V0 bare: just CE at C0
      return { idx: 0, side: 'CE' };
    }
    // BHAV ABOVE_PDH logic
    const C0bp = bp(C0);
    if (vsPDH < 120) {
      // Barely above PDH: treat as inside (unreliable gap)
      return cfg.includeInside ? findInsideEntry(cs, PH, PL, cfg, 0) : null;
    }
    if (vsPDH > 1000) {
      // Extraordinary gap: follow it — CE
      return { idx: 0, side: 'CE' };
    }
    // 120–1000: fake breakout zone
    if (C0bp > 85) return { idx: 0, side: 'CE' };  // very strong C0 → trend day CE
    return { idx: 0, side: 'PE' };                   // fake breakout → PE
  }

  // ── BELOW PDL ─────────────────────────────────────────────────────────────
  if (isBelow) {
    if (!cfg.belowBhav) {
      // V0 bare: just PE at C0
      return { idx: 0, side: 'PE' };
    }
    // BHAV BELOW_PDL logic
    const C0bp = bp(C0);
    if (C0bp < -80) return { idx: 0, side: 'PE' };   // strong trend down
    if (C0bp < -65) return null;                       // climax/exhaustion → skip
    if (C0bp > 65)  return { idx: 0, side: 'PE' };   // strong bounce → still PE (sell bounce)
    // Weak C0: if high peeked above PDL treat as inside
    if (C0.high > PL) return cfg.includeInside ? findInsideEntry(cs, PH, PL, cfg, 0) : null;
    return { idx: 0, side: 'PE' };
  }

  // ── INSIDE ────────────────────────────────────────────────────────────────
  if (!cfg.includeInside) return null;
  return findInsideEntry(cs, PH, PL, cfg, 0);
}

function findInsideEntry(cs, PH, PL, cfg, fromIdx) {
  const maxIdx = Math.min(cs.length - 2, cfg.maxCandle || 25);

  if (!cfg.insideBhav) {
    // Simple: first strong candle (body > threshold)
    for (let i = fromIdx; i <= Math.min(maxIdx, cfg.insideMaxC || 10); i++) {
      const cbp = bp(cs[i]);
      if (cbp > (cfg.insideBody || 50)) return { idx: i, side: 'CE' };
      if (cbp < -(cfg.insideBody || 50)) return { idx: i, side: 'PE' };
    }
    return null;
  }

  // BHAV INSIDE logic
  const C0 = cs[0];
  const C0bp = bp(C0);
  // Shooting star: upper wick > 55% of range AND bearish close
  const hwick = C0.high - Math.max(C0.open, C0.close);
  if (hwick > 0.55 * rng(C0) && C0bp < -20) return { idx: 0, side: 'PE' };
  // Strong C0
  if (Math.abs(C0bp) > 55) return { idx: 0, side: C0bp > 0 ? 'CE' : 'PE' };
  // Weak C0: scan C1–C4 for first strong
  for (let i = 1; i <= Math.min(4, maxIdx); i++) {
    const cbp = bp(cs[i]);
    if (Math.abs(cbp) > 55) return { idx: i, side: cbp > 0 ? 'CE' : 'PE' };
  }
  // Late entry: PDH/PDL intraday test (C5–C20)
  if (cfg.insideLate) {
    for (let i = 5; i <= Math.min(20, maxIdx); i++) {
      const cbp = bp(cs[i]);
      if (cbp > 55 && cs[i].close > PH) return { idx: i, side: 'CE' };
      if (cbp < -55 && cs[i].close < PL) return { idx: i, side: 'PE' };
    }
  }
  return null;
}

// ── Run one configuration ─────────────────────────────────────────────────────
function runConfig(cfg, raw, ALL) {
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
    const res1 = calcPL(cs, entry.idx, entry.side, cfg.trailGap);
    dayPL += res1.pl;

    // Re-entries
    let curExit = res1;
    let curSide = entry.side;
    for (let re = 0; re < (cfg.reEntries || 0); re++) {
      if (curExit.exitType !== 'TRAIL' || curExit.pl <= 0) break;
      if (curExit.exitIdx >= cs.length - 2) break;
      const reIdx = findReEntry(cs, curExit.exitIdx + 1, curSide, cfg.reThresh);
      if (reIdx < 0) break;
      reCount++;
      const resRe = calcPL(cs, reIdx, curSide, cfg.trailGap);
      dayPL += resRe.pl;
      curExit = resRe;
    }

    // Reverse re-entry (after big profitable move, strong opposite candle)
    if (cfg.reverseRE && curExit.exitType === 'TRAIL' && curExit.peakPts >= 100 && curExit.pl > 0
        && curExit.exitIdx < cs.length - 2) {
      const revSide = curSide === 'CE' ? 'PE' : 'CE';
      const revIdx  = findReEntry(cs, curExit.exitIdx + 1, revSide, cfg.reThresh);
      if (revIdx >= 0) {
        reCount++;
        const resRev = calcPL(cs, revIdx, revSide, cfg.trailGap);
        dayPL += resRev.pl;
        // One more in same direction after reverse
        if (resRev.exitType === 'TRAIL' && resRev.pl > 0 && resRev.exitIdx < cs.length - 2) {
          const reIdx2 = findReEntry(cs, resRev.exitIdx + 1, revSide, cfg.reThresh);
          if (reIdx2 >= 0) {
            reCount++;
            dayPL += calcPL(cs, reIdx2, revSide, cfg.trailGap).pl;
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
  }

  const traded = wins + losses;
  return { totalPL, wins, losses, traded,
           wr: traded > 0 ? (wins/traded*100).toFixed(1) : '0',
           maxDD, reCount, yearly };
}

// ── Load data ─────────────────────────────────────────────────────────────────
const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

// ── Ablation configurations: add one filter at a time ────────────────────────
const CONFIGS = [
  {
    name: 'V0  Bare: Above→CE, Below→PE, Inside→skip',
    pdrMin: 0, whipsawGuard: false,
    aboveBhav: false, belowBhav: false,
    includeInside: false, insideBhav: false, insideLate: false,
    maxCandle: 0, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V1  + Include INSIDE (first strong C0–C10, body>50%)',
    pdrMin: 0, whipsawGuard: false,
    aboveBhav: false, belowBhav: false,
    includeInside: true, insideBhav: false, insideBody: 50, insideMaxC: 10, insideLate: false,
    maxCandle: 10, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V2  + PDR filter ≥200 pts (remove flat days)',
    pdrMin: 200, whipsawGuard: false,
    aboveBhav: false, belowBhav: false,
    includeInside: true, insideBhav: false, insideBody: 50, insideMaxC: 10, insideLate: false,
    maxCandle: 10, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V3  + Whipsaw guard (skip 2+ alternating 65%+ candles)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: false, belowBhav: false,
    includeInside: true, insideBhav: false, insideBody: 50, insideMaxC: 10, insideLate: false,
    maxCandle: 10, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V4  + BHAV ABOVE_PDH rules (fake-breakout PE)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: true, belowBhav: false,
    includeInside: true, insideBhav: false, insideBody: 50, insideMaxC: 10, insideLate: false,
    maxCandle: 10, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V5  + BHAV BELOW_PDL rules (skip climax, bounce→PE)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: false, insideBody: 50, insideMaxC: 10, insideLate: false,
    maxCandle: 10, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V6  + BHAV INSIDE rules (shooting star, strong C0, late)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 0, reverseRE: false,
  },
  {
    name: 'V7  + 1 Same-dir re-entry after TRAIL',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 1, reverseRE: false,
  },
  {
    name: 'V8  + 3 Same-dir re-entries (max per day)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 3, reverseRE: false,
  },
  {
    name: 'V9  + Reverse re-entry after big TRAIL (peakPts≥100)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 3, reverseRE: true,
  },
  // ── Bonus: try tweaking PDR threshold ──
  {
    name: 'V10 V9 + PDR ≥250 (stricter volatility filter)',
    pdrMin: 250, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 3, reverseRE: true,
  },
  {
    name: 'V11 V9 + PDR ≥150 (looser, more trades)',
    pdrMin: 150, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 3, reverseRE: true,
  },
  // ── Push for ₹30L ──
  {
    name: 'V12 V11 + 5 re-entries',
    pdrMin: 150, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 5, reverseRE: true,
  },
  {
    name: 'V13 V11 + LOCK10 trail (tighter lock)',
    pdrMin: 150, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 3, reverseRE: true, trailGap: 10,
  },
  {
    name: 'V14 V11 + Lower RE threshold (body>40%)',
    pdrMin: 150, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 5, reverseRE: true, reThresh: 40,
  },
  {
    name: 'V15 LOCK10 + 5 RE + body>40% (aggressive)',
    pdrMin: 150, whipsawGuard: true,
    aboveBhav: true, belowBhav: true,
    includeInside: true, insideBhav: true, insideLate: true,
    maxCandle: 20, reEntries: 5, reverseRE: true, trailGap: 10, reThresh: 40,
  },
  {
    name: 'V16 LOCK10 + 5 RE + No BHAV rules (bare+inside)',
    pdrMin: 200, whipsawGuard: true,
    aboveBhav: false, belowBhav: false,
    includeInside: true, insideBhav: false, insideBody: 45, insideMaxC: 15, insideLate: false,
    maxCandle: 15, reEntries: 5, reverseRE: true, trailGap: 10, reThresh: 40,
  },
];

// ── Run all configs and print table ──────────────────────────────────────────
const sep = '═'.repeat(110);
console.log('\n' + sep);
console.log('  BHAV STRATEGY — ENTRY FILTER ABLATION STUDY');
console.log('  Exit: Candle-close TRAIL at trail level | SL at actual close (Honest)');
console.log('  Data: BankNifty 5yr 15-min | ' + ALL[0] + ' → ' + ALL[ALL.length-1]);
console.log(sep);
console.log(`${'Config'.padEnd(60)} ${'P&L (₹)'.padStart(12)} ${'WR%'.padStart(6)} ${'Trades'.padStart(7)} ${'MaxDD'.padStart(9)} ${'REs'.padStart(5)}`);
console.log('─'.repeat(110));

const results = [];
for (const cfg of CONFIGS) {
  const r = runConfig(cfg, raw, ALL);
  const mark = r.totalPL >= 3000000 ? ' ★' : '';
  console.log(
    `${(cfg.name + mark).padEnd(60)} ` +
    `${Math.round(r.totalPL).toLocaleString('en-IN').padStart(12)} ` +
    `${r.wr.padStart(6)} ` +
    `${r.traded.toString().padStart(7)} ` +
    `${Math.round(r.maxDD).toLocaleString('en-IN').padStart(9)} ` +
    `${r.reCount.toString().padStart(5)}`
  );
  results.push({ ...r, name: cfg.name });
}

const best = results.reduce((a, b) => b.totalPL > a.totalPL ? b : a);
console.log('─'.repeat(110));
console.log(`\nBEST CONFIG: ${best.name}`);
console.log(`  Total P&L : ₹${Math.round(best.totalPL).toLocaleString('en-IN')}  (${(best.totalPL/PTS_PER_RS).toFixed(1)} pts)`);
console.log(`  Win Rate  : ${best.wr}%  (${best.wins}W / ${best.losses}L / ${best.traded} traded)`);
console.log(`  Max DD    : ₹${Math.round(best.maxDD).toLocaleString('en-IN')}`);
console.log(`  Re-entries: ${best.reCount}`);
console.log('\n  YEARLY:');
for (const [yr, pl] of Object.entries(best.yearly).sort())
  console.log(`    ${yr}: ₹${Math.round(pl).toLocaleString('en-IN')}`);
console.log(sep + '\n');

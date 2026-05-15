// cpr_strategy.js  —  CPR + Pivot Strategy for BankNifty Options
// ─────────────────────────────────────────────────────────────────────────────
// CONCEPT:
//   CPR (Central Pivot Range) predicts day type using PREVIOUS day OHLC:
//   - Narrow CPR (width < 100pts) → TRENDING day expected  → TRADE
//   - Wide   CPR (width > 200pts) → CHOPPY  day expected  → SKIP
//   - Medium CPR (100–200)        → NORMAL                → TRADE with care
//
//   Levels:
//     Pivot  P = (H + L + C) / 3
//     BC     = (H + L) / 2
//     TC     = (2*P) - BC
//     R1     = 2*P - L      (first resistance)
//     S1     = 2*P - H      (first support)
//     R2     = P + (H - L)  (second resistance)
//     S2     = P - (H - L)  (second support)
//
//   STRATEGY A — Trail:
//     Entry : first 15-min candle close beyond TC+30 (CE) or BC-30 (PE)
//     SL    : 100 pts (underlying)
//     Exit  : Trail lock-50 OR 3:15 PM
//     Re-entry: 1 allowed if SL hit and price still beyond CPR
//
//   STRATEGY B — Pivot Target:
//     Same entry, but EXIT at R1/S1 as profit target (not trail)
//     Fallback: SL or 3:15 PM
//
//   FILTER:  Skip if CPR width > 200 (clear choppy signal)
//            Reduce SL to 75pts if CPR width 100–200 (medium days)
// ─────────────────────────────────────────────────────────────────────────────
'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QM           = 15;  // Rs15 per underlying point (qty30 × delta0.5)

// ── API ───────────────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': 'token ' + API_KEY + ':' + ACCESS_TOKEN },
      timeout: 30000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }

async function fetchChunk(from, to) {
  const url = '/instruments/historical/260105/15minute?from=' + from +
    '+09:00:00&to=' + to + '+15:30:00&continuous=0&oi=0';
  try {
    const r = await kiteGet(url);
    if (!r.data || !r.data.candles) return [];
    return r.data.candles.map(c => {
      const dt  = new Date(c[0]);
      const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        date:  ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0'),
        h: ist.getHours(), m: ist.getMinutes(),
        open: c[1], high: c[2], low: c[3], close: c[4]
      };
    });
  } catch(e) { return []; }
}

async function fetchAll() {
  const all   = [];
  const start = new Date('2021-01-01');
  const end   = new Date('2026-05-13');
  let cur = new Date(start);
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  while (cur <= end) {
    const ce = new Date(cur);
    ce.setDate(cur.getDate() + 190);
    if (ce > end) ce.setTime(end.getTime());
    all.push(...await fetchChunk(fmtDate(cur), fmtDate(ce)));
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 191);
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(' ' + all.length + ' candles');
  return all;
}

function groupByDay(candles) {
  const map = {};
  for (const c of candles) {
    if (!map[c.date]) map[c.date] = [];
    map[c.date].push(c);
  }
  return Object.entries(map)
    .sort(([a],[b]) => a < b ? -1 : 1)
    .map(([date, cs]) => ({ date, candles: cs }));
}

// ── CPR Calculation ───────────────────────────────────────────────────────────
function calcCPR(H, L, C) {
  const P  = (H + L + C) / 3;
  const BC = (H + L) / 2;
  const TC = 2 * P - BC;
  return {
    P,
    TC: Math.max(TC, BC),   // TC always >= BC
    BC: Math.min(TC, BC),
    R1: 2 * P - L,
    S1: 2 * P - H,
    R2: P + (H - L),
    S2: P - (H - L),
    width: Math.abs(TC - BC)
  };
}

// ── Trail: lock in (peak - 50) once peak > 100 ────────────────────────────────
function trail(sl, entry, dir, peak) {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === 'CE'
    ? Math.max(sl, entry + lock)
    : Math.min(sl, entry - lock);
}

// ── Simulate one day — Strategy A (Trail) ─────────────────────────────────────
function simTrail(candles, cpr) {
  const { TC, BC, width } = cpr;

  // FILTER: skip choppy days
  if (width > 200) return { pnl: 0, trades: 0, wins: 0, skipped: true };

  // Adaptive SL: tighter on medium-width days
  const SL  = width > 100 ? 75 : 100;
  const BUF = 30;

  let pnl = 0, trades = 0, wins = 0;
  let inTrade = false, dir = null, entry = 0, sl = 0, peak = 0;
  let firstDone = false, reUsed = false;

  for (let i = 1; i < candles.length; i++) {
    const c     = candles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 15);

    if (inTrade) {
      // Update peak and trail SL
      const profit = dir === 'CE' ? c.high - entry : entry - c.low;
      if (profit > peak) { peak = profit; sl = trail(sl, entry, dir, peak); }

      // SL hit (wick check)
      const slHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
      if (slHit) {
        const pts = dir === 'CE' ? sl - entry : entry - sl;   // always <= 0 or small +
        pnl += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;

        // One re-entry: only if price still committed beyond CPR on candle close
        if (!reUsed) {
          const reCE = dir === 'CE' && c.close > TC;
          const rePE = dir === 'PE' && c.close < BC;
          if (reCE || rePE) {
            entry  = c.close;
            sl     = dir === 'CE' ? entry - SL : entry + SL;
            peak   = 0;
            reUsed = true;
            inTrade = true;
          }
        }
        continue;
      }

      // EOD exit
      if (isEOD) {
        const pts = dir === 'CE' ? c.close - entry : entry - c.close;
        pnl += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        break;
      }
      continue;
    }

    // Entry: first breakout beyond TC+BUF or BC-BUF
    if (!isEOD && !firstDone) {
      if (c.close > TC + BUF) {
        dir = 'CE'; entry = c.close; sl = entry - SL; peak = 0;
        inTrade = true; firstDone = true;
      } else if (c.close < BC - BUF) {
        dir = 'PE'; entry = c.close; sl = entry + SL; peak = 0;
        inTrade = true; firstDone = true;
      }
    }
  }

  return { pnl, trades, wins, skipped: false };
}

// ── Simulate one day — Strategy B (Pivot Target R1/S1) ───────────────────────
function simPivotTarget(candles, cpr) {
  const { TC, BC, R1, S1, width } = cpr;

  if (width > 200) return { pnl: 0, trades: 0, wins: 0, skipped: true };

  const SL  = width > 100 ? 75 : 100;
  const BUF = 30;

  let pnl = 0, trades = 0, wins = 0;
  let inTrade = false, dir = null, entry = 0, sl = 0, target = 0, peak = 0;
  let firstDone = false, reUsed = false;

  for (let i = 1; i < candles.length; i++) {
    const c     = candles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 15);

    if (inTrade) {
      const profit = dir === 'CE' ? c.high - entry : entry - c.low;
      if (profit > peak) { peak = profit; sl = trail(sl, entry, dir, peak); }

      // Target hit first
      const tgtHit = dir === 'CE' ? c.high >= target : c.low <= target;
      if (tgtHit) {
        const pts = dir === 'CE' ? target - entry : entry - target;
        pnl += pts; trades++; wins++;
        inTrade = false;
        continue;
      }

      // SL hit
      const slHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
      if (slHit) {
        const pts = dir === 'CE' ? sl - entry : entry - sl;
        pnl += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;

        if (!reUsed) {
          const reCE = dir === 'CE' && c.close > TC;
          const rePE = dir === 'PE' && c.close < BC;
          if (reCE || rePE) {
            entry  = c.close;
            sl     = dir === 'CE' ? entry - SL : entry + SL;
            target = dir === 'CE' ? R1 : S1;
            peak   = 0; reUsed = true; inTrade = true;
          }
        }
        continue;
      }

      // EOD exit
      if (isEOD) {
        const pts = dir === 'CE' ? c.close - entry : entry - c.close;
        pnl += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        break;
      }
      continue;
    }

    if (!isEOD && !firstDone) {
      if (c.close > TC + BUF) {
        dir = 'CE'; entry = c.close; sl = entry - SL; target = R1; peak = 0;
        inTrade = true; firstDone = true;
      } else if (c.close < BC - BUF) {
        dir = 'PE'; entry = c.close; sl = entry + SL; target = S1; peak = 0;
        inTrade = true; firstDone = true;
      }
    }
  }

  return { pnl, trades, wins, skipped: false };
}

// ── Simulate one day — Strategy C (Supply/Demand: R2/S2 target, skip narrow) ──
// Use R2/S2 as targets on NARROW CPR (trending) days only — big moves expected
function simSupplyDemand(candles, cpr) {
  const { TC, BC, R2, S2, R1, S1, width } = cpr;

  // Only trade NARROW CPR days (trending)
  if (width > 100) return { pnl: 0, trades: 0, wins: 0, skipped: true };

  const SL  = 100;
  const BUF = 30;

  let pnl = 0, trades = 0, wins = 0;
  let inTrade = false, dir = null, entry = 0, sl = 0, target = 0, peak = 0;
  let firstDone = false, reUsed = false;

  for (let i = 1; i < candles.length; i++) {
    const c     = candles[i];
    const isEOD = c.h > 15 || (c.h === 15 && c.m >= 15);

    if (inTrade) {
      const profit = dir === 'CE' ? c.high - entry : entry - c.low;
      if (profit > peak) { peak = profit; sl = trail(sl, entry, dir, peak); }

      // Phase 1 target: R1/S1 — move SL to breakeven and target R2/S2
      if (!reUsed && peak > Math.abs(target - entry) * 0.5) {
        // halfway to R1/S1, trail will protect
      }

      const tgtHit = dir === 'CE' ? c.high >= target : c.low <= target;
      if (tgtHit) {
        const pts = dir === 'CE' ? target - entry : entry - target;
        pnl += pts; trades++; wins++;
        inTrade = false;
        continue;
      }

      const slHit = dir === 'CE' ? c.low <= sl : c.high >= sl;
      if (slHit) {
        const pts = dir === 'CE' ? sl - entry : entry - sl;
        pnl += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;

        if (!reUsed) {
          const reCE = dir === 'CE' && c.close > TC;
          const rePE = dir === 'PE' && c.close < BC;
          if (reCE || rePE) {
            entry  = c.close;
            sl     = dir === 'CE' ? entry - SL : entry + SL;
            target = dir === 'CE' ? R1 : S1;  // conservative target on re-entry
            peak   = 0; reUsed = true; inTrade = true;
          }
        }
        continue;
      }

      if (isEOD) {
        const pts = dir === 'CE' ? c.close - entry : entry - c.close;
        pnl += pts; trades++;
        if (pts > 0) wins++;
        inTrade = false;
        break;
      }
      continue;
    }

    if (!isEOD && !firstDone) {
      if (c.close > TC + BUF) {
        dir = 'CE'; entry = c.close; sl = entry - SL; target = R2; peak = 0;
        inTrade = true; firstDone = true;
      } else if (c.close < BC - BUF) {
        dir = 'PE'; entry = c.close; sl = entry + SL; target = S2; peak = 0;
        inTrade = true; firstDone = true;
      }
    }
  }

  return { pnl, trades, wins, skipped: false };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const all  = await fetchAll();
  const days = groupByDay(all);

  const YEARS = ['2021','2022','2023','2024','2025','2026'];
  const yrA = {}, yrB = {}, yrC = {};
  for (const y of YEARS) {
    yrA[y] = { days:0, traded:0, skipped:0, pnl:0, wins:0, loss:0, trades:0 };
    yrB[y] = { days:0, traded:0, skipped:0, pnl:0, wins:0, loss:0, trades:0 };
    yrC[y] = { days:0, traded:0, skipped:0, pnl:0, wins:0, loss:0, trades:0 };
  }

  // Drawdown tracking
  let peakA=0, ddA=0, peakB=0, ddB=0, peakC=0, ddC=0;
  let runA=0, runB=0, runC=0;

  let prevH=null, prevL=null, prevC=null;

  for (const { date, candles } of days) {
    if (candles.length < 5) { prevH=prevL=prevC=null; continue; }
    const yr = date.slice(0, 4);
    if (!yrA[yr]) { prevH=null; prevL=null; prevC=null; continue; }

    // Compute this day's OHLC (for use as "prev" in NEXT day)
    const dH = Math.max(...candles.map(c => c.high));
    const dL = Math.min(...candles.map(c => c.low));
    const dC = candles[candles.length-1].close;

    if (prevH === null) { prevH=dH; prevL=dL; prevC=dC; continue; }

    // Calculate CPR from PREVIOUS day
    const cpr = calcCPR(prevH, prevL, prevC);
    prevH=dH; prevL=dL; prevC=dC;

    yrA[yr].days++; yrB[yr].days++; yrC[yr].days++;

    const rA = simTrail(candles, cpr);
    const rB = simPivotTarget(candles, cpr);
    const rC = simSupplyDemand(candles, cpr);

    // Strategy A
    if (rA.skipped) { yrA[yr].skipped++; }
    else {
      yrA[yr].traded++; yrA[yr].pnl += rA.pnl; yrA[yr].trades += rA.trades;
      yrA[yr].wins += rA.wins;
      if (rA.pnl > 0) yrA[yr].winDays = (yrA[yr].winDays||0) + 1;
      runA += rA.pnl;
      if (runA > peakA) peakA = runA;
      const curDDA = peakA - runA;
      if (curDDA > ddA) ddA = curDDA;
    }

    // Strategy B
    if (rB.skipped) { yrB[yr].skipped++; }
    else {
      yrB[yr].traded++; yrB[yr].pnl += rB.pnl; yrB[yr].trades += rB.trades;
      yrB[yr].wins += rB.wins;
      if (rB.pnl > 0) yrB[yr].winDays = (yrB[yr].winDays||0) + 1;
      runB += rB.pnl;
      if (runB > peakB) peakB = runB;
      const curDDB = peakB - runB;
      if (curDDB > ddB) ddB = curDDB;
    }

    // Strategy C
    if (rC.skipped) { yrC[yr].skipped++; }
    else {
      yrC[yr].traded++; yrC[yr].pnl += rC.pnl; yrC[yr].trades += rC.trades;
      yrC[yr].wins += rC.wins;
      if (rC.pnl > 0) yrC[yr].winDays = (yrC[yr].winDays||0) + 1;
      runC += rC.pnl;
      if (runC > peakC) peakC = runC;
      const curDDC = peakC - runC;
      if (curDDC > ddC) ddC = curDDC;
    }
  }

  // ── Print ──────────────────────────────────────────────────────────────────
  const p  = (v, n) => String(v).padStart(n);
  const rs = (pts)  => (pts >= 0 ? '+' : '') + Math.round(pts * QM).toLocaleString('en-IN');
  const pt = (pts)  => (pts >= 0 ? '+' : '') + Math.round(pts);

  console.log('='.repeat(115));
  console.log('  CPR STRATEGY BACKTEST  —  BankNifty 5 Years  (Jan 2021 – May 2026)');
  console.log('  A: CPR Breakout + TrailLock50         (skip CPR width > 200)');
  console.log('  B: CPR Breakout + Pivot Target R1/S1  (skip CPR width > 200)');
  console.log('  C: Narrow CPR only + R2/S2 Target     (only CPR width < 100 = trend days)');
  console.log('  Entry: first candle close beyond TC+30 (CE) or BC-30 (PE) | SL=100pts | QM=Rs15/pt');
  console.log('='.repeat(115));

  for (const label of ['A','B','C']) {
    const yr = label === 'A' ? yrA : label === 'B' ? yrB : yrC;
    const dd = label === 'A' ? ddA : label === 'B' ? ddB : ddC;
    let totPnl=0, totT=0, totTr=0, totSk=0, totW=0, totTrades=0;

    console.log('\n  STRATEGY ' + label + ':');
    console.log('  ' + '-'.repeat(100));
    console.log('  Year  | Days | Traded | Skip% | Total Pts  | Total Rs       | WinDay% | Trade WR');
    console.log('  ' + '-'.repeat(100));

    let totWinDays=0;
    for (const y of YEARS) {
      const d = yr[y];
      if (!d || !d.days) continue;
      const skipPct = Math.round(d.skipped / d.days * 100);
      const wdPct   = d.traded > 0 ? Math.round((d.winDays||0) / d.traded * 100) : 0;
      const twPct   = d.trades > 0 ? Math.round(d.wins / d.trades * 100) : 0;
      console.log('  ' + y + '  | ' + p(d.days,4) + ' | ' + p(d.traded,6) + ' | ' + p(skipPct+'%',5) +
        ' | ' + p(pt(d.pnl),10) + ' | ' + p(rs(d.pnl),14) + ' | ' + p(wdPct+'%',7) + ' | ' + twPct + '%');
      totPnl+=d.pnl; totT+=d.days; totTr+=d.traded; totSk+=d.skipped;
      totW+=d.wins; totTrades+=d.trades; totWinDays+=(d.winDays||0);
    }

    const totSkPct = Math.round(totSk/totT*100);
    const totWdPct = totTr>0 ? Math.round(totWinDays/totTr*100) : 0;
    const totTwPct = totTrades>0 ? Math.round(totW/totTrades*100) : 0;
    console.log('  ' + '-'.repeat(100));
    console.log('  TOTAL | ' + p(totT,4) + ' | ' + p(totTr,6) + ' | ' + p(totSkPct+'%',5) +
      ' | ' + p(pt(totPnl),10) + ' | ' + p(rs(totPnl),14) + ' | ' + p(totWdPct+'%',7) + ' | ' + totTwPct + '%');
    console.log('  Max Drawdown: ' + pt(dd) + ' pts  =  Rs' + Math.round(dd * QM).toLocaleString('en-IN') +
      '  |  Avg/day: ' + (totPnl/totTr).toFixed(1) + ' pts on traded days');
  }

  console.log('\n' + '='.repeat(115));
  console.log('  COMPARISON vs previous best (TICK TRAIL no filter): Rs2,54,850 over 5 years');
  console.log('='.repeat(115));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

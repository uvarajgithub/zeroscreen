/**
 * backtest_prem_sl.js
 * Tests premium SL at various levels vs pure index SL.
 * Uses exact AMINA T100 logic + delta=0.5 to simulate option LTP movement.
 *
 * Model: optionLTP(t) = entryLTP + delta * (index(t) - entryIndex)
 *        entryLTP is fixed at ENTRY_PREM (realistic ATM premium)
 *        delta = 0.5 (ATM approximation)
 *
 * Premium SL fires when: entryLTP + delta*(price-entry) <= entryLTP - PREM_SL
 *   => delta*(price-entry) <= -PREM_SL
 *   => adverse index move >= PREM_SL / delta
 *
 * So PREM_SL=30 with delta=0.5 fires at 60 index pts adverse (same as index SL)
 *    PREM_SL=20 fires at 40 index pts adverse (tighter than index SL=60)
 */

const fs   = require('fs');
const path = require('path');

// ── AMINA T100 constants ────────────────────────────────────────────────────
const SL_INITIAL  = 60;
const TRAIL_GAP   = 100;
const ENTRY_PREM  = 150;   // assumed ATM option premium at entry (proxy)
const DELTA       = 0.5;   // option delta
const QTY         = 30;
const RS_PER_PT   = 15;    // 30 * 0.5 delta

// ── Candle data ─────────────────────────────────────────────────────────────
const CACHE = '/home/ubuntu/trading-bot/research-candles-cache.json';
const raw   = JSON.parse(fs.readFileSync(CACHE));
const candles = (Array.isArray(raw) ? raw : raw.candles || raw.data || Object.values(raw))
  .filter(c => c && c.date && c.open && c.close)
  .sort((a,b) => new Date(a.date) - new Date(b.date));

// ── Group by trading day ─────────────────────────────────────────────────────
function dayKey(c) { return c.date.slice(0,10); }
const days = {};
for (const c of candles) {
  const k = dayKey(c);
  if (!days[k]) days[k] = [];
  days[k].push(c);
}
const dayList = Object.keys(days).sort();

// ── Rolling Entry Scan (exact AMINA T100 logic) ──────────────────────────────
const SCAN_LOOKBACK = 5;
const MIN_MOVE      = 200;
const MAX_MOVE      = 600;

function rollingEntryScan(dayCandles, idx) {
  if (idx < SCAN_LOOKBACK) return null;
  const window = dayCandles.slice(idx - SCAN_LOOKBACK, idx + 1);
  const highs  = window.map(c => c.high);
  const lows   = window.map(c => c.low);
  const wHigh  = Math.max(...highs);
  const wLow   = Math.min(...lows);
  const range  = wHigh - wLow;
  if (range < MIN_MOVE || range > MAX_MOVE) return null;
  const last   = window[window.length - 1];
  const prev   = window[window.length - 2];
  const breakoutUp   = last.close > wHigh - 10 && last.close > prev.close;
  const breakoutDown = last.close < wLow  + 10 && last.close < prev.close;
  if (breakoutUp)   return { dir: 'CE', entry: last.close };
  if (breakoutDown) return { dir: 'PE', entry: last.close };
  return null;
}

// ── Effective SL ─────────────────────────────────────────────────────────────
function effSL(peak) {
  return peak >= SL_INITIAL ? Math.max(0, peak - TRAIL_GAP) : -SL_INITIAL;
}

// ── Run one variant ──────────────────────────────────────────────────────────
function runVariant(premSL) {
  let totalRs = 0, wins = 0, losses = 0, tradeDays = 0;
  let premFired = 0, idxFired = 0;

  for (const dk of dayList) {
    const dc = days[dk];
    if (dc.length < 6) continue;

    let phase = 'SCANNING';
    let t1Dir, t1Entry, t1Peak = 0;
    let reDir, reEntry, rePeak = 0;
    let t1Pts = 0, rePts = 0;
    let dayDone = false;

    for (let i = 0; i < dc.length; i++) {
      const c = dc[i];
      if (dayDone) break;

      // ── SCANNING ────────────────────────────────────────────────────────
      if (phase === 'SCANNING') {
        const sig = rollingEntryScan(dc, i);
        if (sig) {
          t1Dir   = sig.dir;
          t1Entry = sig.entry;
          t1Peak  = 0;
          phase   = 'IN_T1';
        }
        continue;
      }

      // ── Helper: simulate intrabar SL check using candle H/L ─────────────
      // For each candle, the price range is [low, high].
      // Best price = high for CE (favorable), low for CE (adverse)
      function intrabarCheck(dir, entry, peak, candle) {
        // First check best (peak update)
        const bestPrice  = dir === 'CE' ? candle.high  : candle.low;
        const worstPrice = dir === 'CE' ? candle.low   : candle.high;
        const bestPts    = dir === 'CE' ? bestPrice - entry : entry - bestPrice;
        const worstPts   = dir === 'CE' ? worstPrice - entry : entry - worstPrice;
        const newPeak    = Math.max(peak, bestPts); // peak update intrabar

        const sl         = effSL(newPeak);
        const slPx       = dir === 'CE' ? entry + sl : entry - sl;
        const idxHit     = dir === 'CE' ? worstPrice <= slPx : worstPrice >= slPx;

        // premium SL: fires when adverse index move >= premSL/DELTA
        const premThreshold = premSL / DELTA;  // index pts
        const premHit = premSL > 0 && (-worstPts) >= premThreshold;

        // Which fires first? Use adverseMove to order them
        // index SL fires at adverse move = |sl| (since sl can be negative meaning full SL)
        // prem SL fires at adverse move = premSL/delta
        let trigger = null;
        let exitPts;

        if (idxHit || premHit) {
          const idxTriggerPts = -sl;   // adverse pts needed to hit index SL
          const premTriggerPts = premThreshold; // adverse pts to hit prem SL

          if (premHit && idxHit) {
            // both hit: use the one that fires first (smaller adverse move)
            if (premTriggerPts <= idxTriggerPts) {
              trigger  = 'PREM';
              exitPts  = -premTriggerPts;
            } else {
              trigger  = 'IDX';
              exitPts  = sl; // sl is the effective SL (could be -60, 0, or positive trail)
            }
          } else if (premHit) {
            trigger = 'PREM';
            exitPts = -premTriggerPts;
          } else {
            trigger = 'IDX';
            exitPts = sl;
          }
        }

        return { newPeak, trigger, exitPts, closePts: worstPts };
      }

      // ── IN_T1 ────────────────────────────────────────────────────────────
      if (phase === 'IN_T1') {
        const { newPeak, trigger, exitPts } = intrabarCheck(t1Dir, t1Entry, t1Peak, c);
        t1Peak = newPeak;

        if (trigger) {
          t1Pts = exitPts;
          const t1Rs = Math.round(t1Pts * RS_PER_PT);
          if (trigger === 'PREM') premFired++; else idxFired++;

          // RE entry at SL price
          reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
          reEntry = t1Dir === 'CE' ? t1Entry + exitPts : t1Entry - exitPts; // approx exit price
          rePeak  = 0;
          phase   = 'IN_RE';
        } else {
          // No SL: update pts from candle close
          t1Pts  = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
          t1Peak = Math.max(t1Peak, t1Pts);
        }
        continue;
      }

      // ── IN_RE ────────────────────────────────────────────────────────────
      if (phase === 'IN_RE') {
        const { newPeak, trigger, exitPts } = intrabarCheck(reDir, reEntry, rePeak, c);
        rePeak = newPeak;

        if (trigger) {
          rePts = exitPts;
          if (trigger === 'PREM') premFired++; else idxFired++;
          const dayPts = t1Pts + rePts;
          const dayRs  = Math.round(dayPts * RS_PER_PT);
          totalRs += dayRs;
          if (dayRs >= 0) wins++; else losses++;
          tradeDays++;
          dayDone = true;
        } else {
          rePts  = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
          rePeak = Math.max(rePeak, rePts);
        }
      }
    }

    // EOD square-off if still in trade
    if (!dayDone && phase === 'IN_T1' && dc.length > 0) {
      const last = dc[dc.length - 1];
      t1Pts = t1Dir === 'CE' ? last.close - t1Entry : t1Entry - last.close;
      // EOD exit: no RE entry, just close
      totalRs += Math.round(t1Pts * RS_PER_PT);
      if (t1Pts >= 0) wins++; else losses++;
      tradeDays++;
    } else if (!dayDone && phase === 'IN_RE' && dc.length > 0) {
      const last = dc[dc.length - 1];
      rePts = reDir === 'CE' ? last.close - reEntry : reEntry - last.close;
      const dayPts = t1Pts + rePts;
      const dayRs  = Math.round(dayPts * RS_PER_PT);
      totalRs += dayRs;
      if (dayRs >= 0) wins++; else losses++;
      tradeDays++;
    }
  }

  return { totalRs, wins, losses, tradeDays, premFired, idxFired };
}

// ── Run all variants ─────────────────────────────────────────────────────────
const variants = [
  { label: 'No prem SL (index only)', premSL: 0 },
  { label: 'PREM_SL = 20 pts  (≈40 idx pts)', premSL: 20 },
  { label: 'PREM_SL = 25 pts  (≈50 idx pts)', premSL: 25 },
  { label: 'PREM_SL = 30 pts  (≈60 idx pts)', premSL: 30 },
  { label: 'PREM_SL = 40 pts  (≈80 idx pts)', premSL: 40 },
  { label: 'PREM_SL = 50 pts  (≈100 idx pts) ← current', premSL: 50 },
];

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log(' AMINA T100 — Premium SL Backtest (delta=0.5, qty=30, Apr21–Apr26)');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(
  ' Variant'.padEnd(42),
  'Net ₹'.padStart(12),
  'Win%'.padStart(7),
  'Days'.padStart(6),
  'PremFired'.padStart(10),
  'IdxFired'.padStart(9)
);
console.log('─'.repeat(90));

for (const v of variants) {
  const r = runVariant(v.premSL);
  const winPct = r.tradeDays > 0 ? ((r.wins / r.tradeDays) * 100).toFixed(1) : '0.0';
  const rsLakh = (r.totalRs / 100000).toFixed(2);
  const sign   = r.totalRs >= 0 ? '+' : '';
  console.log(
    (' ' + v.label).padEnd(42),
    (sign + '₹' + rsLakh + 'L').padStart(12),
    (winPct + '%').padStart(7),
    String(r.tradeDays).padStart(6),
    String(r.premFired).padStart(10),
    String(r.idxFired).padStart(9)
  );
}
console.log('─'.repeat(90));
console.log('\nNote: delta=0.5 assumption. Real options have variable delta/vega.');
console.log('      PREM_SL fires when: adverse index move >= PREM_SL / 0.5\n');

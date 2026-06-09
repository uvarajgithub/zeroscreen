'use strict';

const fs = require('fs');
const path = require('path');
const { KiteConnect } = require('kiteconnect');
require('dotenv').config({ path: process.env.TRADING_BOT_ENV_PATH || path.join(process.cwd(), '.env') });

const { findDrishtiEntry } = require(path.join(process.cwd(), 'dist/src/drishti_strategy.js'));

const TOKEN = 260105; // BANKNIFTY index token
const FROM = process.argv[2] || '2026-05-01';
const TO = process.argv[3] || '2026-06-09';
const ENTRY_SLIPPAGE_SET = [5, 8, 12];
const GUARD_HOLD_MIN_SET = [0, 1, 2, 3];

const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

function istHM(d) {
  const x = new Date(new Date(d).getTime() + 5.5 * 3600 * 1000);
  return { h: x.getUTCHours(), m: x.getUTCMinutes() };
}

function toMin(h, m) { return h * 60 + m; }

function slotFromMinute(h, m) {
  const t = toMin(h, m);
  const start = 9 * 60 + 30;
  const end = 15 * 60 + 15;
  if (t < start || t > end) return -1;
  return Math.floor((t - start) / 15);
}

function slotLabel(slot) {
  const start = 9 * 60 + 30 + slot * 15;
  const h = Math.floor(start / 60);
  const m = start % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseCache15m(cacheDay) {
  // cacheDay[0] is 9:15 seed; strategy day starts from slice(1)
  return cacheDay.slice(1).map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));
}

function baselineEntry(today15m, prev15m) {
  for (let i = 0; i < today15m.length; i++) {
    const sig = findDrishtiEntry(today15m.slice(0, i + 1), prev15m);
    if (sig && sig.idx === i) {
      return { idx: i, side: sig.side, reason: sig.reason, entry: today15m[i].close, time: slotLabel(i) };
    }
  }
  return null;
}

function intrabarEntryFrom1m(oneMin, prev15m) {
  const agg = []; // per 15m slot
  let firstAnyIntrabar = null;

  for (const c of oneMin) {
    const hm = istHM(c.date);
    const slot = slotFromMinute(hm.h, hm.m);
    if (slot < 0 || slot > 23) continue;

    if (!agg[slot]) {
      agg[slot] = { open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      agg[slot].high = Math.max(agg[slot].high, c.high);
      agg[slot].low = Math.min(agg[slot].low, c.low);
      agg[slot].close = c.close;
    }

    // Build snapshot up to current slot with current partial candle
    const snap = [];
    for (let i = 0; i <= slot; i++) {
      if (agg[i]) snap.push({ ...agg[i] });
      else break;
    }
    if (snap.length === 0) continue;

    const sig = findDrishtiEntry(snap, prev15m);
    if (sig && sig.idx === slot) {
      const t = `${String(hm.h).padStart(2, '0')}:${String(hm.m).padStart(2, '0')}`;
      if (!firstAnyIntrabar) {
        firstAnyIntrabar = { idx: slot, side: sig.side, reason: sig.reason, entry: c.close, time: t };
      }
      return { firstTrigger: firstAnyIntrabar, firstAny: firstAnyIntrabar };
    }
  }

  return { firstTrigger: null, firstAny: firstAnyIntrabar };
}

function intrabarEntryWithGuard(oneMin, prev15m, holdMin) {
  const agg = [];

  for (const c of oneMin) {
    const hm = istHM(c.date);
    const slot = slotFromMinute(hm.h, hm.m);
    if (slot < 0 || slot > 23) continue;

    if (!agg[slot]) {
      agg[slot] = { open: c.open, high: c.high, low: c.low, close: c.close };
    } else {
      agg[slot].high = Math.max(agg[slot].high, c.high);
      agg[slot].low = Math.min(agg[slot].low, c.low);
      agg[slot].close = c.close;
    }

    const slotStartMin = (9 * 60 + 30) + slot * 15;
    const curMin = toMin(hm.h, hm.m);
    if (curMin < slotStartMin + holdMin) continue;

    const snap = [];
    for (let i = 0; i <= slot; i++) {
      if (agg[i]) snap.push({ ...agg[i] });
      else break;
    }
    if (snap.length === 0) continue;

    const sig = findDrishtiEntry(snap, prev15m);
    if (sig && sig.idx === slot) {
      const t = `${String(hm.h).padStart(2, '0')}:${String(hm.m).padStart(2, '0')}`;
      return { idx: slot, side: sig.side, reason: sig.reason, entry: c.close, time: t };
    }
  }

  return null;
}

function edgePts(base, intra) {
  return base.side === 'CE'
    ? (base.entry - intra.entry)
    : (intra.entry - base.entry);
}

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf8'));
  const dates = Object.keys(raw).sort().filter(d => d >= FROM && d <= TO);

  let days = 0;
  let baseSignals = 0;
  let intrabarMatched = 0;
  let sideMatched = 0;
  let sideMismatched = 0;
  let earlier = 0;
  let sameOrLater = 0;
  let favorablePtsSum = 0;
  let unfavorablePtsSum = 0;
  let falseEarly = 0;
  let baseNoIntrabar = 0;
  let oneMinFetchFail = 0;
  const details = [];
  const guardStats = {};
  for (const h of GUARD_HOLD_MIN_SET) {
    guardStats[h] = {
      matched: 0,
      sideMatched: 0,
      sideMismatched: 0,
      favorableDays: 0,
      unfavorableDays: 0,
      favorablePts: 0,
      unfavorablePts: 0,
      baseNoGuard: 0,
      falseEarly: 0,
    };
  }

  for (let i = 1; i < dates.length; i++) {
    const date = dates[i];
    const prevDate = dates[i - 1];
    const todayRaw = raw[date];
    const prevRaw = raw[prevDate];
    if (!todayRaw || !prevRaw || todayRaw.length < 5 || prevRaw.length < 5) continue;

    days++;
    const today15m = parseCache15m(todayRaw);
    const prev15m = prevRaw.map(c => ({ open: c.open, high: c.high, low: c.low, close: c.close }));

    const base = baselineEntry(today15m, prev15m);
    if (base) baseSignals++;

    let oneMin;
    try {
      oneMin = await kite.getHistoricalData(TOKEN, 'minute', date, date, false);
    } catch (_) {
      oneMinFetchFail++;
      if (base) baseNoIntrabar++;
      continue;
    }

    const intra = intrabarEntryFrom1m(oneMin, prev15m).firstTrigger;

    for (const h of GUARD_HOLD_MIN_SET) {
      const g = intrabarEntryWithGuard(oneMin, prev15m, h);
      const s = guardStats[h];
      if (base && g) {
        s.matched++;
        const e = edgePts(base, g);
        if (base.side === g.side) {
          s.sideMatched++;
          if (e >= 0) {
            s.favorableDays++;
            s.favorablePts += e;
          } else {
            s.unfavorableDays++;
            s.unfavorablePts += Math.abs(e);
          }
        } else {
          s.sideMismatched++;
        }
      }
      if (base && !g) s.baseNoGuard++;
      if (!base && g) s.falseEarly++;
    }

    if (base && intra) {
      intrabarMatched++;
      const bMin = toMin(parseInt(base.time.slice(0, 2), 10), parseInt(base.time.slice(3, 5), 10));
      const iMin = toMin(parseInt(intra.time.slice(0, 2), 10), parseInt(intra.time.slice(3, 5), 10));
      if (iMin < bMin) earlier++;
      else sameOrLater++;

      const e = edgePts(base, intra);
      if (base.side === intra.side) {
        sideMatched++;
        if (e >= 0) favorablePtsSum += e;
        else unfavorablePtsSum += Math.abs(e);
      } else {
        sideMismatched++;
      }

      details.push({
        date,
        baseSide: base.side,
        intraSide: intra.side,
        baseTime: base.time,
        intraTime: intra.time,
        baseEntry: base.entry,
        intraEntry: intra.entry,
        edge: e,
        sideMatch: base.side === intra.side,
      });
    }

    if (base && !intra) baseNoIntrabar++;
    if (!base && intra) falseEarly++;
  }

  const net = favorablePtsSum - unfavorablePtsSum;
  const byEdge = details
    .filter(d => d.sideMatch)
    .sort((a, b) => a.edge - b.edge);

  const worst = byEdge.slice(0, 5);
  const best = byEdge.slice(-5).reverse();

  console.log('=== DRISHTI Intrabar Entry Check (1-minute, check-only) ===');
  console.log(`Range: ${FROM} to ${TO}`);
  console.log(`Days analyzed: ${days}`);
  console.log(`Baseline signal days (15m close): ${baseSignals}`);
  console.log(`Days where intrabar trigger also found: ${intrabarMatched}`);
  console.log(`Side-matched triggers: ${sideMatched}`);
  console.log(`Side-mismatched triggers: ${sideMismatched}`);
  console.log(`Intrabar earlier than baseline close: ${earlier}`);
  console.log(`Intrabar same/later vs baseline close: ${sameOrLater}`);
  console.log(`Baseline signal but no intrabar trigger: ${baseNoIntrabar}`);
  console.log(`1-minute data fetch failures: ${oneMinFetchFail}`);
  console.log(`False early intrabar triggers (no final baseline signal): ${falseEarly}`);
  console.log(`Total favorable points vs baseline entries: ${favorablePtsSum.toFixed(1)}`);
  console.log(`Total unfavorable points vs baseline entries: ${unfavorablePtsSum.toFixed(1)}`);
  console.log(`Net entry edge (points): ${net.toFixed(1)}`);

  for (const s of ENTRY_SLIPPAGE_SET) {
    const adj = net - (sideMatched * s);
    console.log(`Net edge after ${s} pts per-entry slippage: ${adj.toFixed(1)} pts`);
  }

  if (worst.length > 0) {
    console.log('\nWorst side-matched days (edge pts):');
    for (const d of worst) {
      console.log(`  ${d.date}  ${d.baseSide}  ${d.baseTime}=>${d.intraTime}  edge:${d.edge.toFixed(1)}`);
    }
  }
  if (best.length > 0) {
    console.log('\nBest side-matched days (edge pts):');
    for (const d of best) {
      console.log(`  ${d.date}  ${d.baseSide}  ${d.baseTime}=>${d.intraTime}  edge:+${d.edge.toFixed(1)}`);
    }
  }

  console.log('\n=== Guarded Intrabar Variants (first-entry quality) ===');
  console.log('holdMin | matched | sideMatch | sideMismatch | favDays | unFavDays | netPts | sideMatchWR');
  for (const h of GUARD_HOLD_MIN_SET) {
    const s = guardStats[h];
    const netPts = s.favorablePts - s.unfavorablePts;
    const wrBase = s.favorableDays + s.unfavorableDays;
    const wr = wrBase > 0 ? (s.favorableDays / wrBase * 100).toFixed(1) : '0.0';
    console.log(
      `${String(h).padStart(7)} | ${String(s.matched).padStart(7)} | ${String(s.sideMatched).padStart(9)} | ${String(s.sideMismatched).padStart(12)} | ${String(s.favorableDays).padStart(7)} | ${String(s.unfavorableDays).padStart(9)} | ${netPts.toFixed(1).padStart(6)} | ${wr.padStart(10)}%`
    );
  }
})();

/**
 * zone_filter.js — Zone-Based AMINA Filter Backtest
 *
 * Concept:
 *   Market has KEY ZONES (buyer/seller zones) each day.
 *   We ONLY take AMINA trades when the entry signal fires NEAR a zone.
 *   Far-from-zone signals = skip.
 *
 * Zones calculated fresh each morning from prior data:
 *   1. PDH/PDL     — Previous Day High / Low
 *   2. PDC         — Previous Day Close
 *   3. Weekly H/L  — Previous week's range
 *   4. Swing H/L   — Last 5-day highest high / lowest low
 *   5. Round Nums  — Every 500 pts (50000, 50500, etc.)
 *   6. Opening Range — First 15-min candle H/L
 *
 * Trade rule:
 *   Entry signal fires → check if entry price is within ZONE_TOLERANCE pts of any key level
 *   YES → take trade (high confidence zone entry)
 *   NO  → skip trade (mid-air entry, no confluence)
 *
 * Output: Baseline AMINA vs Zone-Filtered AMINA at multiple tolerance levels
 */

'use strict';
const https = require('https');
require('dotenv').config({ override: true });

// ── Config ────────────────────────────────────────────────────────────────────
const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const TOKEN        = `${API_KEY}:${ACCESS_TOKEN}`;
const INSTRUMENT   = 260105; // BANKNIFTY
const SL_T1        = 50;
const SL_RE        = 60;
const RS_PER_PT    = 15;
const BROKERAGE    = 4; // pts equivalent per trade

const TOLERANCES   = [50, 75, 100, 125, 150, 200]; // pts — how close to zone = "in zone"

// ── Load candles from cache (avoids token expiry on weekends) ─────────────────
const fs = require('fs');
const CACHE_FILE = require('fs').existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';

async function fetchAllCandles() {
  if (fs.existsSync(CACHE_FILE)) {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    console.log(`Loaded ${raw.length} candles from cache (${CACHE_FILE})\n`);
    return raw;
  }
  // Fallback: fetch from Kite API
  const chunks = [
    ['2021-01-01', '2021-12-31'],
    ['2022-01-01', '2022-12-31'],
    ['2023-01-01', '2023-12-31'],
    ['2024-01-01', '2024-12-31'],
    ['2025-01-01', '2025-12-31'],
    ['2026-01-01', '2026-05-16'],
  ];
  process.stdout.write('Fetching 15-min BNF 2021→2026 ');
  let all = [];
  for (const [from, to] of chunks) {
    process.stdout.write('.');
    const raw = await new Promise((resolve, reject) => {
      const url = `https://api.kite.trade/instruments/historical/${INSTRUMENT}/15minute?from=${from}&to=${to}&continuous=false`;
      https.get(url, { headers: { Authorization: `token ${TOKEN}` } }, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.data && j.data.candles) resolve(j.data.candles);
            else reject(new Error(JSON.stringify(j)));
          } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    all = all.concat(raw);
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(` ${all.length} candles\n`);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(all));
  return all;
}

// ── Candle helpers ────────────────────────────────────────────────────────────
function enrich(c) {
  // Support both array [date,o,h,l,close] and object {date,open,high,low,close}
  const date  = c.date  ?? c[0];
  const open  = c.open  ?? c[1];
  const high  = c.high  ?? c[2];
  const low   = c.low   ?? c[3];
  const close = c.close ?? c[4];
  const bull      = close >= open;
  const body_high = Math.max(open, close);
  const body_low  = Math.min(open, close);
  return { date, open, high, low, close, bull, body_high, body_low, body_size: body_high - body_low };
}

function dayKey(dateStr) { return String(dateStr).slice(0, 10); }

function groupByDay(candles) {
  const map = {};
  for (const c of candles) {
    const k = dayKey(c.date);
    if (!map[k]) map[k] = [];
    map[k].push(c);
  }
  return map;
}

function isEOD(c) {
  const t = String(c.date).slice(11, 16);
  return t >= '15:00';
}

// ── AMINA rolling entry scan (exact replica) ──────────────────────────────────
function rollingEntryScan(cs) {
  for (let i = 0; i < cs.length - 1; i++) {
    const ca = cs[i], cb = cs[i + 1];
    let sig = null, bl = 0, rule = '';

    if (ca.bull === cb.bull) {
      sig  = ca.bull ? 'CE' : 'PE';
      bl   = sig === 'CE' ? Math.max(ca.high, cb.high) : Math.min(ca.low, cb.low);
      rule = 'A';
    } else if (cb.body_size > ca.body_size) {
      sig  = cb.bull ? 'CE' : 'PE';
      bl   = sig === 'CE' ? Math.max(ca.body_high, cb.body_high) : Math.min(ca.body_low, cb.body_low);
      rule = 'B';
    } else {
      continue;
    }

    for (let j = i + 2; j < cs.length; j++) {
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, px: c.close, bl, rule, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, px: c.close, bl, rule, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one day (sweet-spot: SL_T1=50, SL_RE=60, LockBE) ───────────────
function simDay(candles) {
  const entry = rollingEntryScan(candles);
  if (!entry || entry.entryIdx !== candles.length - 1) {
    // We only take entry on latest candle close (live rule)
    // For backtest: scan all candles for entry
  }

  // Full day simulation (not just latest candle)
  const res = rollingEntryScan(candles);
  if (!res) return null;

  let phase = 'IN_T1';
  let t1Dir = res.sig, t1Entry = res.px, t1Pts = 0, t1Peak = 0;
  let t1SL = t1Dir === 'CE' ? t1Entry - SL_T1 : t1Entry + SL_T1;
  let reDir = null, reEntry = 0, rePts = 0, rePeak = 0, reSL = 0;

  for (let i = res.entryIdx + 1; i < candles.length; i++) {
    const c = candles[i];

    if (phase === 'IN_T1') {
      const cur = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      t1Pts = cur;
      if (cur > t1Peak) t1Peak = cur;
      // LockBE
      if (t1Peak >= SL_T1) {
        t1SL = t1Dir === 'CE' ? Math.max(t1SL, t1Entry) : Math.min(t1SL, t1Entry);
      }
      if (isEOD(c)) { t1Pts = cur; break; }
      const slHit = t1Dir === 'CE' ? c.close <= t1SL : c.close >= t1SL;
      if (slHit) {
        t1Pts = t1Peak >= SL_T1 ? 0 : -SL_T1;
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        reSL    = reDir === 'CE' ? reEntry - SL_RE : reEntry + SL_RE;
        rePeak  = 0;
        phase   = 'IN_RE';
        continue;
      }
    }

    if (phase === 'IN_RE') {
      const cur = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      rePts = cur;
      if (cur > rePeak) rePeak = cur;
      // LockBE
      if (rePeak >= SL_RE) {
        reSL = reDir === 'CE' ? Math.max(reSL, reEntry) : Math.min(reSL, reEntry);
      }
      if (isEOD(c)) { rePts = cur; break; }
      const slHit = reDir === 'CE' ? c.close <= reSL : c.close >= reSL;
      if (slHit) {
        rePts = rePeak >= SL_RE ? 0 : -SL_RE;
        phase = 'DONE'; break;
      }
    }
  }

  const trades = 1 + (reDir ? 1 : 0);
  const gross  = t1Pts + rePts;
  const net    = gross - trades * BROKERAGE;
  return { entryPx: res.px, sig: res.sig, net, gross, t1Pts, rePts, trades };
}

// ── Calculate key zones for a given day ──────────────────────────────────────
function calcZones(allDates, byDay, todayDate) {
  const idx  = allDates.indexOf(todayDate);
  if (idx < 5) return [];

  const zones = new Set();

  // 1. Previous Day High / Low / Close
  const prev = byDay[allDates[idx - 1]];
  if (prev && prev.length) {
    const pdH = Math.max(...prev.map(c => c.high));
    const pdL = Math.min(...prev.map(c => c.low));
    const pdC = prev[prev.length - 1].close;
    zones.add(Math.round(pdH));
    zones.add(Math.round(pdL));
    zones.add(Math.round(pdC));
  }

  // 2. Previous Week High / Low (last 5 trading days)
  const lastWeek = allDates.slice(Math.max(0, idx - 5), idx);
  let wkH = -Infinity, wkL = Infinity;
  for (const d of lastWeek) {
    const cs = byDay[d] || [];
    for (const c of cs) {
      if (c.high > wkH) wkH = c.high;
      if (c.low  < wkL) wkL = c.low;
    }
  }
  if (wkH > 0)        zones.add(Math.round(wkH));
  if (wkL < Infinity) zones.add(Math.round(wkL));

  // 3. Swing H/L — last 3 days
  const last3 = allDates.slice(Math.max(0, idx - 3), idx);
  let swH = -Infinity, swL = Infinity;
  for (const d of last3) {
    const cs = byDay[d] || [];
    for (const c of cs) {
      if (c.high > swH) swH = c.high;
      if (c.low  < swL) swL = c.low;
    }
  }
  if (swH > 0)        zones.add(Math.round(swH));
  if (swL < Infinity) zones.add(Math.round(swL));

  // 4. Opening Range — first candle of TODAY
  const today = byDay[todayDate] || [];
  if (today.length >= 1) {
    zones.add(Math.round(today[0].high));
    zones.add(Math.round(today[0].low));
  }

  // 5. Round numbers (every 500 pts near current price)
  const ref = today.length ? today[0].open : 50000;
  for (let r = Math.floor(ref / 500) * 500 - 1000; r <= ref + 1000; r += 500) {
    zones.add(r);
  }
  // Half-round (every 250 pts)
  for (let r = Math.floor(ref / 250) * 250 - 1000; r <= ref + 1000; r += 250) {
    zones.add(r);
  }

  return Array.from(zones);
}

function nearZone(price, zones, tolerance) {
  return zones.some(z => Math.abs(price - z) <= tolerance);
}

// ── Run full backtest ─────────────────────────────────────────────────────────
async function main() {
  const raw   = await fetchAllCandles();
  const all   = raw.map(enrich);
  const byDay = groupByDay(all);
  const allDates = Object.keys(byDay).sort();

  console.log(`Total trading days: ${allDates.length}  (Jan 2021 → May 2026)\n`);

  // ── Baseline (no zone filter) ─────────────────────────────────────────────
  let base = { net: 0, trades: 0, wins: 0, days: 0, noSignal: 0 };
  const baseByDay = [];

  for (const date of allDates) {
    const cs  = byDay[date];
    const res = simDay(cs);
    if (!res) { base.noSignal++; continue; }
    base.net    += res.net;
    base.trades += res.trades;
    base.days++;
    if (res.net > 0) base.wins++;
    baseByDay.push({ date, net: res.net, entryPx: res.entryPx });
  }

  console.log('─'.repeat(90));
  console.log(`${'Variant'.padEnd(32)} ${'NetRs'.padStart(10)} ${'Trades'.padStart(7)} ${'TradeDays'.padStart(10)} ${'WinDays%'.padStart(9)} ${'SkipDays'.padStart(9)}`);
  console.log('─'.repeat(90));

  const fmt = n => (n >= 0 ? '+' : '') + Math.round(n * RS_PER_PT).toLocaleString('en-IN');
  const fmtRs = n => (n >= 0 ? '+' : '') + Math.round(n).toLocaleString('en-IN');

  console.log(
    `${'Baseline (no zone filter)'.padEnd(32)} ${fmtRs(base.net * RS_PER_PT).padStart(10)} ${String(base.trades).padStart(7)} ${String(base.days).padStart(10)} ${(base.wins / base.days * 100).toFixed(1).padStart(8)}% ${'0'.padStart(9)}`
  );

  // ── Zone-filtered variants ────────────────────────────────────────────────
  const results = [];
  for (const tol of TOLERANCES) {
    let zf = { net: 0, trades: 0, wins: 0, days: 0, skipped: 0, noSignal: 0 };
    // zone breakdown
    let zoneWins = 0, zoneLoss = 0, zoneNetPts = 0;
    let noZoneWins = 0, noZoneLoss = 0, noZoneNetPts = 0;

    for (const date of allDates) {
      const cs    = byDay[date];
      const res   = simDay(cs);
      if (!res) { zf.noSignal++; continue; }

      const zones  = calcZones(allDates, byDay, date);
      const inZone = nearZone(res.entryPx, zones, tol);

      if (!inZone) {
        zf.skipped++;
        noZoneNetPts += res.net;
        if (res.net > 0) noZoneWins++; else noZoneLoss++;
        continue;
      }

      zf.net    += res.net;
      zf.trades += res.trades;
      zf.days++;
      if (res.net > 0) zf.wins++;
      zoneNetPts += res.net;
      if (res.net > 0) zoneWins++; else zoneLoss++;
    }

    results.push({ tol, zf, zoneWins, zoneLoss, zoneNetPts, noZoneWins, noZoneLoss, noZoneNetPts });

    console.log(
      `${'Zone ±' + tol + ' pts filter'.padEnd(26)} ${fmtRs(zf.net * RS_PER_PT).padStart(10)} ${String(zf.trades).padStart(7)} ${String(zf.days).padStart(10)} ${(zf.wins / zf.days * 100).toFixed(1).padStart(8)}% ${String(zf.skipped).padStart(9)}`
    );
  }

  // ── Detailed breakdown for best tolerance ────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('ZONE vs NO-ZONE TRADE QUALITY BREAKDOWN');
  console.log('═'.repeat(90));
  console.log(`${'Tolerance'.padEnd(14)} ${'ZoneTrades'.padStart(11)} ${'ZoneWin%'.padStart(9)} ${'ZoneRs'.padStart(10)} ${'SkippedTrades'.padStart(14)} ${'SkipWin%'.padStart(9)} ${'SkipRs'.padStart(10)}`);
  console.log('─'.repeat(90));

  for (const { tol, zf, zoneWins, zoneLoss, zoneNetPts, noZoneWins, noZoneLoss, noZoneNetPts } of results) {
    const zTotal  = zoneWins + zoneLoss;
    const nzTotal = noZoneWins + noZoneLoss;
    const zWinPct  = zTotal  ? (zoneWins  / zTotal  * 100).toFixed(1) : '0.0';
    const nzWinPct = nzTotal ? (noZoneWins / nzTotal * 100).toFixed(1) : '0.0';
    console.log(
      `${'±' + tol + ' pts'.padEnd(13)} ${String(zTotal).padStart(11)} ${zWinPct.padStart(8)}% ${fmtRs(zoneNetPts * RS_PER_PT).padStart(10)} ${String(nzTotal).padStart(14)} ${nzWinPct.padStart(8)}% ${fmtRs(noZoneNetPts * RS_PER_PT).padStart(10)}`
    );
  }

  // ── Zone types contribution ───────────────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  console.log('WHICH ZONE TYPE WORKS BEST (at ±100pts, each zone type tested alone)');
  console.log('═'.repeat(90));

  const zoneTypes = [
    { name: 'PDH/PDL only',       fn: (z) => z.type === 'pd' },
    { name: 'PDH/PDL/PDC',        fn: (z) => ['pd', 'pdc'].includes(z.type) },
    { name: 'Weekly H/L',         fn: (z) => z.type === 'wk' },
    { name: 'Round 500pts',       fn: (z) => z.type === 'rnd500' },
    { name: 'Round 250pts',       fn: (z) => z.type === 'rnd250' },
    { name: 'Opening Range',      fn: (z) => z.type === 'or' },
  ];

  // Re-run with typed zones for breakdown
  const TOL = 100;
  const typeStats = {};
  for (const zt of zoneTypes) typeStats[zt.name] = { wins: 0, loss: 0, net: 0, count: 0 };

  for (const date of allDates) {
    const cs  = byDay[date];
    const res = simDay(cs);
    if (!res) continue;

    const idx   = allDates.indexOf(date);
    if (idx < 5) continue;

    // Build typed zones
    const typedZones = [];
    const prev = byDay[allDates[idx - 1]];
    if (prev && prev.length) {
      typedZones.push({ price: Math.round(Math.max(...prev.map(c => c.high))), type: 'pd' });
      typedZones.push({ price: Math.round(Math.min(...prev.map(c => c.low))),  type: 'pd' });
      typedZones.push({ price: Math.round(prev[prev.length - 1].close),        type: 'pdc' });
    }
    const lastWeek = allDates.slice(Math.max(0, idx - 5), idx);
    let wkH = -Infinity, wkL = Infinity;
    for (const d of lastWeek) {
      for (const c of byDay[d] || []) { if (c.high > wkH) wkH = c.high; if (c.low < wkL) wkL = c.low; }
    }
    if (wkH > 0)        typedZones.push({ price: Math.round(wkH), type: 'wk' });
    if (wkL < Infinity) typedZones.push({ price: Math.round(wkL), type: 'wk' });

    const today = byDay[date] || [];
    if (today.length) {
      typedZones.push({ price: Math.round(today[0].high), type: 'or' });
      typedZones.push({ price: Math.round(today[0].low),  type: 'or' });
    }
    const ref = today.length ? today[0].open : 50000;
    for (let r = Math.floor(ref / 500) * 500 - 1000; r <= ref + 1000; r += 500)
      typedZones.push({ price: r, type: 'rnd500' });
    for (let r = Math.floor(ref / 250) * 250 - 1000; r <= ref + 1000; r += 250)
      typedZones.push({ price: r, type: 'rnd250' });

    for (const zt of zoneTypes) {
      const zPrices = typedZones.filter(zt.fn).map(z => z.price);
      if (nearZone(res.entryPx, zPrices, TOL)) {
        typeStats[zt.name].count++;
        typeStats[zt.name].net += res.net;
        if (res.net > 0) typeStats[zt.name].wins++;
        else              typeStats[zt.name].loss++;
      }
    }
  }

  console.log(`${'Zone Type'.padEnd(22)} ${'Trades'.padStart(7)} ${'Win%'.padStart(7)} ${'NetRs'.padStart(12)} ${'Rs/Trade'.padStart(10)}`);
  console.log('─'.repeat(65));
  for (const [name, s] of Object.entries(typeStats)) {
    const total = s.wins + s.loss;
    if (!total) continue;
    const winPct  = (s.wins / total * 100).toFixed(1);
    const netRs   = Math.round(s.net * RS_PER_PT);
    const perTrade = Math.round(netRs / total);
    console.log(`${name.padEnd(22)} ${String(total).padStart(7)} ${winPct.padStart(6)}% ${fmtRs(netRs).padStart(12)} ${fmtRs(perTrade).padStart(10)}`);
  }

  // ── Final verdict ─────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(90));
  const best = results.reduce((a, b) => b.zf.net > a.zf.net ? b : a);
  const bestNet = Math.round(best.zf.net * RS_PER_PT);
  const baseNet = Math.round(base.net * RS_PER_PT);
  const improvement = ((bestNet - baseNet) / baseNet * 100).toFixed(1);

  console.log(`VERDICT:`);
  console.log(`  Baseline  (all signals)          → ₹${baseNet.toLocaleString('en-IN')}  Win ${(base.wins/base.days*100).toFixed(1)}%`);
  console.log(`  Best Zone (±${best.tol} pts)         → ₹${bestNet.toLocaleString('en-IN')}  Win ${(best.zf.wins/best.zf.days*100).toFixed(1)}%  (${improvement}% change)`);
  console.log(`  Skipped ${best.zf.skipped} trades (${(best.zf.skipped/(best.zf.days+best.zf.skipped)*100).toFixed(0)}% of signals filtered out)`);
  if (bestNet > baseNet) {
    console.log(`\n  ✅ ZONE FILTER HELPS — fewer trades, higher quality`);
  } else {
    console.log(`\n  ⚠️  Zone filter didn't improve P&L — AMINA signal already selects good entries`);
    console.log(`     (The C1+C2 pattern itself may be equivalent to zone confluence)`);
  }
  console.log('═'.repeat(90));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

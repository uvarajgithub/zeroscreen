'use strict';
/**
 * AMINA 100 — 5-Year Backtest (2021–2026)
 * BASE   : Current live strategy (SL=60, trail@100, RE opposite)
 * VAR_B  : Wider SL T1=100pts
 * VAR_BC : T1 SL=100 + gap filter (skip if day gap < 0.3%)
 */

const { KiteConnect } = require('kiteconnect');

const API_KEY      = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || require('fs').readFileSync('/home/ubuntu/trading-bot/.env','utf8').match(/ACCESS_TOKEN=(\S+)/)?.[1];
const INST_TOKEN   = 260105;          // BANKNIFTY
const RS_PER_PT    = 15;              // 30 qty × 0.5 delta

const kite = new KiteConnect({ api_key: API_KEY });
kite.setAccessToken(ACCESS_TOKEN);

// ── Candle helpers ────────────────────────────────────────────────
function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// ── Rolling entry scan (exact port from amina-live.ts) ───────────
// minEntryIdx: minimum candle index allowed for entry (0=any, 2=9:45+, 3=10:00+)
function rollingEntryScan(cs, minEntryIdx = 0) {
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
    } else continue;

    for (let j = i + 2; j < cs.length; j++) {
      if (j < minEntryIdx) continue;          // enforce minimum entry candle
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, bl, rule, pairIdx: i, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, bl, rule, pairIdx: i, entryIdx: j };
    }
  }
  return null;
}

// ── Simulate one day ─────────────────────────────────────────────
// Returns { t1Pts, rePts, dayPts, dayRs, t1Dir, reDir, entryCandle, noTrade }
// noTrail=true   → fixed SL (no trailing)
// dayOpenFilter  → RE only enters if SL exit price crossed past day open
// noRe=true      → skip RE entirely
// trendFilter    → determine allowed direction from C1+C2+prevDay levels; skip if unclear
function simDay(rawCandles, opts) {
  const { sl1 = 60, sl2 = 60, trailGap = 100, minEntryIdx = 0,
          gapFilter = false, prevClose = null, prevHigh = null, prevLow = null,
          noTrail = false, dayOpenFilter = false, noRe = false,
          trendFilter = false } = opts;

  if (!rawCandles || rawCandles.length < 4) return { noTrade: true, reason: 'FEW_CANDLES' };

  const cs      = rawCandles.map(enrich);
  const dayOpen = cs[0].open;

  // Gap filter: skip if open gap < 0.3%
  if (gapFilter && prevClose) {
    const gap = Math.abs(cs[0].open - prevClose) / prevClose;
    if (gap < 0.003) return { noTrade: true, reason: `GAP_SKIP(${(gap*100).toFixed(2)}%)` };
  }

  // ── Trend filter: determine direction from Opening Range (C1+C2) + prev day ──
  let allowedDir = null;   // null = any direction allowed
  let trendReason = '';
  if (trendFilter && prevClose && cs.length >= 3) {
    const c1 = cs[0], c2 = cs[1];
    const c1Bull = c1.close > c1.open;
    const c2Bull = c2.close > c2.open;
    const OR_High = Math.max(c1.high, c2.high);
    const OR_Low  = Math.min(c1.low,  c2.low);

    // Strong gap above prev day high → bull trend
    if (prevHigh && dayOpen > prevHigh) {
      allowedDir = 'CE'; trendReason = 'GAP_UP_PDH';
    }
    // Strong gap below prev day low → bear trend
    else if (prevLow && dayOpen < prevLow) {
      allowedDir = 'PE'; trendReason = 'GAP_DN_PDL';
    }
    // Both C1+C2 bullish AND C2 close above prev day close → bull trend
    else if (c1Bull && c2Bull && c2.close > prevClose) {
      allowedDir = 'CE'; trendReason = 'C1C2_BULL';
    }
    // Both C1+C2 bearish AND C2 close below prev day close → bear trend
    else if (!c1Bull && !c2Bull && c2.close < prevClose) {
      allowedDir = 'PE'; trendReason = 'C1C2_BEAR';
    }
    // Prev day close breakout: open significantly above/below prevClose
    else if (prevLow && prevHigh) {
      const pdRange = prevHigh - prevLow;
      if (c2.close > prevHigh) { allowedDir = 'CE'; trendReason = 'ABOVE_PDH'; }
      else if (c2.close < prevLow) { allowedDir = 'PE'; trendReason = 'BELOW_PDL'; }
      else return { noTrade: true, reason: 'TREND_UNCLEAR' };
    }
    else return { noTrade: true, reason: 'TREND_UNCLEAR' };
  }

  const isEOD = (c) => c.h > 15 || (c.h === 15 && c.m >= 14);

  let phase = 'SCANNING';
  let t1Dir = null, t1Entry = 0, t1Pts = 0, t1Peak = 0, t1EntryIdx = -1;
  let reDir = null, reEntry = 0, rePts = 0, rePeak = 0;

  // Trailing SL (used when noTrail=false)
  function calcSL(dir, entry, peak, slBase) {
    const trailLock = Math.max(0, peak - trailGap);
    const effSL     = peak >= slBase ? trailLock : -slBase;
    return dir === 'CE' ? entry + effSL : entry - effSL;
  }
  // Fixed SL (used when noTrail=true)
  function fixedSL(dir, entry, slBase) {
    return dir === 'CE' ? entry - slBase : entry + slBase;
  }

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];

    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice, minEntryIdx);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      if (allowedDir && res.sig !== allowedDir) continue;  // trend filter: skip wrong direction

      t1Dir      = res.sig;
      t1Entry    = c.close;
      t1Peak     = 0;
      t1EntryIdx = idx;
      phase      = 'IN_T1';
      continue;
    }

    if (phase === 'IN_T1') {
      const raw = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      if (raw > t1Peak) t1Peak = raw;

      if (isEOD(c)) { t1Pts = raw; phase = 'DONE'; break; }

      const sl    = noTrail ? fixedSL(t1Dir, t1Entry, sl1) : calcSL(t1Dir, t1Entry, t1Peak, sl1);
      const slHit = t1Dir === 'CE' ? c.close <= sl : c.close >= sl;
      if (slHit) {
        t1Pts = noTrail ? -sl1 : (t1Dir === 'CE' ? sl - t1Entry : t1Entry - sl);

        // RE-entry opposite direction
        const candidate = t1Dir === 'CE' ? 'PE' : 'CE';
        if (noRe) { phase = 'DONE'; break; }  // skip RE entirely
        // Day-open filter: RE only if reversal price crossed past day open
        if (dayOpenFilter) {
          const mar = candidate === 'CE' ? (c.close - dayOpen) : (dayOpen - c.close);
          if (mar >= 0) { phase = 'DONE'; break; }  // not reversed past open — skip RE
        }
        reDir   = candidate;
        reEntry = c.close;
        rePeak  = 0;
        phase   = 'IN_RE';
        continue;
      }
      continue;
    }

    if (phase === 'IN_RE') {
      const raw = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      if (raw > rePeak) rePeak = raw;

      if (isEOD(c)) { rePts = raw; phase = 'DONE'; break; }

      const sl    = noTrail ? fixedSL(reDir, reEntry, sl2) : calcSL(reDir, reEntry, rePeak, sl2);
      const slHit = reDir === 'CE' ? c.close <= sl : c.close >= sl;
      if (slHit) {
        rePts = noTrail ? -sl2 : (reDir === 'CE' ? sl - reEntry : reEntry - sl);
        phase = 'DONE';
        break;
      }
      continue;
    }
  }

  const dayPts = t1Pts + rePts;
  const dayRs  = Math.round(dayPts * RS_PER_PT);
  return { t1Dir, reDir, t1Pts, rePts, dayPts, dayRs, t1EntryIdx, noTrade: !t1Dir };
}

// ── Fetch candles for date range ──────────────────────────────────
async function fetchDay(dateStr) {
  try {
    const data = await kite.getHistoricalData(
      INST_TOKEN, '15minute',
      `${dateStr} 09:15:00`,   // 9:15 AM IST
      `${dateStr} 15:30:00`,   // 3:30 PM IST
      false
    );
    return (data || []).map(c => {
      const d   = new Date(c.date);
      const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        open: c.open, high: c.high, low: c.low, close: c.close,
        h: ist.getHours(), m: ist.getMinutes()
      };
    });
  } catch (e) {
    console.error(`  ERROR fetching ${dateStr}:`, e.message);
    return [];
  }
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  // Generate all weekdays from 2021-01-01 to 2026-05-22
  function getWeekdays(from, to) {
    const days = [];
    const d = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    while (d <= end) {
      const day = d.getUTCDay();
      if (day !== 0 && day !== 6) {
        days.push(d.toISOString().slice(0, 10));
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return days;
  }
  const ALL_DAYS = getWeekdays('2021-01-01', '2026-05-22');
  console.log(`Total weekdays to fetch: ${ALL_DAYS.length}`);
  console.log('Fetching 5-year BANKNIFTY 15-min candles (this takes ~7 min)...\n');

  const dayData = {};
  let fetched = 0;
  for (const d of ALL_DAYS) {
    const candles = await fetchDay(d);
    dayData[d] = candles;
    fetched++;
    if (candles.length > 0 || fetched % 50 === 0) {
      process.stdout.write(`\r  Fetched ${fetched}/${ALL_DAYS.length} — ${d}: ${candles.length} candles   `);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  console.log('\n');

  const validDays = ALL_DAYS.filter(d => dayData[d].length >= 4);
  console.log(`Valid trading days: ${validDays.length}\n`);

  // Build prevClose/prevHigh/prevLow maps
  const prevCloseMap = {};
  const prevHighMap  = {};
  const prevLowMap   = {};
  for (let i = 1; i < validDays.length; i++) {
    const prev = dayData[validDays[i-1]];
    if (prev.length) {
      prevCloseMap[validDays[i]] = prev[prev.length - 1].close;
      prevHighMap[validDays[i]]  = Math.max(...prev.map(c => c.high));
      prevLowMap[validDays[i]]   = Math.min(...prev.map(c => c.low));
    }
  }

  // ── Run all variants ──────────────────────────────────────────
  const variants = [
    { id: 'BASE',    label: 'BASE (T1+RE)',          opts: { sl1: 60, sl2: 60, noTrail: false, noRe: false, trendFilter: false } },
    { id: 'TREND',   label: 'TREND (1-dir+noRE)',    opts: { sl1: 60, sl2: 60, noTrail: false, noRe: true,  trendFilter: true  } },
    { id: 'TREND2X', label: 'TREND2X (1-dir+RE)',    opts: { sl1: 60, sl2: 60, noTrail: false, noRe: false, trendFilter: true  } },
    { id: 'VAR_B',   label: 'VAR_B (SL100+RE)',      opts: { sl1: 100, sl2: 60, noTrail: false, noRe: false, trendFilter: false } },
  ];

  const results = {};
  for (const v of variants) results[v.id] = { totalPts: 0, totalRs: 0, wins: 0, losses: 0, noTrades: 0, days: [] };

  console.log('Running simulations...\n');

  for (const d of validDays) {
    const candles   = dayData[d];
    const prevClose = prevCloseMap[d] || null;
    const prevHigh  = prevHighMap[d]  || null;
    const prevLow   = prevLowMap[d]   || null;

    for (const v of variants) {
      const res = simDay(candles, { ...v.opts, prevClose, prevHigh, prevLow });
      const r   = results[v.id];
      if (res.noTrade) {
        r.noTrades++;
        r.days.push({ date: d, noTrade: true, reason: res.reason });
      } else {
        r.totalPts += res.dayPts;
        r.totalRs  += res.dayRs;
        if (res.dayPts > 0) r.wins++; else r.losses++;
        r.days.push({ date: d, dayPts: res.dayPts, dayRs: res.dayRs,
                      t1Dir: res.t1Dir, reDir: res.reDir });
      }
    }
  }

  const COL = 18;
  const hdr = 'Period            '.padEnd(20) + variants.map(v => v.id.padStart(COL)).join('');

  // ── Overall Summary ───────────────────────────────────────────
  console.log('═'.repeat(hdr.length));
  console.log('5-YEAR SUMMARY (Jan 2021 – May 2026)');
  console.log('═'.repeat(hdr.length));
  console.log(' '.repeat(20) + variants.map(v => v.label.padStart(COL)).join(''));
  console.log('─'.repeat(hdr.length));

  const fields = [
    ['Total ₹',     v => (v.totalRs >= 0 ? '+₹' : '-₹') + Math.abs(v.totalRs).toLocaleString('en-IN')],
    ['Total Pts',   v => (v.totalPts >= 0 ? '+' : '') + v.totalPts.toFixed(0)],
    ['Win days',    v => v.wins],
    ['Loss days',   v => v.losses],
    ['Skipped',     v => v.noTrades],
    ['Win%',        v => { const t = v.wins+v.losses; return t ? ((v.wins/t*100).toFixed(0)+'%') : 'N/A'; }],
    ['AvgPts/day',  v => { const t = v.wins+v.losses; return t ? ((v.totalPts/t).toFixed(1)) : 'N/A'; }],
    ['Avg ₹/month', v => { const mo = new Set(validDays.map(d=>d.slice(0,7))).size; return mo ? ('₹'+Math.round(v.totalRs/mo).toLocaleString('en-IN')) : 'N/A'; }],
  ];

  for (const [label, fn] of fields) {
    const row = label.padEnd(20);
    process.stdout.write(row);
    for (const v of variants) process.stdout.write(String(fn(results[v.id])).padStart(COL));
    console.log();
  }

  // ── Per-year summary ──────────────────────────────────────────
  const years = [...new Set(validDays.map(d => d.slice(0, 4)))].sort();
  for (const yr of years) {
    const yrDays = validDays.filter(d => d.startsWith(yr));
    console.log('\n' + '─'.repeat(hdr.length));
    console.log(`YEAR ${yr}   (${yrDays.length} trading days)`);
    console.log('─'.repeat(hdr.length));
    const yrFields = [
      ['Total ₹',  v => { const ds = v.days.filter(d => yrDays.includes(d.date) && !d.noTrade); const rs = ds.reduce((s,d)=>s+(d.dayRs||0),0); return (rs>=0?'+₹':'-₹')+Math.abs(rs).toLocaleString('en-IN'); }],
      ['Total Pts',v => { const ds = v.days.filter(d => yrDays.includes(d.date) && !d.noTrade); const pts = ds.reduce((s,d)=>s+(d.dayPts||0),0); return (pts>=0?'+':'')+pts.toFixed(0); }],
      ['Wins',     v => v.days.filter(d => yrDays.includes(d.date) && !d.noTrade && d.dayPts > 0).length],
      ['Losses',   v => v.days.filter(d => yrDays.includes(d.date) && !d.noTrade && d.dayPts <= 0).length],
      ['Skipped',  v => v.days.filter(d => yrDays.includes(d.date) && d.noTrade).length],
      ['Win%',     v => { const w=v.days.filter(d=>yrDays.includes(d.date)&&!d.noTrade&&d.dayPts>0).length; const l=v.days.filter(d=>yrDays.includes(d.date)&&!d.noTrade&&d.dayPts<=0).length; return (w+l)?((w/(w+l)*100).toFixed(0)+'%'):'N/A'; }],
    ];
    for (const [lbl, fn] of yrFields) {
      process.stdout.write(lbl.padEnd(20));
      for (const v of variants) process.stdout.write(String(fn(results[v.id])).padStart(COL));
      console.log();
    }
  }

  // ── Per-month detail table ────────────────────────────────────
  const months = [...new Set(validDays.map(d => d.slice(0, 7)))].sort();
  console.log('\n' + '═'.repeat(hdr.length));
  console.log('MONTH-BY-MONTH  ₹ P&L');
  console.log('═'.repeat(hdr.length));
  console.log(hdr);
  console.log('─'.repeat(hdr.length));
  for (const mo of months) {
    const moDays = validDays.filter(d => d.startsWith(mo));
    process.stdout.write(mo.padEnd(20));
    for (const v of variants) {
      const ds  = results[v.id].days.filter(d => moDays.includes(d.date) && !d.noTrade);
      const rs  = ds.reduce((s, d) => s + (d.dayRs || 0), 0);
      const sk  = results[v.id].days.filter(d => moDays.includes(d.date) && d.noTrade).length;
      const cell = (rs >= 0 ? '+₹' : '-₹') + Math.abs(rs).toLocaleString('en-IN') + (sk ? `(s${sk})` : '');
      process.stdout.write(cell.padStart(COL));
    }
    console.log();
  }

  console.log('\nDone.');
}

main().catch(e => { console.error(e); process.exit(1); });

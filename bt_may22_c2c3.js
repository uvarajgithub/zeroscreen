'use strict';
// May 22, 2026 — C1+C2 vs C2+C3 entry pair comparison

const { KiteConnect } = require('kiteconnect');
const API_KEY      = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ||
  require('fs').readFileSync('/home/ubuntu/trading-bot/.env','utf8').match(/ACCESS_TOKEN=(\S+)/)?.[1];
const INST_TOKEN   = 260105;
const RS_PER_PT    = 15;

const kite = new KiteConnect({ api_key: API_KEY });
kite.setAccessToken(ACCESS_TOKEN);

function enrich(c) {
  const bull      = c.close >= c.open;
  const body_high = Math.max(c.open, c.close);
  const body_low  = Math.min(c.open, c.close);
  return { ...c, bull, body_high, body_low, body_size: body_high - body_low };
}

// minPairIdx: first allowed candle index for the signal pair (0=C1, 1=C2, 2=C3...)
function rollingEntryScan(cs, minPairIdx = 0) {
  for (let i = minPairIdx; i < cs.length - 1; i++) {
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
      const c = cs[j];
      if (sig === 'CE' && c.close > bl) return { sig, bl, rule, pairIdx: i, entryIdx: j };
      if (sig === 'PE' && c.close < bl) return { sig, bl, rule, pairIdx: i, entryIdx: j };
    }
  }
  return null;
}

function simDay(cs, minPairIdx = 0, noRe = false) {
  const SL1 = 60, TRAIL_GAP = 100;
  const isEOD = (c) => c.h > 15 || (c.h === 15 && c.m >= 14);

  function calcSL(dir, entry, peak) {
    const lock = Math.max(0, peak - TRAIL_GAP);
    const eff  = peak >= SL1 ? lock : -SL1;
    return dir === 'CE' ? entry + eff : entry - eff;
  }

  let phase = 'SCANNING';
  let t1Dir = null, t1Entry = 0, t1Pts = 0, t1Peak = 0, t1EntryIdx = -1, t1EntryTime = '';
  let reDir = null, reEntry = 0, rePts = 0;

  for (let idx = 0; idx < cs.length; idx++) {
    const c = cs[idx];
    if (phase === 'SCANNING') {
      if (isEOD(c)) break;
      const slice = cs.slice(0, idx + 1);
      const res   = rollingEntryScan(slice, minPairIdx);
      if (!res || res.entryIdx !== slice.length - 1) continue;
      t1Dir = res.sig; t1Entry = c.close; t1Peak = 0; t1EntryIdx = idx;
      t1EntryTime = `${c.h}:${String(c.m).padStart(2,'0')}`;
      phase = 'IN_T1';
      continue;
    }
    if (phase === 'IN_T1') {
      const raw = t1Dir === 'CE' ? c.close - t1Entry : t1Entry - c.close;
      if (raw > t1Peak) t1Peak = raw;
      if (isEOD(c)) { t1Pts = raw; phase = 'DONE'; break; }
      const sl = calcSL(t1Dir, t1Entry, t1Peak);
      const hit = t1Dir === 'CE' ? c.close <= sl : c.close >= sl;
      if (hit) {
        t1Pts = t1Dir === 'CE' ? sl - t1Entry : t1Entry - sl;
        if (noRe) { phase = 'DONE'; break; }
        reDir   = t1Dir === 'CE' ? 'PE' : 'CE';
        reEntry = c.close;
        phase   = 'IN_RE';
        continue;
      }
      continue;
    }
    if (phase === 'IN_RE') {
      const raw = reDir === 'CE' ? c.close - reEntry : reEntry - c.close;
      if (raw > 0 && raw > (rePts || 0)) rePts = raw;
      if (isEOD(c)) { rePts = raw; phase = 'DONE'; break; }
      const rePeak = rePts;
      const sl = calcSL(reDir, reEntry, rePeak);
      const hit = reDir === 'CE' ? c.close <= sl : c.close >= sl;
      if (hit) {
        rePts = reDir === 'CE' ? sl - reEntry : reEntry - sl;
        phase = 'DONE'; break;
      }
      continue;
    }
  }

  return { t1Dir, reDir, t1Pts, rePts, dayPts: t1Pts + rePts,
           dayRs: Math.round((t1Pts + rePts) * RS_PER_PT),
           t1EntryTime, noTrade: !t1Dir };
}

async function main() {
  const DATE = '2026-05-22';
  console.log(`\nFetching ${DATE} BANKNIFTY 15-min candles...\n`);

  const raw = await kite.getHistoricalData(
    INST_TOKEN, '15minute',
    `${DATE} 09:15:00`, `${DATE} 15:30:00`, false
  );

  const cs = raw.map(c => {
    const d   = new Date(c.date);
    const ist = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return { open: c.open, high: c.high, low: c.low, close: c.close,
             h: ist.getHours(), m: ist.getMinutes() };
  }).map(enrich);

  // Print candles
  console.log('Candles:');
  cs.forEach((c, i) => {
    const dir = c.bull ? '▲ BULL' : '▼ BEAR';
    console.log(`  C${i+1} [${c.h}:${String(c.m).padStart(2,'0')}]  O:${c.open}  H:${c.high}  L:${c.low}  C:${c.close}  ${dir}  body:${c.body_size.toFixed(0)}`);
  });

  console.log('\n' + '─'.repeat(70));

  const variants = [
    { label: 'BASE   (C1+C2+, T1+RE)', minPairIdx: 0, noRe: false },
    { label: 'C2C3   (C2+C3+, T1+RE)', minPairIdx: 1, noRe: false },
    { label: 'C3C4   (C3+C4+, T1+RE)', minPairIdx: 2, noRe: false },
    { label: 'C2C3   (C2+C3+, noRE) ', minPairIdx: 1, noRe: true  },
  ];

  for (const v of variants) {
    const r = simDay(cs, v.minPairIdx, v.noRe);
    if (r.noTrade) {
      console.log(`${v.label}  →  NO TRADE`);
    } else {
      const sign = r.dayRs >= 0 ? '+' : '';
      console.log(
        `${v.label}  →  ${r.t1Dir} entry @ ${r.t1EntryTime}` +
        `  T1:${r.t1Pts>0?'+':''}${r.t1Pts.toFixed(0)}pts` +
        (r.reDir ? `  RE(${r.reDir}):${r.rePts>0?'+':''}${r.rePts.toFixed(0)}pts` : '') +
        `  = ${sign}${r.dayRs.toFixed(0)} ₹`
      );
    }
  }
  console.log('─'.repeat(70));
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

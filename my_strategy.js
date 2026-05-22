'use strict';
/**
 * MY STRATEGY v2 — "Body Break + Entry-Wick SL + Day-Open Bias"
 *
 *  SIGNAL : Body break
 *           C_curr.close < C_prev.body_low  -> PE entry
 *           C_curr.close > C_prev.body_high -> CE entry
 *
 *  SL     : Entry candle's OWN wick extreme (not prev candle, not fixed pts)
 *           PE -> SL = entry candle HIGH  (next candle close >= SL+5 -> exit)
 *           CE -> SL = entry candle LOW   (next candle close <= SL-5 -> exit)
 *           Buffer = 5 pts (tiny: single-candle intrabar spikes dont kill trade)
 *
 *  FILTER : Day-open bias
 *           PE only if entry price < day_open  (market opened higher, now falling)
 *           CE only if entry price > day_open  (market opened lower, now rising)
 *
 *  TRAIL  : Profit >= 100 pts => trail SL = entry +/- (peak * 0.6)
 *           Locks 60% of peak, allows 40% pullback before exiting
 *
 *  RE     : After T1 SL hit, find next body-break with same day-bias. Max 1 RE/day.
 *
 *  EOD    : Exit at last candle close if still open
 */
require('dotenv').config();
const https = require('https');
const RS = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade',
      path,
      headers: {
        'X-Kite-Version': '3',
        'Authorization': `token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}`
      },
      timeout: 15000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function enrich(raw) {
  const [ts, o, h, l, c] = raw;
  return {
    time: ts.slice(11, 16),
    open: o, high: h, low: l, close: c,
    body_high: Math.max(o, c),
    body_low:  Math.min(o, c)
  };
}

const MAX_SL = 150;  // skip if entry candle wick > this
const SL_BUF = 5;    // candle must close 5pts past SL

// Progressive trail: protect only when profit is genuinely large
// Trending day (May 20): 262pt peak → 77% intraday dip → any trail <400 fires → hold to EOD
// Reversal day (May 21): 534pt peak → trail at 70% = 374pts locked before final reversal
function trailLock(peak) {
  if (peak >= 400) return 0.70;  // lock 70% of big peak only
  return 0;                      // < 400 pts: no trail — hold with original SL
}

function findSignal(cs, fromIdx, dayOpen) {
  for (let i = Math.max(fromIdx, 1); i < cs.length; i++) {
    const c = cs[i], p = cs[i - 1];
    let sig, slPx;
    if (c.close < p.body_low) {
      sig = 'PE'; slPx = c.high;  // SL = entry candle's own HIGH
    } else if (c.close > p.body_high) {
      sig = 'CE'; slPx = c.low;   // SL = entry candle's own LOW
    } else {
      continue;
    }
    // Day-open bias: PE only below day_open, CE only above day_open
    if (sig === 'PE' && c.close >= dayOpen) continue;
    if (sig === 'CE' && c.close <= dayOpen) continue;
    // Skip if SL too wide (avoid entry candles with huge wicks)
    if (Math.abs(slPx - c.close) > MAX_SL) continue;
    return { i, sig, entryPx: c.close, slPx, entryTime: c.time };
  }
  return null;
}

function simLeg(cs, startIdx, sig, entryPx, slPx) {
  let peak = 0;
  for (let j = startIdx + 1; j < cs.length; j++) {
    const c = cs[j];
    const pts = sig === 'PE' ? entryPx - c.close : c.close - entryPx;
    if (pts > peak) peak = pts;

    // Progressive trail: tighten protection as profit grows
    const lock = trailLock(peak);
    let effSL = slPx;
    if (lock > 0) {
      const locked = peak * lock;
      if (sig === 'PE') effSL = Math.min(slPx, entryPx - locked);  // trail below entry
      else              effSL = Math.max(slPx, entryPx + locked);  // trail above entry
    }

    // Candle-close SL/trail check
    const hit = sig === 'PE'
      ? c.close >= effSL + SL_BUF
      : c.close <= effSL - SL_BUF;

    if (hit) {
      const exitPts = sig === 'PE' ? entryPx - effSL : effSL - entryPx;
      const exitType = lock > 0 ? 'TR' : 'SL';
      return { pts: exitPts, exit: exitType, exitTime: c.time, peak };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: sig === 'PE' ? entryPx - last.close : last.close - entryPx,
           exit: 'EOD', exitTime: last.time, peak };
}

function simDay(cs) {
  const dayOpen = cs[0].open;
  const legs = [];
  let total = 0;

  const t1 = findSignal(cs, 1, dayOpen);
  if (!t1) return { legs, total };

  const t1Res = simLeg(cs, t1.i, t1.sig, t1.entryPx, t1.slPx);
  legs.push({ ...t1, ...t1Res, label: 'T1' });
  total += t1Res.pts;

  // RE fires after SL hit — not after trail (trail = we captured good profit)
  if (t1Res.exit === 'SL') {
    const re = findSignal(cs, t1.i + 1, dayOpen);
    if (re) {
      const reRes = simLeg(cs, re.i, re.sig, re.entryPx, re.slPx);
      legs.push({ ...re, ...reRes, label: 'RE' });
      total += reRes.pts;
    }
  }

  return { legs, total };
}

async function run(from, to, label) {
  const resp = await kiteGet(
    `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`
  );
  if (!resp.data || !resp.data.candles) {
    console.log('ERROR:', JSON.stringify(resp).slice(0, 200));
    return;
  }

  const byDate = {};
  for (const raw of resp.data.candles) {
    const date = raw[0].slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(enrich(raw));
  }

  const dates = Object.keys(byDate).sort().filter(d => byDate[d].length >= 5);
  const LINE = '='.repeat(95);
  console.log('\n' + LINE);
  console.log(`  MY STRATEGY v2 -- ${label}`);
  console.log(`  Trail: <400pts=NONE (hold full move) | 400pts+=lock70% (protect big peaks)`);
  console.log(LINE);

  let totalPts = 0, wins = 0, losses = 0;

  for (const date of dates) {
    const r = simDay(byDate[date]);
    if (!r.legs.length) continue;

    totalPts += r.total;
    const win = r.total > 0;
    if (win) wins++; else losses++;

    for (const leg of r.legs) {
      const dist = Math.abs(leg.slPx - leg.entryPx).toFixed(0);
      const rs = Math.round(leg.pts * RS);
      const sign = rs >= 0 ? '+' : '-';
      console.log(
        `  ${date}  ${leg.label} ${leg.sig}  in:${leg.entryPx.toFixed(0)}  SL:${leg.slPx.toFixed(0)}(${dist}pt)` +
        `  pk:${leg.peak.toFixed(0)}  ${leg.exit.padEnd(3)}  ${(leg.pts>=0?'+':'')+leg.pts.toFixed(0).padStart(5)}pts` +
        `  ${sign}Rs${Math.abs(rs).toLocaleString().padStart(6)}  ${leg.entryTime}->${leg.exitTime}`
      );
    }
    const dr = Math.round(r.total * RS);
    const dsign = dr >= 0 ? '+' : '-';
    console.log(`              DAY: ${(r.total>=0?'+':'')+r.total.toFixed(0)}pts  ${dsign}Rs${Math.abs(dr).toLocaleString()}  ${win ? 'WIN' : 'LOSS'}`);
    console.log('  ' + '-'.repeat(91));
  }

  const tr = Math.round(totalPts * RS);
  const tsign = tr >= 0 ? '+' : '-';
  console.log(`\n  TOTAL: ${(totalPts>=0?'+':'')+totalPts.toFixed(0)}pts  ${tsign}Rs${Math.abs(tr).toLocaleString()}`);
  console.log(`  Win: ${wins}  Loss: ${losses}  WR: ${((wins / (wins + losses || 1)) * 100).toFixed(1)}%`);
  console.log(LINE + '\n');
}

async function main() {
  await run('2026-05-01', '2026-05-31', 'Full May 2026 — Progressive Trail');
}

main().catch(console.error);

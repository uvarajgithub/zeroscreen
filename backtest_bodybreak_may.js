'use strict';
/**
 * Body-Breakout Strategy — All of May 2026
 * Entry : C_curr.close < C_prev.body_low  → PE, SL = C_prev.high
 *         C_curr.close > C_prev.body_high → CE, SL = C_prev.low
 * SL    : Candle CLOSE only (not intrabar wick)
 * Exit  : EOD if SL not hit. No trailing.
 */
require('dotenv').config();
const https = require('https');
const RS = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}` },
      timeout: 15000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function enrich(c) {
  const bull      = c[4] >= c[1];
  const body_high = Math.max(c[1], c[4]);
  const body_low  = Math.min(c[1], c[4]);
  const body_size = body_high - body_low;
  return { time: c[0].slice(11,16), open: c[1], high: c[2], low: c[3], close: c[4],
           bull, body_high, body_low, body_size };
}

// Simulate one leg: entry at cs[startIdx], returns { pts, exitIdx, exit }
function simLeg(cs, startIdx, sig, entryPx, slPx) {
  const slDist = Math.abs(slPx - entryPx);
  for (let j = startIdx + 1; j < cs.length; j++) {
    const cur = cs[j];
    const slHit = sig === 'PE' ? cur.close >= slPx : cur.close <= slPx;
    if (slHit) {
      const slPts = sig === 'PE' ? entryPx - slPx : slPx - entryPx;
      return { pts: slPts, exitIdx: j, exit: 'SL', exitTime: cur.time };
    }
  }
  const last = cs[cs.length - 1];
  return { pts: sig === 'PE' ? entryPx - last.close : last.close - entryPx,
           exitIdx: cs.length - 1, exit: 'EOD', exitTime: last.time };
}

// Find next body-breakout signal starting at index i
function findSignal(cs, fromIdx) {
  for (let i = Math.max(fromIdx, 1); i < cs.length; i++) {
    const c = cs[i], prev = cs[i-1];
    if (c.close < prev.body_low) {
      return { i, sig: 'PE', entryPx: c.close, slPx: c.high, entryTime: c.time };
    } else if (c.close > prev.body_high) {
      return { i, sig: 'CE', entryPx: c.close, slPx: c.low, entryTime: c.time };
    }
  }
  return null;
}

function simDay(cs, date) {
  // T1
  const t1 = findSignal(cs, 1);
  if (!t1) return { date, sig: null, pts: 0, exit: 'NO_SIGNAL', legs: [] };

  const t1Leg = simLeg(cs, t1.i, t1.sig, t1.entryPx, t1.slPx);
  const legs = [{ ...t1, ...t1Leg, label: 'T1' }];
  let totalPts = t1Leg.pts;

  // RE: only if T1 SL hit — find next body-breakout after T1 exit
  if (t1Leg.exit === 'SL') {
    const re = findSignal(cs, t1Leg.exitIdx + 1);
    if (re) {
      const reLeg = simLeg(cs, re.i, re.sig, re.entryPx, re.slPx);
      legs.push({ ...re, ...reLeg, label: 'RE' });
      totalPts += reLeg.pts;
    }
  }

  return { date, sig: t1.sig, pts: totalPts, exit: t1Leg.exit, legs };
}

async function main() {
  console.log('\nFetching May 2026 candles...');
  const resp = await kiteGet(
    '/instruments/historical/260105/15minute?from=2026-05-01+09:00:00&to=2026-05-22+15:30:00&continuous=0&oi=0'
  );
  if (!resp.data || !resp.data.candles) { console.log('ERROR:', JSON.stringify(resp).slice(0,150)); return; }

  // Group by date
  const byDate = {};
  for (const c of resp.data.candles) {
    const date = c[0].slice(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(enrich(c));
  }

  const dates = Object.keys(byDate).sort().filter(d => byDate[d].length >= 5);
  console.log(`Trading days: ${dates.length}\n`);

  const LINE = '='.repeat(88);
  console.log(LINE);
  console.log('  Body-Breakout v5 — May 2026  (SL=entry candle H/L + RE on next body-break)');
  console.log(LINE);
  console.log(`  ${'Date'.padEnd(12)} ${'Sig'.padEnd(4)} ${'Entry'.padStart(6)} ${'SLPx'.padStart(8)} ${'SLDist'.padStart(7)} ${'Exit'.padStart(5)} ${'Pts'.padStart(6)} ${'₹'.padStart(8)}  Result`);
  console.log('  ' + '-'.repeat(82));

  let totalPts = 0, wins = 0, losses = 0, noSig = 0;

  for (const date of dates) {
    const r = simDay(byDate[date], date);
    if (!r.sig) {
      noSig++;
      console.log(`  ${date}  NO SIGNAL`);
      continue;
    }
    totalPts += r.pts;
    const rs = Math.round(r.pts * RS);
    const win = r.pts > 0;
    if (win) wins++; else losses++;
    const mark = win ? '✅' : '❌';
    for (const leg of r.legs) {
      const legRs = Math.round(leg.pts * RS);
      const dist = Math.abs(leg.slPx - leg.entryPx).toFixed(0);
      console.log(
        `  ${date}  ${leg.label} ${leg.sig.padEnd(3)} ${leg.entryPx.toFixed(0).padStart(6)} SL:${leg.slPx.toFixed(0)} (${dist}pts)  ${leg.exit.padEnd(4)} ${(leg.pts>=0?'+':'')+leg.pts.toFixed(0).padStart(5)} ${((legRs>=0?'+₹':'-₹')+Math.abs(legRs)).padStart(8)}  ${leg.exit==='SL'?'❌ SL':'✅ EOD'}  ${leg.entryTime}→${leg.exitTime}`
      );
    }
    const dayRs = Math.round(r.pts * RS);
    console.log(`  ${' '.repeat(date.length)}  ${'DAY TOTAL'.padEnd(52)} ${((r.pts>=0?'+':'')+r.pts.toFixed(0)).padStart(5)} ${((dayRs>=0?'+₹':'-₹')+Math.abs(dayRs)).padStart(8)}  ${mark}`);
    console.log('  ' + '-'.repeat(82));
  }

  const totalRs = Math.round(totalPts * RS);
  console.log('  ' + '-'.repeat(82));
  console.log(`  ${'TOTAL'.padEnd(12)} ${''.padEnd(4)} ${''.padStart(6)} ${''.padStart(8)} ${''.padStart(7)} ${''.padStart(5)} ${((totalPts >= 0 ? '+' : '') + totalPts.toFixed(0)).padStart(6)} ${((totalRs >= 0 ? '+₹' : '-₹') + Math.abs(totalRs)).padStart(8)}`);
  console.log(LINE);
  console.log(`\n  Days: ${dates.length}  |  Traded: ${wins+losses}  |  Win: ${wins}  |  Loss: ${losses}  |  No signal: ${noSig}`);
  console.log(`  Win rate: ${((wins/(wins+losses))*100).toFixed(1)}%`);
  console.log(`  Total profit: ₹${totalRs.toLocaleString('en-IN')}`);
  console.log(LINE);
}
main().catch(console.error);

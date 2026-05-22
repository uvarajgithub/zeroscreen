'use strict';
/**
 * Simple Body-Breakout Strategy — May 20 + 21 simulation
 *
 * Rules:
 *   Entry : C_curr.close < C_prev.body_low  → PE, entry = C_curr.close, SL = C_prev.high
 *           C_curr.close > C_prev.body_high → CE, entry = C_curr.close, SL = C_prev.low
 *   SL    : Candle CLOSE only (not intrabar wick) must close past SL level
 *   Exit  : EOD (last candle) if SL not hit
 *   Trail : None — hold to EOD
 *   Signal: First signal of the day only
 */
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
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

async function fetchCandles(date) {
  const resp = await kiteGet(
    `/instruments/historical/260105/15minute?from=${date}+09:00:00&to=${date}+15:30:00&continuous=0&oi=0`
  );
  if (!resp.data || !resp.data.candles) throw new Error('No data: ' + JSON.stringify(resp).slice(0,100));
  return resp.data.candles.map(c => {
    const bull      = c[4] >= c[1];
    const body_high = Math.max(c[1], c[4]);
    const body_low  = Math.min(c[1], c[4]);
    return { time: c[0].slice(11,16), open: c[1], high: c[2], low: c[3], close: c[4], bull, body_high, body_low };
  });
}

function simulate(cs, date) {
  console.log(`\n${'='.repeat(65)}`);
  console.log(`  ${date} — Body-Breakout Strategy`);
  console.log('='.repeat(65));
  console.log(`  ${'Time'.padEnd(6)} ${'Open'.padStart(8)} ${'High'.padStart(8)} ${'Low'.padStart(8)} ${'Close'.padStart(8)}  Dir   Note`);
  console.log('  ' + '-'.repeat(60));

  let entryIdx = -1, entryPx = 0, sig = '', slPx = 0;

  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    let note = '';

    if (entryIdx < 0 && i > 0) {
      // Check body-breakout signal
      const prev = cs[i - 1];
      if (c.close < prev.body_low) {
        sig = 'PE'; entryPx = c.close; slPx = prev.high; entryIdx = i;
        note = `<-- PE ENTRY @ ${entryPx}  SL=${slPx} (prev.high)  dist=${(slPx-entryPx).toFixed(0)}pts`;
      } else if (c.close > prev.body_high) {
        sig = 'CE'; entryPx = c.close; slPx = prev.low; entryIdx = i;
        note = `<-- CE ENTRY @ ${entryPx}  SL=${slPx} (prev.low)  dist=${(entryPx-slPx).toFixed(0)}pts`;
      }
    } else if (entryIdx >= 0) {
      const pts = sig === 'PE' ? entryPx - c.close : c.close - entryPx;
      const slHit = sig === 'PE' ? c.close >= slPx : c.close <= slPx;
      if (slHit) {
        const slPts = sig === 'PE' ? entryPx - slPx : slPx - entryPx;
        note = `SL HIT on close  P&L: ${slPts.toFixed(0)} pts (₹${Math.round(slPts*RS_PER_PT)})`;
      } else {
        note = `pts=${pts.toFixed(0)}  SL=${slPx}  ${c.high >= slPx && sig === 'PE' ? '⚠ intrabar H>=SL (ignored)' : c.low <= slPx && sig === 'CE' ? '⚠ intrabar L<=SL (ignored)' : ''}`;
      }
    }

    const dir = c.bull ? 'BULL' : 'BEAR';
    console.log(`  ${c.time.padEnd(6)} ${c.open.toFixed(0).padStart(8)} ${c.high.toFixed(0).padStart(8)} ${c.low.toFixed(0).padStart(8)} ${c.close.toFixed(0).padStart(8)}  ${dir}  ${note}`);

    // SL exit
    if (entryIdx >= 0) {
      const slHit = sig === 'PE' ? c.close >= slPx : c.close <= slPx;
      if (slHit) {
        const slPts = sig === 'PE' ? entryPx - slPx : slPx - entryPx;
        console.log(`\n  SL EXIT: ${sig} ${slPts.toFixed(0)} pts = ₹${Math.round(slPts*RS_PER_PT)}`);
        entryIdx = -2; // done
      }
    }
  }

  if (entryIdx >= 0) {
    const last = cs[cs.length - 1];
    const pts = sig === 'PE' ? entryPx - last.close : last.close - entryPx;
    console.log(`\n  EOD EXIT @ ${last.close}  P&L: ${pts.toFixed(0)} pts = ₹${Math.round(pts*RS_PER_PT)}`);
  } else if (entryIdx === -1) {
    console.log('\n  No signal today.');
  }
  console.log('='.repeat(65));
}

async function main() {
  for (const date of ['2026-05-20', '2026-05-21']) {
    try {
      console.log(`\nFetching ${date}...`);
      const cs = await fetchCandles(date);
      console.log(`  ${cs.length} candles`);
      if (cs.length < 5) { console.log(`  Skipped (holiday / no data)`); continue; }
      simulate(cs, date);
    } catch (e) {
      console.log(`  ERROR: ${e.message}`);
    }
  }
}
main();

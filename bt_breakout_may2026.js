'use strict';
// bt_breakout_may2026.js — May 2026: enter at first breakout candle (close < PDL or > PDH), hold EOD, no SL
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('May 2026: first breakout candle entry, hold EOD, no SL...');
  const d = await kite.getHistoricalData(260105, '15minute', '2026-04-28', '2026-06-01', false);
  const all = d.map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close,
    date: x.date instanceof Date ? x.date : new Date(x.date) }));

  const days = {};
  for (const c of all) {
    const ist = new Date(c.date.getTime() + 5.5 * 3600 * 1000);
    const tm = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    if (tm < 9 * 60 + 15 || tm > 15 * 60 + 15) continue;
    const dk = ist.toISOString().slice(0, 10);
    if (!days[dk]) days[dk] = [];
    days[dk].push({ open: c.open, high: c.high, low: c.low, close: c.close });
  }

  const dates = Object.keys(days).sort();
  let totalPnL = 0;
  console.log('\nDate        | Entry | Side | Entry px | EOD px  | P&L');
  console.log('------------|-------|------|----------|---------|-----');

  for (let di = 1; di < dates.length; di++) {
    if (!dates[di].startsWith('2026-05') && dates[di] !== '2026-06-01') continue;
    const today = days[dates[di]], prev = days[dates[di - 1]];
    if (!today || today.length < 3 || !prev || prev.length < 3) continue;

    const PH = Math.max(...prev.map(c => c.high));
    const PL = Math.min(...prev.map(c => c.low));
    const eod = today[today.length - 1].close;

    // Find first candle that closes outside PDL/PDH
    let entry = null, side = null, entryCandle = null;
    for (let i = 0; i < today.length - 1; i++) { // exclude last candle
      if (today[i].close < PL) { entry = today[i].close; side = 'PE'; entryCandle = 'C' + i; break; }
      if (today[i].close > PH) { entry = today[i].close; side = 'CE'; entryCandle = 'C' + i; break; }
    }

    if (!entry) { console.log(dates[di] + ' | -- no breakout --'); continue; }

    // SL = fixed 150 pts
    const entryIdx = today.findIndex((c, i) => i < today.length - 1 && (side === 'PE' ? c.close < PL : c.close > PH));
    const slLevel = side === 'PE' ? entry + 150 : entry - 150;
    let exitPx = eod, exitNote = 'EOD';
    for (let i = entryIdx + 1; i < today.length; i++) {
      if (side === 'PE' && today[i].high >= slLevel) { exitPx = slLevel; exitNote = 'SL '; break; }
      if (side === 'CE' && today[i].low  <= slLevel) { exitPx = slLevel; exitNote = 'SL '; break; }
    }

    const pnl = side === 'CE' ? exitPx - entry : entry - exitPx;
    totalPnL += pnl;
    const sign = pnl >= 0 ? '+' : '';
    console.log(dates[di] + ' | ' + entryCandle.padEnd(5) + ' | ' + side + ' | ' + entry.toFixed(0).padStart(8) + ' | ' + exitNote + ' | ' + sign + Math.round(pnl));
  }

  console.log('────────────────────────────────────────────────────────');
  console.log('Total P&L: ' + (totalPnL >= 0 ? '+' : '') + Math.round(totalPnL) + ' pts  (₹' + (Math.round(totalPnL) * 15).toLocaleString() + ')');
}
main().catch(e => { console.error(e.message); process.exit(1); });

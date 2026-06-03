'use strict';
// bt_c1_noslhold.js — enter at C1 close, direction = C1 body, hold to EOD, no SL
const { KiteConnect } = require('kiteconnect');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const kite = new KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

const bp = c => (c.high - c.low) > 0 ? (c.close - c.open) / (c.high - c.low) * 100 : 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchChunk(from, to) {
  const d = await kite.getHistoricalData(260105, '15minute', from, to, false);
  return d.map(x => ({ open: x.open, high: x.high, low: x.low, close: x.close,
    date: x.date instanceof Date ? x.date : new Date(x.date) }));
}

async function main() {
  console.log('C1 entry, no SL, hold to EOD (Jan 2021 – May 2026)...');
  const startDate = new Date('2021-01-01'), endDate = new Date('2026-05-25');
  const all = []; let cur = new Date(startDate);
  while (cur < endDate) {
    const ce = new Date(cur); ce.setDate(ce.getDate() + 59);
    if (ce > endDate) ce.setTime(endDate.getTime());
    try { const chunk = await fetchChunk(cur.toISOString().slice(0, 10), ce.toISOString().slice(0, 10)); all.push(...chunk); process.stdout.write('.'); }
    catch (e) { process.stdout.write('E'); }
    await sleep(350); cur.setDate(cur.getDate() + 60);
  }
  console.log('\nBuilding day map...');
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
  let totalPnL = 0, trades = 0, wins = 0, greenDays = 0, redDays = 0;
  let bigWins = [], bigLoss = [];

  for (let di = 0; di < dates.length; di++) {
    const today = days[dates[di]];
    if (!today || today.length < 3) continue;
    const C1 = today[1];
    if (!C1) continue;
    const C1bp = bp(C1);
    const side = C1bp > 0 ? 'CE' : 'PE'; // direction of C1 body
    const entry = C1.close;
    const eod = today[today.length - 1].close;
    const pnl = side === 'CE' ? eod - entry : entry - eod;
    totalPnL += pnl; trades++;
    if (pnl > 0) wins++;
    if (pnl > 0) greenDays++; else redDays++;
    if (pnl > 200) bigWins.push({ date: dates[di], pnl: Math.round(pnl), side });
    if (pnl < -200) bigLoss.push({ date: dates[di], pnl: Math.round(pnl), side });
  }

  const wr = (wins / trades * 100).toFixed(1);
  console.log('\n════════════════════════════════════════');
  console.log('C1 entry, hold EOD, NO SL');
  console.log('════════════════════════════════════════');
  console.log('Total P&L   : ' + Math.round(totalPnL) + ' pts  (₹' + (Math.round(totalPnL) * 15).toLocaleString() + ')');
  console.log('Total days  : ' + trades + '  green: ' + greenDays + '  red: ' + redDays);
  console.log('Win rate    : ' + wr + '%');
  console.log('Avg pts/day : ' + (totalPnL / trades).toFixed(1));
  console.log('────────────────────────────────────────');
  console.log('Compare: DRISHTI V1 = 266,196 pts');
  console.log('\nTop 5 big wins:');
  bigWins.sort((a, b) => b.pnl - a.pnl).slice(0, 5).forEach(d => console.log('  ' + d.date + '  ' + d.side + '  +' + d.pnl));
  console.log('\nTop 5 big losses:');
  bigLoss.sort((a, b) => a.pnl - b.pnl).slice(0, 5).forEach(d => console.log('  ' + d.date + '  ' + d.side + '  ' + d.pnl));
}
main().catch(e => { console.error(e.message); process.exit(1); });

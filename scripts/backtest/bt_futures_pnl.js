'use strict';
const fs  = require('fs');
const data = JSON.parse(fs.readFileSync('./bt_compare2_result.json', 'utf-8'));
const LOT  = 30;
const daily = data.daily;

// Monthly aggregation — candle-close column
const monthly = {};
for (const d of daily) {
  const mon = d.date.slice(0, 7);
  if (!monthly[mon]) monthly[mon] = { pts: 0, W: 0, L: 0, days: 0 };
  monthly[mon].pts  += d.candle;
  monthly[mon].days += 1;
  if (d.candle > 0) monthly[mon].W++;
  else if (d.candle < 0) monthly[mon].L++;
}

const fmt = n => Math.round(n).toLocaleString('en-IN');

console.log('\nDRISHTI_V1 — BankNifty FUTURES (candle-close, 1 lot = 30 qty)');
console.log('='.repeat(62));
console.log('Month    | Index Pts  | Rs P&L       | WR%  | Days');
console.log('-'.repeat(62));

let totalPts = 0, totalRs = 0;
for (const m of Object.keys(monthly).sort()) {
  const r  = monthly[m];
  const rs = r.pts * LOT;
  const wr = r.W + r.L > 0 ? ((r.W / (r.W + r.L)) * 100).toFixed(0) : '-';
  totalPts += r.pts;
  totalRs  += rs;
  const sign = rs >= 0 ? '+' : '';
  console.log(
    m + ' | ' +
    r.pts.toFixed(1).padStart(9) + ' | ' +
    (sign + 'Rs ' + fmt(rs)).padStart(13) + ' | ' +
    wr.padStart(4) + '% | ' + r.days
  );
}

const days     = daily.length;
const months   = Object.keys(monthly).length;
const winDays  = daily.filter(d => d.candle > 0).length;
const lossDays = daily.filter(d => d.candle < 0).length;
const maxLoss  = Math.min(...daily.map(d => d.candle)) * LOT;
const maxWin   = Math.max(...daily.map(d => d.candle)) * LOT;

console.log('-'.repeat(62));
console.log('TOTAL    | ' + totalPts.toFixed(1).padStart(9) + ' | +Rs ' + fmt(totalRs).padStart(11) + ' |');
console.log('');
console.log('Avg / day    : ' + (totalPts / days).toFixed(1) + ' pts  =  +Rs ' + fmt(totalPts / days * LOT));
console.log('Avg / month  : +Rs ' + fmt(totalRs / months));
console.log('Avg / year   : +Rs ' + fmt(totalRs / (months / 12)));
console.log('');
console.log('Win days     : ' + winDays  + ' / ' + days + '  (' + (winDays  / days * 100).toFixed(1) + '%)');
console.log('Loss days    : ' + lossDays + ' / ' + days + '  (' + (lossDays / days * 100).toFixed(1) + '%)');
console.log('');
console.log('Best day     : +Rs ' + fmt(maxWin));
console.log('Worst day    :  Rs ' + fmt(maxLoss));
console.log('');
console.log('Capital needed (SPAN margin ~Rs 20,000/lot × 1 lot): Rs 20,000');
console.log('ROI (5yr)    : ' + (totalRs / 20000 * 100).toFixed(0) + 'x on Rs 20,000 margin');

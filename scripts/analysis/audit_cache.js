'use strict';
const fs  = require('fs');
const path = require('path');
const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'cache', 'banknifty_5yr.json'), 'utf-8'));
const dates = Object.keys(raw).sort();
const totalCandles = dates.reduce((s, d) => s + raw[d].length, 0);

console.log('=== CACHE AUDIT ===');
console.log('First date  :', dates[0]);
console.log('Last date   :', dates[dates.length - 1]);
console.log('Total days  :', dates.length);
console.log('Total candles:', totalCandles);
console.log('Avg candles/day:', (totalCandles / dates.length).toFixed(1));

// Thin days
const thin = dates.filter(d => raw[d].length < 20);
console.log('\nThin days (<20 candles):', thin.length);
thin.slice(0, 10).forEach(d => console.log('  ', d, raw[d].length, 'candles'));

// Gaps between trading days
const gaps = [];
for (let i = 1; i < dates.length; i++) {
  const a = new Date(dates[i - 1]), b = new Date(dates[i]);
  const diff = (b - a) / 86400000;
  if (diff > 5) gaps.push(dates[i - 1] + ' → ' + dates[i] + ' (' + diff + 'd)');
}
console.log('\nGaps >5 calendar days:', gaps.length);
gaps.slice(0, 10).forEach(g => console.log('  ', g));

// Price sanity check — first and last close of each year
console.log('\nYearly price check (first open → last close):');
const years = [...new Set(dates.map(d => d.slice(0, 4)))].sort();
for (const y of years) {
  const yDates = dates.filter(d => d.startsWith(y));
  const firstCandle = raw[yDates[0]][0];
  const lastDayCandles = raw[yDates[yDates.length - 1]];
  const lastCandle = lastDayCandles[lastDayCandles.length - 1];
  console.log('  ' + y + ': open=' + firstCandle.open + '  →  close=' + lastCandle.close + '  (' + yDates.length + ' trading days)');
}

// Missing weekdays (rough check — count expected Mon-Fri vs actual)
console.log('\nExpected vs actual trading days per year:');
for (const y of years) {
  const yDates = dates.filter(d => d.startsWith(y));
  // Count Mon-Fri in year
  let monFri = 0;
  const start = new Date(y + '-01-01'), end = new Date(y + '-12-31');
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day >= 1 && day <= 5) monFri++;
  }
  // India has ~10-12 market holidays per year
  const expected = monFri - 12;
  console.log('  ' + y + ': actual=' + yDates.length + '  monFri=' + monFri + '  expected~' + expected + '  diff=' + (yDates.length - expected));
}

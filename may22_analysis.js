const d = require('./cache/banknifty_2026.json');

// May 21 (prev day)
const prev = d['2026-05-21'];
const prevClose = prev[prev.length - 1].close;
const prevHigh  = Math.max(...prev.map(x => x.high));
const prevLow   = Math.min(...prev.map(x => x.low));
console.log('=== MAY 21 (prev day) ===');
console.log('PDH:', prevHigh, ' PDL:', prevLow, ' PDC:', prevClose);

// May 22
const c = d['2026-05-22'];
const c0 = c[0];
const body = c0.close - c0.open;
const range = c0.high - c0.low;
const bodyPct = (body / range * 100).toFixed(1);
const eod = c[c.length - 1].close;

console.log('\n=== MAY 22 C0 (9:15 candle) ===');
console.log('Open:', c0.open, ' High:', c0.high, ' Low:', c0.low, ' Close:', c0.close);
console.log('Body:', body.toFixed(0), 'pts  BodyPct:', bodyPct + '%');
console.log('Gap from prevClose:', (c0.open - prevClose).toFixed(0), 'pts');
console.log('Gap from prevHigh:', (c0.open - prevHigh).toFixed(0), 'pts  (positive = gap-up above PDH)');
console.log('Open vs PDH:', c0.open > prevHigh ? 'ABOVE PDH (gap-up)' : c0.open < prevLow ? 'BELOW PDL (gap-down)' : 'INSIDE range');
console.log('Close vs PDH:', c0.close > prevHigh ? 'CLOSED ABOVE PDH' : 'below PDH');

console.log('\n=== CONDITIONS FOR CE ENTRY ===');
console.log('1. C0 bullish (close>open):', c0.close > c0.open, '  body='+body.toFixed(0));
console.log('2. C0 body > 150pts:', body > 150);
console.log('3. C0 bodyPct > 70%:', parseFloat(bodyPct) > 70, '  ='+bodyPct+'%');
console.log('4. Open near C0 low (open-low < 20):', (c0.open - c0.low).toFixed(1), 'pts from low');
console.log('5. Close near C0 high (high-close < 100):', (c0.high - c0.close).toFixed(1), 'pts from high');
console.log('6. C0 opened ABOVE prev high:', c0.open > prevHigh);
console.log('7. C0 opened ABOVE prev close:', c0.open > prevClose, ' gap=', (c0.open - prevClose).toFixed(0));

console.log('\n=== EOD result if entered CE at C0 close ===');
console.log('Entry:', c0.close, '  EOD:', eod, '  Move:', (eod - c0.close).toFixed(0), 'pts  Rs:', ((eod-c0.close)*15).toFixed(0));

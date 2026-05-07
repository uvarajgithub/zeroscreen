// BankNifty 5-min candles today
const candles = [
  {t:'09:15', o:54691.3,  h:54718.55, l:54438.15, c:54618.4},
  {t:'09:20', o:54619.65, h:54668.95, l:54545.9,  c:54621.65},
  {t:'09:25', o:54619.2,  h:54627.05, l:54506.55, c:54529.85},
  {t:'09:30', o:54527.1,  h:54637.65, l:54524.4,  c:54623.1},
  {t:'09:35', o:54619.75, h:54649.95, l:54525.75, c:54542.95},
  {t:'09:40', o:54541.5,  h:54590,    l:54488.85, c:54568.9},
  {t:'09:45', o:54572.8,  h:54636.4,  l:54538.5,  c:54622.8},
  {t:'09:50', o:54622.8,  h:54661.3,  l:54562.1,  c:54632.55},
  {t:'09:55', o:54631.45, h:54672.3,  l:54631.45, c:54663.85},
  {t:'10:00', o:54661.85, h:54682.6,  l:54568.8,  c:54601.15},
  {t:'10:05', o:54597.65, h:54607,    l:54526.95, c:54538.85},
];

// Bot was broken 9:25-10:06, re-seeded at 10:06 with a merged candle
const BOT_FIXED_AT = '10:06';

let prev = candles[0];
let inTrade = null;

for (let i = 1; i < candles.length; i++) {
  const cur = candles[i];
  const prevBodyHigh = Math.max(prev.o, prev.c);
  const prevBodyLow  = Math.min(prev.o, prev.c);
  const ceThresh = prevBodyHigh + 25;
  const peThresh = prevBodyLow  - 25;

  if (!inTrade) {
    if (cur.c > ceThresh) {
      const status = cur.t <= '10:06' ? '** MISSED (token expired) **' : 'BOT ACTIVE';
      console.log(cur.t + ' CE SIGNAL | close ' + cur.c + ' > ' + ceThresh.toFixed(2) + ' | entry=' + cur.c + ' SL=' + (cur.c - 100).toFixed(2) + ' | ' + status);
      inTrade = {dir:'CE', entry:cur.c, sl:cur.c - 100, entryT:cur.t};
    } else if (cur.c < peThresh) {
      const status = cur.t <= '10:06' ? '** MISSED (token expired) **' : 'BOT ACTIVE';
      console.log(cur.t + ' PE SIGNAL | close ' + cur.c + ' < ' + peThresh.toFixed(2) + ' | entry=' + cur.c + ' SL=' + (cur.c + 100).toFixed(2) + ' | ' + status);
      inTrade = {dir:'PE', entry:cur.c, sl:cur.c + 100, entryT:cur.t};
    } else {
      console.log(cur.t + ' flat | close=' + cur.c + ' | CE needs >' + ceThresh.toFixed(2) + ' PE needs <' + peThresh.toFixed(2));
    }
  } else {
    // Check C1-3 early exit (closes 3+ pts against) or SL body close
    const against = inTrade.dir === 'CE' ? (cur.c < inTrade.entry - 3) : (cur.c > inTrade.entry + 3);
    const slHit = inTrade.dir === 'CE' ? (cur.l <= inTrade.sl) : (cur.h >= inTrade.sl);
    const slBodyClose = inTrade.dir === 'CE' ? (Math.min(cur.o,cur.c) < inTrade.sl) : (Math.max(cur.o,cur.c) > inTrade.sl);
    if (slBodyClose) {
      const pnl = inTrade.dir === 'CE' ? (inTrade.sl - inTrade.entry) : (inTrade.entry - inTrade.sl);
      console.log(cur.t + ' SL HIT (body close) | P&L: ' + pnl.toFixed(2) + ' pts');
      inTrade = null;
    } else if (against) {
      const exitPnl = inTrade.dir === 'CE' ? (cur.c - inTrade.entry) : (inTrade.entry - cur.c);
      console.log(cur.t + ' C1-3 EARLY EXIT | exit=' + cur.c + ' P&L: ' + exitPnl.toFixed(2) + ' pts');
      inTrade = null;
    } else {
      const pnl = inTrade.dir === 'CE' ? (cur.c - inTrade.entry) : (inTrade.entry - cur.c);
      console.log(cur.t + ' IN TRADE (' + inTrade.dir + ') | price=' + cur.c + ' running P&L: ' + pnl.toFixed(2) + ' pts');
    }
  }
  prev = cur;
}

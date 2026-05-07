// Candles labeled by OPEN time; signal fires at CLOSE (open + 5min)
// Bot starts at 9:25 → seeds with 9:20 candle as prev
// First signal check: when 9:25 candle CLOSES = 9:30 AM entry

const candles = [
  {open:'09:15', close_t:'09:20', o:54691.3,  h:54718.55, l:54438.15, c:54618.4},
  {open:'09:20', close_t:'09:25', o:54619.65, h:54668.95, l:54545.9,  c:54621.65}, // << SEED (prev at bot start 9:25)
  {open:'09:25', close_t:'09:30', o:54619.2,  h:54627.05, l:54506.55, c:54529.85},
  {open:'09:30', close_t:'09:35', o:54527.1,  h:54637.65, l:54524.4,  c:54623.1},
  {open:'09:35', close_t:'09:40', o:54619.75, h:54649.95, l:54525.75, c:54542.95},
  {open:'09:40', close_t:'09:45', o:54541.5,  h:54590,    l:54488.85, c:54568.9},
  {open:'09:45', close_t:'09:50', o:54572.8,  h:54636.4,  l:54538.5,  c:54622.8},
  {open:'09:50', close_t:'09:55', o:54622.8,  h:54661.3,  l:54562.1,  c:54632.55},
  {open:'09:55', close_t:'10:00', o:54631.45, h:54672.3,  l:54631.45, c:54663.85},
  {open:'10:00', close_t:'10:05', o:54661.85, h:54682.6,  l:54568.8,  c:54601.15},
  {open:'10:05', close_t:'10:10', o:54597.65, h:54607,    l:54526.95, c:54538.85},
];

// Bot starts at 9:25 → seed = index 1 (9:20 candle, just completed)
// Scanning starts from index 2 (9:25 candle, closes at 9:30)
// Bot was broken until 10:06 → missed everything up to index 9 (10:00 candle)
const BOT_RECOVERED_AT = '10:06'; // bot re-seeded at 10:06 with merged candle

let prev = candles[1]; // 9:20 candle = SEED
let inTrade = null;

for (let i = 2; i < candles.length; i++) {
  const cur = candles[i];
  const prevBodyHigh = Math.max(prev.o, prev.c);
  const prevBodyLow  = Math.min(prev.o, prev.c);
  const ceThresh = prevBodyHigh + 25;
  const peThresh = prevBodyLow  - 25;
  const missed = cur.close_t <= '10:06';
  const tag = missed ? ' *** MISSED (token expired) ***' : ' [BOT ACTIVE]';

  if (!inTrade) {
    if (cur.c > ceThresh) {
      console.log(CANDLE - | CE SIGNAL | close  > prevBodyHigh()+25= | ORDER AT  price= SL=);
      inTrade = {dir:'CE', entry:cur.c, sl:cur.c-100, entryT:cur.close_t};
    } else if (cur.c < peThresh) {
      console.log(CANDLE - | PE SIGNAL | close  < prevBodyLow()-25= | ORDER AT  price= SL=);
      inTrade = {dir:'PE', entry:cur.c, sl:cur.c+100, entryT:cur.close_t};
    } else {
      console.log(CANDLE - | flat | close= | need CE> or PE<);
    }
  } else {
    const against = inTrade.dir==='CE' ? (cur.c < inTrade.entry-3) : (cur.c > inTrade.entry+3);
    const slBodyClose = inTrade.dir==='CE' ? (Math.min(cur.o,cur.c) < inTrade.sl) : (Math.max(cur.o,cur.c) > inTrade.sl);
    if (slBodyClose) {
      const pnl = inTrade.dir==='CE' ? (inTrade.sl-inTrade.entry) : (inTrade.entry-inTrade.sl);
      console.log(CANDLE - | SL BODY CLOSE | exit at SL= | P&L:  pts);
      inTrade = null;
    } else if (against) {
      const pnl = inTrade.dir==='CE' ? (cur.c-inTrade.entry) : (inTrade.entry-cur.c);
      console.log(CANDLE - | C1-3 EARLY EXIT | exit= | P&L:  pts);
      inTrade = null;
    } else {
      const pnl = inTrade.dir==='CE' ? (cur.c-inTrade.entry) : (inTrade.entry-cur.c);
      console.log(CANDLE - | IN TRADE  | close= running P&L:  pts);
    }
  }
  prev = cur;
}

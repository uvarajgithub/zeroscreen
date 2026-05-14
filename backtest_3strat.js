// 5-YEAR BACKTEST: 3 Strategies compared
// 1. LOCK50   — current bot (body breakout + LOCK50 trail, exact strategy.ts logic)
// 2. FCD      — First Candle Direction (9:15 candle direction → enter, hold EOD, 100pt SL)
// 3. ORB30    — Opening Range Breakout (first 30-min range → enter on breakout, 100pt SL, EOD exit)
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT    = 15; // qty=30, ₹15/pt

// ─── Kite fetch ──────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 15000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} }); });
    req.on('error', reject); req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchChunk(from, to) {
  const url = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const resp = await kiteGet(url);
    if (!resp.data || !resp.data.candles) return [];
    return resp.data.candles.map(c => {
      const dt  = new Date(c[0]);
      const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return { date: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
               hour: ist.getHours(), min: ist.getMinutes(),
               open: c[1], high: c[2], low: c[3], close: c[4] };
    });
  } catch(e) { console.error(`Chunk ${from}→${to}: ${e.message}`); return []; }
}

async function fetchAll5Yr() {
  const all = []; const end = new Date(); const start = new Date();
  start.setFullYear(end.getFullYear() - 5);
  let cur = new Date(start);
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  while (cur < end) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 190);
    if (ce > end) ce.setTime(end.getTime());
    const chunk = await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10));
    all.push(...chunk); process.stdout.write('.');
    cur.setDate(cur.getDate() + 191);
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date]=[]; m[c.date].push(c); }
  return m;
}

// ─── LOCK50 trail fn ─────────────────────────────────────────────────────────
function trailLock50(sl, entry, dir, peak) {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === 'CE' ? Math.max(sl, entry + lock) : Math.min(sl, entry - lock);
}

// ─── LOCK50: full processHybridCandle (exact strategy.ts port) ───────────────
const HR_BUF = 25, HR_SL = 100;

function createState() {
  return { inTrade:false, dir:null, entry:0, sl:0, refHigh:0,
           firstDone:false, reUsed:false, waitReEntry:false, isC1:false, peakProfit:0 };
}

function processCandle(state, prev, curr, isEOD) {
  const bH = Math.max(prev.open, prev.close), bL = Math.min(prev.open, prev.close);
  if (state.inTrade) {
    if (state.isC1) {
      state.isC1 = false;
      const pnl = state.dir==='CE' ? curr.close-state.entry : state.entry-curr.close;
      if (pnl < -3) {
        state.inTrade=false; state.firstDone=false; state.waitReEntry=false; state.reUsed=false;
        return { action:'EXIT_EARLY', pts:-3 };
      }
    }
    const slHit = state.dir==='CE' ? curr.low<=state.sl : curr.high>=state.sl;
    if (slHit) {
      const pts  = state.dir==='CE' ? state.sl-state.entry : state.entry-state.sl;
      const past = state.dir==='CE' ? curr.close<state.sl   : curr.close>state.sl;
      if (past && !state.reUsed) {
        const rd=state.dir==='CE'?'PE':'CE', re=curr.close, rs=rd==='CE'?re-HR_SL:re+HR_SL;
        state.dir=rd; state.entry=re; state.sl=rs;
        state.refHigh=rd==='CE'?curr.high:curr.low;
        state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'REVERSE_ENTER', dir:rd, exitPts:pts };
      }
      state.inTrade=false;
      if (!state.reUsed) state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0;
      return { action:'EXIT_SL', pts };
    }
    const hp = state.dir==='CE' ? curr.high-state.entry : state.entry-curr.low;
    if (hp > state.peakProfit) { state.peakProfit=hp; state.sl=trailLock50(state.sl,state.entry,state.dir,state.peakProfit); }
    if (isEOD) {
      const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;
      state.inTrade=false; return { action:'EXIT_EOD', pts };
    }
    return { action:'NONE' };
  }
  if (state.waitReEntry) {
    const re=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if (re) {
      const e=curr.close,s=state.dir==='CE'?e-HR_SL:e+HR_SL;
      state.entry=e; state.sl=s; state.inTrade=true; state.waitReEntry=false;
      state.reUsed=true; state.isC1=true; state.peakProfit=0;
      return { action:'ENTER', dir:state.dir, price:e };
    }
    const dist=state.dir==='CE'?state.refHigh-curr.close:curr.close-state.refHigh;
    if (dist > 150) {
      state.waitReEntry=false;
      if (curr.close > bH+HR_BUF) {
        const e=curr.close; state.dir='CE'; state.entry=e; state.sl=e-HR_SL;
        state.refHigh=curr.high; state.inTrade=true; state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'ENTER', dir:'CE', price:e };
      }
      if (curr.close < bL-HR_BUF) {
        const e=curr.close; state.dir='PE'; state.entry=e; state.sl=e+HR_SL;
        state.refHigh=curr.low; state.inTrade=true; state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'ENTER', dir:'PE', price:e };
      }
      state.firstDone=false; state.reUsed=true;
    }
    return { action:'NONE' };
  }
  if (state.firstDone || isEOD) return { action:'NONE' };
  if (curr.close > bH+HR_BUF) {
    const e=curr.close; state.dir='CE'; state.entry=e; state.sl=e-HR_SL;
    state.refHigh=curr.high; state.inTrade=true; state.firstDone=true; state.isC1=true; state.peakProfit=0;
    return { action:'ENTER', dir:'CE', price:e };
  }
  if (curr.close < bL-HR_BUF) {
    const e=curr.close; state.dir='PE'; state.entry=e; state.sl=e+HR_SL;
    state.refHigh=curr.low; state.inTrade=true; state.firstDone=true; state.isC1=true; state.peakProfit=0;
    return { action:'ENTER', dir:'PE', price:e };
  }
  return { action:'NONE' };
}

function simLOCK50(candles) {
  const state=createState(); let pnl=0,trades=0,wins=0,loss=0,dailyLoss=0;
  for (let i=1;i<candles.length;i++) {
    if (trades>=5||dailyLoss>=350) break;
    const isEOD=(candles[i].hour===15&&candles[i].min>=15)||(i===candles.length-1);
    const sig=processCandle(state,candles[i-1],candles[i],isEOD);
    if (sig.action==='REVERSE_ENTER') {
      pnl+=sig.exitPts; trades++;
      if(sig.exitPts>0)wins++;else{loss++;dailyLoss+=Math.abs(sig.exitPts);}
      if(trades>=5||dailyLoss>=350) state.inTrade=false;
    } else if (['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)) {
      pnl+=sig.pts; trades++;
      if(sig.pts>0)wins++;else{loss++;dailyLoss+=Math.abs(sig.pts);}
    }
  }
  if (state.inTrade) {
    const last=candles[candles.length-1];
    const p=state.dir==='CE'?last.close-state.entry:state.entry-last.close;
    pnl+=p; trades++; if(p>0)wins++;else loss++;
  }
  return { pnl:Math.round(pnl), trades, wins, loss };
}

// ─── Strategy 2: First Candle Direction (FCD) ────────────────────────────────
// Enter at close of first 15-min candle (9:15-9:30), direction = candle direction
// SL = 100 pts | Exit = EOD
function simFCD(candles) {
  if (candles.length < 2) return { pnl:0, trades:0, wins:0, loss:0 };
  const c0 = candles[0]; // 9:15 candle
  if (Math.abs(c0.close - c0.open) < 10) return { pnl:0, trades:0, wins:0, loss:0 }; // doji — skip
  const dir  = c0.close > c0.open ? 'CE' : 'PE';
  const entry = c0.close;
  const sl    = dir === 'CE' ? entry - 100 : entry + 100;

  let exitPts = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const isEOD = (c.hour === 15 && c.min >= 15) || i === candles.length - 1;
    // SL hit check
    if (dir === 'CE' && c.low <= sl)  { exitPts = sl - entry; break; }
    if (dir === 'PE' && c.high >= sl) { exitPts = entry - sl; break; }
    if (isEOD) {
      exitPts = dir === 'CE' ? c.close - entry : entry - c.close;
      break;
    }
  }
  const pnl = Math.round(exitPts);
  return { pnl, trades:1, wins: pnl>0?1:0, loss: pnl<=0?1:0 };
}

// ─── Strategy 3: Opening Range Breakout 30-min (ORB30) ───────────────────────
// First 2 candles (9:15 + 9:30) form the range
// From candle 3 onward: enter CE on close > rangeHigh+10, PE on close < rangeLow-10
// SL = opposite side of range | Exit = EOD | Max 1 trade/day | No entry after 2PM
function simORB30(candles) {
  if (candles.length < 3) return { pnl:0, trades:0, wins:0, loss:0 };
  const c0 = candles[0], c1 = candles[1];
  const rangeHigh = Math.max(c0.high, c1.high);
  const rangeLow  = Math.min(c0.low,  c1.low);
  const rangePts  = rangeHigh - rangeLow;
  // Skip extremely wide range days (>600 pts) — unfavourable risk/reward
  if (rangePts > 600) return { pnl:0, trades:0, wins:0, loss:0 };

  const BUF = 10;
  const SL  = 100;

  for (let i = 2; i < candles.length; i++) {
    const c = candles[i];
    if (c.hour >= 14) break; // no new entry after 2 PM
    const isEOD = (c.hour === 15 && c.min >= 15) || i === candles.length - 1;
    if (isEOD) break;

    let dir = null;
    if (c.close > rangeHigh + BUF) dir = 'CE';
    else if (c.close < rangeLow - BUF) dir = 'PE';
    if (!dir) continue;

    const entry = c.close;
    const sl    = dir === 'CE' ? entry - SL : entry + SL;
    let exitPts = 0;

    for (let j = i + 1; j < candles.length; j++) {
      const cx = candles[j];
      const isE = (cx.hour === 15 && cx.min >= 15) || j === candles.length - 1;
      if (dir === 'CE' && cx.low <= sl)  { exitPts = sl - entry; break; }
      if (dir === 'PE' && cx.high >= sl) { exitPts = entry - sl; break; }
      if (isE) { exitPts = dir === 'CE' ? cx.close - entry : entry - cx.close; break; }
    }

    const pnl = Math.round(exitPts);
    return { pnl, trades:1, wins:pnl>0?1:0, loss:pnl<=0?1:0 };
  }
  return { pnl:0, trades:0, wins:0, loss:0 }; // no breakout today
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const candles = await fetchAll5Yr();
  const byDay   = groupByDay(candles);
  const dates   = Object.keys(byDay).sort();
  console.log(`Trading days: ${dates.length}\n`);

  const yrs = {};
  let totL=0,totF=0,totO=0;
  let lWD=0,lLD=0,fWD=0,fLD=0,oWD=0,oLD=0;
  let lWins=0,lLoss=0,fWins=0,fLoss=0,oWins=0,oLoss=0;

  for (const date of dates) {
    const dc = byDay[date];
    if (dc.length < 5) continue;
    const yr = date.slice(0,4);
    if (!yrs[yr]) yrs[yr] = { l:0,f:0,o:0,days:0,lWD:0,fWD:0,oWD:0 };

    const rL = simLOCK50(dc);
    const rF = simFCD(dc);
    const rO = simORB30(dc);

    totL+=rL.pnl; totF+=rF.pnl; totO+=rO.pnl;
    yrs[yr].l+=rL.pnl; yrs[yr].f+=rF.pnl; yrs[yr].o+=rO.pnl; yrs[yr].days++;
    lWins+=rL.wins; lLoss+=rL.loss; fWins+=rF.wins; fLoss+=rF.loss; oWins+=rO.wins; oLoss+=rO.loss;
    if(rL.pnl>0){lWD++;yrs[yr].lWD++;}else if(rL.pnl<0)lLD++;
    if(rF.pnl>0){fWD++;yrs[yr].fWD++;}else if(rF.pnl<0)fLD++;
    if(rO.pnl>0){oWD++;yrs[yr].oWD++;}else if(rO.pnl<0)oLD++;
  }

  const W = 108;
  console.log('='.repeat(W));
  console.log('  5-YEAR BACKTEST: LOCK50  vs  FIRST CANDLE DIRECTION  vs  OPENING RANGE BREAKOUT (30-min)');
  console.log('  qty=30 | ₹15/pt | SL=100pts | EOD exit');
  console.log('='.repeat(W));
  console.log('Year  | LOCK50 ₹      Win Days | FCD ₹         Win Days | ORB30 ₹       Win Days | Winner');
  console.log('------|------------------------|------------------------|------------------------|-------');
  for (const [yr, s] of Object.entries(yrs).sort()) {
    const lRs=Math.round(s.l*RS_PER_PT), fRs=Math.round(s.f*RS_PER_PT), oRs=Math.round(s.o*RS_PER_PT);
    const best = s.l>=s.f&&s.l>=s.o?'LOCK50':s.f>=s.l&&s.f>=s.o?'FCD':'ORB30';
    const lStr=`₹${(lRs/100000).toFixed(2)}L`.padEnd(13);
    const fStr=`₹${(fRs/100000).toFixed(2)}L`.padEnd(13);
    const oStr=`₹${(oRs/100000).toFixed(2)}L`.padEnd(13);
    console.log(`${yr}  | ${lStr} ${(s.lWD+'/'+s.days).padEnd(8)} | ${fStr} ${(s.fWD+'/'+s.days).padEnd(8)} | ${oStr} ${(s.oWD+'/'+s.days).padEnd(8)} | **${best}**`);
  }
  console.log('='.repeat(W));
  const lTRs=Math.round(totL*RS_PER_PT), fTRs=Math.round(totF*RS_PER_PT), oTRs=Math.round(totO*RS_PER_PT);
  const totDays=lWD+lLD;
  console.log(`TOTAL | ₹${(lTRs/100000).toFixed(2)}L`.padEnd(18)+` ${(lWD+'/'+totDays).padEnd(8)} | ₹${(fTRs/100000).toFixed(2)}L`.padEnd(18)+` ${(fWD+'/'+totDays).padEnd(8)} | ₹${(oTRs/100000).toFixed(2)}L`.padEnd(18)+` ${(oWD+'/'+totDays).padEnd(8)} |`);
  console.log('='.repeat(W));
  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────────────────────┐');
  console.log('│  SUMMARY                                                                        │');
  console.log('├─────────────────────────────────────────────────────────────────────────────────┤');
  const lWr=Math.round(lWins/(lWins+lLoss)*100), fWr=Math.round(fWins/(fWins+fLoss)*100), oWr=Math.round(oWins/(oWins+oLoss)*100);
  console.log(`│  LOCK50  │ ₹${(lTRs/100000).toFixed(2)}L 5yr │ ₹${Math.round(lTRs/5).toLocaleString('en-IN')}/yr │ Trade WR: ${lWr}% │ Day WR: ${Math.round(lWD/(lWD+lLD)*100)}%     │`);
  console.log(`│  FCD     │ ₹${(fTRs/100000).toFixed(2)}L 5yr │ ₹${Math.round(fTRs/5).toLocaleString('en-IN')}/yr │ Trade WR: ${fWr}% │ Day WR: ${Math.round(fWD/(fWD+fLD)*100)}%     │`);
  console.log(`│  ORB30   │ ₹${(oTRs/100000).toFixed(2)}L 5yr │ ₹${Math.round(oTRs/5).toLocaleString('en-IN')}/yr │ Trade WR: ${oWr}% │ Day WR: ${Math.round(oWD/(oWD+oLD)*100)}%     │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────────┘');
}

main().catch(console.error);

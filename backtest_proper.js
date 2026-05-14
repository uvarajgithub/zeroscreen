// PROPER 5-YEAR BACKTEST — LOCK50 vs TRAIL
// Uses EXACT strategy logic ported from strategy.ts + processHybridCandle
// LOCK50  = trailLock50 (peak-50 lock, aggressive)
// TRAIL   = trailDefault (lock 20pts@100, 100pts@200, conservative)
// Both: maxTrades=5, dailyLossCap=350pts, qty=30 => ₹15/pt
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QTY_RS_PER_PT = 15; // qty=30, ₹0.5/unit, BANKNIFTY lot=15 => ₹15/pt

// ─── Kite API ────────────────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 15000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ reject(e); } });
    });
    req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchChunk(from, to) {
  const url = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const resp = await kiteGet(url);
    if (!resp.data || !resp.data.candles) return [];
    return resp.data.candles.map(c => {
      const dt = new Date(c[0]);
      const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        date: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
        hour: ist.getHours(), min: ist.getMinutes(),
        open: c[1], high: c[2], low: c[3], close: c[4]
      };
    });
  } catch(e) { console.error(`Chunk ${from}→${to}: ${e.message}`); return []; }
}

async function fetchAll5Yr() {
  const chunks = []; const end = new Date(); const start = new Date();
  start.setFullYear(end.getFullYear() - 5);
  let cur = new Date(start);
  process.stdout.write('Fetching 5-yr BANKNIFTY 15-min candles ');
  while (cur < end) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 190);
    if (ce > end) ce.setTime(end.getTime());
    const from = cur.toISOString().slice(0,10), to = ce.toISOString().slice(0,10);
    const c = await fetchChunk(from, to); chunks.push(...c);
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 191);
    await new Promise(r => setTimeout(r, 350));
  }
  console.log(` ${chunks.length} candles`);
  return chunks;
}

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date] = []; m[c.date].push(c); }
  return m;
}

// ─── Trail functions (from strategy.ts) ──────────────────────────────────────

// TRAIL (trailDefault): lock 20pts after 100pt peak, 100pts after 200pt peak
function trailDefault(sl, entry, dir, peak) {
  let lock = 0;
  if (peak >= 200) lock = 100;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry + lock) : Math.min(sl, entry - lock);
}

// LOCK50 (trailLock50): once peak > 100, lock at peak-50 (aggressive)
function trailLock50(sl, entry, dir, peak) {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === 'CE' ? Math.max(sl, entry + lock) : Math.min(sl, entry - lock);
}

// ─── processHybridCandle (ported from strategy.ts) ───────────────────────────
const HR_ENTRY_BUF  = 25;
const HR_SL_PTS     = 100;
const HR_EARLY_EXIT = 3;

function createState() {
  return { inTrade:false, dir:null, entry:0, sl:0, refHigh:0,
           firstDone:false, reUsed:false, waitReEntry:false, isC1:false, peakProfit:0 };
}

function processCandle(state, prev, curr, isEOD, trailFn) {
  const bodyHigh = Math.max(prev.open, prev.close);
  const bodyLow  = Math.min(prev.open, prev.close);

  if (state.inTrade) {
    // C1-3 early exit
    if (state.isC1) {
      state.isC1 = false;
      const pnl = state.dir === 'CE' ? curr.close - state.entry : state.entry - curr.close;
      if (pnl < -HR_EARLY_EXIT) {
        state.inTrade = false; state.firstDone = false;
        state.waitReEntry = false; state.reUsed = false;
        return { action: 'EXIT_EARLY', pts: -HR_EARLY_EXIT };
      }
    }
    // SL hit
    const slHit = state.dir === 'CE' ? curr.low <= state.sl : curr.high >= state.sl;
    if (slHit) {
      const pts = state.dir === 'CE' ? state.sl - state.entry : state.entry - state.sl;
      const bodyPast = state.dir === 'CE' ? curr.close < state.sl : curr.close > state.sl;
      if (bodyPast && !state.reUsed) {
        const revDir = state.dir === 'CE' ? 'PE' : 'CE';
        const revEntry = curr.close;
        const revSL = revDir === 'CE' ? revEntry - HR_SL_PTS : revEntry + HR_SL_PTS;
        state.dir = revDir; state.entry = revEntry; state.sl = revSL;
        state.refHigh = revDir === 'CE' ? curr.high : curr.low;
        state.reUsed = true; state.isC1 = true; state.peakProfit = 0;
        return { action: 'REVERSE_ENTER', dir: revDir, price: revEntry, sl: revSL, exitPts: pts };
      }
      state.inTrade = false;
      if (!state.reUsed) { state.waitReEntry = true; }
      else { state.firstDone = false; }
      state.peakProfit = 0;
      return { action: 'EXIT_SL', pts };
    }
    // Trail update
    const hp = state.dir === 'CE' ? curr.high - state.entry : state.entry - curr.low;
    if (hp > state.peakProfit) {
      state.peakProfit = hp;
      state.sl = trailFn(state.sl, state.entry, state.dir, state.peakProfit);
    }
    // EOD
    if (isEOD) {
      const pts = state.dir === 'CE' ? curr.close - state.entry : state.entry - curr.close;
      state.inTrade = false;
      return { action: 'EXIT_EOD', pts };
    }
    return { action: 'NONE' };
  }

  // Wait re-entry
  if (state.waitReEntry) {
    const reTrig = (state.dir==='CE' && curr.close > state.refHigh) ||
                   (state.dir==='PE' && curr.close < state.refHigh);
    if (reTrig) {
      const e = curr.close, sl = state.dir==='CE' ? e-HR_SL_PTS : e+HR_SL_PTS;
      state.entry=e; state.sl=sl; state.inTrade=true; state.waitReEntry=false;
      state.reUsed=true; state.isC1=true; state.peakProfit=0;
      return { action:'ENTER', dir:state.dir, price:e, sl };
    }
    const dist = state.dir==='CE' ? state.refHigh - curr.close : curr.close - state.refHigh;
    if (dist > 150) {
      state.waitReEntry = false;
      if (curr.close > bodyHigh + HR_ENTRY_BUF) {
        const e = curr.close;
        state.dir='CE'; state.entry=e; state.sl=e-HR_SL_PTS;
        state.refHigh=curr.high; state.inTrade=true; state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'ENTER', dir:'CE', price:e, sl:e-HR_SL_PTS };
      }
      if (curr.close < bodyLow - HR_ENTRY_BUF) {
        const e = curr.close;
        state.dir='PE'; state.entry=e; state.sl=e+HR_SL_PTS;
        state.refHigh=curr.low; state.inTrade=true; state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'ENTER', dir:'PE', price:e, sl:e+HR_SL_PTS };
      }
      state.firstDone=false; state.reUsed=true;
    }
    return { action:'NONE' };
  }

  // First signal detection
  if (state.firstDone || isEOD) return { action:'NONE' };
  if (curr.close > bodyHigh + HR_ENTRY_BUF) {
    const e = curr.close;
    state.dir='CE'; state.entry=e; state.sl=e-HR_SL_PTS;
    state.refHigh=curr.high; state.inTrade=true; state.firstDone=true; state.isC1=true; state.peakProfit=0;
    return { action:'ENTER', dir:'CE', price:e, sl:e-HR_SL_PTS };
  }
  if (curr.close < bodyLow - HR_ENTRY_BUF) {
    const e = curr.close;
    state.dir='PE'; state.entry=e; state.sl=e+HR_SL_PTS;
    state.refHigh=curr.low; state.inTrade=true; state.firstDone=true; state.isC1=true; state.peakProfit=0;
    return { action:'ENTER', dir:'PE', price:e, sl:e+HR_SL_PTS };
  }
  return { action:'NONE' };
}

// ─── Simulate one day ─────────────────────────────────────────────────────────
function simulateDay(candles, trailFn, maxTrades=5, dailyLossCap=350) {
  const state = createState();
  let pnl=0, trades=0, wins=0, losses=0, dailyLoss=0;
  let pendingRevPts = null; // pts from REVERSE_ENTER exit side

  for (let i=1; i<candles.length; i++) {
    const prev = candles[i-1], curr = candles[i];
    const isEOD = (curr.hour===15 && curr.min>=15) || (i===candles.length-1);

    if (trades >= maxTrades) break;
    if (dailyLoss >= dailyLossCap) break;

    const sig = processCandle(state, prev, curr, isEOD, trailFn);

    if (sig.action === 'REVERSE_ENTER') {
      // book the exit side of the reversed trade
      const exitPts = sig.exitPts ?? -HR_SL_PTS;
      pnl += exitPts; trades++;
      if (exitPts > 0) wins++; else { losses++; dailyLoss += Math.abs(exitPts); }
      pendingRevPts = null;
      // the reverse entry is now open in state — check if we've hit trade limit
      if (trades >= maxTrades || dailyLoss >= dailyLossCap) {
        // close the just-opened reverse trade immediately at entry (no profit)
        state.inTrade = false;
      }
    } else if (sig.action === 'EXIT_EARLY' || sig.action === 'EXIT_SL' || sig.action === 'EXIT_EOD') {
      pnl += sig.pts; trades++;
      if (sig.pts > 0) wins++; else { losses++; dailyLoss += Math.abs(sig.pts); }
    }
  }

  // Force-close if still in trade at end (shouldn't happen but safety net)
  if (state.inTrade) {
    const last = candles[candles.length-1];
    const pts = state.dir==='CE' ? last.close - state.entry : state.entry - last.close;
    pnl += pts; trades++;
    if (pts > 0) wins++; else losses++;
  }

  return { pnl: Math.round(pnl), trades, wins, losses };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const candles = await fetchAll5Yr();
  const byDay = groupByDay(candles);
  const dates = Object.keys(byDay).sort();
  console.log(`Trading days: ${dates.length}\n`);

  const years = {};
  let totL50=0, totTR=0;
  let l50WD=0, l50LD=0, trWD=0, trLD=0;
  let l50Eq=0, trEq=0, l50Peak=0, trPeak=0, l50MaxDD=0, trMaxDD=0;
  let l50Wins=0, l50Losses=0, trWins=0, trLosses=0;
  let l50Trades=0, trTrades=0;

  for (const date of dates) {
    const dc = byDay[date];
    if (dc.length < 5) continue;
    const yr = date.slice(0,4);
    if (!years[yr]) years[yr] = { l50:0, tr:0, days:0, l50WD:0, trWD:0, l50Trades:0, trTrades:0 };

    const r50 = simulateDay(dc, trailLock50);
    const rTR = simulateDay(dc, trailDefault);

    totL50 += r50.pnl; totTR += rTR.pnl;
    years[yr].l50 += r50.pnl; years[yr].tr += rTR.pnl; years[yr].days++;
    years[yr].l50Trades += r50.trades; years[yr].trTrades += rTR.trades;
    l50Wins+=r50.wins; l50Losses+=r50.losses; trWins+=rTR.wins; trLosses+=rTR.losses;
    l50Trades+=r50.trades; trTrades+=rTR.trades;

    if (r50.pnl > 0) { l50WD++; years[yr].l50WD++; } else if (r50.pnl < 0) l50LD++;
    if (rTR.pnl > 0) { trWD++; years[yr].trWD++; } else if (rTR.pnl < 0) trLD++;

    l50Eq += r50.pnl; if (l50Eq > l50Peak) l50Peak = l50Eq;
    trEq  += rTR.pnl; if (trEq  > trPeak)  trPeak  = trEq;
    const d50 = l50Peak - l50Eq; if (d50 > l50MaxDD) l50MaxDD = d50;
    const dTR = trPeak  - trEq;  if (dTR > trMaxDD)  trMaxDD  = dTR;
  }

  const W = 100;
  console.log('='.repeat(W));
  console.log('  5-YEAR BACKTEST — LOCK50 vs TRAIL  |  BANKNIFTY 15-min  |  qty=30  |  ₹15/pt');
  console.log('  LOCK50 = aggressive trail (lock peak-50 pts)  |  TRAIL = conservative (lock 20@100, 100@200)');
  console.log('='.repeat(W));
  console.log('Year  | LOCK50 pts    | Win Days | Trades | TRAIL pts     | Win Days | Trades | Δ (TRAIL-L50)');
  console.log('------|---------------|----------|--------|---------------|----------|--------|---------------');
  for (const [yr, s] of Object.entries(years).sort()) {
    const d = (s.tr - s.l50 >= 0 ? '+' : '') + (s.tr - s.l50);
    console.log(
      `${yr}  | ${((s.l50>=0?'+':'')+s.l50+' pts').padEnd(13)} | ${(s.l50WD+'/'+s.days).padEnd(8)} | ${String(s.l50Trades).padEnd(6)} | ${((s.tr>=0?'+':'')+s.tr+' pts').padEnd(13)} | ${(s.trWD+'/'+s.days).padEnd(8)} | ${String(s.trTrades).padEnd(6)} | ${d} pts`
    );
  }
  console.log('='.repeat(W));
  const totDiff = (totTR - totL50 >= 0 ? '+' : '') + Math.round(totTR - totL50);
  console.log(
    `TOTAL | ${((totL50>=0?'+':'')+Math.round(totL50)+' pts').padEnd(13)} | ${(l50WD+'/'+(l50WD+l50LD)).padEnd(8)} | ${String(l50Trades).padEnd(6)} | ${((totTR>=0?'+':'')+Math.round(totTR)+' pts').padEnd(13)} | ${(trWD+'/'+(trWD+trLD)).padEnd(8)} | ${String(trTrades).padEnd(6)} | ${totDiff} pts`
  );
  console.log('='.repeat(W));

  const l50Rs = Math.round(totL50 * QTY_RS_PER_PT);
  const trRs  = Math.round(totTR  * QTY_RS_PER_PT);
  const l50Wr = Math.round(l50Wins/(l50Wins+l50Losses)*100);
  const trWr  = Math.round(trWins/(trWins+trLosses)*100);

  console.log('');
  console.log('┌────────────────────────────────────────────────────────────────────┐');
  console.log('│  SUMMARY (qty=30, ₹15/pt)                                         │');
  console.log('├────────────────────────────────────────────────────────────────────┤');
  console.log(`│  LOCK50  │ ${(Math.round(totL50)+' pts').padEnd(10)} │ ₹${String(l50Rs).padEnd(12)} │ WR:${l50Wr}% │ MaxDD: ${Math.round(l50MaxDD)} pts (₹${Math.round(l50MaxDD*QTY_RS_PER_PT).toLocaleString('en-IN')}) │`);
  console.log(`│  TRAIL   │ ${(Math.round(totTR)+' pts').padEnd(10)} │ ₹${String(trRs).padEnd(12)} │ WR:${trWr}% │ MaxDD: ${Math.round(trMaxDD)} pts (₹${Math.round(trMaxDD*QTY_RS_PER_PT).toLocaleString('en-IN')}) │`);
  console.log('└────────────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log(`  ₹ in lakhs — LOCK50: ₹${(l50Rs/100000).toFixed(2)}L   TRAIL: ₹${(trRs/100000).toFixed(2)}L`);
  console.log(`  Per year  — LOCK50: ₹${Math.round(l50Rs/5).toLocaleString('en-IN')}/yr   TRAIL: ₹${Math.round(trRs/5).toLocaleString('en-IN')}/yr`);
}

main().catch(console.error);

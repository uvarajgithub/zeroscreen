// ============================================================
// MARKET TYPE ANALYSIS  —  Jan 2024 to May 2026
// Classifies each day as TRENDING / REVERSAL / CHOPPY
// Compares: trailDefault | trailLock50 | tickTrail
// QTY_MULT = 15  (30 qty × 0.5 delta)
// ============================================================
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QM           = 15;
const DELTA        = 0.5;

// ── Kite fetch ────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchChunk(from, to) {
  const url = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const r = await kiteGet(url);
    if (!r.data || !r.data.candles) return [];
    return r.data.candles.map(c => {
      const dt  = new Date(c[0]);
      const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        date: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
        h: ist.getHours(), m: ist.getMinutes(),
        open: c[1], high: c[2], low: c[3], close: c[4]
      };
    });
  } catch(e) { process.stderr.write(`\nChunk ${from}→${to} err: ${e.message}\n`); return []; }
}

function fmtDate(d) { return d.toISOString().slice(0,10); }

async function fetchAll() {
  const all = [];
  const end   = new Date('2026-05-13');
  const start = new Date('2024-01-01');
  let cur = new Date(start);
  process.stdout.write('Fetching BANKNIFTY 15-min (Jan 2024 – May 2026) ');
  while (cur <= end) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 90);
    if (ce > end) ce.setTime(end.getTime());
    const chunk = await fetchChunk(fmtDate(cur), fmtDate(ce));
    all.push(...chunk);
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 91);
    await new Promise(r => setTimeout(r, 300));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date]=[]; m[c.date].push(c); }
  return m;
}

// ── Day classification ────────────────────────────────────────
// Uses first candle open and last candle close, plus day range
function classifyDay(candles) {
  const dayOpen  = candles[0].open;
  const dayClose = candles[candles.length-1].close;
  const dayHigh  = Math.max(...candles.map(c => c.high));
  const dayLow   = Math.min(...candles.map(c => c.low));
  const range    = dayHigh - dayLow;
  const netMove  = Math.abs(dayClose - dayOpen);
  const ratio    = netMove / range;   // 0=choppy, 1=pure trend

  // Midpoint reversal check: did price cross midpoint from both sides?
  const mid = (dayHigh + dayLow) / 2;

  if (range < 250) return 'CHOPPY';           // small range day
  if (ratio > 0.55) return 'TRENDING';        // strong directional
  if (range > 350 && ratio < 0.25) return 'REVERSAL';  // big swings, ended near open
  if (range < 400 && ratio < 0.4)  return 'CHOPPY';    // medium range, indecisive
  return 'TRENDING';
}

// ── Trail functions ───────────────────────────────────────────
function trailDefault(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 200) lock = 100;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

function trailLock50(sl, entry, dir, peak) {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ── tickTrail simulation ──────────────────────────────────────
function simDayTickTrail(candles) {
  let pnl=0, wins=0, losses=0, trades=0;
  let inTrade=false, entry=0, sl=0, dir=null, isC1=false, peak=0;
  let ref = candles[0];

  for (let i=1; i<candles.length; i++) {
    const curr = candles[i];
    const isEOD = curr.h > 15 || (curr.h === 15 && curr.m >= 15);
    const refBH = Math.max(ref.open, ref.close), refBL = Math.min(ref.open, ref.close);

    let signal = null;
    if (!isEOD) {
      if (curr.close > refBH + 50) signal = 'CE';
      else if (curr.close < refBL - 50) signal = 'PE';
    }
    if (signal) ref = curr;

    if (inTrade) {
      if (isC1) {
        isC1 = false;
        const c1pnl = dir==='CE' ? curr.close-entry : entry-curr.close;
        if (c1pnl < -3) {
          inTrade=false; losses++; pnl-=3; trades++;
          if (signal && !isEOD) { entry=curr.close; sl=signal==='CE'?entry-100:entry+100; dir=signal; inTrade=true; isC1=true; peak=0; trades++; }
          continue;
        }
      }
      const slHit = dir==='CE' ? curr.low<=sl : curr.high>=sl;
      if (slHit) {
        const pts = dir==='CE' ? sl-entry : entry-sl;
        inTrade=false; trades++;
        if (pts>0) wins++; else losses++;
        pnl+=pts;
        if (signal && !isEOD) { entry=curr.close; sl=signal==='CE'?entry-100:entry+100; dir=signal; inTrade=true; isC1=true; peak=0; trades++; }
        continue;
      }
      const hp = dir==='CE' ? curr.high-entry : entry-curr.low;
      if (hp > peak) { peak=hp; sl=trailLock50(sl,entry,dir,peak); }
      if (isEOD) {
        const pts = dir==='CE' ? curr.close-entry : entry-curr.close;
        inTrade=false; trades++;
        if (pts>0) wins++; else losses++;
        pnl+=pts;
      }
    }

    if (signal && !inTrade && !isEOD) {
      entry=curr.close; sl=signal==='CE'?entry-100:entry+100;
      dir=signal; inTrade=true; isC1=true; peak=0; trades++;
    }
  }
  return { pnl, wins, losses, trades };
}

// ── trailDefault / trailLock50 simulation ─────────────────────
function createState() {
  return { inTrade:false, dir:null, entry:0, sl:0, refHigh:0,
           firstDone:false, reUsed:false, waitReEntry:false, isC1:false, peakProfit:0 };
}

function processCandle(state, prev, curr, isEOD, trailFn) {
  const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
  if (state.inTrade) {
    if (state.isC1) {
      state.isC1=false;
      const p = state.dir==='CE' ? curr.close-state.entry : state.entry-curr.close;
      if (p < -3) {
        state.inTrade=false; state.firstDone=false; state.waitReEntry=false; state.reUsed=false;
        return { action:'EXIT_EARLY', pts:-3 };
      }
    }
    const slHit = state.dir==='CE' ? curr.low<=state.sl : curr.high>=state.sl;
    if (slHit) {
      const pts = state.dir==='CE' ? state.sl-state.entry : state.entry-state.sl;
      const past = state.dir==='CE' ? curr.close<state.sl : curr.close>state.sl;
      if (past && !state.reUsed) {
        const rd=state.dir==='CE'?'PE':'CE', re=curr.close, rs=rd==='CE'?re-100:re+100;
        state.dir=rd; state.entry=re; state.sl=rs;
        state.refHigh=rd==='CE'?curr.high:curr.low;
        state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'REVERSE_ENTER', dir:rd, prevPts:pts };
      }
      state.inTrade=false;
      if (!state.reUsed) state.waitReEntry=true;
      else               state.firstDone=false;
      state.peakProfit=0;
      return { action:'EXIT_SL', pts };
    }
    const hp = state.dir==='CE' ? curr.high-state.entry : state.entry-curr.low;
    if (hp > state.peakProfit) {
      state.peakProfit=hp;
      state.sl=trailFn(state.sl, state.entry, state.dir, state.peakProfit);
    }
    if (isEOD) {
      const pts = state.dir==='CE' ? curr.close-state.entry : state.entry-curr.close;
      state.inTrade=false;
      return { action:'EXIT_EOD', pts };
    }
    return { action:'NONE' };
  }
  if (state.waitReEntry) {
    const rt = (state.dir==='CE' && curr.close>state.refHigh) ||
               (state.dir==='PE' && curr.close<state.refHigh);
    if (rt) {
      const e=curr.close, sl=state.dir==='CE'?e-100:e+100;
      state.entry=e; state.sl=sl; state.inTrade=true;
      state.waitReEntry=false; state.reUsed=true; state.isC1=true; state.peakProfit=0;
      return { action:'ENTER', dir:state.dir, price:e };
    }
    const da = state.dir==='CE' ? state.refHigh-curr.close : curr.close-state.refHigh;
    if (da > 150) {
      state.waitReEntry=false;
      if (curr.close > bH+25) {
        const e=curr.close;
        Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0});
        return { action:'ENTER', dir:'CE', price:e };
      }
      if (curr.close < bL-25) {
        const e=curr.close;
        Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0});
        return { action:'ENTER', dir:'PE', price:e };
      }
      state.firstDone=false; state.reUsed=true;
    }
    return { action:'NONE' };
  }
  if (state.firstDone || isEOD) return { action:'NONE' };
  if (curr.close > bH+25) {
    const e=curr.close;
    Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0});
    return { action:'ENTER', dir:'CE', price:e };
  }
  if (curr.close < bL-25) {
    const e=curr.close;
    Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0});
    return { action:'ENTER', dir:'PE', price:e };
  }
  return { action:'NONE' };
}

function simDayShadow(candles, trailFn) {
  const state = createState();
  let pnl=0, wins=0, losses=0, trades=0;
  for (let i=1; i<candles.length; i++) {
    const prev=candles[i-1], curr=candles[i];
    const isEOD = curr.h>15 || (curr.h===15 && curr.m>=15);
    const sig = processCandle(state, prev, curr, isEOD, trailFn);
    if (sig.action==='ENTER') { trades++; }
    else if (sig.action==='REVERSE_ENTER') {
      trades++; pnl+=sig.prevPts;
      if (sig.prevPts>0) wins++; else losses++;
    }
    else if (['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)) {
      pnl+=sig.pts;
      if (sig.pts>0) wins++; else losses++;
    }
  }
  return { pnl, wins, losses, trades };
}

// ── Stats accumulator ─────────────────────────────────────────
function emptyBucket() {
  return { days:0, wdays:0, ldays:0,
           td:0, tl:0, tt:0,    // total pnl
           wd:0, wl:0, wt:0,    // win trades
           nd:0, nl:0, nt:0 };  // total trades
}

function addDay(bucket, rD, rL, rT) {
  bucket.days++;
  if (rD.pnl>0) bucket.wdays++; else if (rD.pnl<0) bucket.ldays++;
  bucket.td+=rD.pnl; bucket.tl+=rL.pnl; bucket.tt+=rT.pnl;
  bucket.wd+=rD.wins; bucket.wl+=rL.wins; bucket.wt+=rT.wins;
  bucket.nd+=rD.trades; bucket.nl+=rL.trades; bucket.nt+=rT.trades;
}

// ── Print bucket row ──────────────────────────────────────────
function printBucket(type, b) {
  const d = b.days || 1;
  const sep = '│';
  function col(pnl, wins, trades, days) {
    const pts = Math.round(pnl);
    const rs  = (pts * QM).toLocaleString('en-IN');
    const avg = (pnl/days).toFixed(0);
    const wr  = trades>0 ? ((wins/trades)*100).toFixed(0)+'%' : '-';
    return ` ${(pts>=0?'+':'')+String(pts).padStart(5)}  ${(pts>=0?'+₹':'-₹')+Math.abs(pts*QM).toLocaleString('en-IN').padStart(8)}  avg${(Number(avg)>=0?'+':'')+avg}  wr${wr} `;
  }
  console.log(`  ${type.padEnd(9)} ${sep}${col(b.td,b.wd,b.nd,d)}${sep}${col(b.tl,b.wl,b.nl,d)}${sep}${col(b.tt,b.wt,b.nt,d)}${sep}  ${b.days}d`);
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  const allCandles = await fetchAll();
  const byDay = groupByDay(allCandles);
  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 10);
  console.log(`Total trading days: ${dates.length}\n`);

  const buckets = { TRENDING: emptyBucket(), REVERSAL: emptyBucket(), CHOPPY: emptyBucket() };
  const overall = emptyBucket();

  // Per-month breakdown for trending days only
  const monthTrend = {};

  for (const date of dates) {
    const candles = byDay[date];
    const type = classifyDay(candles);
    const rD = simDayShadow(candles, trailDefault);
    const rL = simDayShadow(candles, trailLock50);
    const rT = simDayTickTrail(candles);
    addDay(buckets[type], rD, rL, rT);
    addDay(overall, rD, rL, rT);
    if (type === 'TRENDING') {
      const mo = date.slice(0,7);
      if (!monthTrend[mo]) monthTrend[mo] = emptyBucket();
      addDay(monthTrend[mo], rD, rL, rT);
    }
  }

  // ── Print summary ────────────────────────────────────────────
  const W = 110;
  const sep = '─'.repeat(W);
  console.log(sep);
  console.log('  MARKET TYPE BREAKDOWN  (Jan 2024 – May 2026, 1 lot = 30 qty)');
  console.log(sep);
  console.log(`  Type       │  trailDefault (current)                  │  trailLock50 (new)                       │  tickTrail (buf=50 unlimited)            │  Days`);
  console.log(`             │  TotalPts  TotalRs   Avg/day  WinRate     │  TotalPts  TotalRs   Avg/day  WinRate     │  TotalPts  TotalRs   Avg/day  WinRate     │`);
  console.log(sep);
  printBucket('TRENDING',  buckets.TRENDING);
  printBucket('REVERSAL',  buckets.REVERSAL);
  printBucket('CHOPPY',    buckets.CHOPPY);
  console.log(sep);
  printBucket('TOTAL',     overall);
  console.log(sep);

  // ── Day classification counts ────────────────────────────────
  console.log(`\n  Day breakdown: TRENDING=${buckets.TRENDING.days}  REVERSAL=${buckets.REVERSAL.days}  CHOPPY=${buckets.CHOPPY.days}  total=${dates.length}`);

  // ── Win/Loss day breakdown per type ─────────────────────────
  console.log('\n  WIN DAYS vs LOSS DAYS per market type (trailLock50):');
  console.log(sep);
  for (const [type, b] of Object.entries(buckets)) {
    const winRate = b.days > 0 ? ((b.wdays/b.days)*100).toFixed(0) : 0;
    const ldays = b.days - b.wdays;
    console.log(`  ${type.padEnd(9)}: ${b.wdays} win days / ${ldays} loss/flat days  (${winRate}% win days)  |  avg PnL trailDefault: ${(b.td/b.days).toFixed(0)} pts/day  trailLock50: ${(b.tl/b.days).toFixed(0)} pts/day  tickTrail: ${(b.tt/b.days).toFixed(0)} pts/day`);
  }
  console.log(sep);

  // ── Per-strategy verdict ─────────────────────────────────────
  console.log('\n  STRATEGY VERDICT:');
  console.log(`  Trending days  →  best: ${buckets.TRENDING.tl > buckets.TRENDING.tt && buckets.TRENDING.tl > buckets.TRENDING.td ? 'trailLock50' : buckets.TRENDING.tt > buckets.TRENDING.td ? 'tickTrail' : 'trailDefault'}`);
  console.log(`  Reversal days  →  best: ${buckets.REVERSAL.tl > buckets.REVERSAL.tt && buckets.REVERSAL.tl > buckets.REVERSAL.td ? 'trailLock50' : buckets.REVERSAL.tt > buckets.REVERSAL.td ? 'tickTrail' : 'trailDefault'}`);
  console.log(`  Choppy days    →  best: ${buckets.CHOPPY.tl > buckets.CHOPPY.tt && buckets.CHOPPY.tl > buckets.CHOPPY.td ? 'trailLock50' : buckets.CHOPPY.tt > buckets.CHOPPY.td ? 'tickTrail' : 'trailDefault'}`);
  console.log('');
}

main().catch(console.error);

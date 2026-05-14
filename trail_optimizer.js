// TRAIL OPTIMIZER — find best trail function for processHybridCandle engine
// Tests 8 trail variants on 5 years of BANKNIFTY 15-min data
// QTY_MULT=15 (30qty x 0.5 delta)
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QTY_MULT     = 15;

// ── Fetch helpers ──────────────────────────────────────────────────────
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 20000
    }, res => {
      let d = '';
      res.on('data', c => d += c);
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
    const resp = await kiteGet(url);
    if (!resp.data || !resp.data.candles) return [];
    return resp.data.candles.map(c => {
      const dt  = new Date(c[0]);
      const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        date: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
        h: ist.getHours(), m: ist.getMinutes(),
        open: c[1], high: c[2], low: c[3], close: c[4]
      };
    });
  } catch(e) { process.stderr.write(`\nChunk ${from}->${to} err: ${e.message}\n`); return []; }
}

async function fetchAll() {
  const all = [];
  const end   = new Date('2026-05-14');
  const start = new Date('2021-05-14');
  let cur = new Date(start);
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  while (cur <= end) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 190);
    if (ce > end) ce.setTime(end.getTime());
    const chunk = await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10));
    all.push(...chunk);
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 191);
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(` ${all.length} candles\n`);
  return all;
}

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date]=[]; m[c.date].push(c); }
  return m;
}

// ── TRAIL VARIANTS ─────────────────────────────────────────────────────
// Current baseline
function trailDefault(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 200) lock = 100;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 1: Continuous trail 100pts below peak once peak≥200
//   trailDefault is fine until peak=200, then keeps trailing instead of freezing
function trailCont100(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 200) lock = peak - 100;  // CONTINUOUS: always 100 below peak
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 2: Continuous 75pts below peak once peak≥150 (tighter)
function trailCont75(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 150) lock = peak - 75;
  else if (peak >= 75)  lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 3: Continuous 125pts below peak once peak≥225 (more room to run)
function trailCont125(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 225) lock = peak - 125;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 4: Continuous 150pts below peak once peak≥250 (loose, for big trends)
function trailCont150(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 250) lock = peak - 150;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 5: 3-step static trail (adds 300pt tier)
function trailStep3(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 300) lock = 200;
  else if (peak >= 200) lock = 100;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 6: 4-step static trail
function trailStep4(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 400) lock = 300;
  else if (peak >= 300) lock = 200;
  else if (peak >= 200) lock = 100;
  else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 7: trailLock50 (what TICK TRAIL uses) — continuous from peak>100, 50pt buffer
function trailLock50(sl, entry, dir, peak) {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

// ★ FIX 8: Hybrid — early BE at 50pts, then continuous 100pt buffer
function trailEarlyBE(sl, entry, dir, peak) {
  let lock = 0;
  if      (peak >= 200) lock = peak - 100;
  else if (peak >= 100) lock = 20;
  else if (peak >= 50)  lock = 0;   // break-even early
  if (lock < 0) lock = 0;
  if (peak < 50) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

const TRAIL_VARIANTS = [
  { name: 'baseline (current)',  fn: trailDefault  },
  { name: 'cont-100 (★best?)',   fn: trailCont100  },
  { name: 'cont-75  (tight)',    fn: trailCont75   },
  { name: 'cont-125 (medium)',   fn: trailCont125  },
  { name: 'cont-150 (loose)',    fn: trailCont150  },
  { name: 'step-3',              fn: trailStep3    },
  { name: 'step-4',              fn: trailStep4    },
  { name: 'lock50  (=TICKTRAIL)',fn: trailLock50   },
  { name: 'earlyBE+cont-100',    fn: trailEarlyBE  },
];

// ── processHybridCandle engine ─────────────────────────────────────────
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
      const past= state.dir==='CE' ? curr.close<state.sl  : curr.close>state.sl;
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

function simDay(candles, trailFn) {
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

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  const allCandles = await fetchAll();
  const byDay = groupByDay(allCandles);
  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  const totalDays = dates.length;
  console.log(`Trading days: ${totalDays}\n`);

  const results = TRAIL_VARIANTS.map(v => ({
    name: v.name, fn: v.fn,
    total:0, winDays:0, lossDays:0, trades:0, wins:0,
    eq:0, peak:0, maxDD:0
  }));

  for (const date of dates) {
    const candles = byDay[date];
    for (const r of results) {
      const d = simDay(candles, r.fn);
      r.total   += d.pnl;
      r.trades  += d.trades;
      r.wins    += d.wins;
      if (d.pnl > 0) r.winDays++;
      else if (d.pnl < 0) r.lossDays++;
      r.eq += d.pnl;
      if (r.eq > r.peak) r.peak = r.eq;
      if (r.peak - r.eq > r.maxDD) r.maxDD = r.peak - r.eq;
    }
  }

  // Sort by total P&L descending
  results.sort((a, b) => b.total - a.total);

  const baseline = results.find(r => r.name.startsWith('baseline'));
  const sep  = '═'.repeat(98);
  const sep2 = '─'.repeat(98);

  console.log(sep);
  console.log('  TRAIL OPTIMIZER — 5yr BANKNIFTY  |  processHybridCandle engine  |  QTY_MULT=15');
  console.log(sep);
  console.log(`  ${'Trail Variant'.padEnd(24)} ${'Total Pts'.padStart(10)} ${'Rs P&L'.padStart(12)} ${'vs Baseline'.padStart(12)} ${'Win Days'.padStart(10)} ${'MaxDD pts'.padStart(10)} ${'WinRate%'.padStart(9)} ${'AvgPts/d'.padStart(9)}`);
  console.log(sep2);

  for (const r of results) {
    const pts    = Math.round(r.total);
    const rs     = pts * QTY_MULT;
    const delta  = pts - Math.round(baseline.total);
    const deltaS = (delta >= 0 ? '+' : '') + delta;
    const wd     = `${r.winDays}/${totalDays} (${((r.winDays/totalDays)*100).toFixed(0)}%)`;
    const wr     = r.trades > 0 ? ((r.wins/r.trades)*100).toFixed(0)+'%' : '-';
    const avgpd  = (pts/totalDays).toFixed(1);
    const dd     = Math.round(r.maxDD);
    const isBest = r === results[0];
    console.log(
      `${isBest?' ★':' ─'} ${r.name.padEnd(24)} ${String((pts>=0?'+':'')+pts).padStart(10)} ${String((rs>=0?'+₹':'-₹')+Math.abs(rs).toLocaleString('en-IN')).padStart(12)} ${String(deltaS).padStart(12)} ${wd.padStart(10)} ${String('-'+dd).padStart(10)} ${wr.padStart(9)} ${String(avgpd).padStart(9)}`
    );
  }

  console.log(sep);

  // Detailed year-by-year for TOP 3
  const top3 = results.slice(0, 3);
  console.log('\n  YEAR-BY-YEAR: TOP 3 VARIANTS');
  console.log(sep2);
  console.log(`  ${'Year'.padEnd(6)} | ${top3.map(r => r.name.slice(0,18).padStart(18)).join(' | ')}`);
  console.log(sep2);

  const yearData = {};
  for (const v of top3) {
    const byDay2 = groupByDay(allCandles);
    const sortedDates = Object.keys(byDay2).sort().filter(d => byDay2[d].length >= 5);
    for (const date of sortedDates) {
      const yr = date.slice(0,4);
      if (!yearData[yr]) yearData[yr] = {};
      if (!yearData[yr][v.name]) yearData[yr][v.name] = 0;
      const d = simDay(byDay2[date], v.fn);
      yearData[yr][v.name] += d.pnl;
    }
  }

  for (const yr of Object.keys(yearData).sort()) {
    const row = top3.map(v => {
      const pts = Math.round(yearData[yr][v.name] || 0);
      const rs  = pts * QTY_MULT;
      return String((rs>=0?'+₹':'-₹')+Math.abs(rs).toLocaleString('en-IN')).padStart(18);
    }).join(' | ');
    console.log(`  ${yr}   | ${row}`);
  }
  console.log(sep2);

  // Recommendation
  const best = results[0];
  const bestPts = Math.round(best.total);
  const basePts = Math.round(baseline.total);
  const improvement = (((bestPts - basePts) / basePts) * 100).toFixed(1);
  console.log(`\n  ★ BEST: "${best.name}" — ${improvement}% more P&L vs current baseline`);
  console.log(`     Implement by replacing trailDefault in strategy.js with this function:`);

  // Print the best function code
  if (best.fn === trailCont100) {
    console.log(`
     function trailDefault(sl, entry, dir, peak) {
       let lock = 0;
       if      (peak >= 200) lock = peak - 100;  // continuous trail, 100pts below peak
       else if (peak >= 100) lock = 20;
       if (lock === 0) return sl;
       return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
     }`);
  } else if (best.fn === trailCont75) {
    console.log(`
     function trailDefault(sl, entry, dir, peak) {
       let lock = 0;
       if      (peak >= 150) lock = peak - 75;   // continuous trail, 75pts below peak
       else if (peak >= 75)  lock = 20;
       if (lock === 0) return sl;
       return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
     }`);
  } else if (best.fn === trailCont125) {
    console.log(`
     function trailDefault(sl, entry, dir, peak) {
       let lock = 0;
       if      (peak >= 225) lock = peak - 125;  // continuous trail, 125pts below peak
       else if (peak >= 100) lock = 20;
       if (lock === 0) return sl;
       return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
     }`);
  } else if (best.fn === trailCont150) {
    console.log(`
     function trailDefault(sl, entry, dir, peak) {
       let lock = 0;
       if      (peak >= 250) lock = peak - 150;  // continuous trail, 150pts below peak
       else if (peak >= 100) lock = 20;
       if (lock === 0) return sl;
       return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
     }`);
  } else if (best.fn === trailStep3) {
    console.log(`
     function trailDefault(sl, entry, dir, peak) {
       let lock = 0;
       if      (peak >= 300) lock = 200;
       else if (peak >= 200) lock = 100;
       else if (peak >= 100) lock = 20;
       if (lock === 0) return sl;
       return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
     }`);
  } else if (best.fn === trailStep4) {
    console.log(`
     function trailDefault(sl, entry, dir, peak) {
       let lock = 0;
       if      (peak >= 400) lock = 300;
       else if (peak >= 300) lock = 200;
       else if (peak >= 200) lock = 100;
       else if (peak >= 100) lock = 20;
       if (lock === 0) return sl;
       return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
     }`);
  }
  console.log(`\n  Note: All variants use same processHybridCandle engine (entry buf=25, SL=100, C1 filter)`);
  console.log('');
}

main().catch(console.error);

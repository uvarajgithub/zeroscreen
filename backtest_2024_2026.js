// 3-YEAR BACKTEST: 2024-2026  |  Correct engines  |  QTY_MULT=30 (full qty, no delta)
require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QTY_MULT     = 30;

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
  } catch(e) { process.stderr.write(`\nChunk ${from}->${to} failed: ${e.message}\n`); return []; }
}

function fmtDate(d) { return d.toISOString().slice(0,10); }

async function fetchAll() {
  const all = [];
  const end   = new Date('2026-05-14');
  const start = new Date('2024-01-01');
  let cur = new Date(start);
  process.stdout.write('Fetching 2024-2026 BANKNIFTY 15-min ');
  while (cur <= end) {
    const ce = new Date(cur); ce.setDate(cur.getDate() + 190);
    if (ce > end) ce.setTime(end.getTime());
    const chunk = await fetchChunk(fmtDate(cur), fmtDate(ce));
    all.push(...chunk);
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 191);
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m = {};
  for (const c of candles) { if (!m[c.date]) m[c.date]=[]; m[c.date].push(c); }
  return m;
}

// Trail functions
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

// TICK TRAIL engine
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
          continue;
        }
      }
      const slHit = dir==='CE' ? curr.low<=sl : curr.high>=sl;
      if (slHit) {
        const pts = dir==='CE' ? sl-entry : entry-sl;
        inTrade=false; trades++;
        if (pts>0) wins++; else losses++;
        pnl+=pts;
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
      entry=curr.close; sl=signal==='CE' ? entry-100 : entry+100;
      dir=signal; inTrade=true; isC1=true; peak=0; trades++;
    }
  }
  return { pnl, wins, losses, trades };
}

// TRAIL / LOCK50 Old engine (processHybridCandle)
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

function simDayShadow(candles, trailFn) {
  const state = createState();
  let pnl=0, wins=0, losses=0, trades=0;
  for (let i=1; i<candles.length; i++) {
    const prev=candles[i-1], curr=candles[i];
    const isEOD = curr.h>15 || (curr.h===15 && curr.m>=15);
    const sig = processCandle(state, prev, curr, isEOD, trailFn);
    if (sig.action==='ENTER') { trades++; }
    else if (sig.action==='REVERSE_ENTER') {
      trades++;
      pnl += sig.prevPts;
      if (sig.prevPts>0) wins++; else losses++;
    }
    else if (sig.action==='EXIT_EARLY'||sig.action==='EXIT_SL'||sig.action==='EXIT_EOD') {
      pnl += sig.pts;
      if (sig.pts>0) wins++; else losses++;
    }
  }
  return { pnl, wins, losses, trades };
}

async function main() {
  const allCandles = await fetchAll();
  const byDay = groupByDay(allCandles);
  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log(`Trading days: ${dates.length}\n`);

  const years = {};
  let maxDDtt=0, maxDDtr=0, maxDDl5=0;
  let eqTT=0, eqTR=0, eqL5=0, pkTT=0, pkTR=0, pkL5=0;
  let ttTotal=0, trTotal=0, l5Total=0;
  let ttWD=0, trWD=0, l5WD=0, ttLD=0, trLD=0, l5LD=0;
  let ttTrades=0, trTrades=0, l5Trades=0;
  let ttWins=0, trWins=0, l5Wins=0;

  for (const date of dates) {
    const candles = byDay[date];
    const yr = date.slice(0,4);
    if (!years[yr]) years[yr]={tt:0,tr:0,l5:0,days:0,ttW:0,trW:0,l5W:0};

    const tt = simDayTickTrail(candles);
    const tr = simDayShadow(candles, trailDefault);
    const l5 = simDayShadow(candles, trailDefault); // trailLock50Old = trailDefault (not exported)

    years[yr].tt+=tt.pnl; years[yr].tr+=tr.pnl; years[yr].l5+=l5.pnl; years[yr].days++;
    if(tt.pnl>0)years[yr].ttW++; if(tr.pnl>0)years[yr].trW++; if(l5.pnl>0)years[yr].l5W++;

    ttTotal+=tt.pnl; trTotal+=tr.pnl; l5Total+=l5.pnl;
    if(tt.pnl>0)ttWD++; else if(tt.pnl<0)ttLD++;
    if(tr.pnl>0)trWD++; else if(tr.pnl<0)trLD++;
    if(l5.pnl>0)l5WD++; else if(l5.pnl<0)l5LD++;
    ttTrades+=tt.trades; trTrades+=tr.trades; l5Trades+=l5.trades;
    ttWins+=tt.wins; trWins+=tr.wins; l5Wins+=l5.wins;

    eqTT+=tt.pnl; eqTR+=tr.pnl; eqL5+=l5.pnl;
    if(eqTT>pkTT)pkTT=eqTT; if(eqTR>pkTR)pkTR=eqTR; if(eqL5>pkL5)pkL5=eqL5;
    if(pkTT-eqTT>maxDDtt)maxDDtt=pkTT-eqTT;
    if(pkTR-eqTR>maxDDtr)maxDDtr=pkTR-eqTR;
    if(pkL5-eqL5>maxDDl5)maxDDl5=pkL5-eqL5;
  }

  const sep = '='.repeat(80);
  const sep2 = '-'.repeat(80);

  console.log(sep);
  console.log('  YEAR    DAYS |  TICK TRAIL pts       Rs     W% |  TRAIL pts        Rs     W%');
  console.log(sep);

  for (const yr of Object.keys(years).sort()) {
    const y = years[yr];
    const d = y.days;
    const ttPts=Math.round(y.tt), trPts=Math.round(y.tr);
    const ttRs=(ttPts*QTY_MULT).toLocaleString('en-IN');
    const trRs=(trPts*QTY_MULT).toLocaleString('en-IN');
    const ttW=((y.ttW/d)*100).toFixed(0), trW=((y.trW/d)*100).toFixed(0);
    const s1=ttPts>=0?'+':'', s2=trPts>=0?'+':'';
    console.log(
      `  ${yr}   ${String(d).padStart(4)} | ${s1}${String(ttPts).padStart(6)}  Rs${String(ttRs).padStart(10)}  ${ttW}% | ${s2}${String(trPts).padStart(6)}  Rs${String(trRs).padStart(10)}  ${trW}%`
    );
  }

  console.log(sep);
  const ttT=Math.round(ttTotal), trT=Math.round(trTotal), l5T=Math.round(l5Total);
  const totalDays=dates.length;
  const ttRsT=(ttT*QTY_MULT).toLocaleString('en-IN');
  const trRsT=(trT*QTY_MULT).toLocaleString('en-IN');
  console.log(
    `  TOTAL  ${String(totalDays).padStart(4)} | ${ttT>=0?'+':''}${String(ttT).padStart(6)}  Rs${String(ttRsT).padStart(10)}       | ${trT>=0?'+':''}${String(trT).padStart(6)}  Rs${String(trRsT).padStart(10)}`
  );
  console.log(sep);

  // Comparison with yesterday's results
  console.log('\n  COMPARISON: Yesterday vs Today (2024-2026, qty 30)');
  console.log(sep2);
  console.log('  Strategy    | Yesterday (BUGGY)  | Today (CORRECT)    | Diff');
  console.log(sep2);
  // Yesterday's numbers: TICK TRAIL 34,10,940 | TRAIL 6,02,670
  const yestTT = 3410940, yestTR = 602670;
  const todayTT = ttT*QTY_MULT, todayTR = trT*QTY_MULT;
  console.log(`  TICK TRAIL  | +Rs${yestTT.toLocaleString('en-IN').padStart(10)} | +Rs${todayTT.toLocaleString('en-IN').padStart(10)} | ${todayTT<yestTT?'-':'+'} ${Math.abs(todayTT-yestTT).toLocaleString('en-IN')} (${((todayTT/yestTT)*100).toFixed(0)}% of yesterday)`);
  console.log(`  TRAIL       | +Rs${yestTR.toLocaleString('en-IN').padStart(10)} | +Rs${todayTR.toLocaleString('en-IN').padStart(10)} | ${todayTR<yestTR?'-':'+'} ${Math.abs(todayTR-yestTR).toLocaleString('en-IN')} (${((todayTR/yestTR)*100).toFixed(0)}% of yesterday)`);
  console.log(sep2);

  console.log('\n  DETAILED STATS (2024-2026, QTY_MULT=30)');
  console.log(sep2);
  console.log(`  ${'Metric'.padEnd(28)} ${'TICK TRAIL'.padStart(14)} ${'TRAIL'.padStart(14)}`);
  console.log(sep2);
  function row(label, v1, v2) {
    console.log(`  ${label.padEnd(28)} ${String(v1).padStart(14)} ${String(v2).padStart(14)}`);
  }
  row('Total Pts', (ttT>=0?'+':'')+ttT, (trT>=0?'+':'')+trT);
  row('Total Rs P&L',
    (ttT>=0?'+Rs':'-Rs')+Math.abs(ttT*QTY_MULT).toLocaleString('en-IN'),
    (trT>=0?'+Rs':'-Rs')+Math.abs(trT*QTY_MULT).toLocaleString('en-IN'));
  row('Avg Pts/Day',
    ((ttT/totalDays)>=0?'+':'')+( ttT/totalDays).toFixed(1),
    ((trT/totalDays)>=0?'+':'')+( trT/totalDays).toFixed(1));
  row('Win Days',
    `${ttWD}/${totalDays} (${((ttWD/totalDays)*100).toFixed(0)}%)`,
    `${trWD}/${totalDays} (${((trWD/totalDays)*100).toFixed(0)}%)`);
  row('Loss Days',
    `${ttLD}/${totalDays} (${((ttLD/totalDays)*100).toFixed(0)}%)`,
    `${trLD}/${totalDays} (${((trLD/totalDays)*100).toFixed(0)}%)`);
  row('Max Drawdown pts', '-'+Math.round(maxDDtt), '-'+Math.round(maxDDtr));
  row('Max Drawdown Rs',
    '-Rs'+(Math.round(maxDDtt)*QTY_MULT).toLocaleString('en-IN'),
    '-Rs'+(Math.round(maxDDtr)*QTY_MULT).toLocaleString('en-IN'));
  row('Total Trades', ttTrades, trTrades);
  row('Trade Win Rate',
    `${ttWins}/${ttTrades} (${ttTrades>0?((ttWins/ttTrades)*100).toFixed(0):0}%)`,
    `${trWins}/${trTrades} (${trTrades>0?((trWins/trTrades)*100).toFixed(0):0}%)`);
  row('Avg Trades/Day', (ttTrades/totalDays).toFixed(1), (trTrades/totalDays).toFixed(1));
  console.log(sep2);
  console.log(`\n  QTY_MULT=${QTY_MULT} | Period: 2024-01-01 to 2026-05-14 | Days: ${totalDays}`);
  console.log(`  Note: TRAIL = LOCK50 Old (trailLock50Old not exported in strategy.js)`);
  console.log('');
}

main().catch(console.error);

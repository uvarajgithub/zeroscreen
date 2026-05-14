// 5-YEAR BACKTEST — 3 Current Strategies
// BANKNIFTY 15-min candles | 2021-05-14 to 2026-05-14
//
// Strategy 1: TICK TRAIL  (buf=50, trailLock50, re-enters every breakout, unlimited)
// Strategy 2: TRAIL       (buf=25, trailDefault, processHybridCandle, unlimited)
// Strategy 3: LOCK50 Old  (buf=25, trailDefault — trailLock50Old not exported in strategy.js)
//
// QTY_MULT = 15  (30 qty x 0.5 delta = Rs.15/pt)

require('dotenv').config();
const https = require('https');

const API_KEY      = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QTY_MULT     = 15;

// Kite API fetch
function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': 'token ' + API_KEY + ':' + ACCESS_TOKEN },
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
  const url = '/instruments/historical/260105/15minute?from=' + from + '+09:00:00&to=' + to + '+15:30:00&continuous=0&oi=0';
  try {
    const resp = await kiteGet(url);
    if (!resp.data || !resp.data.candles) return [];
    return resp.data.candles.map(c => {
      const dt  = new Date(c[0]);
      const ist = new Date(dt.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return {
        date: ist.getFullYear() + '-' + String(ist.getMonth()+1).padStart(2,'0') + '-' + String(ist.getDate()).padStart(2,'0'),
        h: ist.getHours(), m: ist.getMinutes(),
        open: c[1], high: c[2], low: c[3], close: c[4]
      };
    });
  } catch(e) { process.stderr.write('\nChunk ' + from + '->' + to + ' failed: ' + e.message + '\n'); return []; }
}

function fmtDate(d) { return d.toISOString().slice(0,10); }

async function fetchAll() {
  const all = [];
  const end   = new Date('2026-05-14');
  const start = new Date('2021-05-14');
  let cur = new Date(start);
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  while (cur <= end) {
    const ce = new Date(cur);
    ce.setDate(cur.getDate() + 190);
    if (ce > end) ce.setTime(end.getTime());
    const chunk = await fetchChunk(fmtDate(cur), fmtDate(ce));
    all.push(...chunk);
    process.stdout.write('.');
    cur.setDate(cur.getDate() + 191);
    await new Promise(r => setTimeout(r, 400));
  }
  console.log(' ' + all.length + ' candles');
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

// TICK TRAIL: buf=50, structure refCandle, trailLock50, unlimited re-entries
function simDayTickTrail(candles) {
  let pnl=0, wins=0, losses=0, trades=0;
  let inTrade=false, entry=0, sl=0, dir=null, isC1=false, peak=0;
  let ref = candles[0];

  for (let i=1; i<candles.length; i++) {
    const curr = candles[i];
    const isEOD = curr.h > 15 || (curr.h === 15 && curr.m >= 15);
    const refBH = Math.max(ref.open, ref.close);
    const refBL = Math.min(ref.open, ref.close);

    // signal: buf=50 past structure candle body
    let signal = null;
    if (!isEOD) {
      if (curr.close > refBH + 50) signal = 'CE';
      else if (curr.close < refBL - 50) signal = 'PE';
    }
    if (signal) ref = curr; // breakout candle becomes new structure ref

    // monitor open trade
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
        pnl += pts;
        continue;
      }
      const hp = dir==='CE' ? curr.high-entry : entry-curr.low;
      if (hp > peak) { peak=hp; sl=trailLock50(sl,entry,dir,peak); }
      if (isEOD) {
        const pts = dir==='CE' ? curr.close-entry : entry-curr.close;
        inTrade=false; trades++;
        if (pts>0) wins++; else losses++;
        pnl += pts;
      }
    }

    // enter on signal if flat
    if (signal && !inTrade && !isEOD) {
      entry=curr.close; sl=signal==='CE' ? entry-100 : entry+100;
      dir=signal; inTrade=true; isC1=true; peak=0; trades++;
    }
  }
  return { pnl, wins, losses, trades };
}

// TRAIL / LOCK50 Old: processHybridCandle exact port
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
      const pts  = state.dir==='CE' ? state.sl-state.entry : state.entry-state.sl;
      const past = state.dir==='CE' ? curr.close<state.sl  : curr.close>state.sl;
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
      const e=curr.close, sl2=state.dir==='CE'?e-100:e+100;
      state.entry=e; state.sl=sl2; state.inTrade=true;
      state.waitReEntry=false; state.reUsed=true; state.isC1=true; state.peakProfit=0;
      return { action:'ENTER', dir:state.dir };
    }
    const da = state.dir==='CE' ? state.refHigh-curr.close : curr.close-state.refHigh;
    if (da > 150) {
      state.waitReEntry=false;
      if (curr.close > bH+25) {
        const e=curr.close;
        Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0});
        return { action:'ENTER', dir:'CE' };
      }
      if (curr.close < bL-25) {
        const e=curr.close;
        Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0});
        return { action:'ENTER', dir:'PE' };
      }
      state.firstDone=false; state.reUsed=true;
    }
    return { action:'NONE' };
  }
  if (state.firstDone || isEOD) return { action:'NONE' };
  if (curr.close > bH+25) {
    const e=curr.close;
    Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0});
    return { action:'ENTER', dir:'CE' };
  }
  if (curr.close < bL-25) {
    const e=curr.close;
    Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0});
    return { action:'ENTER', dir:'PE' };
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
    if (sig.action==='ENTER') {
      trades++;
    } else if (sig.action==='REVERSE_ENTER') {
      trades++;
      pnl += sig.prevPts;
      if (sig.prevPts>0) wins++; else losses++;
    } else if (sig.action==='EXIT_EARLY' || sig.action==='EXIT_SL' || sig.action==='EXIT_EOD') {
      pnl += sig.pts;
      if (sig.pts>0) wins++; else losses++;
    }
  }
  return { pnl, wins, losses, trades };
}

function pad(s, n) { return String(s).padStart(n); }
function pct(a,b) { return b>0 ? ((a/b)*100).toFixed(0)+'%' : '0%'; }
function rs(pts) { return (pts*QTY_MULT).toLocaleString('en-IN'); }
function sign(n) { return n>=0 ? '+' : ''; }

async function main() {
  const allCandles = await fetchAll();
  const byDay = groupByDay(allCandles);
  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);
  console.log('Trading days: ' + dates.length + '\n');

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
    const l5 = simDayShadow(candles, trailDefault);

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

  const LINE = '='.repeat(80);
  const line = '-'.repeat(80);
  console.log(LINE);
  console.log('  YEAR    DAYS |  TICK TRAIL pts    Rs     W% |  TRAIL pts       Rs     W% |  LOCK50 Old pts   Rs     W%');
  console.log(LINE);

  for (const yr of Object.keys(years).sort()) {
    const y = years[yr];
    const d = y.days;
    const tt=Math.round(y.tt), tr=Math.round(y.tr), l5=Math.round(y.l5);
    console.log(
      '  ' + yr + '  ' + pad(d,4) + ' |' +
      pad(sign(tt)+tt,7) + ' ' + pad('Rs'+rs(tt),12) + ' ' + pad(pct(y.ttW,d),4) + ' |' +
      pad(sign(tr)+tr,7) + ' ' + pad('Rs'+rs(tr),12) + ' ' + pad(pct(y.trW,d),4) + ' |' +
      pad(sign(l5)+l5,7) + ' ' + pad('Rs'+rs(l5),12) + ' ' + pad(pct(y.l5W,d),4)
    );
  }

  console.log(LINE);
  const ttT=Math.round(ttTotal), trT=Math.round(trTotal), l5T=Math.round(l5Total);
  const totalDays=dates.length;
  console.log(
    '  TOTAL ' + pad(totalDays,5) + ' |' +
    pad(sign(ttT)+ttT,7) + ' ' + pad('Rs'+rs(ttT),12) + '      |' +
    pad(sign(trT)+trT,7) + ' ' + pad('Rs'+rs(trT),12) + '      |' +
    pad(sign(l5T)+l5T,7) + ' ' + pad('Rs'+rs(l5T),12)
  );
  console.log(LINE);

  console.log('\n  DETAILED STATS');
  console.log(LINE);
  function row(label, v1, v2, v3) {
    console.log('  ' + label.padEnd(26) + pad(v1,18) + pad(v2,18) + pad(v3,18));
  }
  console.log('  ' + 'Metric'.padEnd(26) + pad('TICK TRAIL',18) + pad('TRAIL',18) + pad('LOCK50 Old',18));
  console.log(line);
  row('Total Pts',        sign(ttT)+ttT,                    sign(trT)+trT,                    sign(l5T)+l5T);
  row('Total Rs P&L',     sign(ttT)+'Rs'+rs(ttT),           sign(trT)+'Rs'+rs(trT),           sign(l5T)+'Rs'+rs(l5T));
  row('Avg Pts/Day',      sign(ttT/totalDays)+(ttT/totalDays).toFixed(1), sign(trT/totalDays)+(trT/totalDays).toFixed(1), sign(l5T/totalDays)+(l5T/totalDays).toFixed(1));
  row('Win Days',         ttWD+'/'+totalDays+' ('+pct(ttWD,totalDays)+')', trWD+'/'+totalDays+' ('+pct(trWD,totalDays)+')', l5WD+'/'+totalDays+' ('+pct(l5WD,totalDays)+')');
  row('Loss Days',        ttLD+'/'+totalDays+' ('+pct(ttLD,totalDays)+')', trLD+'/'+totalDays+' ('+pct(trLD,totalDays)+')', l5LD+'/'+totalDays+' ('+pct(l5LD,totalDays)+')');
  row('Max Drawdown pts', '-'+Math.round(maxDDtt),           '-'+Math.round(maxDDtr),           '-'+Math.round(maxDDl5));
  row('Max Drawdown Rs',  '-Rs'+(Math.round(maxDDtt)*QTY_MULT).toLocaleString('en-IN'), '-Rs'+(Math.round(maxDDtr)*QTY_MULT).toLocaleString('en-IN'), '-Rs'+(Math.round(maxDDl5)*QTY_MULT).toLocaleString('en-IN'));
  row('Total Trades',     ttTrades,                          trTrades,                          l5Trades);
  row('Trade Win Rate',   ttWins+'/'+ttTrades+' ('+pct(ttWins,ttTrades)+')', trWins+'/'+trTrades+' ('+pct(trWins,trTrades)+')', l5Wins+'/'+l5Trades+' ('+pct(l5Wins,l5Trades)+')');
  row('Avg Trades/Day',   (ttTrades/totalDays).toFixed(1),   (trTrades/totalDays).toFixed(1),   (l5Trades/totalDays).toFixed(1));
  console.log(LINE);
  console.log('\n  QTY_MULT=' + QTY_MULT + ' | 30 qty x 0.5 delta = Rs.15/pt | Days: ' + totalDays);
  console.log('  LOCK50 Old uses trailDefault (trailLock50Old not exported in strategy.js = same as TRAIL)');
  console.log('');
}

main().catch(console.error);

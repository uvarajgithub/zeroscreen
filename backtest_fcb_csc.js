// 5-YEAR BACKTEST: 2 new strategies vs LOCK50
// 1. FCB  — First Candle Breakout: enter CE on close > C1.high, PE on close < C1.low, NO SL, hold EOD
// 2. CSC  — Consecutive Same Color: green+green (C2 high > C1 high) → CE, red+red (C2 low < C1 low) → PE, NO SL, hold EOD
// Both: max 1 trade/day, no SL, hold to EOD
require('dotenv').config();
const https = require('https');

const API_KEY = process.env.API_KEY;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT = 15;

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
      const ist = new Date(new Date(c[0]).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
      return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
               hour:ist.getHours(), min:ist.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4] };
    });
  } catch(e) { console.error(`Chunk ${from}→${to}: ${e.message}`); return []; }
}

async function fetchAll5Yr() {
  const all=[]; const end=new Date(); const start=new Date();
  start.setFullYear(end.getFullYear()-5);
  let cur=new Date(start);
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  while (cur < end) {
    const ce=new Date(cur); ce.setDate(cur.getDate()+190);
    if (ce>end) ce.setTime(end.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate()+191);
    await new Promise(r=>setTimeout(r,350));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m={};
  for (const c of candles) { if (!m[c.date]) m[c.date]=[]; m[c.date].push(c); }
  return m;
}

// ─── LOCK50 (exact strategy.ts) ──────────────────────────────────────────────
function trailLock50(sl,entry,dir,peak) {
  if (peak<=100) return sl;
  return dir==='CE' ? Math.max(sl,entry+(peak-50)) : Math.min(sl,entry-(peak-50));
}
function createState() {
  return {inTrade:false,dir:null,entry:0,sl:0,refHigh:0,firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0};
}
function processCandle(state,prev,curr,isEOD) {
  const bH=Math.max(prev.open,prev.close),bL=Math.min(prev.open,prev.close);
  if (state.inTrade) {
    if (state.isC1) {
      state.isC1=false;
      const pnl=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;
      if (pnl<-3) { state.inTrade=false;state.firstDone=false;state.waitReEntry=false;state.reUsed=false; return {action:'EXIT_EARLY',pts:-3}; }
    }
    const slHit=state.dir==='CE'?curr.low<=state.sl:curr.high>=state.sl;
    if (slHit) {
      const pts=state.dir==='CE'?state.sl-state.entry:state.entry-state.sl;
      const past=state.dir==='CE'?curr.close<state.sl:curr.close>state.sl;
      if (past&&!state.reUsed) {
        const rd=state.dir==='CE'?'PE':'CE',re=curr.close,rs=rd==='CE'?re-100:re+100;
        state.dir=rd;state.entry=re;state.sl=rs;state.refHigh=rd==='CE'?curr.high:curr.low;
        state.reUsed=true;state.isC1=true;state.peakProfit=0;
        return {action:'REVERSE_ENTER',exitPts:pts};
      }
      state.inTrade=false;
      if (!state.reUsed) state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0; return {action:'EXIT_SL',pts};
    }
    const hp=state.dir==='CE'?curr.high-state.entry:state.entry-curr.low;
    if (hp>state.peakProfit) { state.peakProfit=hp; state.sl=trailLock50(state.sl,state.entry,state.dir,state.peakProfit); }
    if (isEOD) { const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close; state.inTrade=false; return {action:'EXIT_EOD',pts}; }
    return {action:'NONE'};
  }
  if (state.waitReEntry) {
    const re=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if (re) { const e=curr.close,s=state.dir==='CE'?e-100:e+100; state.entry=e;state.sl=s;state.inTrade=true;state.waitReEntry=false;state.reUsed=true;state.isC1=true;state.peakProfit=0; return {action:'ENTER'}; }
    const dist=state.dir==='CE'?state.refHigh-curr.close:curr.close-state.refHigh;
    if (dist>150) {
      state.waitReEntry=false;
      if (curr.close>bH+25) { const e=curr.close;state.dir='CE';state.entry=e;state.sl=e-100;state.refHigh=curr.high;state.inTrade=true;state.reUsed=true;state.isC1=true;state.peakProfit=0; return {action:'ENTER'}; }
      if (curr.close<bL-25) { const e=curr.close;state.dir='PE';state.entry=e;state.sl=e+100;state.refHigh=curr.low;state.inTrade=true;state.reUsed=true;state.isC1=true;state.peakProfit=0; return {action:'ENTER'}; }
      state.firstDone=false;state.reUsed=true;
    }
    return {action:'NONE'};
  }
  if (state.firstDone||isEOD) return {action:'NONE'};
  if (curr.close>bH+25) { const e=curr.close;state.dir='CE';state.entry=e;state.sl=e-100;state.refHigh=curr.high;state.inTrade=true;state.firstDone=true;state.isC1=true;state.peakProfit=0; return {action:'ENTER'}; }
  if (curr.close<bL-25) { const e=curr.close;state.dir='PE';state.entry=e;state.sl=e+100;state.refHigh=curr.low;state.inTrade=true;state.firstDone=true;state.isC1=true;state.peakProfit=0; return {action:'ENTER'}; }
  return {action:'NONE'};
}
function simLOCK50(candles) {
  const state=createState(); let pnl=0,trades=0,wins=0,loss=0,dailyLoss=0;
  for (let i=1;i<candles.length;i++) {
    if (trades>=5||dailyLoss>=350) break;
    const isEOD=(candles[i].hour===15&&candles[i].min>=15)||(i===candles.length-1);
    const sig=processCandle(state,candles[i-1],candles[i],isEOD);
    if (sig.action==='REVERSE_ENTER') {
      pnl+=sig.exitPts; trades++; if(sig.exitPts>0)wins++;else{loss++;dailyLoss+=Math.abs(sig.exitPts);}
      if(trades>=5||dailyLoss>=350) state.inTrade=false;
    } else if (['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)) {
      pnl+=sig.pts; trades++; if(sig.pts>0)wins++;else{loss++;dailyLoss+=Math.abs(sig.pts);}
    }
  }
  if (state.inTrade) { const l=candles[candles.length-1]; const p=state.dir==='CE'?l.close-state.entry:state.entry-l.close; pnl+=p;trades++;if(p>0)wins++;else loss++; }
  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Strategy: First Candle Breakout (FCB) ───────────────────────────────────
// First candle = candles[0] (9:15-9:30)
// From candle[1] onward: 
//   CE when close > firstCandle.high
//   PE when close < firstCandle.low
// NO SL — hold to EOD. Max 1 trade/day.
function simFCB(candles) {
  if (candles.length < 2) return {pnl:0,trades:0,wins:0,loss:0};
  const c0 = candles[0];
  const fcHigh = c0.high, fcLow = c0.low;

  for (let i=1; i<candles.length; i++) {
    const c=candles[i];
    const isEOD=(c.hour===15&&c.min>=15)||(i===candles.length-1);
    if (isEOD) break; // no entry on last candle

    let dir=null;
    if (c.close > fcHigh) dir='CE';
    else if (c.close < fcLow) dir='PE';
    if (!dir) continue;

    const entry=c.close;
    // Hold to EOD — no SL
    for (let j=i+1; j<candles.length; j++) {
      const cx=candles[j];
      const isE=(cx.hour===15&&cx.min>=15)||(j===candles.length-1);
      if (isE) {
        const p=dir==='CE'?cx.close-entry:entry-cx.close;
        return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0};
      }
    }
    return {pnl:0,trades:1,wins:0,loss:1};
  }
  return {pnl:0,trades:0,wins:0,loss:0}; // no breakout
}

// ─── Strategy: Consecutive Same Color (CSC) ──────────────────────────────────
// Scan every pair of adjacent candles (prev, curr):
//   GREEN+GREEN continuation: prev green (close>open) AND curr green AND curr.high > prev.high
//     → CE entry at curr.close
//   RED+RED continuation: prev red (close<open) AND curr red AND curr.low < prev.low
//     → PE entry at curr.close
// NO SL — hold to EOD. Max 1 trade/day. First signal taken.
function simCSC(candles) {
  if (candles.length < 2) return {pnl:0,trades:0,wins:0,loss:0};

  for (let i=1; i<candles.length; i++) {
    const prev=candles[i-1], curr=candles[i];
    const isEOD=(curr.hour===15&&curr.min>=15)||(i===candles.length-1);
    if (isEOD) break;

    const prevGreen = prev.close > prev.open;
    const prevRed   = prev.close < prev.open;
    const currGreen = curr.close > curr.open;
    const currRed   = curr.close < curr.open;

    let dir=null;
    // Green+Green: both green AND current high > prev high (momentum continuation)
    if (prevGreen && currGreen && curr.high > prev.high) dir='CE';
    // Red+Red: both red AND current low < prev low (momentum continuation)
    else if (prevRed && currRed && curr.low < prev.low) dir='PE';

    if (!dir) continue;

    const entry=curr.close;
    // Hold to EOD — no SL
    for (let j=i+1; j<candles.length; j++) {
      const cx=candles[j];
      const isE=(cx.hour===15&&cx.min>=15)||(j===candles.length-1);
      if (isE) {
        const p=dir==='CE'?cx.close-entry:entry-cx.close;
        return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0};
      }
    }
    return {pnl:0,trades:1,wins:0,loss:1};
  }
  return {pnl:0,trades:0,wins:0,loss:0};
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const candles = await fetchAll5Yr();
  const byDay   = groupByDay(candles);
  const dates   = Object.keys(byDay).sort();
  console.log(`Trading days: ${dates.length}\n`);

  const labels  = ['LOCK50','FCB (1st candle H/L breakout)','CSC (same-color continuation)'];
  const totals  = [0,0,0];
  const winDays = [0,0,0];
  const lossDays= [0,0,0];
  const trWins  = [0,0,0];
  const trLoss  = [0,0,0];
  const noSignal= [0,0,0]; // days with no trade
  const yrs={};
  const dayCounts={};

  for (const date of dates) {
    const dc=byDay[date]; if (dc.length<5) continue;
    const yr=date.slice(0,4);
    if (!yrs[yr]) yrs[yr]={days:0,pnl:[0,0,0],wd:[0,0,0],ns:[0,0,0]};
    dayCounts[yr]=(dayCounts[yr]||0)+1;

    const results=[simLOCK50(dc), simFCB(dc), simCSC(dc)];
    for (let k=0;k<3;k++) {
      totals[k]+=results[k].pnl;
      yrs[yr].pnl[k]+=results[k].pnl;
      if(results[k].pnl>0){winDays[k]++;yrs[yr].wd[k]++;}
      else if(results[k].pnl<0) lossDays[k]++;
      if(results[k].trades===0){noSignal[k]++;yrs[yr].ns[k]++;}
      trWins[k]+=results[k].wins; trLoss[k]+=results[k].loss;
    }
    yrs[yr].days++;
  }

  const totalDays=Object.values(dayCounts).reduce((a,b)=>a+b,0);

  const W=110;
  console.log('='.repeat(W));
  console.log('  5-YR BACKTEST: LOCK50  vs  FIRST CANDLE H/L BREAKOUT  vs  SAME-COLOR CONTINUATION');
  console.log('  FCB & CSC: NO SL — hold to EOD  |  qty=30  |  ₹15/pt');
  console.log('='.repeat(W));
  console.log(`${'Year'.padEnd(6)}| ${'Days'.padEnd(5)}| ${'LOCK50'.padEnd(16)}| ${'FCB (no SL)'.padEnd(22)}| ${'CSC (no SL)'.padEnd(22)}| Winner`);
  console.log('-'.repeat(W));

  for (const [yr, s] of Object.entries(yrs).sort()) {
    const nd=dayCounts[yr]||0;
    const rss=s.pnl.map(p=>Math.round(p*RS_PER_PT));
    const best=s.pnl.indexOf(Math.max(...s.pnl));
    const bLabel=['LOCK50','FCB','CSC'][best];
    console.log(
      `${yr.padEnd(6)}| ${String(nd).padEnd(5)}| ₹${(rss[0]/100000).toFixed(2)}L ${(s.wd[0]+'/'+nd+'D').padEnd(8)}| ₹${(rss[1]/100000).toFixed(2)}L ${(s.wd[1]+'/'+nd+'D+'+s.ns[1]+'noSig').padEnd(14)}| ₹${(rss[2]/100000).toFixed(2)}L ${(s.wd[2]+'/'+nd+'D+'+s.ns[2]+'noSig').padEnd(14)}| **${bLabel}**`
    );
  }

  console.log('='.repeat(W));
  const totRs=totals.map(p=>Math.round(p*RS_PER_PT));
  console.log(
    `${'TOTAL'.padEnd(6)}| ${String(totalDays).padEnd(5)}| ₹${(totRs[0]/100000).toFixed(2)}L ${(winDays[0]+'/'+totalDays+'D').padEnd(8)}| ₹${(totRs[1]/100000).toFixed(2)}L ${(winDays[1]+'/'+totalDays+'D+'+noSignal[1]+'noSig').padEnd(14)}| ₹${(totRs[2]/100000).toFixed(2)}L ${(winDays[2]+'/'+totalDays+'D+'+noSignal[2]+'noSig').padEnd(14)}|`
  );
  console.log('='.repeat(W));

  console.log('\n  ── SUMMARY ──────────────────────────────────────────────────────────');
  for (let k=0;k<3;k++) {
    const total=trWins[k]+trLoss[k];
    const wr=total>0?Math.round(trWins[k]/total*100):0;
    const dayWr=Math.round(winDays[k]/(winDays[k]+lossDays[k])*100);
    const rs=totRs[k];
    const flag=k===totals.indexOf(Math.max(...totals))?'  ← BEST':'';
    console.log(`  ${labels[k].padEnd(35)} ₹${(rs/100000).toFixed(2)}L 5yr  |  ₹${Math.round(rs/5).toLocaleString('en-IN')}/yr  |  Trade WR:${wr}%  |  Day WR:${dayWr}%  |  No-signal days:${noSignal[k]}${flag}`);
  }

  // Show distribution of FCB and CSC results
  console.log('\n  ── FCB breakdown: where does entry typically happen? ──────────────');
  // Re-run to collect entry candle stats
  let fcbEarlyEntry=0, fcbLateEntry=0, fcbNoEntry=0;
  for (const date of dates) {
    const dc=byDay[date]; if (dc.length<5) continue;
    const c0=dc[0]; const fcHigh=c0.high, fcLow=c0.low;
    let found=false;
    for (let i=1;i<dc.length;i++) {
      const c=dc[i], isEOD=(c.hour===15&&c.min>=15);
      if (isEOD) break;
      if (c.close>fcHigh||c.close<fcLow) {
        if (i<=3) fcbEarlyEntry++; else fcbLateEntry++;
        found=true; break;
      }
    }
    if (!found) fcbNoEntry++;
  }
  console.log(`  FCB entries within first 3 candles after open: ${fcbEarlyEntry} days`);
  console.log(`  FCB entries after candle 3:                    ${fcbLateEntry} days`);
  console.log(`  FCB no breakout all day:                       ${fcbNoEntry} days`);
}

main().catch(console.error);

// 5-YEAR BACKTEST: Bollinger Band % strategies vs LOCK50
// Bollinger Bands: 20-period SMA, 2 SD on 15-min close
// B% = (close - lowerBand) / (upperBand - lowerBand)
//      B% > 1.0 = above upper band (overbought)
//      B% < 0.0 = below lower band (oversold)
//
// STRATEGY 1: BB_REVERT — Mean Reversion (contrarian)
//   B% > 1 → SELL zone → enter PE on next bearish "perfect" candle (close < open)
//   B% < 0 → BUY zone  → enter CE on next bullish "perfect" candle (close > open)
//   SL=100pts, EOD exit, max 2 trades/day
//
// STRATEGY 2: BB_BREAK  — Breakout/Momentum
//   B% > 1 → breakout above upper band → enter CE (momentum buy)
//   B% < 0 → breakdown below lower band → enter PE (momentum sell)
//   SL=100pts, EOD exit, max 2 trades/day
//
// LOCK50: current bot, for reference
require('dotenv').config();
const https = require('https');
const RS_PER_PT = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version':'3', 'Authorization':`token ${process.env.API_KEY}:${process.env.ACCESS_TOKEN}` },
      timeout: 20000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} }); });
    req.on('error', reject); req.on('timeout', ()=>{ req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

async function fetchChunk(from, to) {
  const url = `/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const r = await kiteGet(url);
    if (!r.data?.candles) return [];
    return r.data.candles.map(c => {
      const ist = new Date(new Date(c[0]).toLocaleString('en-US', {timeZone:'Asia/Kolkata'}));
      return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
               hour:ist.getHours(), min:ist.getMinutes(),
               open:c[1], high:c[2], low:c[3], close:c[4] };
    });
  } catch(e) { console.error(`Chunk ${from}→${to}: ${e.message}`); return []; }
}

async function fetchAll5Yr() {
  const all=[]; const end=new Date(); const start=new Date();
  start.setFullYear(end.getFullYear()-5);
  let cur=new Date(start);
  process.stdout.write('Fetching 5yr BANKNIFTY 15-min ');
  while (cur<end) {
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

// ─── Bollinger Band calculation ───────────────────────────────────────────────
// Needs 20 candles of history. We pass a rolling window of candles.
function calcBB(closes, period=20, mult=2.0) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const sma   = slice.reduce((a,b)=>a+b,0) / period;
  const variance = slice.reduce((a,b)=>a+Math.pow(b-sma,2),0) / period;
  const sd    = Math.sqrt(variance);
  const upper = sma + mult*sd;
  const lower = sma - mult*sd;
  const bw    = upper - lower;
  return { sma, upper, lower, bw };
}

// ─── LOCK50 (exact strategy.ts) ──────────────────────────────────────────────
function trailLock50(sl,entry,dir,peak) {
  if (peak<=100) return sl;
  return dir==='CE' ? Math.max(sl,entry+(peak-50)) : Math.min(sl,entry-(peak-50));
}
function createHState() {
  return {inTrade:false,dir:null,entry:0,sl:0,refHigh:0,firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0};
}
function processHC(state,prev,curr,isEOD) {
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
        state.reUsed=true;state.isC1=true;state.peakProfit=0; return {action:'REVERSE_ENTER',exitPts:pts};
      }
      state.inTrade=false; if(!state.reUsed) state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0; return {action:'EXIT_SL',pts};
    }
    const hp=state.dir==='CE'?curr.high-state.entry:state.entry-curr.low;
    if(hp>state.peakProfit){state.peakProfit=hp;state.sl=trailLock50(state.sl,state.entry,state.dir,state.peakProfit);}
    if(isEOD){const pts=state.dir==='CE'?curr.close-state.entry:state.entry-curr.close;state.inTrade=false;return{action:'EXIT_EOD',pts};}
    return {action:'NONE'};
  }
  if (state.waitReEntry) {
    const re=(state.dir==='CE'&&curr.close>state.refHigh)||(state.dir==='PE'&&curr.close<state.refHigh);
    if(re){const e=curr.close,s=state.dir==='CE'?e-100:e+100;state.entry=e;state.sl=s;state.inTrade=true;state.waitReEntry=false;state.reUsed=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER'};}
    const dist=state.dir==='CE'?state.refHigh-curr.close:curr.close-state.refHigh;
    if(dist>150){state.waitReEntry=false;if(curr.close>bH+25){const e=curr.close;state.dir='CE';state.entry=e;state.sl=e-100;state.refHigh=curr.high;state.inTrade=true;state.reUsed=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER'};}if(curr.close<bL-25){const e=curr.close;state.dir='PE';state.entry=e;state.sl=e+100;state.refHigh=curr.low;state.inTrade=true;state.reUsed=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER'};}state.firstDone=false;state.reUsed=true;}
    return {action:'NONE'};
  }
  if(state.firstDone||isEOD) return {action:'NONE'};
  if(curr.close>bH+25){const e=curr.close;state.dir='CE';state.entry=e;state.sl=e-100;state.refHigh=curr.high;state.inTrade=true;state.firstDone=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER'};}
  if(curr.close<bL-25){const e=curr.close;state.dir='PE';state.entry=e;state.sl=e+100;state.refHigh=curr.low;state.inTrade=true;state.firstDone=true;state.isC1=true;state.peakProfit=0;return{action:'ENTER'};}
  return {action:'NONE'};
}
function simLOCK50(candles) {
  const s=createHState(); let pnl=0,trades=0,wins=0,loss=0,dl=0;
  for(let i=1;i<candles.length;i++){
    if(trades>=5||dl>=350) break;
    const isEOD=(candles[i].hour===15&&candles[i].min>=15)||(i===candles.length-1);
    const sig=processHC(s,candles[i-1],candles[i],isEOD);
    if(sig.action==='REVERSE_ENTER'){pnl+=sig.exitPts;trades++;if(sig.exitPts>0)wins++;else{loss++;dl+=Math.abs(sig.exitPts);}if(trades>=5||dl>=350)s.inTrade=false;}
    else if(['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)){pnl+=sig.pts;trades++;if(sig.pts>0)wins++;else{loss++;dl+=Math.abs(sig.pts);}}
  }
  if(s.inTrade){const l=candles[candles.length-1];const p=s.dir==='CE'?l.close-s.entry:s.entry-l.close;pnl+=p;trades++;if(p>0)wins++;else loss++;}
  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Shared BB trade engine ───────────────────────────────────────────────────
// allCandles: full 5-yr array sorted by date+time (for rolling BB window)
// We need 20+ candles of history before the day starts.
// For each day's candles we look up the rolling history from allCandles.
function simBB(dayCandles, historyCloses, mode /* 'REVERT' | 'BREAK' */, BB_PERIOD=20, BB_MULT=2.0, SL=100, MAX_TRADES=2) {
  let pnl=0, trades=0, wins=0, loss=0;
  let inTrade=false, dir=null, entry=0, sl=0;
  let pendingSignal=null; // { dir: 'CE'|'PE' } — for REVERT: wait for perfect candle

  // Build rolling closes: history + day candles
  const closes=[...historyCloses];

  for (let i=0; i<dayCandles.length; i++) {
    const c=dayCandles[i];
    const isEOD=(c.hour===15&&c.min>=15)||(i===dayCandles.length-1);
    closes.push(c.close);

    // Exit logic first
    if (inTrade) {
      const slHit = dir==='CE' ? c.low<=sl : c.high>=sl;
      if (slHit || isEOD) {
        const p = isEOD
          ? (dir==='CE' ? c.close-entry : entry-c.close)
          : (dir==='CE' ? sl-entry : entry-sl);
        pnl+=Math.round(p); trades++;
        if(p>0)wins++;else loss++;
        inTrade=false; dir=null;
        if (trades>=MAX_TRADES) break;
        if (isEOD) continue;
      }
    }

    if (trades>=MAX_TRADES || isEOD) continue;

    // Calculate BB
    const bb = calcBB(closes, BB_PERIOD, BB_MULT);
    if (!bb || bb.bw < 10) continue; // not enough history or band too tight

    const bPct = (c.close - bb.lower) / bb.bw;

    if (mode === 'REVERT') {
      // Hit upper band (overbought) → flag as PE signal
      // Hit lower band (oversold) → flag as CE signal
      if (!inTrade) {
        if (bPct >= 1.0 && pendingSignal?.dir !== 'PE') pendingSignal={dir:'PE'};
        else if (bPct <= 0.0 && pendingSignal?.dir !== 'CE') pendingSignal={dir:'CE'};

        // Wait for "perfect candle" confirmation
        if (pendingSignal) {
          const bearish = c.close < c.open;
          const bullish = c.close > c.open;
          const candleBody = Math.abs(c.close-c.open);
          if (candleBody < 5) { /* doji — skip */ }
          else if (pendingSignal.dir==='PE' && bearish) {
            // Confirmed: enter PE
            entry=c.close; sl=entry+SL; dir='PE'; inTrade=true; pendingSignal=null;
          } else if (pendingSignal.dir==='CE' && bullish) {
            // Confirmed: enter CE
            entry=c.close; sl=entry-SL; dir='CE'; inTrade=true; pendingSignal=null;
          } else {
            // Cancel signal if price moves back inside bands
            if (bPct>0.1 && bPct<0.9) pendingSignal=null;
          }
        }
      }
    } else { // BREAK — momentum
      if (!inTrade) {
        if (bPct >= 1.0) {
          // Breakout above upper band → CE
          entry=c.close; sl=entry-SL; dir='CE'; inTrade=true; pendingSignal=null;
        } else if (bPct <= 0.0) {
          // Breakdown below lower band → PE
          entry=c.close; sl=entry+SL; dir='PE'; inTrade=true; pendingSignal=null;
        }
      }
    }
  }

  // Force EOD close if still in trade
  if (inTrade && dayCandles.length > 0) {
    const last=dayCandles[dayCandles.length-1];
    const p=dir==='CE'?last.close-entry:entry-last.close;
    pnl+=Math.round(p); trades++; if(p>0)wins++;else loss++;
  }

  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const all = await fetchAll5Yr();
  const byDay = groupByDay(all);
  const dates = Object.keys(byDay).sort();
  console.log(`Trading days: ${dates.length}\n`);

  // Build full chronological close array for rolling BB window
  const allClosesByTime = [];
  for (const d of dates) {
    for (const c of byDay[d]) allClosesByTime.push({date:d, close:c.close});
  }

  const labels=['LOCK50 (15m)','BB_REVERT (mean rev)','BB_BREAK (breakout)'];
  const totals=[0,0,0];
  const winDays=[0,0,0], lossDays=[0,0,0];
  const tWins=[0,0,0], tLoss=[0,0,0];
  const noTrade=[0,0,0];
  const yrs={}, dayCounts={};

  const BB_PERIOD=20;

  // Track close index for rolling history
  let closeIdx=0;

  for (const date of dates) {
    const dc=byDay[date]; if (!dc||dc.length<5) { closeIdx+=dc?.length||0; continue; }
    const yr=date.slice(0,4);
    if(!yrs[yr])yrs[yr]={pnl:[0,0,0],wd:[0,0,0],days:0};
    dayCounts[yr]=(dayCounts[yr]||0)+1; yrs[yr].days++;

    // Get 20 candles of history BEFORE this day
    const historyCloses = allClosesByTime.slice(Math.max(0,closeIdx-BB_PERIOD), closeIdx).map(x=>x.close);
    closeIdx += dc.length;

    const rL  = simLOCK50(dc);
    const rRV = simBB(dc, historyCloses, 'REVERT');
    const rBK = simBB(dc, historyCloses, 'BREAK');

    const r=[rL, rRV, rBK];
    for(let k=0;k<3;k++){
      totals[k]+=r[k].pnl; yrs[yr].pnl[k]+=r[k].pnl;
      if(r[k].pnl>0){winDays[k]++;yrs[yr].wd[k]++;}else if(r[k].pnl<0)lossDays[k]++;
      if(r[k].trades===0) noTrade[k]++;
      tWins[k]+=r[k].wins; tLoss[k]+=r[k].loss;
    }
  }

  const totalDays=Object.values(dayCounts).reduce((a,b)=>a+b,0);
  const W=100;
  console.log('='.repeat(W));
  console.log('  5-YEAR BACKTEST: LOCK50 vs BOLLINGER BAND STRATEGIES (20-period, 2 SD, 15-min)');
  console.log('  BB_REVERT: touch band → wait for reversal candle → enter opposite direction');
  console.log('  BB_BREAK:  touch band → enter same direction (momentum breakout)');
  console.log('  Both: SL=100pts, EOD exit, max 2 trades/day | qty=30 | ₹15/pt');
  console.log('='.repeat(W));
  console.log(`${'Year'.padEnd(6)}| ${'Days'.padEnd(5)}| ${'LOCK50'.padEnd(18)}| ${'BB_REVERT'.padEnd(18)}| ${'BB_BREAK'.padEnd(18)}| Winner`);
  console.log('-'.repeat(W));

  for (const [yr,s] of Object.entries(yrs).sort()) {
    const nd=dayCounts[yr]||0;
    const rs=s.pnl.map(p=>Math.round(p*RS_PER_PT));
    const best=s.pnl.indexOf(Math.max(...s.pnl));
    const bL=['L50','REVERT','BREAK'][best];
    console.log(`${yr.padEnd(6)}| ${String(nd).padEnd(5)}| ₹${(rs[0]/100000).toFixed(2)}L (${s.wd[0]}W)`.padEnd(26)+'| '+
      `₹${(rs[1]/100000).toFixed(2)}L (${s.wd[1]}W)`.padEnd(18)+'| '+
      `₹${(rs[2]/100000).toFixed(2)}L (${s.wd[2]}W)`.padEnd(18)+'| **'+bL+'**');
  }
  console.log('='.repeat(W));
  const totRs=totals.map(p=>Math.round(p*RS_PER_PT));
  console.log(`${'TOTAL'.padEnd(6)}| ${String(totalDays).padEnd(5)}| ₹${(totRs[0]/100000).toFixed(2)}L (${winDays[0]}W)`.padEnd(26)+'| '+
    `₹${(totRs[1]/100000).toFixed(2)}L (${winDays[1]}W, ${noTrade[1]}noSig)`.padEnd(28)+'| '+
    `₹${(totRs[2]/100000).toFixed(2)}L (${winDays[2]}W, ${noTrade[2]}noSig)`.padEnd(28)+'|');
  console.log('='.repeat(W));

  console.log('\n  ── SUMMARY ────────────────────────────────────────────────────────────────────────');
  for(let k=0;k<3;k++){
    const total=tWins[k]+tLoss[k];
    const wr=total>0?Math.round(tWins[k]/total*100):0;
    const dwr=winDays[k]+lossDays[k]>0?Math.round(winDays[k]/(winDays[k]+lossDays[k])*100):0;
    const rs=totRs[k];
    const flag=k===totals.indexOf(Math.max(...totals))?'  ← BEST':'';
    console.log(`  ${labels[k].padEnd(22)} ₹${(rs/100000).toFixed(2)}L 5yr | ₹${Math.round(rs/5).toLocaleString('en-IN')}/yr | Trade WR:${wr}% | Day WR:${dwr}% | No-signal:${noTrade[k]}d${flag}`);
  }

  // Extra: show BB signal frequency breakdown
  console.log('\n  ── BB SIGNAL STATS ─────────────────────────────────────────────────────────────────');
  console.log(`  BB_REVERT trades taken: ${tWins[1]+tLoss[1]} over ${totalDays} days (avg ${((tWins[1]+tLoss[1])/totalDays).toFixed(2)}/day)`);
  console.log(`  BB_BREAK  trades taken: ${tWins[2]+tLoss[2]} over ${totalDays} days (avg ${((tWins[2]+tLoss[2])/totalDays).toFixed(2)}/day)`);
}

main().catch(console.error);

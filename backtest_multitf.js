// 5-YEAR BACKTEST: 5-min & 1-min strategies vs LOCK50 (15-min)
// Strategy 1: ORB15     — 5-min: first 15-min range (3 candles) breakout, SL=50pts, EOD
// Strategy 2: MOMENTUM5 — 5-min: 3 consecutive candles same direction, body>20pts, SL=prev candle extreme, EOD
// Strategy 3: SCALP1    — 1-min: enter after 15-min body breakout signal, SL=20pts, target=40pts (1:2 RR)
// LOCK50 (15-min): current bot, for reference
require('dotenv').config();
const https = require('https');
const RS_PER_PT = 15; // qty=30

// ─── API ─────────────────────────────────────────────────────────────────────
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

async function fetchChunk(tf, from, to) {
  const url = `/instruments/historical/260105/${tf}?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`;
  try {
    const r = await kiteGet(url);
    if (!r.data?.candles) return [];
    return r.data.candles.map(c => {
      const ist = new Date(new Date(c[0]).toLocaleString('en-US', {timeZone:'Asia/Kolkata'}));
      return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
               hour:ist.getHours(), min:ist.getMinutes(),
               open:c[1], high:c[2], low:c[3], close:c[4] };
    });
  } catch(e) { console.error(`${tf} chunk ${from}→${to}: ${e.message}`); return []; }
}

async function fetchAll(tf, chunkDays) {
  const all=[]; const end=new Date(); const start=new Date();
  start.setFullYear(end.getFullYear()-5);
  let cur=new Date(start);
  process.stdout.write(`Fetching 5yr ${tf} `);
  while (cur<end) {
    const ce=new Date(cur); ce.setDate(cur.getDate()+chunkDays-1);
    if (ce>end) ce.setTime(end.getTime());
    all.push(...await fetchChunk(tf, cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate()+chunkDays);
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
function simLOCK50(candles15) {
  const s=createHState(); let pnl=0,trades=0,wins=0,loss=0,dl=0;
  for(let i=1;i<candles15.length;i++){
    if(trades>=5||dl>=350) break;
    const isEOD=(candles15[i].hour===15&&candles15[i].min>=15)||(i===candles15.length-1);
    const sig=processHC(s,candles15[i-1],candles15[i],isEOD);
    if(sig.action==='REVERSE_ENTER'){pnl+=sig.exitPts;trades++;if(sig.exitPts>0)wins++;else{loss++;dl+=Math.abs(sig.exitPts);}if(trades>=5||dl>=350)s.inTrade=false;}
    else if(['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)){pnl+=sig.pts;trades++;if(sig.pts>0)wins++;else{loss++;dl+=Math.abs(sig.pts);}}
  }
  if(s.inTrade){const l=candles15[candles15.length-1];const p=s.dir==='CE'?l.close-s.entry:s.entry-l.close;pnl+=p;trades++;if(p>0)wins++;else loss++;}
  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Strategy 1: ORB15 (5-min) ───────────────────────────────────────────────
// First 3 × 5-min candles (9:15–9:30) define the opening range
// Enter CE when 5-min close > rangeHigh+5, PE when close < rangeLow-5
// SL = 50 pts, Target = 100 pts (1:2 RR), or EOD. Max 1 trade/day.
function simORB15(candles5) {
  if (candles5.length < 4) return {pnl:0,trades:0,wins:0,loss:0};
  // First 3 candles = 9:15, 9:20, 9:25
  const rangeHigh = Math.max(candles5[0].high, candles5[1].high, candles5[2].high);
  const rangeLow  = Math.min(candles5[0].low,  candles5[1].low,  candles5[2].low);
  const SL=50, TARGET=100, BUF=5;
  if (rangeHigh - rangeLow > 500) return {pnl:0,trades:0,wins:0,loss:0}; // skip gap day

  for (let i=3; i<candles5.length; i++) {
    const c=candles5[i];
    const isEOD=(c.hour===15&&c.min>=14)||(i===candles5.length-1);
    if (isEOD) break;
    let dir=null;
    if (c.close > rangeHigh+BUF) dir='CE';
    else if (c.close < rangeLow-BUF) dir='PE';
    if (!dir) continue;

    const entry=c.close;
    const sl   = dir==='CE' ? entry-SL : entry+SL;
    const tgt  = dir==='CE' ? entry+TARGET : entry-TARGET;

    for (let j=i+1; j<candles5.length; j++) {
      const cx=candles5[j];
      const isE=(cx.hour===15&&cx.min>=14)||(j===candles5.length-1);
      if (dir==='CE') {
        if (cx.low<=sl)   { const p=sl-entry;   return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0}; }
        if (cx.high>=tgt) { return {pnl:TARGET,trades:1,wins:1,loss:0}; }
      } else {
        if (cx.high>=sl)  { const p=entry-sl;   return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0}; }
        if (cx.low<=tgt)  { return {pnl:TARGET,trades:1,wins:1,loss:0}; }
      }
      if (isE) { const p=dir==='CE'?cx.close-entry:entry-cx.close; return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0}; }
    }
    return {pnl:0,trades:1,wins:0,loss:1};
  }
  return {pnl:0,trades:0,wins:0,loss:0};
}

// ─── Strategy 2: MOMENTUM5 (5-min) ───────────────────────────────────────────
// 3 consecutive 5-min candles all same direction, each body >= 20pts
//   Green×3: enter CE at close of 3rd, SL=3rd candle low, Target=2×risk, or EOD
//   Red×3:   enter PE at close of 3rd, SL=3rd candle high, Target=2×risk, or EOD
// Max 2 trades/day. No entry after 1:30 PM.
function simMOM5(candles5) {
  let pnl=0,trades=0,wins=0,loss=0;
  if (candles5.length < 3) return {pnl:0,trades,wins,loss};

  for (let i=2; i<candles5.length; i++) {
    if (trades>=2) break;
    const c=candles5[i],p1=candles5[i-1],p2=candles5[i-2];
    if (c.hour>=13&&c.min>=30) break; // no new entry after 1:30 PM

    const body0=p2.close-p2.open, body1=p1.close-p1.open, body2=c.close-c.open;
    const allGreen = body0>20 && body1>20 && body2>20;
    const allRed   = body0<-20 && body1<-20 && body2<-20;
    if (!allGreen && !allRed) continue;

    const dir   = allGreen ? 'CE' : 'PE';
    const entry = c.close;
    const sl    = dir==='CE' ? c.low-2 : c.high+2;
    const risk  = Math.abs(entry-sl);
    const tgt   = dir==='CE' ? entry+risk*2 : entry-risk*2;

    for (let j=i+1; j<candles5.length; j++) {
      const cx=candles5[j];
      const isE=(cx.hour===15&&cx.min>=14)||(j===candles5.length-1);
      if (dir==='CE') {
        if (cx.low<=sl)   { pnl+=sl-entry;trades++;loss++;break; }
        if (cx.high>=tgt) { pnl+=risk*2;trades++;wins++;break; }
      } else {
        if (cx.high>=sl)  { pnl+=entry-sl;trades++;loss++;break; }
        if (cx.low<=tgt)  { pnl+=risk*2;trades++;wins++;break; }
      }
      if (isE) { const p=dir==='CE'?cx.close-entry:entry-cx.close; pnl+=p;trades++;if(p>0)wins++;else loss++;break; }
    }
  }
  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Strategy 3: SCALP1 (1-min) ──────────────────────────────────────────────
// Wait for 15-min body breakout signal (same as LOCK50 detection)
// On signal, enter on NEXT 1-min candle that pulls back (close against direction)
//   i.e., for CE: enter when 1-min candle dips then close turns back up OR just enter next 1-min
// SL=20pts, Target=40pts (1:2 RR). Max 3 trades/day. No entry after 12:00 PM.
function simSCALP1(candles15, candles1ByDay, date) {
  const c1s = candles1ByDay[date] || [];
  if (c1s.length < 5) return {pnl:0,trades:0,wins:0,loss:0};
  let pnl=0,trades=0,wins=0,loss=0;

  // Find 15-min breakout signals (same logic as LOCK50 first entry)
  const signals=[];
  for (let i=1; i<candles15.length; i++) {
    const prev=candles15[i-1],curr=candles15[i];
    const bH=Math.max(prev.open,prev.close),bL=Math.min(prev.open,prev.close);
    const isEOD=(curr.hour===15&&curr.min>=15);
    if (isEOD) break;
    if (curr.close>bH+25) signals.push({time:{h:curr.hour,m:curr.min},dir:'CE',signalClose:curr.close});
    else if (curr.close<bL-25) signals.push({time:{h:curr.hour,m:curr.min},dir:'PE',signalClose:curr.close});
    if (signals.length>=1) break; // take first signal only for entry timing
  }
  if (signals.length===0) return {pnl:0,trades,wins,loss};

  const sig=signals[0];
  // Find 1-min candles AFTER the 15-min signal candle close time
  const sigMinutes=sig.time.h*60+sig.time.m;
  // Signal fires at end of the 15-min candle — next 1-min starts at that time+1
  const entryStart=sigMinutes; // enter from this minute onward in 1-min candles

  for (let i=0; i<c1s.length&&trades<3; i++) {
    const c=c1s[i];
    const cMin=c.hour*60+c.min;
    if (cMin < entryStart) continue;
    if (c.hour>=12) break; // no new entries after 12 PM

    const isEOD=(c.hour===15&&c.min>=14)||(i===c1s.length-1);
    if (isEOD) break;

    // Simple scalp: enter on any 1-min candle in signal direction after signal fires
    // For CE: enter when 1-min candle closes above its open (momentum confirmation)
    // For PE: enter when 1-min candle closes below its open
    const confirm = sig.dir==='CE' ? c.close>c.open : c.close<c.open;
    if (!confirm) continue;

    const entry=c.close, SL=20, TARGET=40;
    const sl  = sig.dir==='CE' ? entry-SL : entry+SL;
    const tgt = sig.dir==='CE' ? entry+TARGET : entry-TARGET;

    let done=false;
    for (let j=i+1; j<c1s.length&&!done; j++) {
      const cx=c1s[j];
      const isE=(cx.hour===15&&cx.min>=14)||(j===c1s.length-1);
      if (sig.dir==='CE') {
        if (cx.low<=sl)   { pnl+=sl-entry;trades++;loss++;done=true; }
        else if(cx.high>=tgt){ pnl+=TARGET;trades++;wins++;done=true; }
      } else {
        if (cx.high>=sl)  { pnl+=entry-sl;trades++;loss++;done=true; }
        else if(cx.low<=tgt){ pnl+=TARGET;trades++;wins++;done=true; }
      }
      if (!done&&isE) { const p=sig.dir==='CE'?cx.close-entry:entry-cx.close; pnl+=p;trades++;if(p>0)wins++;else loss++;done=true; }
    }
    if (done) i+=5; // skip a few candles before next entry
  }
  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Fetch all 3 timeframes in parallel sequence
  const [all15, all5, all1] = await Promise.all([
    fetchAll('15minute', 190),
    fetchAll('5minute', 95),
    fetchAll('minute', 58),
  ]);

  const by15 = groupByDay(all15);
  const by5  = groupByDay(all5);
  const by1  = groupByDay(all1);
  const dates = Object.keys(by15).sort();
  console.log(`\nTrading days (15-min basis): ${dates.length}\n`);

  const labels=['LOCK50 (15m)','ORB15 (5m, SL50)','MOM5 (5m, 3-candle)','SCALP1 (1m, SL20 T40)'];
  const totals=[0,0,0,0];
  const winDays=[0,0,0,0], lossDays=[0,0,0,0];
  const tWins=[0,0,0,0], tLoss=[0,0,0,0];
  const yrs={}, dayCounts={};

  for (const date of dates) {
    const d15=by15[date]; if (!d15||d15.length<5) continue;
    const d5=by5[date]||[]; const d1=by1[date]||[];
    const yr=date.slice(0,4);
    if(!yrs[yr])yrs[yr]={pnl:[0,0,0,0],wd:[0,0,0,0],days:0};
    dayCounts[yr]=(dayCounts[yr]||0)+1; yrs[yr].days++;

    const r=[simLOCK50(d15), simORB15(d5), simMOM5(d5), simSCALP1(d15,by1,date)];
    for(let k=0;k<4;k++){
      totals[k]+=r[k].pnl; yrs[yr].pnl[k]+=r[k].pnl;
      if(r[k].pnl>0){winDays[k]++;yrs[yr].wd[k]++;}else if(r[k].pnl<0)lossDays[k]++;
      tWins[k]+=r[k].wins; tLoss[k]+=r[k].loss;
    }
  }

  const totalDays=Object.values(dayCounts).reduce((a,b)=>a+b,0);
  const W=105;
  console.log('='.repeat(W));
  console.log('  5-YEAR BACKTEST: LOCK50 (15m)  vs  ORB15 (5m)  vs  MOMENTUM5 (5m)  vs  SCALP1 (1m)');
  console.log('  qty=30 | ₹15/pt');
  console.log('='.repeat(W));
  console.log(`${'Year'.padEnd(6)}| ${'Days'.padEnd(5)}| ${'LOCK50(15m)'.padEnd(16)}| ${'ORB15(5m)'.padEnd(16)}| ${'MOM5(5m)'.padEnd(16)}| ${'SCALP1(1m)'.padEnd(16)}| Winner`);
  console.log('-'.repeat(W));

  for (const [yr,s] of Object.entries(yrs).sort()) {
    const nd=dayCounts[yr]||0;
    const rs=s.pnl.map(p=>Math.round(p*RS_PER_PT));
    const best=s.pnl.indexOf(Math.max(...s.pnl));
    const bL=['L50','ORB','MOM5','SC1'][best];
    const row=`${yr.padEnd(6)}| ${String(nd).padEnd(5)}|`+
      rs.map((v,k)=>` ₹${(v/100000).toFixed(2)}L (${s.wd[k]}W)`.padEnd(16)+'|').join('')+
      ` **${bL}**`;
    console.log(row);
  }
  console.log('='.repeat(W));
  const totRs=totals.map(p=>Math.round(p*RS_PER_PT));
  console.log(`${'TOTAL'.padEnd(6)}| ${String(totalDays).padEnd(5)}|`+totRs.map((v,k)=>` ₹${(v/100000).toFixed(2)}L (${winDays[k]}W)`.padEnd(16)+'|').join(''));
  console.log('='.repeat(W));

  console.log('\n  ── SUMMARY ─────────────────────────────────────────────────────────────');
  for(let k=0;k<4;k++){
    const total=tWins[k]+tLoss[k];
    const wr=total>0?Math.round(tWins[k]/total*100):0;
    const dwr=Math.round(winDays[k]/(winDays[k]+lossDays[k])*100);
    const rs=totRs[k];
    const flag=k===totals.indexOf(Math.max(...totals))?'  ← BEST':'';
    console.log(`  ${labels[k].padEnd(25)} ₹${(rs/100000).toFixed(2)}L 5yr | ₹${Math.round(rs/5).toLocaleString('en-IN')}/yr | Trade WR:${wr}% | Day WR:${dwr}%${flag}`);
  }
}

main().catch(console.error);

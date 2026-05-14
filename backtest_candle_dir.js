// 5-YEAR BACKTEST: Candle Direction Strategy — Candles 1,2,3,4 vs LOCK50
// Enter at close of candle N, direction = candle body direction, SL=100pts, hold EOD
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

// ─── Candle-N Direction Strategy ─────────────────────────────────────────────
// Enter at close of candle index N (0-based), direction = close vs open
// SL=100pts, exit EOD or SL hit. Skip doji (<10pt body).
function simCandleN(candles, n) {
  if (candles.length <= n+1) return {pnl:0,trades:0,wins:0,loss:0};
  const c = candles[n];
  if (Math.abs(c.close - c.open) < 10) return {pnl:0,trades:0,wins:0,loss:0}; // doji skip
  const dir   = c.close > c.open ? 'CE' : 'PE';
  const entry = c.close;
  const sl    = dir==='CE' ? entry-100 : entry+100;

  for (let i=n+1; i<candles.length; i++) {
    const cx=candles[i];
    const isEOD=(cx.hour===15&&cx.min>=15)||(i===candles.length-1);
    if (dir==='CE'&&cx.low<=sl)  { const p=sl-entry; return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0}; }
    if (dir==='PE'&&cx.high>=sl) { const p=entry-sl; return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0}; }
    if (isEOD) { const p=dir==='CE'?cx.close-entry:entry-cx.close; return {pnl:Math.round(p),trades:1,wins:p>0?1:0,loss:p<=0?1:0}; }
  }
  return {pnl:0,trades:0,wins:0,loss:0};
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const candles = await fetchAll5Yr();
  const byDay   = groupByDay(candles);
  const dates   = Object.keys(byDay).sort();
  console.log(`Trading days: ${dates.length}\n`);

  // labels: C1=9:15, C2=9:30, C3=9:45, C4=10:00
  const labels = ['LOCK50','C1(9:15)','C2(9:30)','C3(9:45)','C4(10:00)'];
  const totals  = [0,0,0,0,0];
  const winDays = [0,0,0,0,0];
  const lossDays= [0,0,0,0,0];
  const tradeWins=[0,0,0,0,0];
  const tradeLoss=[0,0,0,0,0];
  const yrs = {};

  for (const date of dates) {
    const dc=byDay[date]; if (dc.length<5) continue;
    const yr=date.slice(0,4);
    if (!yrs[yr]) yrs[yr]={days:0,pnl:[0,0,0,0,0],wd:[0,0,0,0,0]};

    const results=[
      simLOCK50(dc),
      simCandleN(dc,0),
      simCandleN(dc,1),
      simCandleN(dc,2),
      simCandleN(dc,3),
    ];
    for (let k=0;k<5;k++) {
      totals[k]+=results[k].pnl;
      yrs[yr].pnl[k]+=results[k].pnl;
      yrs[yr].days++;
      if(results[k].pnl>0){winDays[k]++;yrs[yr].wd[k]++;}
      else if(results[k].pnl<0) lossDays[k]++;
      tradeWins[k]+=results[k].wins; tradeLoss[k]+=results[k].loss;
    }
    yrs[yr].days = yrs[yr].days/5|0; // divide by 5 (counted 5x)
  }

  // Fix days count
  let totalDays=0;
  for (const yr of Object.keys(yrs)) { yrs[yr].days=Object.values(byDay).filter((_,i)=>Object.keys(byDay)[i]?.startsWith(yr)&&byDay[Object.keys(byDay)[i]].length>=5).length; totalDays+=yrs[yr].days; }
  // simple recount
  const dayCounts={};
  for (const date of dates) { if(byDay[date].length>=5){const yr=date.slice(0,4);dayCounts[yr]=(dayCounts[yr]||0)+1;} }
  totalDays = Object.values(dayCounts).reduce((a,b)=>a+b,0);

  const W=115;
  console.log('='.repeat(W));
  console.log('  5-YR CANDLE DIRECTION BACKTEST  |  BANKNIFTY 15-min  |  qty=30 ₹15/pt  |  SL=100pts  |  Hold to EOD');
  console.log('='.repeat(W));

  // Header
  let hdr = 'Year  | Days |';
  for (const l of labels) hdr += ` ${l.padEnd(14)} |`;
  console.log(hdr);
  console.log('-'.repeat(W));

  for (const [yr, s] of Object.entries(yrs).sort()) {
    const nd = dayCounts[yr]||0;
    let row = `${yr}  | ${String(nd).padEnd(4)} |`;
    for (let k=0;k<5;k++) {
      const rs = Math.round(s.pnl[k]*RS_PER_PT);
      const wr = s.wd[k];
      row += ` ₹${(rs/100000).toFixed(2)}L (${wr}W/${nd}D)`.padEnd(16) + '|';
    }
    console.log(row);
  }

  console.log('='.repeat(W));
  let totRow='TOTAL | '+String(totalDays).padEnd(4)+' |';
  for (let k=0;k<5;k++) {
    const rs=Math.round(totals[k]*RS_PER_PT);
    const wd=winDays[k];
    totRow+=` ₹${(rs/100000).toFixed(2)}L (${wd}W/${totalDays}D)`.padEnd(16)+'|';
  }
  console.log(totRow);
  console.log('='.repeat(W));

  console.log('\n  Win Rate per trade:');
  for (let k=0;k<5;k++) {
    const total=tradeWins[k]+tradeLoss[k];
    const wr=total>0?Math.round(tradeWins[k]/total*100):0;
    const rs=Math.round(totals[k]*RS_PER_PT);
    const winner = totals[k]===Math.max(...totals)?'  ← BEST':'';
    console.log(`  ${labels[k].padEnd(12)} ₹${(rs/100000).toFixed(2)}L | Trade WR:${wr}% | Day WR:${Math.round(winDays[k]/totalDays*100)}%${winner}`);
  }
}

main().catch(console.error);

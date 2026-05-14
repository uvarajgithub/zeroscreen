// 5-YEAR BACKTEST: COMBINED LOCK50 + SCALP1 vs each alone
// LOCK50  — 15-min body breakout, LOCK50 trail, max 5 trades, SL=100pts
// SCALP1  — 1-min: after 15-min breakout signal fires, enter on confirming 1-min candle
//            SL=20pts, Target=40pts (1:2 RR), max 3 scalp trades/day, no entry after 12 PM
// COMBINED — both run simultaneously on SAME day, P&L added together
//            Represents 2 lots: lot-1 does LOCK50, lot-2 does SCALP1 (₹15/pt each)
require('dotenv').config();
const https = require('https');
const RS_PER_PT = 15; // per strategy (each runs 1 lot = qty 30)

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
               hour:ist.getHours(), min:ist.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4] };
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

// ─── LOCK50 ───────────────────────────────────────────────────────────────────
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
  // Collect all signals for SCALP1 to use
  const signals=[];
  for(let i=1;i<candles15.length;i++){
    if(trades>=5||dl>=350) break;
    const isEOD=(candles15[i].hour===15&&candles15[i].min>=15)||(i===candles15.length-1);
    const sig=processHC(s,candles15[i-1],candles15[i],isEOD);
    if(sig.action==='ENTER'||sig.action==='REVERSE_ENTER'){
      signals.push({h:candles15[i].hour, m:candles15[i].min, dir:s.dir, price:s.entry});
    }
    if(sig.action==='REVERSE_ENTER'){pnl+=sig.exitPts;trades++;if(sig.exitPts>0)wins++;else{loss++;dl+=Math.abs(sig.exitPts);}if(trades>=5||dl>=350)s.inTrade=false;}
    else if(['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)){pnl+=sig.pts;trades++;if(sig.pts>0)wins++;else{loss++;dl+=Math.abs(sig.pts);}}
  }
  if(s.inTrade){const l=candles15[candles15.length-1];const p=s.dir==='CE'?l.close-s.entry:s.entry-l.close;pnl+=p;trades++;if(p>0)wins++;else loss++;}
  return {pnl:Math.round(pnl),trades,wins,loss,signals};
}

// ─── SCALP1 ───────────────────────────────────────────────────────────────────
// Receives signals from LOCK50 (time + direction)
// Enters on confirming 1-min candle after signal fires
// SL=20pts, Target=40pts, max 3 trades/day, no entry after 12 PM
function simSCALP1(candles1, lock50Signals) {
  if (!candles1 || candles1.length<5 || !lock50Signals?.length) return {pnl:0,trades:0,wins:0,loss:0};
  let pnl=0, trades=0, wins=0, loss=0;

  for (const sig of lock50Signals) {
    if (trades>=3) break;
    const sigMinutes = sig.h*60 + sig.m;
    if (sig.h>=12) continue; // no scalp entries after 12 PM

    // Find 1-min candles starting from signal time
    let entered=false;
    for (let i=0; i<candles1.length && trades<3; i++) {
      const c=candles1[i];
      const cMin=c.hour*60+c.min;
      if (cMin < sigMinutes) continue;
      if (c.hour>=12) break;
      const isEOD=(c.hour===15&&c.min>=14)||(i===candles1.length-1);
      if (isEOD) break;

      // Enter on confirming 1-min candle (body in signal direction)
      const confirm = sig.dir==='CE' ? c.close>c.open : c.close<c.open;
      const body=Math.abs(c.close-c.open);
      if (!confirm || body<3) continue;

      const entry=c.close, SL=20, TARGET=40;
      const sl  = sig.dir==='CE' ? entry-SL : entry+SL;
      const tgt = sig.dir==='CE' ? entry+TARGET : entry-TARGET;

      for (let j=i+1; j<candles1.length; j++) {
        const cx=candles1[j];
        const isE=(cx.hour===15&&cx.min>=14)||(j===candles1.length-1);
        let done=false;
        if (sig.dir==='CE') {
          if (cx.low<=sl)   { pnl+=sl-entry;trades++;loss++;done=true; }
          else if(cx.high>=tgt){ pnl+=TARGET;trades++;wins++;done=true; }
        } else {
          if (cx.high>=sl)  { pnl+=entry-sl;trades++;loss++;done=true; }
          else if(cx.low<=tgt){ pnl+=TARGET;trades++;wins++;done=true; }
        }
        if (!done&&isE) { const p=sig.dir==='CE'?cx.close-entry:entry-cx.close; pnl+=p;trades++;if(p>0)wins++;else loss++;done=true; }
        if (done) { entered=true; break; }
      }
      if (entered) break; // one scalp per signal
    }
  }
  return {pnl:Math.round(pnl),trades,wins,loss};
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const [all15, all1] = await Promise.all([
    fetchAll('15minute', 190),
    fetchAll('minute', 58),
  ]);

  const by15=groupByDay(all15), by1=groupByDay(all1);
  const dates=Object.keys(by15).sort();
  console.log(`\nTrading days: ${dates.length}\n`);

  // Totals
  const tot={l50:0, sc1:0, comb:0};
  const wd={l50:0, sc1:0, comb:0}, ld={l50:0, sc1:0, comb:0};
  const tw={l50:0, sc1:0}, tl={l50:0, sc1:0};
  const yrs={}, dayCounts={};

  for (const date of dates) {
    const d15=by15[date]; if(!d15||d15.length<5) continue;
    const d1=by1[date]||[];
    const yr=date.slice(0,4);
    if(!yrs[yr]) yrs[yr]={l50:0,sc1:0,comb:0,wd:{l50:0,sc1:0,comb:0},days:0};
    dayCounts[yr]=(dayCounts[yr]||0)+1; yrs[yr].days++;

    const rL = simLOCK50(d15);
    const rS = simSCALP1(d1, rL.signals);
    const combPnl = rL.pnl + rS.pnl;

    tot.l50+=rL.pnl; tot.sc1+=rS.pnl; tot.comb+=combPnl;
    yrs[yr].l50+=rL.pnl; yrs[yr].sc1+=rS.pnl; yrs[yr].comb+=combPnl;

    if(rL.pnl>0){wd.l50++;yrs[yr].wd.l50++;}else if(rL.pnl<0)ld.l50++;
    if(rS.pnl>0){wd.sc1++;yrs[yr].wd.sc1++;}else if(rS.pnl<0)ld.sc1++;
    if(combPnl>0){wd.comb++;yrs[yr].wd.comb++;}else if(combPnl<0)ld.comb++;

    tw.l50+=rL.wins; tl.l50+=rL.loss;
    tw.sc1+=rS.wins; tl.sc1+=rS.loss;
  }

  const totalDays=Object.values(dayCounts).reduce((a,b)=>a+b,0);
  const W=108;
  console.log('='.repeat(W));
  console.log('  5-YEAR BACKTEST: LOCK50 alone  vs  SCALP1 alone  vs  COMBINED (both lots)');
  console.log('  LOCK50: 15-min breakout, SL=100pts, LOCK50 trail | qty=30 ₹15/pt');
  console.log('  SCALP1: 1-min confirm after LOCK50 signal, SL=20pts target=40pts | qty=30 ₹15/pt');
  console.log('  COMBINED: both running = 2 lots total (₹30/pt total)');
  console.log('='.repeat(W));
  console.log(`${'Year'.padEnd(6)}| ${'Days'.padEnd(5)}| ${'LOCK50 (₹15/pt)'.padEnd(22)}| ${'SCALP1 (₹15/pt)'.padEnd(22)}| ${'COMBINED (₹30/pt)'.padEnd(22)}| SCALP adds`);
  console.log('-'.repeat(W));

  for (const [yr,s] of Object.entries(yrs).sort()) {
    const nd=dayCounts[yr]||0;
    const lRs=Math.round(s.l50*RS_PER_PT), sRs=Math.round(s.sc1*RS_PER_PT), cRs=Math.round(s.comb*RS_PER_PT);
    const extra=(sRs>=0?'+':'')+sRs.toLocaleString('en-IN');
    console.log(`${yr.padEnd(6)}| ${String(nd).padEnd(5)}| ₹${(lRs/100000).toFixed(2)}L (${s.wd.l50}W)`.padEnd(24)+'| '+
      `₹${(sRs/100000).toFixed(2)}L (${s.wd.sc1}W)`.padEnd(22)+'| '+
      `₹${(cRs/100000).toFixed(2)}L (${s.wd.comb}W)`.padEnd(22)+'| ₹'+extra);
  }

  console.log('='.repeat(W));
  const lRs=Math.round(tot.l50*RS_PER_PT), sRs=Math.round(tot.sc1*RS_PER_PT), cRs=Math.round(tot.comb*RS_PER_PT);
  console.log(`${'TOTAL'.padEnd(6)}| ${String(totalDays).padEnd(5)}| ₹${(lRs/100000).toFixed(2)}L (${wd.l50}W/${totalDays}D)`.padEnd(26)+'| '+
    `₹${(sRs/100000).toFixed(2)}L (${wd.sc1}W/${totalDays}D)`.padEnd(26)+'| '+
    `₹${(cRs/100000).toFixed(2)}L (${wd.comb}W/${totalDays}D)`.padEnd(26)+'| ₹'+(sRs>=0?'+':'')+sRs.toLocaleString('en-IN'));
  console.log('='.repeat(W));

  const l50Wr=Math.round(tw.l50/(tw.l50+tl.l50)*100);
  const sc1Wr=Math.round(tw.sc1/(tw.sc1+tl.sc1)*100);
  const combDWr=Math.round(wd.comb/(wd.comb+ld.comb)*100);
  console.log(`
  ── SUMMARY ─────────────────────────────────────────────────────────────────────────
  LOCK50 alone  (1 lot, ₹15/pt)  ₹${(lRs/100000).toFixed(2)}L 5yr | ₹${Math.round(lRs/5).toLocaleString('en-IN')}/yr | Trade WR:${l50Wr}% | Day WR:${Math.round(wd.l50/totalDays*100)}%
  SCALP1 alone  (1 lot, ₹15/pt)  ₹${(sRs/100000).toFixed(2)}L 5yr | ₹${Math.round(sRs/5).toLocaleString('en-IN')}/yr | Trade WR:${sc1Wr}% | Day WR:${Math.round(wd.sc1/totalDays*100)}%
  COMBINED      (2 lots, ₹30/pt) ₹${(cRs/100000).toFixed(2)}L 5yr | ₹${Math.round(cRs/5).toLocaleString('en-IN')}/yr | Day WR:${combDWr}%
  
  SCALP1 adds ₹${(sRs/100000).toFixed(2)}L on top of LOCK50 over 5 years
  Max daily loss risk: LOCK50 max ₹5,250/day (350pts×₹15) + SCALP1 max ₹900/day (3×20pts×₹15) = ₹6,150/day
  ──────────────────────────────────────────────────────────────────────────────────────`);

  // Per-year breakdown detail
  console.log('\n  ── YEAR-BY-YEAR SCALP1 CONTRIBUTION ────────────────────────────');
  for (const [yr,s] of Object.entries(yrs).sort()) {
    const sRs=Math.round(s.sc1*RS_PER_PT);
    const pct=s.l50>0?Math.round(s.sc1/s.l50*100):0;
    const bar='█'.repeat(Math.max(0,Math.min(20,Math.round(Math.abs(sRs)/5000))));
    console.log(`  ${yr}  SCALP1: ₹${(sRs/100000).toFixed(2)}L  (${pct>=0?'+':''}${pct}% of LOCK50)  ${sRs>=0?'▲':'▼'} ${bar}`);
  }
}

main().catch(console.error);

require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QM = 15; // 30 qty × 0.5 delta
const DELTA = 0.5; // ATM option delta

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: 'api.kite.trade', path, headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` }, timeout: 20000 }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }); req.on('error', reject); req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); }); req.end();
  });
}

function trailDefault(sl, entry, dir, peak) {
  let lock = 0;
  if (peak >= 200) lock = 100; else if (peak >= 100) lock = 20;
  if (lock === 0) return sl;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

function trailLock50(sl, entry, dir, peak) {
  if (peak <= 100) return sl;
  const lock = peak - 50;
  return dir === 'CE' ? Math.max(sl, entry+lock) : Math.min(sl, entry-lock);
}

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
      if (p < -3) { state.inTrade=false; state.firstDone=false; state.waitReEntry=false; state.reUsed=false; return { action:'EXIT_EARLY', pts:-3 }; }
    }
    const slHit = state.dir==='CE' ? curr.low<=state.sl : curr.high>=state.sl;
    if (slHit) {
      const pts = state.dir==='CE' ? state.sl-state.entry : state.entry-state.sl;
      const past = state.dir==='CE' ? curr.close<state.sl : curr.close>state.sl;
      if (past && !state.reUsed) {
        const rd=state.dir==='CE'?'PE':'CE', re=curr.close, rs=rd==='CE'?re-100:re+100;
        state.dir=rd; state.entry=re; state.sl=rs; state.refHigh=rd==='CE'?curr.high:curr.low;
        state.reUsed=true; state.isC1=true; state.peakProfit=0;
        return { action:'REVERSE_ENTER', dir:rd, prevPts:pts };
      }
      state.inTrade=false; if (!state.reUsed) state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0; return { action:'EXIT_SL', pts };
    }
    const hp = state.dir==='CE' ? curr.high-state.entry : state.entry-curr.low;
    if (hp > state.peakProfit) { state.peakProfit=hp; state.sl=trailFn(state.sl, state.entry, state.dir, state.peakProfit); }
    if (isEOD) { const pts = state.dir==='CE' ? curr.close-state.entry : state.entry-curr.close; state.inTrade=false; return { action:'EXIT_EOD', pts }; }
    return { action:'NONE' };
  }
  if (state.waitReEntry) {
    const rt = (state.dir==='CE' && curr.close>state.refHigh) || (state.dir==='PE' && curr.close<state.refHigh);
    if (rt) {
      const e=curr.close, sl=state.dir==='CE'?e-100:e+100;
      state.entry=e; state.sl=sl; state.inTrade=true; state.waitReEntry=false; state.reUsed=true; state.isC1=true; state.peakProfit=0;
      return { action:'ENTER', dir:state.dir, price:e };
    }
    const da = state.dir==='CE' ? state.refHigh-curr.close : curr.close-state.refHigh;
    if (da > 150) {
      state.waitReEntry=false;
      if (curr.close > bH+25) { const e=curr.close; Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'CE', price:e }; }
      if (curr.close < bL-25) { const e=curr.close; Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'PE', price:e }; }
      state.firstDone=false; state.reUsed=true;
    }
    return { action:'NONE' };
  }
  if (state.firstDone || isEOD) return { action:'NONE' };
  if (curr.close > bH+25) { const e=curr.close; Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'CE', price:e }; }
  if (curr.close < bL-25) { const e=curr.close; Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'PE', price:e }; }
  return { action:'NONE' };
}

function simDay(candles, trailFn) {
  const state = createState(); let pnl=0, trades=0;
  for (let i=1; i<candles.length; i++) {
    const prev=candles[i-1], curr=candles[i];
    const isEOD = curr.h>15 || (curr.h===15 && curr.m>=15);
    const sig = processCandle(state, prev, curr, isEOD, trailFn);
    if (sig.action==='ENTER') { trades++; }
    else if (sig.action==='REVERSE_ENTER') { trades++; pnl+=sig.prevPts; }
    else if (['EXIT_EARLY','EXIT_SL','EXIT_EOD'].includes(sig.action)) { pnl+=sig.pts; }
  }
  return { pnl, trades };
}

function parseCandles(raw) {
  return raw.map(c => {
    const dt=new Date(c[0]);
    const ist=new Date(dt.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`, h:ist.getHours(), m:ist.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4] };
  });
}

function printMonth(label, candles) {
  const byDay = {};
  for (const c of candles) { if (!byDay[c.date]) byDay[c.date]=[]; byDay[c.date].push(c); }
  const dates = Object.keys(byDay).sort().filter(d => byDay[d].length >= 5);

  console.log(`\n${label}  |  1 lot = 30 qty  |  DELTA=0.5  (PremPts = IndexPts x 0.5)`);
  console.log('='.repeat(80));
  console.log('  Date        trailDefault (current)            trailLock50 (NEW)        Diff');
  console.log('            PremPts   Rs P&L   Result      PremPts   Rs P&L   Result');
  console.log('-'.repeat(80));

  let totOld=0, totNew=0;
  for (const date of dates) {
    const o = simDay(byDay[date], trailDefault);
    const n = simDay(byDay[date], trailLock50);
    totOld += o.pnl; totNew += n.pnl;
    const op=Math.round(o.pnl), np=Math.round(n.pnl);
    const opp=Math.round(op*DELTA), npp=Math.round(np*DELTA), diffp=npp-opp;
    const ow = op>0?'WIN ':op<0?'LOSS':'FLAT';
    const nw = np>0?'WIN ':np<0?'LOSS':'FLAT';
    const ds = (diffp>=0?'+':'')+diffp;
    console.log(`  ${date}  ${String((opp>=0?'+':'')+opp).padStart(6)} ${String((op*QM>=0?'+':'-')+'Rs'+Math.abs(op*QM).toLocaleString('en-IN')).padStart(10)}  ${ow}   ${String((npp>=0?'+':'')+npp).padStart(6)} ${String((np*QM>=0?'+':'-')+'Rs'+Math.abs(np*QM).toLocaleString('en-IN')).padStart(10)}  ${nw}  ${ds}`);
  }
  const to=Math.round(totOld), tn=Math.round(totNew);
  const top=Math.round(to*DELTA), tnp=Math.round(tn*DELTA);
  console.log('='.repeat(80));
  console.log(`  TOTAL        ${String((top>=0?'+':'')+top).padStart(6)} ${String((to*QM>=0?'+':'-')+'Rs'+Math.abs(to*QM).toLocaleString('en-IN')).padStart(10)}              ${String((tnp>=0?'+':'')+tnp).padStart(6)} ${String((tn*QM>=0?'+':'-')+'Rs'+Math.abs(tn*QM).toLocaleString('en-IN')).padStart(10)}        +(${tnp-top} prem)`);
  console.log('='.repeat(80));
  console.log(`  Days: ${dates.length}  |  trailLock50 wins by +Rs${((tn-to)*QM).toLocaleString('en-IN')} (+${tnp-top} prem pts)`);
  return { to, tn };
}

async function main() {
  const months = [
    { label:'FEBRUARY 2026', from:'2026-02-01', to:'2026-02-28' },
    { label:'MARCH 2026',    from:'2026-03-01', to:'2026-03-31' },
    { label:'APRIL 2026',    from:'2026-04-01', to:'2026-04-30' },
    { label:'MAY 2026',      from:'2026-05-01', to:'2026-05-14' },
  ];

  let grandOld=0, grandNew=0;
  for (const m of months) {
    const resp = await kiteGet(`/instruments/historical/260105/15minute?from=${m.from}+09:00:00&to=${m.to}+15:30:00&continuous=0&oi=0`);
    const candles = parseCandles(resp.data.candles);
    const { to, tn } = printMonth(m.label, candles);
    grandOld += to; grandNew += tn;
    await new Promise(r => setTimeout(r, 300));
  }

  const gop=Math.round(grandOld*DELTA), gnp=Math.round(grandNew*DELTA);
  console.log('\n' + '='.repeat(80));
  console.log(`  GRAND TOTAL (Feb-May 2026)`);
  console.log(`  trailDefault: +${gop} prem pts  =  +Rs${(grandOld*QM).toLocaleString('en-IN')}`);
  console.log(`  trailLock50:  +${gnp} prem pts  =  +Rs${(grandNew*QM).toLocaleString('en-IN')}`);
  console.log(`  Difference:   +${gnp-gop} prem pts  =  +Rs${((grandNew-grandOld)*QM).toLocaleString('en-IN')} extra for trailLock50`);
  console.log('='.repeat(80));
  console.log('  Note: PremPts = IndexPts x 0.5 (ATM delta) | Rs = PremPts x 30 qty (1 lot)');
}
main().catch(console.error);

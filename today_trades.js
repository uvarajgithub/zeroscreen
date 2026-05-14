require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const QM = 15; // 30 qty x 0.5 delta
const DELTA = 0.5;

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
        return { action:'REVERSE_ENTER', dir:rd, entry:re, prevPts:pts };
      }
      state.inTrade=false; if (!state.reUsed) state.waitReEntry=true; else state.firstDone=false;
      state.peakProfit=0; return { action:'EXIT_SL', pts };
    }
    const hp = state.dir==='CE' ? curr.high-state.entry : state.entry-curr.low;
    if (hp > state.peakProfit) { state.peakProfit=hp; state.sl=trailFn(state.sl, state.entry, state.dir, state.peakProfit); }
    if (isEOD) { const pts = state.dir==='CE' ? curr.close-state.entry : state.entry-curr.close; state.inTrade=false; return { action:'EXIT_EOD', pts, sl:state.sl }; }
    return { action:'NONE' };
  }
  if (state.waitReEntry) {
    const rt = (state.dir==='CE' && curr.close>state.refHigh) || (state.dir==='PE' && curr.close<state.refHigh);
    if (rt) {
      const e=curr.close, sl=state.dir==='CE'?e-100:e+100;
      state.entry=e; state.sl=sl; state.inTrade=true; state.waitReEntry=false; state.reUsed=true; state.isC1=true; state.peakProfit=0;
      return { action:'ENTER', dir:state.dir, entry:e };
    }
    const da = state.dir==='CE' ? state.refHigh-curr.close : curr.close-state.refHigh;
    if (da > 150) {
      state.waitReEntry=false;
      if (curr.close > bH+25) { const e=curr.close; Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,reUsed:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'CE', entry:e }; }
      if (curr.close < bL-25) { const e=curr.close; Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,reUsed:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'PE', entry:e }; }
      state.firstDone=false; state.reUsed=true;
    }
    return { action:'NONE' };
  }
  if (state.firstDone || isEOD) return { action:'NONE' };
  if (curr.close > bH+25) { const e=curr.close; Object.assign(state,{dir:'CE',entry:e,sl:e-100,refHigh:curr.high,inTrade:true,firstDone:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'CE', entry:e }; }
  if (curr.close < bL-25) { const e=curr.close; Object.assign(state,{dir:'PE',entry:e,sl:e+100,refHigh:curr.low,inTrade:true,firstDone:true,isC1:true,peakProfit:0}); return { action:'ENTER', dir:'PE', entry:e }; }
  return { action:'NONE' };
}

function simDayTickTrailVerbose(candles) {
  const label = 'tickTrail     (BUF=50 unlimited re-entries)';
  const trades = [];
  let inTrade=false, entry=0, sl=0, dir=null, isC1=false, peak=0;
  let ref = candles[0];
  let totalPnl = 0;
  let currentEntry = null;

  for (let i=1; i<candles.length; i++) {
    const curr = candles[i];
    const isEOD = curr.h > 15 || (curr.h === 15 && curr.m >= 15);
    const time = `${String(curr.h).padStart(2,'0')}:${String(curr.m).padStart(2,'0')}`;
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
          trades.push({ ...currentEntry, exitTime:time, exitPrice:dir==='CE'?entry-3:entry+3, idxPts:-3, premPts:Math.round(-3*DELTA), rs:-3*QM, how:'C1-STOP' });
          totalPnl -= 3;
          inTrade=false; currentEntry=null;
          if (signal && !isEOD) {
            entry=curr.close; sl=signal==='CE'?entry-100:entry+100;
            dir=signal; inTrade=true; isC1=true; peak=0;
            currentEntry = { dir, entry, time };
          }
          continue;
        }
      }
      const slHit = dir==='CE' ? curr.low<=sl : curr.high>=sl;
      if (slHit) {
        const pts = dir==='CE' ? sl-entry : entry-sl;
        trades.push({ ...currentEntry, exitTime:time, exitPrice:sl, idxPts:Math.round(pts), premPts:Math.round(pts*DELTA), rs:Math.round(pts)*QM, how:'SL' });
        totalPnl += pts;
        inTrade=false; currentEntry=null;
        if (signal && !isEOD) {
          entry=curr.close; sl=signal==='CE'?entry-100:entry+100;
          dir=signal; inTrade=true; isC1=true; peak=0;
          currentEntry = { dir, entry, time };
        }
        continue;
      }
      const hp = dir==='CE' ? curr.high-entry : entry-curr.low;
      if (hp > peak) { peak=hp; sl=trailLock50(sl,entry,dir,peak); }
      if (isEOD) {
        const pts = dir==='CE' ? curr.close-entry : entry-curr.close;
        trades.push({ ...currentEntry, exitTime:time, exitPrice:curr.close, idxPts:Math.round(pts), premPts:Math.round(pts*DELTA), rs:Math.round(pts)*QM, how:'EOD' });
        totalPnl += pts;
        inTrade=false; currentEntry=null;
      }
    }

    if (signal && !inTrade && !isEOD) {
      entry=curr.close; sl=signal==='CE'?entry-100:entry+100;
      dir=signal; inTrade=true; isC1=true; peak=0;
      currentEntry = { dir, entry, time };
    }
  }

  const tp = Math.round(totalPnl * DELTA);
  console.log(`\n${label}  |  Today: ${candles[0].date}  |  1 lot = 30 qty`);
  console.log('='.repeat(82));
  console.log('  #   Dir  EntryTime  EntryPx  ExitTime  ExitPx   IdxPts  PremPts   Rs P&L   How');
  console.log('-'.repeat(82));
  if (trades.length === 0) {
    console.log('  No trades today');
  } else {
    trades.forEach((t, i) => {
      const sign = t.rs >= 0 ? '+' : '';
      const pp = t.premPts >= 0 ? '+'+t.premPts : ''+t.premPts;
      const ip = t.idxPts >= 0 ? '+'+t.idxPts : ''+t.idxPts;
      console.log(`  ${String(i+1).padStart(2)}  ${t.dir}  ${t.time}       ${String(Math.round(t.entry)).padStart(6)}   ${t.exitTime}   ${String(Math.round(t.exitPrice)).padStart(6)}  ${String(ip).padStart(7)}  ${String(pp).padStart(7)}  ${String(sign+'Rs'+Math.abs(t.rs).toLocaleString('en-IN')).padStart(9)}  ${t.how}`);
    });
  }
  console.log('='.repeat(82));
  const tot = Math.round(totalPnl);
  console.log(`  TOTAL: ${trades.length} trades  |  IdxPts: ${tot>=0?'+':''}${tot}  |  PremPts: ${tp>=0?'+':''}${tp}  |  Rs: ${(tot*QM>=0?'+':'')}Rs${Math.abs(tot*QM).toLocaleString('en-IN')}`);
  console.log('='.repeat(82));
}

function simDayVerbose(candles, trailFn, label) {
  const state = createState();
  const trades = [];
  let currentEntry = null;
  let totalPnl = 0;

  for (let i=1; i<candles.length; i++) {
    const prev=candles[i-1], curr=candles[i];
    const isEOD = curr.h>15 || (curr.h===15 && curr.m>=15);
    const time = `${String(curr.h).padStart(2,'0')}:${String(curr.m).padStart(2,'0')}`;
    const sig = processCandle(state, prev, curr, isEOD, trailFn);

    if (sig.action==='ENTER') {
      currentEntry = { dir:sig.dir, entry:sig.entry, time };
    } else if (sig.action==='REVERSE_ENTER') {
      if (currentEntry) {
        const pp = Math.round(sig.prevPts * DELTA);
        trades.push({ ...currentEntry, exitTime:time, exitPrice:sig.entry, idxPts:Math.round(sig.prevPts), premPts:pp, rs:Math.round(sig.prevPts)*QM, how:'SL→REV' });
        totalPnl += sig.prevPts;
      }
      currentEntry = { dir:sig.dir, entry:sig.entry, time };
    } else if (sig.action==='EXIT_SL') {
      if (currentEntry) {
        const pp = Math.round(sig.pts * DELTA);
        trades.push({ ...currentEntry, exitTime:time, exitPrice: currentEntry.dir==='CE' ? currentEntry.entry+sig.pts : currentEntry.entry-sig.pts, idxPts:Math.round(sig.pts), premPts:pp, rs:Math.round(sig.pts)*QM, how:'SL' });
        totalPnl += sig.pts;
        currentEntry = null;
      }
    } else if (sig.action==='EXIT_EARLY') {
      if (currentEntry) {
        trades.push({ ...currentEntry, exitTime:time, exitPrice: currentEntry.dir==='CE' ? currentEntry.entry-3 : currentEntry.entry+3, idxPts:-3, premPts:Math.round(-3*DELTA), rs:-3*QM, how:'C1-STOP' });
        totalPnl -= 3;
        currentEntry = null;
      }
    } else if (sig.action==='EXIT_EOD') {
      if (currentEntry) {
        const pp = Math.round(sig.pts * DELTA);
        trades.push({ ...currentEntry, exitTime:time, exitPrice:curr.close, idxPts:Math.round(sig.pts), premPts:pp, rs:Math.round(sig.pts)*QM, how:'EOD' });
        totalPnl += sig.pts;
        currentEntry = null;
      }
    }
  }

  const tp = Math.round(totalPnl * DELTA);
  console.log(`\n${label}  |  Today: ${candles[0].date}  |  1 lot = 30 qty`);
  console.log('='.repeat(82));
  console.log('  #   Dir  EntryTime  EntryPx  ExitTime  ExitPx   IdxPts  PremPts   Rs P&L   How');
  console.log('-'.repeat(82));
  if (trades.length === 0) {
    console.log('  No trades today');
  } else {
    trades.forEach((t, i) => {
      const sign = t.rs >= 0 ? '+' : '';
      const pp = t.premPts >= 0 ? '+'+t.premPts : ''+t.premPts;
      const ip = t.idxPts >= 0 ? '+'+t.idxPts : ''+t.idxPts;
      console.log(`  ${String(i+1).padStart(2)}  ${t.dir}  ${t.time}       ${String(Math.round(t.entry)).padStart(6)}   ${t.exitTime}   ${String(Math.round(t.exitPrice)).padStart(6)}  ${String(ip).padStart(7)}  ${String(pp).padStart(7)}  ${String(sign+'Rs'+Math.abs(t.rs).toLocaleString('en-IN')).padStart(9)}  ${t.how}`);
    });
  }
  console.log('='.repeat(82));
  const tot = Math.round(totalPnl);
  console.log(`  TOTAL: ${trades.length} trades  |  IdxPts: ${tot>=0?'+':''}${tot}  |  PremPts: ${tp>=0?'+':''}${tp}  |  Rs: ${(tot*QM>=0?'+':'')}Rs${Math.abs(tot*QM).toLocaleString('en-IN')}`);
  console.log('='.repeat(82));
  return totalPnl;
}

async function main() {
  const today = '2026-05-13';
  const resp = await kiteGet(`/instruments/historical/260105/15minute?from=${today}+09:00:00&to=${today}+15:30:00&continuous=0&oi=0`);
  if (!resp.data || !resp.data.candles || resp.data.candles.length === 0) {
    console.log('No data for today yet (market closed or holiday)');
    return;
  }
  const candles = resp.data.candles.map(c => {
    const dt=new Date(c[0]);
    const ist=new Date(dt.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    return { date:`${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`, h:ist.getHours(), m:ist.getMinutes(), open:c[1], high:c[2], low:c[3], close:c[4] };
  });

  console.log(`\nFetched ${candles.length} candles for today (${candles[0].date})`);
  console.log(`Last candle: ${candles[candles.length-1].h}:${String(candles[candles.length-1].m).padStart(2,'0')}  close=${candles[candles.length-1].close}`);

  simDayVerbose(candles, trailDefault, 'trailDefault (CURRENT bot)');
  simDayVerbose(candles, trailLock50,  'trailLock50  (NEW)');
  simDayTickTrailVerbose(candles);
}
main().catch(console.error);

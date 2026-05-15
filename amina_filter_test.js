// amina_filter_test.js
// 5-year backtest comparing 4 strategies:
//   1. Amina WITH re-entry filter
//   2. Amina WITHOUT re-entry filter
//   3. Tick Trail — 1 trade per day (SL 100 | trail+lock@50)
//   4. Tick Trail — unlimited trades (same rules, re-enter after every exit)
require('dotenv').config();
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const RS_PER_PT = 15;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname:'api.kite.trade', path, headers:{'X-Kite-Version':'3','Authorization':`token ${API_KEY}:${ACCESS_TOKEN}`}, timeout:20000 }, res => {
      let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} });
    }); req.on('error',reject); req.on('timeout',()=>{req.destroy();reject(new Error('timeout'))}); req.end();
  });
}

async function fetchChunk(from, to) {
  const r = await kiteGet(`/instruments/historical/260105/15minute?from=${from}+09:00:00&to=${to}+15:30:00&continuous=0&oi=0`).catch(()=>null);
  if (!r||!r.data||!r.data.candles) return [];
  return r.data.candles.map(c => {
    const ist = new Date(new Date(c[0]).toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
    return {
      date: `${ist.getFullYear()}-${String(ist.getMonth()+1).padStart(2,'0')}-${String(ist.getDate()).padStart(2,'0')}`,
      h: ist.getHours(), m: ist.getMinutes(),
      open: c[1], high: c[2], low: c[3], close: c[4],
      bull: c[4] >= c[1],
      bodyH: Math.max(c[1],c[4]), bodyL: Math.min(c[1],c[4]),
      bodySize: Math.abs(c[4]-c[1])
    };
  });
}

async function fetchAll(start, end) {
  const all=[], endD=new Date(end); let cur=new Date(start);
  process.stdout.write(`Fetching ${start} → ${end} `);
  while(cur<=endD){
    const ce=new Date(cur); ce.setDate(cur.getDate()+90); if(ce>endD)ce.setTime(endD.getTime());
    all.push(...await fetchChunk(cur.toISOString().slice(0,10), ce.toISOString().slice(0,10)));
    process.stdout.write('.');
    cur.setDate(cur.getDate()+91);
    await new Promise(r=>setTimeout(r,300));
  }
  console.log(` ${all.length} candles`);
  return all;
}

function groupByDay(candles) {
  const m={};
  for(const c of candles){ if(!m[c.date])m[c.date]=[]; m[c.date].push(c); }
  return m;
}

// Rolling C1+C2 scan — returns signal only if breakout is on the LATEST candle (index n-1)
function scan(cs) {
  const n = cs.length;
  for(let i=0; i<n-1; i++){
    const ca=cs[i], cb=cs[i+1];
    let sig=null, bl=null;
    if(ca.bull===cb.bull){
      sig = ca.bull?'CE':'PE';
      bl  = sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if(cb.bodySize>ca.bodySize){
      sig = cb.bull?'CE':'PE';
      bl  = sig==='CE'?Math.max(ca.bodyH,cb.bodyH):Math.min(ca.bodyL,cb.bodyL);
    } else continue;

    for(let j=i+2; j<n; j++){
      const cx=cs[j];
      if(cx.h>=15&&cx.m>=15) break;
      const breaks = sig==='CE'?cx.close>bl:cx.close<bl;
      if(breaks){
        if(j===n-1) return {sig, px:cx.close};
        break; // breakout on past candle — skip pair
      }
    }
  }
  return null;
}

// Simulate one day — useFilter=true applies the day-open re-entry gate
function simulateDay(candles, useFilter) {
  const SL_T1=50, SL_RE=100;
  if(candles.length<2) return { pts:0, t1:false, re:false, reSkip:false };

  const dayOpen = candles[0].open;
  let phase='SCANNING';
  let t1Dir=null, t1Entry=0;
  let reDir=null, reEntry=0;
  let dayPts=0;
  let tookT1=false, tookRe=false, skippedRe=false;

  for(let i=1; i<candles.length; i++){
    const c=candles[i];
    const eod=(c.h===15&&c.m>=14)||c.h>15;

    if(phase==='SCANNING'){
      if(eod) break;
      const res=scan(candles.slice(0,i+1));
      if(res){ t1Dir=res.sig; t1Entry=res.px; phase='IN_T1'; tookT1=true; }
      continue;
    }

    if(phase==='IN_T1'){
      const t1Pts = t1Dir==='CE'?c.close-t1Entry:t1Entry-c.close;
      if(eod){ dayPts=t1Pts; break; }
      if(t1Pts<=-SL_T1){
        const slClose=c.close;
        dayPts=-SL_T1;
        reDir=t1Dir==='CE'?'PE':'CE';
        const moveAgainstRe = reDir==='CE'?slClose-dayOpen:dayOpen-slClose;
        if(useFilter && moveAgainstRe>=0){
          skippedRe=true; phase='DONE';
        } else {
          reEntry=slClose; phase='IN_RE'; tookRe=true;
        }
        continue;
      }
    }

    if(phase==='IN_RE'){
      const rePts = reDir==='CE'?c.close-reEntry:reEntry-c.close;
      if(eod){ dayPts+=rePts; break; }
      if(rePts<=-SL_RE){ dayPts+=(-SL_RE); phase='DONE'; continue; }
    }
  }

  return { pts:dayPts, tookT1, tookRe, skippedRe };
}

function runBacktest(allDates, byDay, useFilter) {
  let totalPts=0, winDays=0, lossDays=0, zeroDays=0;
  let equity=0, peak=0, maxDD=0;
  let t1Days=0, reDays=0, reSkipDays=0;
  const yearly={};

  for(const date of allDates){
    const yr=date.slice(0,4);
    if(!yearly[yr]) yearly[yr]={pts:0,win:0,loss:0};

    const {pts, tookT1, tookRe, skippedRe} = simulateDay(byDay[date], useFilter);
    totalPts+=pts;
    yearly[yr].pts+=pts;
    if(pts>0){winDays++;yearly[yr].win++;}
    else if(pts<0){lossDays++;yearly[yr].loss++;}
    else zeroDays++;
    if(tookT1) t1Days++;
    if(tookRe) reDays++;
    if(skippedRe) reSkipDays++;
    equity+=pts;
    if(equity>peak) peak=equity;
    if(peak-equity>maxDD) maxDD=peak-equity;
  }

  return {
    totalPts:    Math.round(totalPts),
    totalRs:     Math.round(totalPts*RS_PER_PT),
    winDays, lossDays, zeroDays,
    winDayPct:   ((winDays/allDates.length)*100).toFixed(1),
    maxDD:       Math.round(maxDD),
    maxDDRs:     Math.round(maxDD*RS_PER_PT),
    avgPerDay:   (totalPts/allDates.length).toFixed(2),
    days:        allDates.length,
    yearly
  };
}

// ══ TICK TRAIL ════════════════════════════════════════════════════════════════
// SL=100, BUF=25 (prev candle body breakout), Trail+Lock at peak≥50
// mode:
//   'one'      → 1 trade/day, no trail
//   'one_trail'→ 1 trade/day, trail+lock@50
//   'unlimited'→ unlimited re-entries, trail+lock@50
//   'hybrid'   → 1 trade + optional same-candle reverse if body past SL, trail+lock@50

function trailSL(entry, dir, peak) {
  const SL=100;
  if(peak<50) return dir==='CE' ? entry-SL : entry+SL;
  return dir==='CE' ? Math.max(entry-SL, entry+(peak-50))
                    : Math.min(entry+SL, entry-(peak-50));
}

function simulateTT(candles, mode) {
  const SL=100, BUF=25;
  if(candles.length<2) return {pts:0};
  const useTrail   = mode !== 'one';
  const unlimited  = mode === 'unlimited';
  const hybrid     = mode === 'hybrid';

  let inTrade=false, dir=null, entry=0, sl=0, peak=0;
  let done=false, dayPts=0;

  for(let i=1; i<candles.length; i++){
    const prev=candles[i-1], c=candles[i];
    const eod=(c.h===15&&c.m>=14)||c.h>15;

    if(inTrade){
      if(useTrail){
        const fav = dir==='CE' ? c.high-entry : entry-c.low;
        if(fav>peak) peak=fav;
        sl = trailSL(entry, dir, peak);
      }

      if(eod){
        dayPts += dir==='CE' ? c.close-entry : entry-c.close;
        break;
      }

      const slHit = dir==='CE' ? c.low<=sl : c.high>=sl;
      if(slHit){
        const exitPx = sl;
        dayPts += dir==='CE' ? exitPx-entry : entry-exitPx;
        inTrade=false; peak=0;

        // Hybrid reverse: body closes past SL → flip on same candle
        if(hybrid){
          const bodyPast = dir==='CE' ? c.close < sl : c.close > sl;
          if(bodyPast){
            dir = dir==='CE'?'PE':'CE';
            entry=c.close; peak=0;
            sl = dir==='CE' ? entry-SL : entry+SL;
            inTrade=true;
            done=true; // only 1 reverse allowed
            continue;
          }
        }

        if(!unlimited) done=true;
        continue;
      }

      // C1 early exit: close 3pts against
      const c1loss = dir==='CE' ? entry-c.close : c.close-entry;
      if(c1loss>=3){
        dayPts += dir==='CE' ? c.close-entry : entry-c.close;
        inTrade=false; peak=0;
        continue;
      }
    }

    if(!inTrade && !done){
      const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
      if(c.close > bH+BUF){
        dir='CE'; entry=c.close; sl=entry-SL; peak=0; inTrade=true;
        if(!unlimited && !hybrid) done=true;
      } else if(c.close < bL-BUF){
        dir='PE'; entry=c.close; sl=entry+SL; peak=0; inTrade=true;
        if(!unlimited && !hybrid) done=true;
      }
    }
  }
  return {pts: dayPts};
}

function runTTBacktest(allDates, byDay, mode) {
  let totalPts=0, winDays=0, lossDays=0, zeroDays=0;
  let equity=0, peak=0, maxDD=0;
  const yearly={};

  for(const date of allDates){
    const yr=date.slice(0,4);
    if(!yearly[yr]) yearly[yr]={pts:0};
    const {pts} = simulateTT(byDay[date], mode);
    totalPts+=pts;
    yearly[yr].pts+=pts;
    if(pts>0) winDays++;
    else if(pts<0) lossDays++;
    else zeroDays++;
    equity+=pts;
    if(equity>peak) peak=equity;
    if(peak-equity>maxDD) maxDD=peak-equity;
  }

  return {
    totalPts:  Math.round(totalPts),
    totalRs:   Math.round(totalPts*RS_PER_PT),
    winDays, lossDays, zeroDays,
    winDayPct: ((winDays/allDates.length)*100).toFixed(1),
    maxDD:     Math.round(maxDD),
    maxDDRs:   Math.round(maxDD*RS_PER_PT),
    avgPerDay: (totalPts/allDates.length).toFixed(2),
    days:      allDates.length,
    yearly
  };
}

async function main() {
  const allCandles = await fetchAll('2021-01-01','2026-05-13');
  const byDay      = groupByDay(allCandles);
  const allDates   = Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);
  console.log(`\nTotal trading days: ${allDates.length}  (Jan 2021 – May 2026)\n`);

  const strategies = [
    { name:'Amina (no filter)',            r: runBacktest(allDates, byDay, false) },
    { name:'Amina (with filter)',          r: runBacktest(allDates, byDay, true)  },
    { name:'TT unlimited+trail+lock50',    r: runTTBacktest(allDates, byDay, 'unlimited')  },
    { name:'TT hybrid rev+trail+lock50',   r: runTTBacktest(allDates, byDay, 'hybrid')     },
    { name:'TT 1trade+trail+lock50',       r: runTTBacktest(allDates, byDay, 'one_trail')  },
    { name:'TT 1trade plain SL100',        r: runTTBacktest(allDates, byDay, 'one')        },
  ];
  // sort by total pts descending
  strategies.sort((a,b)=>b.r.totalPts-a.r.totalPts);

  const SEP ='═'.repeat(100);
  const SEP2='─'.repeat(100);

  console.log(SEP);
  console.log('  5-YEAR STRATEGY COMPARISON  |  BankNifty 15-min  |  Jan 2021 – May 2026  |  Rs 15/pt');
  console.log(SEP);
  console.log(`  ${'#'.padEnd(2)}  ${'Strategy'.padEnd(26)}  ${'Total Pts'.padStart(10)}  ${'Total Rs'.padStart(14)}  ${'Win Days'.padStart(9)}  ${'Avg/day'.padStart(8)}  ${'MaxDD pts'.padStart(10)}  ${'MaxDD Rs'.padStart(12)}`);
  console.log(SEP2);

  strategies.forEach(({name, r}, i) => {
    const s  = r.totalPts>=0?'+':'';
    const av = Number(r.avgPerDay)>=0?'+'+r.avgPerDay:r.avgPerDay;
    console.log(
      `  ${String(i+1).padEnd(2)}  ${name.padEnd(26)}` +
      `  ${(s+r.totalPts.toLocaleString('en-IN')).padStart(10)}` +
      `  ${('Rs '+(s+Math.abs(r.totalRs).toLocaleString('en-IN'))).padStart(14)}` +
      `  ${(r.winDayPct+'%').padStart(9)}` +
      `  ${av.padStart(8)}` +
      `  ${('-'+r.maxDD).padStart(10)}` +
      `  ${('Rs-'+r.maxDDRs.toLocaleString('en-IN')).padStart(12)}`
    );
  });
  console.log(SEP);

  // Year-by-year table
  const years = Object.keys(strategies[0].r.yearly).sort();
  console.log('\n  YEAR-BY-YEAR BREAKDOWN (Total Rs per year)');
  console.log(SEP2);
  const nameHdr = strategies.map(s=>s.name.padEnd(22)).join('  ');
  console.log(`  ${'Year'.padEnd(6)}  ${nameHdr}`);
  console.log(SEP2);
  for(const yr of years){
    const cells = strategies.map(({r})=>{
      const pts=Math.round(r.yearly[yr]?.pts||0);
      const rs=Math.round(pts*RS_PER_PT);
      const s=rs>=0?'+':'';
      return (s+'Rs'+(Math.abs(rs)).toLocaleString('en-IN')).padEnd(22);
    }).join('  ');
    console.log(`  ${yr.padEnd(6)}  ${cells}`);
  }
  console.log(SEP+'\n');
}

main().catch(console.error);

// backtest_5yr_kite.js — BHAV V3 5-year backtest using live Kite candles
// Fetches Jan 2021–May 2026 in 60-day chunks, then runs EXACT same logic as backtest_bhav.js
'use strict';
const https = require('https');

const API_KEY      = '7an6kfp8opzq0zai';
const ACCESS_TOKEN = 'IHXLJ6ND5YBU7T7gRpEhJo4uy9F0wwUY';
const INSTRUMENT   = 260105;
const SL_PTS       = 150;
const TRAIL_GAP    = 20;
const PTS_PER_RS   = 15;

// ── helpers ──────────────────────────────────────────────────────────────
const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c) / rng(c) * 100 : 0;
const pdh  = cs => Math.max(...cs.map(c => c.high));
const pdl  = cs => Math.min(...cs.map(c => c.low));
const pdc  = cs => cs[cs.length - 1].close;
const firstBull   = (cs, from, t=30) => { for(let i=from;i<cs.length;i++) if(bp(cs[i])>t) return i; return -1; };
const firstBear   = (cs, from, t=30) => { for(let i=from;i<cs.length;i++) if(bp(cs[i])<-t) return i; return -1; };
const firstStrong = (cs, from, t=55) => { for(let i=from;i<cs.length;i++){const b=bp(cs[i]);if(Math.abs(b)>t)return{i,side:b>0?'CE':'PE'};} return null; };

function getCandles(from, to) {
  return new Promise((resolve, reject) => {
    const url = `https://api.kite.trade/instruments/historical/${INSTRUMENT}/15minute?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const opts = { headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` } };
    https.get(url, opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (j.status !== 'success') return reject(new Error(j.message || JSON.stringify(j).slice(0,100)));
          resolve(j.data.candles.map(c => ({ time:c[0], open:c[1], high:c[2], low:c[3], close:c[4] })));
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Fetch all candles from startDate to endDate in 55-day chunks
async function fetchAll(startDate, endDate) {
  const all = [];
  let cur = new Date(startDate);
  const end = new Date(endDate);
  let chunkNum = 0;
  while (cur < end) {
    const from = cur.toISOString().slice(0,10) + ' 09:15:00';
    const toDate = new Date(cur);
    toDate.setDate(toDate.getDate() + 55);
    if (toDate > end) toDate.setTime(end.getTime());
    const to = toDate.toISOString().slice(0,10) + ' 15:30:00';
    chunkNum++;
    process.stdout.write(`  Chunk ${chunkNum}: ${from.slice(0,10)} → ${to.slice(0,10)} ... `);
    const candles = await getCandles(from, to);
    process.stdout.write(`${candles.length} candles\n`);
    all.push(...candles);
    // small delay to avoid rate limit
    await new Promise(r => setTimeout(r, 300));
    cur = new Date(toDate);
    cur.setDate(cur.getDate() + 1);
  }
  return all;
}

// ── entry logic (exact copy from backtest_bhav.js) ───────────────────────
function findEntry(candles, prevCandles) {
  if (!candles || candles.length < 2 || !prevCandles || prevCandles.length === 0) return {entry:null,ctx:'?',reason:'no_prev'};
  const PH = pdh(prevCandles), PL = pdl(prevCandles), PC = pdc(prevCandles);
  const C0 = candles[0];
  const gap = C0.open - PC, vsPDH = C0.open - PH, vsPDL = C0.open - PL;
  const ctx = vsPDH > 120 ? 'ABOVE_PDH' : vsPDL < 0 ? 'BELOW_PDL' : 'INSIDE';
  const C0bp = bp(C0), C1bp = candles[1] ? bp(candles[1]) : 0;
  const bps4 = candles.slice(0,Math.min(4,candles.length)).map(bp);
  let wipsaws = 0;
  for(let i=1;i<bps4.length;i++) if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65) wipsaws++;
  if(wipsaws>=2) return {entry:null,ctx,reason:'whipsaw'};

  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000) return {entry:{idx:0,side:'CE'},ctx,reason:'extraordinary_gap_ce'};
    if(C0bp<-20) return {entry:{idx:0,side:'PE'},ctx,reason:'above_pdh_c0_reversal_pe'};
    const bearIdx=firstBear(candles,1,35);
    if(bearIdx>0&&bearIdx<=7) return {entry:{idx:bearIdx,side:'PE'},ctx,reason:'above_pdh_delayed_pe'};
    const contIdx=firstStrong(candles,2,55);
    if(contIdx) return {entry:{idx:contIdx.i,side:contIdx.side},ctx,reason:'above_pdh_continuation'};
    return {entry:null,ctx,reason:'above_pdh_no_signal'};
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-65) return {entry:null,ctx,reason:'selling_climax_skip'};
    if(C0bp>65){const i=firstBear(candles,1,30);if(i>0) return {entry:{idx:i,side:'PE'},ctx,reason:'recovery_bounce_pe'};}
    if(C0.high<PL){
      if(C1bp>20) return {entry:{idx:1,side:'CE'},ctx,reason:'below_pdl_c1_bull_ce'};
      if(C1bp<-20) return {entry:{idx:0,side:'PE'},ctx,reason:'below_pdl_no_recovery_pe'};
      const s=firstStrong(candles,2,40); if(s&&s.i<=5) return {entry:{idx:s.i,side:s.side},ctx,reason:'below_pdl_c2_signal'};
      return {entry:null,ctx,reason:'below_pdl_no_c1_signal'};
    }
    if(C0bp>20){const i=firstBear(candles,1,30);if(i>0&&i<=6) return {entry:{idx:i,side:'PE'},ctx,reason:'below_pdl_partial_bounce_pe'};}
    if(C0bp<-10){for(let i=2;i<=Math.min(7,candles.length-2);i++) if(bp(candles[i])<-45&&candles[i-1].close<PL) return {entry:{idx:i,side:'PE'},ctx,reason:'below_pdl_failed_bounce_pe'};}
    return {entry:null,ctx,reason:'below_pdl_ambiguous_avoid'};
  }
  // INSIDE
  if(C0.close<PL) return {entry:{idx:0,side:'PE'},ctx,reason:'inside_c0_breaks_below_pdl'};
  if(C0.close>PH) return {entry:{idx:0,side:'CE'},ctx,reason:'inside_c0_breaks_above_pdh'};
  const gapUp=gap>50,gapDown=gap<-50;
  if(Math.abs(C0bp)>55){
    const c0isBull=C0bp>0,aligned=(c0isBull&&!gapDown)||(!c0isBull&&!gapUp);
    if(aligned){
      if(C1bp*C0bp<0&&Math.abs(C1bp)>65) return {entry:{idx:1,side:C1bp>0?'CE':'PE'},ctx,reason:'inside_c0_trap_c1_signal'};
      return {entry:{idx:0,side:c0isBull?'CE':'PE'},ctx,reason:'inside_c0_momentum'};
    } else {
      const gapSide=gapUp?'CE':'PE',revCandle=gapUp?firstBull(candles,1,35):firstBear(candles,1,35);
      if(revCandle>0&&revCandle<=5) return {entry:{idx:revCandle,side:gapSide},ctx,reason:'inside_counter_gap_reversal'};
      return {entry:{idx:0,side:c0isBull?'CE':'PE'},ctx,reason:'inside_c0_momentum_no_reversal'};
    }
  }
  if(Math.abs(C0bp)>30){
    if(C1bp*C0bp>0) return {entry:{idx:0,side:C0bp>0?'CE':'PE'},ctx,reason:'inside_c0_moderate_c1_confirmed'};
    if(Math.abs(C1bp)>65&&C1bp*C0bp<0&&candles.length>2){const C2bp=bp(candles[2]);if(C2bp*C0bp>0&&Math.abs(C2bp)>20) return {entry:{idx:0,side:C0bp>0?'CE':'PE'},ctx,reason:'inside_c0_c1_fake_c2_confirms'};}
  }
  for(let i=2;i<=4;i++){
    if(i>=candles.length) break;
    const cbp=bp(candles[i]);
    if(Math.abs(cbp)>55){
      const signalBull=cbp>0,oppGap=(signalBull&&gapDown)||(!signalBull&&gapUp),c0ModOpp=(signalBull&&C0bp<-20)||(!signalBull&&C0bp>20);
      if(oppGap&&c0ModOpp) continue;
      const prev=bp(candles[i-1]);
      if(Math.abs(prev)>60&&prev*cbp<0&&i+1<candles.length&&bp(candles[i+1])*cbp<0&&Math.abs(bp(candles[i+1]))>60)
        return {entry:null,ctx,reason:'inside_whipsaw_c1c2'};
      return {entry:{idx:i,side:cbp>0?'CE':'PE'},ctx,reason:`inside_c${i}_strong`};
    }
  }
  for(let i=5;i<Math.min(candles.length,21);i++){
    const prevClose=candles[i-1].close;
    if(candles[i].low<=PL&&prevClose>PL&&bp(candles[i])>35) return {entry:{idx:i,side:'CE'},ctx,reason:'inside_pdl_test_ce'};
    if(candles[i].high>=PH&&prevClose<PH&&bp(candles[i])<-35) return {entry:{idx:i,side:'PE'},ctx,reason:'inside_pdh_test_pe'};
  }
  return {entry:null,ctx,reason:'inside_no_signal'};
}

// ── calcPL (LOCK20 candle-close trail — exact from backtest_bhav.js) ─────
function calcPL(candles, entryIdx, side) {
  const ep=candles[entryIdx].close, sign=side==='CE'?1:-1;
  let trailStop=-SL_PTS, peakPts=0;
  for(let i=entryIdx+1;i<candles.length;i++){
    const c=candles[i];
    const favPts=side==='CE'?(c.high-ep):(ep-c.low);
    if(favPts>peakPts){peakPts=favPts;trailStop=peakPts>=TRAIL_GAP?peakPts-TRAIL_GAP:-SL_PTS;}
    const closePts=sign*(c.close-ep);
    if(closePts<=trailStop){
      return {pl:trailStop*PTS_PER_RS,peakPts,exitIdx:i,exitType:trailStop<=0?'SL':'TRAIL',ep,exitPrice:ep+sign*trailStop};
    }
    const t=new Date(c.time);
    if(t.getHours()>=15&&t.getMinutes()>=14){
      return {pl:sign*(c.close-ep)*PTS_PER_RS,peakPts,exitIdx:i,exitType:'EOD',ep,exitPrice:c.close};
    }
  }
  const last=candles[candles.length-1];
  return {pl:sign*(last.close-ep)*PTS_PER_RS,peakPts,exitIdx:candles.length-1,exitType:'EOD',ep,exitPrice:last.close};
}

// ── findReEntry (exact from backtest_bhav.js — threshold 35%) ────────────
function findReEntry(candles, exitIdx, side) {
  const maxCandle=candles.length-3;
  for(let i=exitIdx+1;i<=maxCandle;i++){
    const b=bp(candles[i]);
    if(side==='CE'&&b>35) return i;
    if(side==='PE'&&b<-35) return i;
  }
  return -1;
}

// ── process one day (exact re-entry structure from backtest_bhav.js) ─────
function processDay(cs, prev, date) {
  const {entry, ctx, reason} = findEntry(cs, prev);
  if(!entry) return {date,ctx,reason,traded:false,pl:0,wins:0,losses:0,trades:0};

  const res1=calcPL(cs,entry.idx,entry.side);
  const {pl,exitIdx,exitType,peakPts}=res1;
  let rePL=0, curExitIdx=exitIdx, curExitType=exitType, curPL=pl, curSide=entry.side;

  // Reverse RE after big T1
  if(peakPts>=100&&exitType!=='EOD'&&pl>0){
    const revSide=entry.side==='CE'?'PE':'CE';
    let revIdx=-1;
    for(let i=exitIdx+1;i<=cs.length-3;i++){
      const b=bp(cs[i]);
      if((revSide==='CE'&&b>65)||(revSide==='PE'&&b<-65)){revIdx=i;break;}
    }
    const sameReFirst=findReEntry(cs,exitIdx,entry.side);
    if(revIdx>0&&(sameReFirst<0||revIdx<sameReFirst)){
      const resRev=calcPL(cs,revIdx,revSide);
      rePL+=resRev.pl; curExitIdx=resRev.exitIdx; curExitType=resRev.exitType; curPL=resRev.pl; curSide=revSide;
    }
  }

  // Up to 3 same-dir REs
  for(let re=0;re<3;re++){
    if(curExitType!=='EOD'&&curPL>0){
      const reIdx=findReEntry(cs,curExitIdx,curSide);
      if(reIdx>0){
        const resRE=calcPL(cs,reIdx,curSide);
        rePL+=resRE.pl; curExitIdx=resRE.exitIdx; curExitType=resRE.exitType; curPL=resRE.pl;
      } else break;
    } else break;
  }

  // Post-loop reverse check
  if(curSide===entry.side&&curExitType!=='EOD'&&curPL>0){
    const revSide2=curSide==='CE'?'PE':'CE';
    let rev2Idx=-1;
    for(let i=curExitIdx+1;i<=cs.length-3;i++){
      const b=bp(cs[i]);
      if((revSide2==='CE'&&b>65)||(revSide2==='PE'&&b<-65)){rev2Idx=i;break;}
    }
    if(rev2Idx>0){
      const resRev2=calcPL(cs,rev2Idx,revSide2);
      rePL+=resRev2.pl; curExitIdx=resRev2.exitIdx; curExitType=resRev2.exitType; curPL=resRev2.pl; curSide=revSide2;
      for(let re=0;re<2;re++){
        if(curExitType!=='EOD'&&curPL>0){
          const reIdx2=findReEntry(cs,curExitIdx,curSide);
          if(reIdx2>0){
            const resRE2=calcPL(cs,reIdx2,curSide);
            rePL+=resRE2.pl; curExitIdx=resRE2.exitIdx; curExitType=resRE2.exitType; curPL=resRE2.pl;
          } else break;
        } else break;
      }
    }
  }

  const totalPL=pl+rePL;
  return {date,ctx,reason,entry:entry.side,traded:true,pl:totalPL,t1pl:pl,rePL,wins:totalPL>0?1:0,losses:totalPL<=0?1:0,trades:1};
}

// ── main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('Fetching 5yr BANKNIFTY 15-min candles from Kite (Jan 2021 – May 2026)...');
  const allCandles = await fetchAll('2020-12-28', '2026-05-25');
  console.log(`\nTotal candles: ${allCandles.length}`);

  // Group by date
  const byDate={};
  for(const c of allCandles){
    const d=c.time.slice(0,10);
    if(!byDate[d]) byDate[d]=[];
    byDate[d].push(c);
  }
  const dates=Object.keys(byDate).sort();
  console.log(`Trading days: ${dates.length}`);

  // Run backtest for Jan 2021 onwards
  let totalPL=0,wins=0,losses=0,noSignal=0,traded=0;
  const monthly={}, yearly={};

  for(let i=1;i<dates.length;i++){
    const date=dates[i];
    if(date<'2021-01-01') continue;
    const cs=byDate[date], prev=byDate[dates[i-1]];
    if(!prev||prev.length===0) continue;

    const r=processDay(cs,prev,date);
    const ym=date.slice(0,7),yr=date.slice(0,4);
    if(!monthly[ym]) monthly[ym]=0;
    if(!yearly[yr])  yearly[yr]=0;

    if(!r.traded){noSignal++;}
    else {
      traded++;
      totalPL+=r.pl;
      monthly[ym]+=r.pl;
      yearly[yr]+=r.pl;
      if(r.pl>0) wins++;
      else losses++;
    }
  }

  const tradeDays=wins+losses;
  const wr=(wins/tradeDays*100).toFixed(1);

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  BHAV V3 — 5 YEAR BACKTEST (Live Kite Candles)');
  console.log('  Jan 2021 – May 2026');
  console.log('══════════════════════════════════════════════════════');
  console.log(`  Traded days  : ${traded}  |  No signal: ${noSignal}`);
  console.log(`  Win days     : ${wins} / ${tradeDays}  (${wr}% WR)`);
  console.log(`  Loss days    : ${losses}`);
  console.log(`  Total P&L    : Rs ${(totalPL/100000).toFixed(2)}L  (${totalPL>=0?'+':''}Rs ${Math.round(totalPL).toLocaleString()})`);

  console.log('\n  YEARLY BREAKDOWN:');
  for(const yr of Object.keys(yearly).sort()){
    const inL=(yearly[yr]/100000).toFixed(2);
    console.log(`    ${yr}: Rs ${inL}L  (${yearly[yr]>=0?'+':''}Rs ${Math.round(yearly[yr]).toLocaleString()})`);
  }

  console.log('\n  MONTHLY BREAKDOWN (2026):');
  for(const ym of Object.keys(monthly).sort().filter(m=>m.startsWith('2026'))){
    const inL=(monthly[ym]/100000).toFixed(2);
    console.log(`    ${ym}: Rs ${inL}L  (${monthly[ym]>=0?'+':''}Rs ${Math.round(monthly[ym]).toLocaleString()})`);
  }
  console.log('══════════════════════════════════════════════════════');

  console.log('\n  COMPARISON WITH CACHED BACKTEST:');
  console.log('  Cache result: Rs 31.07L  |  74.6% WR');
  console.log(`  Live  result: Rs ${(totalPL/100000).toFixed(2)}L  |  ${wr}% WR`);
  console.log(`  Difference  : Rs ${((totalPL-3107000)/100000).toFixed(2)}L`);
  console.log('══════════════════════════════════════════════════════');
}

main().catch(e=>{console.error('ERROR:',e.message||e);process.exit(1);});

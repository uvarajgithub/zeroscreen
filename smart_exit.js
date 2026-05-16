'use strict';
require('dotenv').config({ path: '/home/ubuntu/trading-bot/.env' });
const https = require('https');
const API_KEY = process.env.API_KEY, ACCESS_TOKEN = process.env.ACCESS_TOKEN;

function kiteGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.kite.trade', path,
      headers: { 'X-Kite-Version': '3', 'Authorization': `token ${API_KEY}:${ACCESS_TOKEN}` },
      timeout: 30000
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{ try{resolve(JSON.parse(d))}catch(e){reject(e)} }); });
    req.on('error', reject); req.on('timeout', ()=>{req.destroy();reject(new Error('timeout'))}); req.end();
  });
}
function fetchCandles(from, to) {
  const f=encodeURIComponent(from+' 09:15:00'), t2=encodeURIComponent(to+' 15:30:00');
  return kiteGet(`/instruments/historical/260105/15minute?from=${f}&to=${t2}&continuous=0&oi=0`);
}
function mv(sig,e,p){ return sig==='CE'?p-e:e-p; }

function findC1C2(cs) {
  for (let i=0;i<cs.length-1;i++) {
    const ca=cs[i],cb=cs[i+1]; let sig=null,bl=null;
    const bullA=ca.close>=ca.open, bullB=cb.close>=cb.open;
    const bodyA=Math.abs(ca.close-ca.open), bodyB=Math.abs(cb.close-cb.open);
    const bhA=Math.max(ca.open,ca.close), blA=Math.min(ca.open,ca.close);
    const bhB=Math.max(cb.open,cb.close), blB=Math.min(cb.open,cb.close);
    if (bullA===bullB){ sig=bullA?'CE':'PE'; bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low); }
    else if (bodyB>bodyA){ sig=bullB?'CE':'PE'; bl=sig==='CE'?Math.max(bhA,bhB):Math.min(blA,blB); }
    else continue;
    for (let j=i+2;j<cs.length;j++){
      if (sig==='CE'&&cs[j].close>bl) return {sig,px:cs[j].close,idx:j};
      if (sig==='PE'&&cs[j].close<bl) return {sig,px:cs[j].close,idx:j};
    }
  }
  return null;
}

// isOpposingCandle: candle moves against our position
function isOpposing(sig, c){ return sig==='CE' ? c.close<c.open : c.close>c.open; }
function candleBody(c){ return Math.abs(c.close-c.open); }

// ─── simulate with smart exit rules ───
// opts:
//   slT1         : stop loss (default 50)
//   profitTrigger: min profit (pts) before reversal monitoring starts
//   revBodyAbs   : exit if single opposing candle body > this (pts)
//   revBodyPct   : exit if single opposing candle body > (peak * revBodyPct)
//   consec       : exit if N consecutive opposing candles after profit (0=off)
//   reEntryVMT   : use VMT re-entry filter after SL
function simulate(cs, opts={}) {
  const { slT1=50, profitTrigger=200, revBodyAbs=0, revBodyPct=0, consec=0, reEntryVMT=true } = opts;
  if (!cs||cs.length<3) return null;
  const dayOpen=cs[0].open, last=cs[cs.length-1].close;
  const entry=findC1C2(cs);
  if (!entry) return null;

  let slHit=false, sIdx=null, sPx=null;
  let peak=0, consecCount=0;
  let exitIdx=null, exitPts=null, exitReason='EOD';

  for (let i=entry.idx+1; i<cs.length; i++) {
    const c=cs[i];
    const pts=mv(entry.sig, entry.px, c.close);

    // Update peak
    if (pts>peak) { peak=pts; consecCount=0; }

    // Rule 2: T1 SL (always active)
    if (pts<=-slT1){ slHit=true; sIdx=i; sPx=c.close; exitPts=-slT1; exitReason='T1_SL'; break; }

    // Rule 1: Smart exit — only after profit threshold reached
    if (peak>=profitTrigger) {
      const opp=isOpposing(entry.sig, c);
      const body=candleBody(c);

      // Check: single big reversal candle
      if (revBodyAbs>0 && opp && body>=revBodyAbs && pts>0) {
        exitIdx=i; exitPts=pts; exitReason=`REV_CANDLE_body=${Math.round(body)}`; break;
      }
      // Check: reversal candle body > % of peak
      if (revBodyPct>0 && opp && body>=peak*revBodyPct && pts>0) {
        exitIdx=i; exitPts=pts; exitReason=`REV_PCT_body=${Math.round(body)}(${Math.round(body/peak*100)}%ofpeak)`; break;
      }
      // Check: N consecutive opposing candles
      if (consec>0) {
        if (opp) consecCount++; else consecCount=0;
        if (consecCount>=consec && pts>0) {
          exitIdx=i; exitPts=pts; exitReason=`CONSEC_${consec}`; break;
        }
      }
    }
  }

  let t1pts = exitPts!==null ? exitPts : mv(entry.sig, entry.px, last);
  let repts=0;

  if (slHit) {
    const rs=entry.sig==='CE'?'PE':'CE';
    const mar=rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
    if (!reEntryVMT||mar<0) {
      repts=mv(rs,sPx,last);
      for (let i=sIdx+1;i<cs.length;i++) if(mv(rs,sPx,cs[i].close)<=-100){repts=-100;break;}
    }
  }

  return { entry, slHit, peak:Math.round(peak), exitReason, t1pts:Math.round(t1pts), repts:Math.round(repts), total:Math.round(t1pts+repts) };
}

function splitDays(candles){
  const days={};
  for(const c of candles){
    const d=c[0].slice(0,10);
    if(!days[d]) days[d]=[];
    days[d].push({ts:c[0].slice(11,16),open:c[1],high:c[2],low:c[3],close:c[4]});
  }
  return days;
}
async function runYear(year){
  const chunks=[];
  for(let m=0;m<12;m+=2){
    const from=new Date(year,m,1),to=new Date(year,m+2,1); to.setDate(to.getDate()-1);
    const r=await fetchCandles(from.toISOString().slice(0,10),to.toISOString().slice(0,10));
    if(r.status==='success') chunks.push(...r.data.candles);
    await new Promise(res=>setTimeout(res,300));
  }
  return splitDays(chunks);
}

async function main(){
  const YEARS=[2021,2022,2023,2024,2025];
  const allDays=[];
  for(const yr of YEARS){
    process.stdout.write(`Fetching ${yr}... `);
    const days=await runYear(yr);
    for(const [date,cs] of Object.entries(days).sort()){
      if(cs.length<10) continue;
      const dayClose=cs[cs.length-1].close;
      const netMove=Math.abs(dayClose-cs[0].open);
      allDays.push({date,cs,netMove,dir:dayClose>=cs[0].open?'UP':'DN'});
    }
    console.log(`${Object.keys(days).length} days`);
  }

  const RS=15;
  // ─── Define variants ───
  const variants=[
    { name:'A. Current (EOD SL50)',           slT1:50, profitTrigger:9999, revBodyAbs:0,   revBodyPct:0,    consec:0 },
    // Single big reversal candle — absolute body threshold
    { name:'B. Rev candle >300pts',           slT1:50, profitTrigger:200,  revBodyAbs:300, revBodyPct:0,    consec:0 },
    { name:'C. Rev candle >400pts',           slT1:50, profitTrigger:200,  revBodyAbs:400, revBodyPct:0,    consec:0 },
    { name:'D. Rev candle >500pts',           slT1:50, profitTrigger:200,  revBodyAbs:500, revBodyPct:0,    consec:0 },
    // Proportional — body > X% of peak profit (adaptive to position size)
    { name:'E. Rev body >30% of peak',        slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0.30, consec:0 },
    { name:'F. Rev body >40% of peak',        slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0.40, consec:0 },
    { name:'G. Rev body >50% of peak',        slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0.50, consec:0 },
    // Trigger only at higher profit (don't exit small profitable moves)
    { name:'H. Rev >40% peak, trig500',       slT1:50, profitTrigger:500,  revBodyAbs:0,   revBodyPct:0.40, consec:0 },
    { name:'I. Rev >40% peak, trig300',       slT1:50, profitTrigger:300,  revBodyAbs:0,   revBodyPct:0.40, consec:0 },
    // Consecutive candles reversal
    { name:'J. 3 consec rev, trig200',        slT1:50, profitTrigger:200,  revBodyAbs:0,   revBodyPct:0,    consec:3 },
    { name:'K. 2 consec rev, trig300',        slT1:50, profitTrigger:300,  revBodyAbs:0,   revBodyPct:0,    consec:2 },
  ];

  const results=variants.map(v=>({...v,total:0,days:0,wins:0,losses:0,revExits:0}));
  for(const d of allDays){
    for(let vi=0;vi<variants.length;vi++){
      const s=simulate(d.cs,variants[vi]);
      if(!s) continue;
      const r=results[vi];
      r.days++; r.total+=s.total;
      if(s.total>0) r.wins++; else if(s.total<0) r.losses++;
      if(s.exitReason!=='EOD'&&s.exitReason!=='T1_SL') r.revExits++;
    }
  }

  const base=results[0].total;
  console.log('\n'+'='.repeat(95));
  console.log('5-YEAR P&L — Smart Reversal Exit (Rule 1: max profit | Rule 2: SL50 unchanged)');
  console.log('='.repeat(95));
  console.log(`${'Variant'.padEnd(30)} ${'TotalPts'.padStart(9)} ${'₹ P&L'.padStart(12)} ${'W'.padStart(5)} ${'L'.padStart(5)} ${'RevExits'.padStart(9)}  vs Current`);
  console.log('-'.repeat(95));
  for(const r of results){
    const diff=r.total-base;
    const vs=diff>0?`▲+${Math.round(diff)}pts ₹+${Math.round(diff)*RS}`:diff<0?`▼${Math.round(diff)}pts ₹${Math.round(diff)*RS}`:'(baseline)';
    console.log(`${r.name.padEnd(30)} ${String(Math.round(r.total)).padStart(9)} ${('₹'+(Math.round(r.total)*RS)).padStart(12)} ${String(r.wins).padStart(5)} ${String(r.losses).padStart(5)} ${String(r.revExits).padStart(9)}  ${vs}`);
  }

  // ─── Top 10 move days: show exit point and P&L for each variant ───
  allDays.sort((a,b)=>b.netMove-a.netMove);
  const top10=allDays.slice(0,10);

  console.log('\n'+'='.repeat(110));
  console.log('TOP 10 BIGGEST MOVE DAYS — Exit Comparison');
  console.log('='.repeat(110));
  // Show A, B, C, F, H for comparison
  const showV=[0,1,2,5,7]; // indices into variants
  console.log(`${'Date'.padEnd(12)} ${'Dir'.padEnd(4)} ${'NetMv'.padStart(6)} ${'Peak'.padStart(6)}  ${showV.map(i=>variants[i].name.slice(0,12).padStart(13)).join('  ')}`);
  console.log('-'.repeat(110));
  for(const d of top10){
    const sims=variants.map(v=>simulate(d.cs,v));
    const peakA=sims[0]?sims[0].peak:0;
    const cols=showV.map(i=>{
      const s=sims[i]; if(!s) return '             ';
      const pct=Math.round(s.total/d.netMove*100);
      const flag=s.total>sims[0].total?'★':'';
      return (flag+s.total+'pts('+pct+'%)').padStart(13);
    }).join('  ');
    console.log(`${d.date.padEnd(12)} ${d.dir.padEnd(4)} ${Math.round(d.netMove).toString().padStart(6)} ${String(peakA).padStart(6)}  ${cols}`);
  }

  // ─── Deep dive: Jun 4 candle-by-candle for best variants ───
  const elec=allDays.find(d=>d.date==='2024-06-04');
  if(elec){
    console.log('\n'+'='.repeat(100));
    console.log(`CANDLE DEEP DIVE: 2024-06-04 — DN ${Math.round(elec.netMove)}pts  (Rule 1 test)`);
    console.log('='.repeat(100));
    const simA=simulate(elec.cs,variants[0]);
    const simB=simulate(elec.cs,variants[1]);
    const simC=simulate(elec.cs,variants[2]);
    const simF=simulate(elec.cs,variants[5]);
    console.log(`${'Time'.padEnd(6)} ${'Close'.padStart(9)} ${'Dir'.padEnd(4)} ${'Body'.padStart(5)}  ${'A.EOD'.padStart(9)} ${'B.Rev300'.padStart(9)} ${'C.Rev400'.padStart(9)} ${'F.40%pk'.padStart(9)}`);
    console.log('-'.repeat(100));
    const e=simA.entry;
    for(let i=0;i<elec.cs.length;i++){
      const c=elec.cs[i];
      const dir=c.close>=c.open?'▲ BUL':'▼ BEA';
      const body=Math.round(candleBody(c));
      const fmtPts=(s,pts)=>{
        if(i<s.entry.idx) return '         -';
        if(i===s.entry.idx) return '  [ENTRY]  ';
        const p=mv(s.entry.sig,s.entry.px,c.close);
        return ((p>=0?'+':'')+Math.round(p)+'pts').padStart(9);
      };
      const exitMark=(s,i)=>{
        if(s.slHit&&i===s.sIdx) return ' ←SL';
        return '';
      };
      console.log(`${c.ts.padEnd(6)} ${String(c.close).padStart(9)} ${dir}  ${String(body).padStart(5)}  ${fmtPts(simA,i)}${exitMark(simA,i)}  ${fmtPts(simB,i)}${exitMark(simB,i)}  ${fmtPts(simC,i)}${exitMark(simC,i)}  ${fmtPts(simF,i)}${exitMark(simF,i)}`);
      // Mark exit points
      if(simB.exitReason&&simB.exitReason.startsWith('REV')&&i===simB.exitIdx) process.stdout.write('  ← B EXITS here\n');
      if(simC.exitReason&&simC.exitReason.startsWith('REV')&&i===simC.exitIdx) process.stdout.write('  ← C EXITS here\n');
      if(simF.exitReason&&simF.exitReason.startsWith('REV')&&i===simF.exitIdx) process.stdout.write('  ← F EXITS here\n');
    }
    console.log('');
    for(const [label,s] of [['A. Current EOD',simA],['B. Rev candle>300',simB],['C. Rev candle>400',simC],['F. Rev 40% peak',simF]]){
      console.log(`  ${label.padEnd(20)}: peak=+${s.peak}pts  exit=${s.exitReason.padEnd(25)}  TOTAL: ${s.total}pts ₹${s.total*RS}  (${Math.round(s.total/elec.netMove*100)}% of ${Math.round(elec.netMove)}pt day)`);
    }
  }

  // ─── Feb 1, 2021 (budget day) — ensure we don't exit too early ───
  const bdgt=allDays.find(d=>d.date==='2021-02-01');
  if(bdgt){
    console.log('\n'+'='.repeat(80));
    console.log(`CANDLE DEEP DIVE: 2021-02-01 — UP ${Math.round(bdgt.netMove)}pts  (Rule 1 must NOT exit early)`);
    console.log('='.repeat(80));
    for(const vi of showV){
      const s=simulate(bdgt.cs,variants[vi]);
      if(!s) continue;
      console.log(`  ${variants[vi].name.padEnd(30)}: peak=+${s.peak}pts  exit=${s.exitReason.padEnd(25)}  TOTAL: ${s.total}pts ₹${s.total*RS}  (${Math.round(s.total/bdgt.netMove*100)}%)`);
    }
  }

  // Best variant recommendation
  console.log('\n'+'='.repeat(80));
  console.log('RECOMMENDATION — Best variant by 5-year P&L');
  console.log('='.repeat(80));
  const sorted=[...results].sort((a,b)=>b.total-a.total);
  for(let i=0;i<5;i++){
    const r=sorted[i];
    const diff=r.total-base;
    console.log(`  #${i+1} ${r.name.padEnd(32)} ₹${Math.round(r.total)*RS}  (${diff>=0?'+':''}${Math.round(diff)}pts vs current)`);
  }
}
main().catch(e=>console.error('FATAL:',e.message));

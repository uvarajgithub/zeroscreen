// ============================================================
//  VARIANT B COMPLETE BACKTEST
//  Config: AMINA signal | Trail=100 | Buffer=25 | RE=opposite
//  Uses EXACT same logic as backtest_improve5yr.js (verified match)
//  Shows: Monthly P&L, Win/Loss, Max DD, All stats
// ============================================================
const fs = require('fs');

const RS = 15;          // Rs per point (30 qty × 0.5 delta)
const SL_INITIAL = 60;  // initial SL in pts
const TRAIL_GAP  = 100; // trail gap
const BUFFER     = 25;  // close must be 25pt beyond SL
const USE_RE     = true;

// ── Load cache (same as backtest_improve5yr.js) ──────────────
const raw = JSON.parse(fs.readFileSync('/home/ubuntu/trading-bot/research-candles-cache.json','utf8'));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString('en-US',{timeZone:'Asia/Kolkata'}));
  const date = ist.getFullYear()+'-'+String(ist.getMonth()+1).padStart(2,'0')+'-'+String(ist.getDate()).padStart(2,'0');
  return {date,h:ist.getHours(),m:ist.getMinutes(),open:c.open,high:c.high,low:c.low,close:c.close};
}).filter(c=>c.close>0);

const byDay={};
for(const c of candles){if(!byDay[c.date])byDay[c.date]=[];byDay[c.date].push(c);}
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=5);

// ── EXACT same helpers as backtest_improve5yr.js ─────────────
const isEOD = c => c.h>15||(c.h===15&&c.m>=14);

function enrich(c){
  const bull=c.close>=c.open;const bh=Math.max(c.open,c.close);const bl=Math.min(c.open,c.close);
  return Object.assign({},c,{bull,body_high:bh,body_low:bl,body_size:bh-bl});
}

function rollingEntryScan(cs){
  for(let i=0;i<cs.length-1;i++){
    const ca=cs[i],cb=cs[i+1];let sig=null,c2l=0,c3l=0;
    if(ca.bull===cb.bull){sig=ca.bull?'CE':'PE';c2l=sig==='CE'?ca.high:ca.low;c3l=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);}
    else if(cb.body_size>ca.body_size){sig=cb.bull?'CE':'PE';c2l=sig==='CE'?ca.body_high:ca.body_low;c3l=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);}
    else continue;
    if(sig==='CE'&&cb.close>c2l)return{sig,entryIdx:i+1};
    if(sig==='PE'&&cb.close<c2l)return{sig,entryIdx:i+1};
    for(let j=i+2;j<cs.length;j++){const c=cs[j];if(sig==='CE'&&c.close>c3l)return{sig,entryIdx:j};if(sig==='PE'&&c.close<c3l)return{sig,entryIdx:j};}
  }
  return null;
}

function simLeg(cs, startIdx, dir, trailGap, buffer){
  const entry=cs[startIdx].close;
  let sl=dir==='CE'?entry-SL_INITIAL:entry+SL_INITIAL;
  let peak=0;
  for(let idx=startIdx+1;idx<cs.length;idx++){
    const c=cs[idx];
    if(isEOD(c))return {pts:dir==='CE'?c.close-entry:entry-c.close,type:'EOD',exitIdx:idx};
    const ib=dir==='CE'?c.high-entry:entry-c.low;
    if(ib>peak)peak=ib;
    if(peak>=SL_INITIAL){const locked=Math.max(0,peak-trailGap);if(dir==='CE')sl=Math.max(sl,entry+locked);else sl=Math.min(sl,entry-locked);}
    const intraTouched=dir==='CE'?c.low<=sl:c.high>=sl;
    const margin=dir==='CE'?sl-c.close:c.close-sl;
    if(intraTouched&&margin>=buffer)return {pts:dir==='CE'?sl-entry:entry-sl,type:'SL',exitIdx:idx};
  }
  const last=cs[cs.length-1];
  return {pts:dir==='CE'?last.close-entry:entry-last.close,type:'EOD',exitIdx:cs.length-1};
}

// ── Simulate one day ─────────────────────────────────────────
function simDay(rawcs){
  const cs=rawcs.map(enrich);
  for(let idx=0;idx<cs.length;idx++){
    if(isEOD(cs[idx]))break;
    const res=rollingEntryScan(cs.slice(0,idx+1));
    if(!res||res.entryIdx!==idx)continue;
    const t1=simLeg(cs,idx,res.sig,TRAIL_GAP,BUFFER);
    let rePts=0;
    if(USE_RE&&t1.type==='SL'){
      const reDir=res.sig==='CE'?'PE':'CE';
      const re=simLeg(cs,t1.exitIdx,reDir,TRAIL_GAP,BUFFER);
      rePts=re.pts;
    }
    const total=t1.pts+rePts;
    return {pts:total, win:total>0?1:0, loss:total<0?1:0};
  }
  return {pts:0,win:0,loss:0};
}

const dates = allDates;

// ── Run all dates ─────────────────────────────────────────────
const monthly  = {}; // "YYYY-MM" -> {pts, wins, losses, days}
const yearly   = {}; // "YYYY"    -> {pts, wins, losses, days}
const allDays  = []; // [{date, pts, running}]

let runningPts = 0;
let peakRun    = 0;
let maxDD      = 0;

for(const date of dates){
  const cs = byDay[date];
  if(!cs || cs.length < 4) continue;

  const {pts, win, loss} = simDay(cs);
  runningPts += pts;

  if(runningPts > peakRun) peakRun = runningPts;
  const dd = (peakRun - runningPts) * RS;
  if(dd > maxDD) maxDD = dd;

  allDays.push({date, pts, running: runningPts});

  const ym = date.slice(0,7);
  const yr = date.slice(0,4);
  if(!monthly[ym]) monthly[ym] = {pts:0, wins:0, losses:0, days:0};
  if(!yearly[yr])  yearly[yr]  = {pts:0, wins:0, losses:0, days:0};
  monthly[ym].pts    += pts;
  monthly[ym].wins   += win;
  monthly[ym].losses += loss;
  monthly[ym].days   ++;
  yearly[yr].pts     += pts;
  yearly[yr].wins    += win;
  yearly[yr].losses  += loss;
  yearly[yr].days    ++;
}

// ── Print header ──────────────────────────────────────────────
console.log('='.repeat(72));
console.log(' VARIANT B — COMPLETE BACKTEST');
console.log(' Config: AMINA | Trail=100 | Buffer=25 | RE=Opposite');
console.log('='.repeat(72));

// ── Monthly table ─────────────────────────────────────────────
console.log('\n──── MONTHLY BREAKDOWN ─────────────────────────────────────────────');
console.log('Month       |   Points |    Rs Profit |  W  |  L  | WR%  | Cum Rs');
console.log('────────────|──────────|──────────────|─────|─────|──────|──────────');

let cumPts = 0;
let curYear = null;
const yearlyPts = {};

for(const ym of Object.keys(monthly).sort()){
  const yr = ym.slice(0,4);
  if(yr !== curYear){
    if(curYear !== null){
      const y = yearly[curYear];
      const yrs = y.wins + y.losses;
      const wr = yrs ? (100*y.wins/yrs).toFixed(1) : '-';
      console.log('────────────|──────────|──────────────|─────|─────|──────|──────────');
      console.log(`${curYear} TOTAL  | ${y.pts>=0?'+':''}${y.pts.toFixed(1).padStart(7)} | ${((y.pts*RS)/100000)>=0?'+':''}${((y.pts*RS)/100000).toFixed(2).padStart(9)} L | ${String(y.wins).padStart(3)} | ${String(y.losses).padStart(3)} | ${wr.padStart(5)}% |`);
      console.log('────────────|──────────|──────────────|─────|─────|──────|──────────');
    }
    curYear = yr;
  }
  const m  = monthly[ym];
  cumPts  += m.pts;
  const ts = m.wins + m.losses;
  const wr = ts ? (100*m.wins/ts).toFixed(1) : '-';
  const arrow = m.pts > 0 ? '▲' : m.pts < 0 ? '▼' : ' ';
  console.log(
    `${ym}  ${arrow}  | ${(m.pts>=0?'+':'')+m.pts.toFixed(1).padStart(7)} | ${(m.pts*RS>=0?'+Rs':'-Rs')+(Math.abs(m.pts*RS)/1000).toFixed(1).padStart(7)}K | ${String(m.wins).padStart(3)} | ${String(m.losses).padStart(3)} | ${wr.padStart(5)}% | ${(cumPts*RS>=0?'+Rs':'-Rs')+(Math.abs(cumPts*RS)/100000).toFixed(2).padStart(5)}L`
  );
}
// Last year
if(curYear){
  const y = yearly[curYear];
  const yrs = y.wins + y.losses;
  const wr = yrs ? (100*y.wins/yrs).toFixed(1) : '-';
  console.log('────────────|──────────|──────────────|─────|─────|──────|──────────');
  console.log(`${curYear} TOTAL  | ${y.pts>=0?'+':''}${y.pts.toFixed(1).padStart(7)} | ${((y.pts*RS)/100000)>=0?'+':''}${((y.pts*RS)/100000).toFixed(2).padStart(9)} L | ${String(y.wins).padStart(3)} | ${String(y.losses).padStart(3)} | ${wr.padStart(5)}% |`);
  console.log('────────────|──────────|──────────────|─────|─────|──────|──────────');
}

// ── Yearly summary ─────────────────────────────────────────────
console.log('\n──── YEARLY SUMMARY ────────────────────────────────────────────────');
console.log('Year |   Rs Profit  |  W  |  L  | WR%  | Trading Days');
console.log('─────|──────────────|─────|─────|──────|─────────────');

let grandPts  = 0;
let grandW    = 0, grandL = 0;
for(const yr of Object.keys(yearly).sort()){
  const y  = yearly[yr];
  grandPts += y.pts;
  grandW   += y.wins;
  grandL   += y.losses;
  const ts = y.wins + y.losses;
  const wr = ts ? (100*y.wins/ts).toFixed(1) : '-';
  const pl = (y.pts*RS/100000).toFixed(2);
  console.log(`${yr} | ${(y.pts>=0?'+':'')+pl.padStart(9)} L | ${String(y.wins).padStart(3)} | ${String(y.losses).padStart(3)} | ${wr.padStart(5)}% | ${y.days}`);
}
console.log('─────|──────────────|─────|─────|──────|─────────────');
const ts   = grandW + grandL;
const wr   = ts ? (100*grandW/ts).toFixed(1) : '-';
const gpl  = (grandPts*RS/100000).toFixed(2);
console.log(`ALL  | ${(grandPts>=0?'+':'')+gpl.padStart(9)} L | ${String(grandW).padStart(3)} | ${String(grandL).padStart(3)} | ${wr.padStart(5)}% | ${allDays.length}`);

// ── Risk metrics ──────────────────────────────────────────────
const grossRs    = grandPts * RS;
const maxDDRs    = maxDD;
console.log('\n──── RISK METRICS ──────────────────────────────────────────────────');
console.log(`Total Profit  : +Rs ${(grossRs/100000).toFixed(2)} L`);
console.log(`Max Drawdown  : -Rs ${(maxDDRs/1000).toFixed(1)} K  (${(maxDDRs/grossRs*100).toFixed(1)}% of total profit)`);
console.log(`Win Rate      : ${wr}%  (${grandW}W / ${grandL}L out of ${ts} trade days)`);
console.log(`No-Signal days: ${allDays.length - ts}`);
console.log(`Avg Win Day   : +Rs ${(allDays.filter(d=>d.pts>0).reduce((s,d)=>s+d.pts,0)*RS/grandW/1000).toFixed(1)}K`);
console.log(`Avg Loss Day  : -Rs ${(Math.abs(allDays.filter(d=>d.pts<0).reduce((s,d)=>s+d.pts,0))*RS/grandL/1000).toFixed(1)}K`);
console.log(`Profit Factor : ${(allDays.filter(d=>d.pts>0).reduce((s,d)=>s+d.pts,0)/Math.abs(allDays.filter(d=>d.pts<0).reduce((s,d)=>s+d.pts,0)||1)).toFixed(2)}`);
console.log(`Total Days    : ${allDays.length}  |  Trade Days: ${ts}`);

// ── Per-year max DD ───────────────────────────────────────────
console.log('\n──── PER-YEAR MAX DRAWDOWN ─────────────────────────────────────────');
for(const yr of Object.keys(yearly).sort()){
  const yDays = allDays.filter(d=>d.date.startsWith(yr));
  let pk=0, dd=0, base=yDays.length>0?(yDays[0].running - yDays[0].pts)*RS:0;
  let yPeak = base;
  for(const d of yDays){
    const cur = d.running * RS;
    if(cur > yPeak) yPeak = cur;
    const ydd = yPeak - cur;
    if(ydd > dd) dd = ydd;
  }
  console.log(`${yr}  Max DD: -Rs ${(dd/1000).toFixed(1)}K`);
}

console.log('\n' + '='.repeat(72));
console.log(' END OF BACKTEST — Variant B confirmed');
console.log('='.repeat(72));

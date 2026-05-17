// compare_both.js — AMINA SweetSpot vs FirstCandle on SAME cache data
'use strict';
const fs = require('fs');
const CACHE = fs.existsSync('bnf_candles_full.json') ? 'bnf_candles_full.json' : 'research-candles-cache.json';
const raw = JSON.parse(fs.readFileSync(CACHE,'utf-8'));
const all = raw.map(c => ({
  day: String(c.date).slice(0,10),
  timeIST: (()=>{ const d=new Date(c.date); d.setMinutes(d.getMinutes()+330); return d.toISOString().slice(11,16); })(),
  open:c.open, high:c.high, low:c.low, close:c.close,
  bull:c.close>=c.open,
  body_high:Math.max(c.open,c.close), body_low:Math.min(c.open,c.close),
  body_size:Math.abs(c.close-c.open)
}));
const byDay={};
for(const c of all){ if(!byDay[c.day]) byDay[c.day]=[]; byDay[c.day].push(c); }
const dates=Object.keys(byDay).sort();
const SL_T1=50, SL_RE=60, BRK=4, RS=15;

function isEOD(c){ return c.timeIST>='15:00'; }

// ── AMINA SweetSpot sim ───────────────────────────────────────────────────────
function aminaScan(cs){
  for(let i=0;i<cs.length-1;i++){
    const ca=cs[i], cb=cs[i+1];
    let sig=null, bl=0;
    if(ca.bull===cb.bull){
      sig=ca.bull?'CE':'PE';
      bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if(cb.body_size>ca.body_size){
      sig=cb.bull?'CE':'PE';
      bl=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
    } else continue;
    for(let j=i+2;j<cs.length;j++){
      const c=cs[j];
      if(sig==='CE' && c.close>bl) return{sig,px:c.close,entryIdx:j};
      if(sig==='PE' && c.close<bl) return{sig,px:c.close,entryIdx:j};
    }
  }
  return null;
}

function aminaDay(cs){
  const r=aminaScan(cs); if(!r) return null;
  let t1D=r.sig, t1E=r.px, t1Pts=0, t1Pk=0, t1SL=t1D==='CE'?t1E-SL_T1:t1E+SL_T1;
  let reD=null, reE=0, rePts=0, rePk=0, reSL=0, phase='T1';
  for(let i=r.entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    if(phase==='T1'){
      const cur=t1D==='CE'?c.close-t1E:t1E-c.close;
      t1Pts=cur; if(cur>t1Pk) t1Pk=cur;
      if(t1Pk>=SL_T1) t1SL=t1D==='CE'?Math.max(t1SL,t1E):Math.min(t1SL,t1E);
      if(isEOD(c)){t1Pts=cur;break;}
      const hit=t1D==='CE'?c.close<=t1SL:c.close>=t1SL;
      if(hit){ t1Pts=t1Pk>=SL_T1?0:-SL_T1; reD=t1D==='CE'?'PE':'CE'; reE=c.close; reSL=reD==='CE'?reE-SL_RE:reE+SL_RE; rePk=0; phase='RE'; continue; }
    }
    if(phase==='RE'){
      const cur=reD==='CE'?c.close-reE:reE-c.close;
      rePts=cur; if(cur>rePk) rePk=cur;
      if(rePk>=SL_RE) reSL=reD==='CE'?Math.max(reSL,reE):Math.min(reSL,reE);
      if(isEOD(c)){rePts=cur;break;}
      const hit=reD==='CE'?c.close<=reSL:c.close>=reSL;
      if(hit){ rePts=rePk>=SL_RE?0:-SL_RE; phase='DONE'; break; }
    }
  }
  return (t1Pts+rePts) - (1+(reD?1:0))*BRK;
}

// ── First Candle sim (SL1=candle low/high, SL3=50pts) ────────────────────────
function fcDay(cs, slMode){
  const c1=cs[0]; if(!c1||c1.timeIST!=='09:15') return null;
  const dir=c1.bull?'CE':'PE';
  const entry=c1.close;
  let slPx = slMode==='SL1' ? (dir==='CE'?c1.low:c1.high)
           : slMode==='SL3' ? (dir==='CE'?entry-50:entry+50) : null;
  let pts=0;
  for(let i=1;i<cs.length;i++){
    const c=cs[i];
    if(slPx!==null){
      const hit=dir==='CE'?c.close<=slPx:c.close>=slPx;
      if(hit){ pts=dir==='CE'?slPx-entry:entry-slPx; break; }
    }
    if(isEOD(c)){ pts=dir==='CE'?c.close-entry:entry-c.close; break; }
  }
  return pts - BRK;
}

// ── Run & collect ─────────────────────────────────────────────────────────────
const variants = [
  { name:'AMINA SL60+LockBE [SWEET SPOT]', fn: cs=>aminaDay(cs) },
  { name:'First Candle SL1 (candle H/L)',  fn: cs=>fcDay(cs,'SL1') },
  { name:'First Candle SL3 (fixed 50pts)', fn: cs=>fcDay(cs,'SL3') },
  { name:'First Candle No SL (hold EOD)',  fn: cs=>fcDay(cs,null) },
];

console.log(`\nSAME DATASET: ${all.length} candles | ${dates.length} trading days`);
console.log('─'.repeat(90));
console.log(`${'Strategy'.padEnd(38)} ${'NetRs'.padStart(12)} ${'Win%'.padStart(7)} ${'MaxDD'.padStart(10)} ${'Avg/Day'.padStart(9)}`);
console.log('─'.repeat(90));

const yearly = {};
for(const v of variants){
  let net=0,wins=0,days=0,pk=0,maxDD=0;
  const yr={};
  for(const date of dates){
    const r=v.fn(byDay[date]); if(r===null) continue;
    net+=r; days++; if(r>0) wins++;
    if(net>pk) pk=net; const dd=pk-net; if(dd>maxDD) maxDD=dd;
    const y=date.slice(0,4); yr[y]=(yr[y]||0)+r;
  }
  const netRs=Math.round(net*RS);
  const ddRs=Math.round(maxDD*RS);
  const winPct=days?(wins/days*100).toFixed(1):'0';
  const avg=days?Math.round(netRs/days):0;
  const flag=v.name.includes('AMINA')?'  ← BASELINE':netRs>0?'':'  ❌ LOSS';
  console.log(`${v.name.padEnd(38)} ${'₹'+netRs.toLocaleString('en-IN').padStart(11)} ${winPct.padStart(6)}% ${'₹'+ddRs.toLocaleString('en-IN').padStart(9)} ${'₹'+avg.toLocaleString('en-IN').padStart(8)}${flag}`);
  yearly[v.name]=yr;
}

console.log('\n' + '─'.repeat(90));
console.log('YEARLY  (₹)');
console.log('─'.repeat(90));
const yrs=['2021','2022','2023','2024','2025','2026'];
console.log('Strategy'.padEnd(38)+yrs.map(y=>y.padStart(10)).join(''));
console.log('─'.repeat(90));
for(const [name,yr] of Object.entries(yearly)){
  console.log(name.padEnd(38)+yrs.map(y=>{const v=Math.round((yr[y]||0)*RS);return((v>=0?'+':'')+v.toLocaleString('en-IN')).padStart(10);}).join(''));
}
console.log('─'.repeat(90));
console.log('\n⚠️  Note: AMINA on 33K candles (Jan2021-May2026) = ₹14,24,023');
console.log('   Above uses 30K candle cache (Apr2021-Apr2026) — same for all rows = fair comparison');

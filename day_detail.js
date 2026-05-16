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

async function main() {
  const DATE = process.argv[2] || '2026-04-13';
  const resp = await kiteGet(`/instruments/historical/260105/15minute?from=${DATE}+09%3A15%3A00&to=${DATE}+15%3A30%3A00&continuous=0&oi=0`);
  if (resp.status !== 'success') { console.log('ERR:', JSON.stringify(resp).slice(0,200)); return; }

  const cs = resp.data.candles.map(c => ({
    ts: c[0].slice(11,16),
    open: c[1], high: c[2], low: c[3], close: c[4],
    bull: c[4] >= c[1],
    body_high: Math.max(c[1],c[4]), body_low: Math.min(c[1],c[4]),
    body_size: Math.abs(c[4]-c[1])
  }));

  const mv = (s,e,p) => s==='CE' ? p-e : e-p;
  const SL_T1=50, SL_RE=100;

  // Find entry
  let entry = null;
  outer: for (let i=0; i<cs.length-1; i++) {
    const ca=cs[i], cb=cs[i+1]; let sig=null, bl=null;
    if (ca.bull===cb.bull) {
      sig=ca.bull?'CE':'PE';
      bl=sig==='CE'?Math.max(ca.high,cb.high):Math.min(ca.low,cb.low);
    } else if (cb.body_size>ca.body_size) {
      sig=cb.bull?'CE':'PE';
      bl=sig==='CE'?Math.max(ca.body_high,cb.body_high):Math.min(ca.body_low,cb.body_low);
    } else continue;
    for (let j=i+2; j<cs.length; j++) {
      if (sig==='CE' && cs[j].close>bl) { entry={sig,px:cs[j].close,idx:j,bl,pairA:i,pairB:i+1}; break outer; }
      if (sig==='PE' && cs[j].close<bl) { entry={sig,px:cs[j].close,idx:j,bl,pairA:i,pairB:i+1}; break outer; }
    }
  }

  // Day stats
  const dayOpen = cs[0].open;
  const dayClose = cs[cs.length-1].close;
  const dayHigh = Math.max(...cs.map(c=>c.high));
  const dayLow  = Math.min(...cs.map(c=>c.low));

  console.log('');
  console.log(`${DATE} — Candle by Candle (BNF 15-min Spot)`);
  console.log(`Day Open: ${dayOpen}  High: ${dayHigh}  Low: ${dayLow}  Close: ${dayClose}  Move: ${dayClose>dayOpen?'▲ UP +':'▼ DN '}${Math.round(dayClose-dayOpen)}pts`);
  console.log('='.repeat(85));
  console.log('Time   Open      High      Low      Close    Dir    Body   Trade Notes');
  console.log('-'.repeat(85));

  let slHit=false, sIdx=null, sPx=null, t1Pts=0;

  for (let i=0; i<cs.length; i++) {
    const c = cs[i];
    let note = '';
    if (entry) {
      if (i===entry.pairA) note = '◀ C1 of signal pair';
      else if (i===entry.pairB) note = '◀ C2 of signal pair → breakout level: '+Math.round(entry.bl);
      else if (i===entry.idx) note = '★ ENTRY '+entry.sig+' @ '+c.close+' (broke '+Math.round(entry.bl)+')';
      else if (i > entry.idx && !slHit) {
        const pts = mv(entry.sig, entry.px, c.close);
        note = 'P&L: '+(pts>=0?'+':'')+Math.round(pts)+'pts';
        if (pts <= -SL_T1) { slHit=true; sIdx=i; sPx=c.close; note+='  ← T1 SL HIT (-50pts)'; t1Pts=-SL_T1; }
      } else if (slHit && i===sIdx) {
        // re-entry decision
        const rs = entry.sig==='CE'?'PE':'CE';
        const mar = rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
        if (mar<0) note += '  → RE-ENTRY '+rs+' taken (filter OK)';
        else note += '  → RE-ENTRY BLOCKED by VMT filter (mar='+Math.round(mar)+')';
      } else if (slHit && i>sIdx) {
        const rs = entry.sig==='CE'?'PE':'CE';
        const mar = rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
        if (mar<0) {
          const rePts = mv(rs,sPx,c.close);
          note = 'Re-entry P&L: '+(rePts>=0?'+':'')+Math.round(rePts)+'pts';
          if (rePts <= -SL_RE) note += '  ← RE SL HIT (-100pts)';
        }
      }
    }
    const dir = c.bull ? '▲ BUL' : '▼ BEA';
    console.log(`${c.ts}  ${String(c.open).padStart(7)}  ${String(c.high).padStart(7)}  ${String(c.low).padStart(7)}  ${String(c.close).padStart(7)}  ${dir}  ${String(Math.round(c.body_size)).padStart(4)}   ${note}`);
  }

  console.log('='.repeat(85));
  if (entry) {
    const last = cs[cs.length-1].close;
    let finalT1 = t1Pts || mv(entry.sig, entry.px, last);
    if (!slHit && mv(entry.sig, entry.px, last) <= -SL_T1) finalT1 = -SL_T1;
    let finalRe = 0;
    if (slHit) {
      const rs = entry.sig==='CE'?'PE':'CE';
      const mar = rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
      if (mar<0) {
        finalRe = mv(rs,sPx,last);
        for (let i=sIdx+1; i<cs.length; i++) if (mv(rs,sPx,cs[i].close)<=-SL_RE){finalRe=-SL_RE;break;}
      }
    }
    const total = (!slHit ? mv(entry.sig,entry.px,last) : finalT1) + finalRe;
    console.log(`Signal    : ${entry.sig} | Entry @ ${entry.px} | Breakout level: ${Math.round(entry.bl)}`);
    console.log(`T1 result : ${slHit?'-50 (SL hit)':'+'+Math.round(mv(entry.sig,entry.px,last))+' (held to EOD)'}`);
    if (slHit) {
      const rs = entry.sig==='CE'?'PE':'CE';
      const mar = rs==='CE'?sPx-dayOpen:-(sPx-dayOpen);
      console.log(`Re-entry  : ${mar<0?rs+' taken → '+Math.round(finalRe)+'pts':'BLOCKED (VMT filter) → saved ₹'+(Math.abs(finalRe)*15)}`);
    }
    console.log(`─────────────────────────────────────────`);
    console.log(`TOTAL P&L : ${total>=0?'+':''}${Math.round(total)}pts = ₹${Math.round(total)*15}`);
  } else {
    console.log('NO ENTRY SIGNAL found for this day.');
  }
}
main().catch(e=>console.error('FATAL:', e.message));

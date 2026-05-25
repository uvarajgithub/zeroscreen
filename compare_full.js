'use strict';
// Full day-by-day comparison: ALL trading days Mar-May 2026
// Shows: Date | Market | User traded? | User side | User P&L (pts) | BHAV signal | BHAV P&L

const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('./cache/banknifty_2026.json', 'utf8'));
const ALL = Object.keys(raw).sort().filter(k => raw[k].length > 0);

// User's trades from the 48 manual trades data given
const USER = {
  // March — sides known, P&L not yet provided (share when ready)
  '2026-03-02': {side:'PE', rs:null},
  '2026-03-06': {side:'PE', rs:null},
  '2026-03-09': {side:'CE', rs:null},
  '2026-03-10': {side:'CE', rs:null},
  '2026-03-11': {side:'PE', rs:null},
  '2026-03-13': {side:'PE', rs:null},
  '2026-03-16': {side:'CE', rs:null},
  '2026-03-17': {side:'CE', rs:null},
  '2026-03-18': {side:'CE', rs:null},
  '2026-03-19': {side:'PE', rs:null},
  '2026-03-20': {side:'PE', rs:null},
  '2026-03-23': {side:'PE', rs:null},
  '2026-03-24': {side:'CE', rs:null},
  '2026-03-25': {side:'CE', rs:null},
  '2026-03-27': {side:'PE', rs:null},
  // April — your actual manual BHAV trade results (NOT Amina algo results)
  '2026-04-01': {side:'CE', rs:10995},  // CE at C5, gap-up stalled, waterfall, C5 first bull
  '2026-04-02': {side:'CE', rs:19935},  // CE at C1, gap-down below PDL, C0 climax, C1 reversal
  '2026-04-06': {side:'CE', rs:14880},  // CE at C1, fake gap-up, C0 bear, C1 reclaimed
  '2026-04-07': {side:'CE', rs:8310},   // CE at C2, C0 doji, C1 strong bear, C2 bull reversal
  '2026-04-08': {side:'CE', rs:12105},  // CE at C0, extraordinary gap +2198 above PDH
  '2026-04-09': {side:'PE', rs:6720},   // PE at C1, C0 doji, C1 86% bear → follow
  '2026-04-10': {side:'CE', rs:4560},   // CE at C0, C0 92% bull momentum
  '2026-04-13': {side:'CE', rs:13410},  // CE at C1, gap below PDL, C0 doji, C1 first bull
  '2026-04-15': {side:'PE', rs:3960},   // PE at C5, gap above PDH, 5 weak candles, C5 first bear
  '2026-04-16': {side:'PE', rs:8430},   // PE at C1, C0 weak 23%, C1 84.7% bear
  '2026-04-17': {side:'CE', rs:7365},   // CE at C2, C0 bull, C1 bear, C2 bull confirm
  '2026-04-20': {side:'CE', rs:4950},   // CE at C2, opened above PDH, C1 bear reversal, C2 bull
  '2026-04-21': {side:'CE', rs:5640},   // CE at C0, 3 consecutive bull candles
  '2026-04-22': {side:null, rs:0},      // AVOID — choppy no structure
  '2026-04-23': {side:'PE', rs:6810},   // PE at C3, gap below PDL, bounce failed PDL, C3 rolled over
  '2026-04-24': {side:null, rs:0},      // AVOID — extreme whipsaw
  '2026-04-27': {side:null, rs:0},      // AVOID — alternating bull-bear no structure
  '2026-04-28': {side:'PE', rs:9315},   // PE at C3, gap below PDL, 2-candle bounce, C3 reversed at PDL
  '2026-04-29': {side:'CE', rs:20340},  // CE at C1 (+9045) + PE at C14 (+11295) = double entry day
  '2026-04-30': {side:'CE', rs:7410},   // CE at C5, C0 climax bear, C1 reversal, C5 resumes bull
  '2026-05-04': {side:'PE', rs:null},
  '2026-05-05': {side:'CE', rs:null},
  '2026-05-06': {side:'PE', rs:null},
  '2026-05-07': {side:'CE', rs:null},
  '2026-05-08': {side:'PE', rs:null},
  '2026-05-11': {side:'CE', rs:null},
  '2026-05-12': {side:'PE', rs:null},
  '2026-05-13': {side:'CE', rs:null},
  '2026-05-14': {side:'CE', rs:null},
  '2026-05-15': {side:'PE', rs:null},
  '2026-05-18': {side:'CE', rs:null},
  '2026-05-20': {side:'CE', rs:null},
  '2026-05-21': {side:'PE', rs:null},
  '2026-05-22': {side:'CE', rs:null},
};

const PTS_PER_RS = 15;
const SL_PTS = 150;
const TRAIL_GAP = 20;

const body = c => c.close - c.open;
const rng  = c => c.high - c.low;
const bp   = c => rng(c) > 0 ? body(c)/rng(c)*100 : 0;
const getPrev = date => { const i=ALL.indexOf(date); return i>0?raw[ALL[i-1]]:null; };

function calcPLFull(cs, entryIdx, side) {
  const ep = cs[entryIdx].close;
  const sign = side==='CE'?1:-1;
  let ts=-SL_PTS, peak=0;
  for (let i=entryIdx+1;i<cs.length;i++) {
    const c=cs[i];
    const fav=side==='CE'?(c.high-ep):(ep-c.low);
    if(fav>peak){peak=fav;ts=peak>=TRAIL_GAP?peak-TRAIL_GAP:-SL_PTS;}
    const cp=sign*(c.close-ep);
    if(cp<=ts) return {pts:ts,pl:ts*PTS_PER_RS,exit:ts<=0?'SL':'TRAIL',exitIdx:i};
  }
  const xp=cs[cs.length-1].close; const pts=sign*(xp-ep);
  return {pts,pl:pts*PTS_PER_RS,exit:'EOD',exitIdx:cs.length-1};
}

function findRE(cs,exitIdx,side){
  for(let i=exitIdx+1;i<=cs.length-3;i++){
    const b=bp(cs[i]);
    if(side==='CE'&&b>35)return i;
    if(side==='PE'&&b<-35)return i;
  }
  return -1;
}

function bhavDayPL(cs, entryIdx, side){
  const r=calcPLFull(cs,entryIdx,side);
  let total=r.pl, cur=r;
  for(let re=0;re<3;re++){
    if(cur.exit!=='EOD'&&cur.pts>0){
      const ri=findRE(cs,cur.exitIdx,side);
      if(ri>0){const rr=calcPLFull(cs,ri,side);total+=rr.pl;cur=rr;}else break;
    }else break;
  }
  return total;
}

function findEntry(cs, prev) {
  if(!cs||cs.length<2||!prev||prev.length===0) return null;
  const PH=Math.max(...prev.map(c=>c.high));
  const PL=Math.min(...prev.map(c=>c.low));
  const PC=prev[prev.length-1].close;
  const C0=cs[0];
  const gap=C0.open-PC;
  const vsPDH=C0.open-PH, vsPDL=C0.open-PL;
  const ctx=vsPDH>0?'ABOVE_PDH':vsPDL<0?'BELOW_PDL':'INSIDE';
  const C0bp=bp(C0), C1bp=cs[1]?bp(cs[1]):0;
  const gapUp=gap>50, gapDown=gap<-50;
  const fBull=(from,th=30)=>{for(let i=from;i<cs.length;i++)if(bp(cs[i])>th)return i;return -1;};
  const fBear=(from,th=30)=>{for(let i=from;i<cs.length;i++)if(bp(cs[i])<-th)return i;return -1;};
  if(ctx==='ABOVE_PDH'){
    if(vsPDH>1000)return{idx:0,side:'CE',ctx};
    if(vsPDH<120)return null;
    if(C0bp<-20)return{idx:0,side:'PE',ctx};
    const b=fBear(1,35);if(b>0&&b<=7)return{idx:b,side:'PE',ctx};
    return null;
  }
  if(ctx==='BELOW_PDL'){
    if(C0bp<-65)return null;
    if(C0bp>65){const i=fBear(1,30);if(i>0)return{idx:i,side:'PE',ctx};}
    if(C0.high<PL){
      if(C1bp>20)return{idx:1,side:'CE',ctx};
      if(C1bp<-20)return{idx:0,side:'PE',ctx};
      return null;
    }
    if(C0bp>20){const i=fBear(1,30);if(i>0&&i<=6)return{idx:i,side:'PE',ctx};}
    return null;
  }
  const bps4=cs.slice(0,Math.min(4,cs.length)).map(bp);
  let wips=0,pd=0;
  for(let i=1;i<bps4.length;i++){if(bps4[i]*bps4[i-1]<0&&Math.abs(bps4[i])>65&&Math.abs(bps4[i-1])>65)wips++;if(bps4[i]!==0)pd=bps4[i];}
  if(wips>=2)return null;
  if(Math.abs(C0bp)>55){
    const c0bull=C0bp>0;
    const aligned=(c0bull&&!gapDown)||(!c0bull&&!gapUp);
    if(aligned){
      if(C1bp*C0bp<0&&Math.abs(C1bp)>65)return{idx:1,side:C1bp>0?'CE':'PE',ctx};
      return{idx:0,side:c0bull?'CE':'PE',ctx};
    }else{
      const gs=gapUp?'CE':'PE';
      const rv=gapUp?fBull(1,35):fBear(1,35);
      if(rv>0&&rv<=5)return{idx:rv,side:gs,ctx};
      return{idx:0,side:c0bull?'CE':'PE',ctx};
    }
  }
  if(Math.abs(C0bp)>30){if(C1bp*C0bp>0)return{idx:0,side:C0bp>0?'CE':'PE',ctx};}
  for(let i=2;i<=4;i++){
    if(i>=cs.length)break;
    const cbp=bp(cs[i]);
    if(Math.abs(cbp)>55)return{idx:i,side:cbp>0?'CE':'PE',ctx};
  }
  for(let i=5;i<Math.min(cs.length,21);i++){
    if(cs[i].low<=PL&&bp(cs[i])>35)return{idx:i,side:'CE',ctx};
    if(cs[i].high>=PH&&bp(cs[i])<-35)return{idx:i,side:'PE',ctx};
  }
  return null;
}

// ── Print ─────────────────────────────────────────────────
const days = ALL.filter(d => d >= '2026-03-01' && d <= '2026-05-31');

let userTotal=0, bhavTotal=0;
let userWins=0, userLosses=0, bhavWins=0, bhavLosses=0;
let curMonth='';

console.log('\n' + '═'.repeat(90));
console.log('  MARCH-MAY 2026: Day-by-Day — YOUR TRADES vs BHAV STRATEGY');
console.log('═'.repeat(90));
console.log('Date        Mkt   | YOU Side  PL(pts) PL(₹)   | BHAV Side  PL(₹)    | ?');
console.log('─'.repeat(90));

for (const date of days) {
  const cs = raw[date];
  const prev = getPrev(date);
  if (!prev) continue;

  const month = date.slice(0,7);
  if (month !== curMonth) {
    if (curMonth) {
      console.log('─'.repeat(90));
      console.log(`  ${curMonth} subtotals:  YOU: ₹${userTotal.toLocaleString('en-IN').padStart(8)}  |  BHAV: ₹${bhavTotal.toLocaleString('en-IN').padStart(8)}`);
    }
    console.log('─'.repeat(90));
    console.log(`  ▶ ${month}`);
    console.log('─'.repeat(90));
    curMonth = month;
  }

  // Market context
  const PH=Math.max(...prev.map(c=>c.high)), PL=Math.min(...prev.map(c=>c.low));
  const vsPDH=cs[0].open-PH, vsPDL=cs[0].open-PL;
  const ctx=vsPDH>0?'↑PDH':vsPDL<0?'↓PDL':'INSD';

  // User
  const u = USER[date];
  let userStr='—      —       —      ', match='';
  if (u && u.side) {
    const uPL = u.rs !== null ? u.rs : null;
    if (uPL !== null && uPL !== 0) userTotal += uPL;
    const plStr = uPL !== null ? ((uPL>=0?'+₹':'-₹')+Math.abs(uPL).toLocaleString('en-IN')) : '?';
    const avoidStr = (u.side === null) ? 'AVOID' : u.side;
    userStr = `${avoidStr.padEnd(4)}  ${plStr}`;
    if (uPL !== null && uPL !== 0) { if (uPL > 0) userWins++; else userLosses++; }
  }

  // BHAV
  const entry = findEntry(cs, prev);
  let bhavStr='NO SIGNAL    ';
  if (entry) {
    const pl = bhavDayPL(cs, entry.idx, entry.side);
    bhavTotal += pl;
    if (pl > 0) bhavWins++; else bhavLosses++;
    bhavStr = `${entry.side}  ${(pl>=0?'+₹':'-₹')+Math.abs(pl).toLocaleString('en-IN')}`;
    if (u) match = entry.side===u.side ? '✓' : '✗';
    else match = '';
  }

  console.log(`${date}  ${ctx} | ${userStr.padEnd(26)}| ${bhavStr.padEnd(20)}| ${match}`);
}

// Final month subtotal
console.log('─'.repeat(90));
console.log(`  ${curMonth} subtotals:  YOU: ₹${userTotal.toLocaleString('en-IN').padStart(8)}  |  BHAV: ₹${bhavTotal.toLocaleString('en-IN').padStart(8)}`);

console.log('\n' + '═'.repeat(90));
console.log(`  TOTAL Mar-May 2026:`);
console.log(`  YOUR P&L (known trades only): ₹${userTotal.toLocaleString('en-IN')}`);
console.log(`  BHAV P&L (all days):          ₹${bhavTotal.toLocaleString('en-IN')}`);
console.log(`  YOU  : ${userWins}W / ${userLosses}L`);
console.log(`  BHAV : ${bhavWins}W / ${bhavLosses}L`);
console.log('═'.repeat(90));

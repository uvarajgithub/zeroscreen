const fs = require("fs");
const raw = JSON.parse(fs.readFileSync("/home/ubuntu/trading-bot/research-candles-cache.json","utf8"));
const candles = raw.map(c => {
  const utc = new Date(c.date);
  const ist = new Date(utc.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
  const date = ist.getFullYear()+"-"+String(ist.getMonth()+1).padStart(2,"0")+"-"+String(ist.getDate()).padStart(2,"0");
  return {date,h:ist.getHours(),m:ist.getMinutes(),open:c.open,high:c.high,low:c.low,close:c.close};
}).filter(c=>c.close>0);
const byDay={};
for(const c of candles){if(!byDay[c.date])byDay[c.date]=[];byDay[c.date].push(c);}
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=3 && d.startsWith("2025"));
const isEOD=c=>c.h>15||(c.h===15&&c.m>=14);
const RS=15;

// AMINA-C tick double-confirm simulation:
// SL breached only if: candle[i] intrabar crosses SL (low<sl for CE, high>sl for PE)
// AND candle[i+1] also still breached (same intrabar check on next candle)
// Exit price = candle[i+1].close (confirmation candle close)
function signalAmina(cs){
  for(let i=1;i<cs.length;i++){
    if(isEOD(cs[i]))break;
    if(i>=2){
      const C2=cs[i-1],C3=cs[i];
      const b2=Math.abs(C2.close-C2.open),b3=Math.abs(C3.close-C3.open);
      if(b3>b2){
        const dir=C3.close>C3.open?"CE":"PE";
        return{dir,entry:C3.close,sl:dir==="CE"?C3.close-60:C3.close+60,entryIdx:i};
      }
    }
  }
  return null;
}

function simAminaTick(cs,signal){
  if(!signal)return null;
  let pending=false;
  for(let i=signal.entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    if(isEOD(c)){
      // EOD exit at close
      return signal.dir==="CE"?c.close-signal.entry:signal.entry-c.close;
    }
    const intraBreached = signal.dir==="CE"?c.low<=signal.sl:c.high>=signal.sl;
    if(pending){
      if(intraBreached){
        // double confirmed - exit at close of this candle
        return signal.dir==="CE"?c.close-signal.entry:signal.entry-c.close;
      } else {
        pending=false; // recovered - reset
      }
    } else {
      if(intraBreached) pending=true;
    }
  }
  const last=cs[cs.length-1];
  return signal.dir==="CE"?last.close-signal.entry:signal.entry-last.close;
}

// T2 and T4 use EOD exit with candle-close SL (structural)
function simLeg(cs,signal){
  if(!signal)return null;
  for(let i=signal.entryIdx+1;i<cs.length;i++){
    const c=cs[i];
    const slHit=signal.dir==="CE"?c.close<=signal.sl:c.close>=signal.sl;
    if(slHit||isEOD(c))return signal.dir==="CE"?c.close-signal.entry:signal.entry-c.close;
  }
  const last=cs[cs.length-1];
  return signal.dir==="CE"?last.close-signal.entry:signal.entry-last.close;
}

function signalT2(cs){
  if(cs.length<3)return null;
  const C2=cs[1],C3=cs[2];
  if(isEOD(C3))return null;
  const b2=C2.close>=C2.open,b3=C3.close>=C3.open;
  if(b2===b3){const dir=b2?"CE":"PE";return{dir,entry:C3.close,sl:dir==="CE"?C2.low:C2.high,entryIdx:2};}
  return null;
}

function signalT4(cs){
  for(let i=1;i<cs.length;i++){
    if(isEOD(cs[i]))break;
    const p=cs[i-1],c=cs[i];
    const bh=Math.max(p.open,p.close),bl=Math.min(p.open,p.close);
    if(c.close>bh)return{dir:"CE",entry:c.close,sl:p.low,entryIdx:i};
    if(c.close<bl)return{dir:"PE",entry:c.close,sl:p.high,entryIdx:i};
  }
  return null;
}

const months=["01","02","03","04","05","06","07","08","09","10","11","12"];
const mname=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fr=n=>(n>=0?"+":"-")+"\u20b9"+Math.abs(n).toLocaleString("en-IN");
let totT2=0,totT4=0,totAm=0;

const L="=".repeat(88);
const S="-".repeat(88);
console.log(L);
console.log("  MONTH-BY-MONTH 2025 — T2 vs T4 vs AMINA-C (tick double-confirm simulation)");
console.log(L);
console.log("  "+"Month".padEnd(8)+"T2 (EOD)".padStart(14)+"T4 (EOD)".padStart(14)+"AMINA (tick2x)".padStart(16)+"  Winner");
console.log(S);

for(let mi=0;mi<12;mi++){
  const prefix="2025-"+months[mi];
  const mDates=allDates.filter(d=>d.startsWith(prefix));
  if(!mDates.length){console.log("  "+mname[mi].padEnd(8)+"(no data)");continue;}
  let p2=0,p4=0,pa=0;
  for(const date of mDates){
    const cs=byDay[date];
    const s2=signalT2(cs),s4=signalT4(cs),sa=signalAmina(cs);
    const r2=simLeg(cs,s2),r4=simLeg(cs,s4),ra=simAminaTick(cs,sa);
    if(r2!==null)p2+=r2;
    if(r4!==null)p4+=r4;
    if(ra!==null)pa+=ra;
  }
  const rs2=Math.round(p2*RS),rs4=Math.round(p4*RS),rsa=Math.round(pa*RS);
  totT2+=rs2;totT4+=rs4;totAm+=rsa;
  const best=[{n:"T2",v:rs2},{n:"T4",v:rs4},{n:"AMINA-tick2x",v:rsa}].sort((a,b)=>b.v-a.v)[0].n;
  console.log("  "+mname[mi].padEnd(8)+fr(rs2).padStart(14)+fr(rs4).padStart(14)+fr(rsa).padStart(16)+"  <- "+best);
}
console.log(S);
console.log("  "+"TOTAL".padEnd(8)+fr(totT2).padStart(14)+fr(totT4).padStart(14)+fr(totAm).padStart(16));
console.log(L);
console.log("  Note: AMINA tick2x = SL confirmed on 2 consecutive 15-min candles breaching SL intrabar");
console.log(L);

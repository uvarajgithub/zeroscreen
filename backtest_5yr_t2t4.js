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
const allDates=Object.keys(byDay).sort().filter(d=>byDay[d].length>=3);
const isEOD=c=>c.h>15||(c.h===15&&c.m>=14);
const RS=15;

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

function run(name,sigFn){
  let pts=0,wins=0,losses=0,flat=0,eq=0,peak=0,maxDD=0;
  const yearly={};
  for(const date of allDates){
    const cs=byDay[date];
    const sig=sigFn(cs);
    if(!sig){flat++;continue;}
    const p=simLeg(cs,sig);
    if(p===null){flat++;continue;}
    pts+=p;eq+=p;
    if(eq>peak)peak=eq;
    if(peak-eq>maxDD)maxDD=peak-eq;
    const yr=date.slice(0,4);
    yearly[yr]=(yearly[yr]||0)+Math.round(p*RS);
    if(p>0)wins++;else if(p<0)losses++;else flat++;
  }
  const td=wins+losses;
  return{name,netRs:Math.round(pts*RS),winPct:td?((wins/td)*100).toFixed(1):"0",maxDD:Math.round(maxDD*RS),avgDay:td?Math.round(pts*RS/td):0,wins,losses,td,yearly};
}

console.log("Running...");
const r2=run("T2: C2+C3 same color | C2-low SL | EOD",signalT2);
const r4=run("T4: Any body breakout | prev-low SL | EOD",signalT4);

const f=n=>(n>=0?"+":"-")+"Rs"+(Math.abs(n)/100000).toFixed(2)+"L";
const fr=n=>(n>=0?"+":"-")+"\u20b9"+Math.abs(n).toLocaleString("en-IN");
const L="=".repeat(95);
const S="-".repeat(95);
console.log(L);
console.log("  5-YEAR BACKTEST: T2 vs T4 vs AMINA-C");
console.log("  Period: "+allDates[0]+" to "+allDates[allDates.length-1]+" | "+allDates.length+" days");
console.log(L);
console.log("  "+"Strategy".padEnd(44)+"Net Rs".padStart(14)+"Net".padStart(9)+"Win%".padStart(7)+"Trades".padStart(8)+"Avg/Trade".padStart(11)+"MaxDD".padStart(12));
console.log(S);
for(const r of [r2,r4]){
  console.log("  "+r.name.padEnd(44)+fr(r.netRs).padStart(14)+f(r.netRs).padStart(9)+(r.winPct+"%").padStart(7)+r.td.toString().padStart(8)+fr(r.avgDay).padStart(11)+fr(r.maxDD).padStart(12));
}
console.log("  "+"T1: AMINA-C tick double-confirm".padEnd(44)+fr(1647077).padStart(14)+"+Rs16.47L".padStart(9)+"62.0%".padStart(7)+"1191".padStart(8)+fr(1384).padStart(11)+fr(9425).padStart(12));
console.log(L);

const years=[...new Set(allDates.map(d=>d.slice(0,4)))].sort();
const aminaYr={"2021":254776,"2022":357509,"2023":285387,"2024":318018,"2025":312809,"2026":118609};
console.log("\n  Year-by-year (Rs):");
console.log("  "+"Year".padEnd(6)+"T2".padStart(14)+"T4".padStart(14)+"AMINA-C".padStart(14));
console.log(S.slice(0,50));
for(const yr of years){
  const a=r2.yearly[yr]||0,b=r4.yearly[yr]||0,c=aminaYr[yr]||0;
  const w=[{n:"T2",v:a},{n:"T4",v:b},{n:"AMINA",v:c}].sort((x,y)=>y.v-x.v)[0].n;
  console.log("  "+yr.padEnd(6)+fr(a).padStart(14)+fr(b).padStart(14)+fr(c).padStart(14)+"  <- "+w+" wins");
}
console.log(L);

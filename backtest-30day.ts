/**
 * backtest-30day.ts
 * Last 30 days: LOCK50-INTRABAR vs LOCK50-CANDLE vs TRAIL side by side
 */
import * as KiteConnect from "kiteconnect";
import dotenv from "dotenv";
dotenv.config();

const QTY = 30;
const kite = new (KiteConnect as any).KiteConnect({ api_key: process.env.API_KEY });
kite.setAccessToken(process.env.ACCESS_TOKEN);

interface Candle { date: Date; open: number; high: number; low: number; close: number; }
interface S {
  inTrade: boolean; dir: "CE"|"PE"|null; entry: number; sl: number; refHigh: number;
  firstDone: boolean; reUsed: boolean; waitReEntry: boolean; isC1: boolean; peakProfit: number;
}
const fresh = (): S => ({ inTrade:false,dir:null,entry:0,sl:0,refHigh:0,
  firstDone:false,reUsed:false,waitReEntry:false,isC1:false,peakProfit:0 });

const BASE_SL=100, BUF=25, C1=3, CAP=350;
type TrailFn = (sl:number,entry:number,dir:"CE"|"PE",peak:number)=>number;

const trailDefault: TrailFn = (sl,e,d,p)=>{
  let l=0; if(p>=200)l=100; else if(p>=100)l=20;
  return d==="CE"?Math.max(sl,e+l):Math.min(sl,e-l);
};
const trailLock50: TrailFn = (sl,e,d,p)=>{
  if(p<=100)return sl;
  const l=p-50;
  return d==="CE"?Math.max(sl,e+l):Math.min(sl,e-l);
};

function simDay(cs: Candle[], tfn: TrailFn, useWick: boolean): { pts:number; trades:number; log:string[] } {
  let s=fresh(), prev:Candle|null=null, pts=0, dayLoss=0, trades=0;
  const tradeLog: string[] = [];
  for (const cur of cs) {
    if (!prev) { prev=cur; continue; }
    const ist=new Date(cur.date.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
    const h=ist.getHours(), m=ist.getMinutes();
    const timeStr=`${h}:${String(m).padStart(2,"0")}`;
    const eod=h>15||(h===15&&m>=15);
    const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
    if (dayLoss<=-CAP) { prev=cur; continue; }
    if (s.inTrade) {
      if (s.isC1) {
        s.isC1=false;
        const p=s.dir==="CE"?cur.close-s.entry:s.entry-cur.close;
        if (p<-C1) { pts-=C1; dayLoss-=C1; tradeLog.push(`  ${timeStr} C1 exit -${C1}pts`); s=fresh(); prev=cur; continue; }
      }
      const slHit = useWick
        ? (s.dir==="CE" ? cur.low<=s.sl  : cur.high>=s.sl)
        : (s.dir==="CE" ? cur.close<=s.sl : cur.close>=s.sl);
      if (slHit) {
        const slPts=s.dir==="CE"?s.sl-s.entry:s.entry-s.sl;
        pts+=slPts; dayLoss+=slPts; trades++;
        tradeLog.push(`  ${timeStr} SL ${s.dir} entry:${s.entry.toFixed(0)} sl:${s.sl.toFixed(0)} → ${slPts>=0?"+":""}${slPts.toFixed(0)}pts`);
        const bodyPast=s.dir==="CE"?cur.close<s.sl:cur.close>s.sl;
        if (bodyPast&&!s.reUsed) {
          const rev:"CE"|"PE"=s.dir==="CE"?"PE":"CE";
          const revSL=rev==="CE"?cur.close-BASE_SL:cur.close+BASE_SL;
          s={...fresh(),dir:rev,entry:cur.close,sl:revSL,refHigh:rev==="CE"?cur.high:cur.low,
             inTrade:true,firstDone:true,reUsed:true,isC1:true,peakProfit:0};
        } else {
          if(!s.reUsed){s.inTrade=false;s.waitReEntry=true;}
          else{s.inTrade=false;s.firstDone=false;}
          s.peakProfit=0;
        }
        prev=cur; continue;
      }
      const hp=s.dir==="CE"?cur.high-s.entry:s.entry-cur.low;
      if(hp>s.peakProfit){s.peakProfit=hp;s.sl=tfn(s.sl,s.entry,s.dir!,s.peakProfit);}
      if (eod) {
        const p=s.dir==="CE"?cur.close-s.entry:s.entry-cur.close;
        pts+=p; trades++;
        tradeLog.push(`  ${timeStr} EOD ${s.dir} entry:${s.entry.toFixed(0)} → ${p>=0?"+":""}${p.toFixed(0)}pts`);
        s=fresh();
      }
    } else if (s.waitReEntry) {
      const hit=(s.dir==="CE"&&cur.close>s.refHigh)||(s.dir==="PE"&&cur.close<s.refHigh);
      if (hit) {
        const sl2=s.dir==="CE"?cur.close-BASE_SL:cur.close+BASE_SL;
        tradeLog.push(`  ${timeStr} RE-ENTRY ${s.dir} @ ${cur.close.toFixed(0)}`);
        s.entry=cur.close;s.sl=sl2;s.inTrade=true;s.waitReEntry=false;
        s.reUsed=true;s.isC1=true;s.peakProfit=0;
      }
    } else if (!s.firstDone&&!eod) {
      if(cur.close>bH+BUF) {
        const sl2=cur.close-BASE_SL;
        tradeLog.push(`  ${timeStr} ENTRY CE @ ${cur.close.toFixed(0)} SL:${sl2.toFixed(0)}`);
        s={...fresh(),dir:"CE",entry:cur.close,sl:sl2,refHigh:cur.high,
           inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
        trades++;
      } else if(cur.close<bL-BUF) {
        const sl2=cur.close+BASE_SL;
        tradeLog.push(`  ${timeStr} ENTRY PE @ ${cur.close.toFixed(0)} SL:${sl2.toFixed(0)}`);
        s={...fresh(),dir:"PE",entry:cur.close,sl:sl2,refHigh:cur.low,
           inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
        trades++;
      }
    }
    prev=cur;
  }
  return { pts, trades, log: tradeLog };
}

async function fetchCandles(from:string,to:string): Promise<Candle[]> {
  const data:any[]=await kite.getHistoricalData(260105,"15minute",from,to,false) as any[];
  return data.map((c:any)=>{
    const raw=c.date??c[0];
    const d=raw instanceof Date?raw:new Date(String(raw).replace(" ","T"));
    return{date:d,open:c.open??c[1],high:c.high??c[2],low:c.low??c[3],close:c.close??c[4]};
  });
}
function groupByDay(cs:Candle[]) {
  const m=new Map<string,Candle[]>();
  for(const c of cs){
    const k=c.date.toLocaleDateString("en-CA",{timeZone:"Asia/Kolkata"});
    if(!m.has(k))m.set(k,[]);m.get(k)!.push(c);
  }
  return m;
}

const rs=(pts:number)=>{const r=Math.round(pts*QTY*0.5);return(r>=0?"+":"")+"\u20b9"+Math.abs(r).toLocaleString("en-IN");};
const pt=(n:number)=>(n>=0?"+":"")+n.toFixed(0)+"pts";

(async()=>{
  const toDate = new Date();
  const fromDate = new Date(); fromDate.setDate(fromDate.getDate()-35);
  const from = fromDate.toISOString().slice(0,10);
  const to   = toDate.toISOString().slice(0,10);
  console.log(`\nFetching BANKNIFTY 15min: ${from} → ${to}...`);
  const all = await fetchCandles(from, to);
  console.log(`Got ${all.length} candles\n`);

  const days = groupByDay(all);
  let totA=0, totB=0, totC=0;

  const LINE="=".repeat(80);
  const SEP ="-".repeat(68);

  console.log(LINE);
  console.log("  LAST 30 DAYS — LOCK50-INTRABAR vs LOCK50-CANDLE vs TRAIL");
  console.log("  A=LOCK50-INTRABAR(current)  B=LOCK50-CANDLE(proposed)  C=TRAIL");
  console.log(LINE);
  console.log(`  ${"Date".padEnd(12)} ${"A Intrabar".padStart(12)} ${"B CandleSL".padStart(12)} ${"C TRAIL".padStart(10)} ${"B-A".padStart(10)} ${"Winner".padStart(8)}`);
  console.log("  "+SEP);

  for(const[d,cs] of [...days.entries()].sort()){
    if(cs.length<3)continue;
    const A=simDay(cs,trailLock50,true);
    const B=simDay(cs,trailLock50,false);
    const C=simDay(cs,trailDefault,false);
    totA+=A.pts; totB+=B.pts; totC+=C.pts;
    const diff=B.pts-A.pts;
    const winner=B.pts>A.pts&&B.pts>C.pts?"B★":C.pts>A.pts&&C.pts>B.pts?"C★":"A★";
    console.log(`  ${d.padEnd(12)} ${rs(A.pts).padStart(12)} ${rs(B.pts).padStart(12)} ${rs(C.pts).padStart(10)} ${rs(diff).padStart(10)} ${winner.padStart(8)}`);
  }

  console.log("  "+SEP);
  console.log(`  ${"TOTAL".padEnd(12)} ${rs(totA).padStart(12)} ${rs(totB).padStart(12)} ${rs(totC).padStart(10)} ${rs(totB-totA).padStart(10)}`);
  console.log(LINE);
  console.log(`\n  B improvement over A: ${rs(totB-totA)}`);
  console.log(`  C vs B: ${rs(totC-totB)}`);
  console.log(LINE+"\n");
})();

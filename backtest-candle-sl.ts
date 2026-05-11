/**
 * backtest-candle-sl.ts
 * Compare 3 strategies over 5 years:
 *   A) LOCK50-INTRABAR  — current live (SL triggers on intrabar wick, low/high)
 *   B) LOCK50-CANDLE    — proposed    (SL only triggers on candle close)
 *   C) TRAIL-CANDLE     — existing shadow (SL on candle close, trailDefault)
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

// useWick=true  → current LOCK50 (checks cur.low/high = intrabar wicks)
// useWick=false → candle-close SL (checks cur.close only)
function simDay(cs: Candle[], tfn: TrailFn, useWick: boolean): { pts:number; trades:number } {
  let s=fresh(), prev:Candle|null=null, pts=0, dayLoss=0, trades=0;
  for (const cur of cs) {
    if (!prev) { prev=cur; continue; }
    const ist=new Date(cur.date.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
    const h=ist.getHours(), m=ist.getMinutes();
    const eod=h>15||(h===15&&m>=15);
    const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
    if (dayLoss<=-CAP) { prev=cur; continue; }
    if (s.inTrade) {
      // C1 filter: first candle after entry — exit if close goes -3 pts
      if (s.isC1) {
        s.isC1=false;
        const p=s.dir==="CE"?cur.close-s.entry:s.entry-cur.close;
        if (p<-C1) { pts-=C1; dayLoss-=C1; s=fresh(); prev=cur; continue; }
      }
      // KEY DIFFERENCE: wick vs candle-close SL
      const slHit = useWick
        ? (s.dir==="CE" ? cur.low<=s.sl  : cur.high>=s.sl)   // intrabar (current)
        : (s.dir==="CE" ? cur.close<=s.sl : cur.close>=s.sl); // candle-close (proposed)
      if (slHit) {
        const slPts=s.dir==="CE"?s.sl-s.entry:s.entry-s.sl;
        pts+=slPts; dayLoss+=slPts; trades++;
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
        pts+=p; trades++; s=fresh();
      }
    } else if (s.waitReEntry) {
      const hit=(s.dir==="CE"&&cur.close>s.refHigh)||(s.dir==="PE"&&cur.close<s.refHigh);
      if (hit) {
        const sl2=s.dir==="CE"?cur.close-BASE_SL:cur.close+BASE_SL;
        s.entry=cur.close;s.sl=sl2;s.inTrade=true;s.waitReEntry=false;
        s.reUsed=true;s.isC1=true;s.peakProfit=0;
      }
    } else if (!s.firstDone&&!eod) {
      if(cur.close>bH+BUF) {
        const sl2=cur.close-BASE_SL;
        s={...fresh(),dir:"CE",entry:cur.close,sl:sl2,refHigh:cur.high,
           inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
        trades++;
      } else if(cur.close<bL-BUF) {
        const sl2=cur.close+BASE_SL;
        s={...fresh(),dir:"PE",entry:cur.close,sl:sl2,refHigh:cur.low,
           inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
        trades++;
      }
    }
    prev=cur;
  }
  return { pts, trades };
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
const pt=(n:number)=>(n>=0?"+":"")+n.toFixed(0);

(async()=>{
  console.log("\nFetching 5yr BANKNIFTY 15min...");
  const all:Candle[]=[];
  let cursor=new Date("2021-01-01T00:00:00Z");
  const end=new Date("2026-05-09T23:59:59Z");
  while(cursor<=end){
    const ce=new Date(cursor);ce.setDate(ce.getDate()+59);
    if(ce>end)ce.setTime(end.getTime());
    const f=cursor.toISOString().slice(0,10),t=ce.toISOString().slice(0,10);
    process.stdout.write(`  ${f}->${t}...`);
    try{const chunk=await fetchCandles(f,t);all.push(...chunk);console.log(` ${chunk.length}`);}
    catch(e:any){console.log(` ERR: ${e.message}`);}
    await new Promise(r=>setTimeout(r,350));
    cursor.setDate(cursor.getDate()+60);
  }
  if(!all.length){console.error("No candles");process.exit(1);}

  const days=groupByDay(all);
  let totA=0,totB=0,totC=0, trdA=0,trdB=0,trdC=0;
  let winsAB=0,winsCB=0,daysTotal=0;

  // Per-year buckets
  const years:Record<string,{a:number,b:number,c:number}> = {};

  interface Row { date:string; a:number; b:number; c:number; diff_BA:number; diff_CB:number; }
  const rows: Row[] = [];

  for(const[d,cs] of [...days.entries()].sort()){
    if(cs.length<3)continue;
    const A=simDay(cs,trailLock50,true);   // LOCK50-INTRABAR (current)
    const B=simDay(cs,trailLock50,false);  // LOCK50-CANDLE (proposed)
    const C=simDay(cs,trailDefault,false); // TRAIL-CANDLE (existing shadow)
    totA+=A.pts; totB+=B.pts; totC+=C.pts;
    trdA+=A.trades; trdB+=B.trades; trdC+=C.trades;
    if(B.pts>A.pts)winsAB++;
    if(C.pts>B.pts)winsCB++;
    daysTotal++;
    const yr=d.slice(0,4);
    if(!years[yr])years[yr]={a:0,b:0,c:0};
    years[yr].a+=A.pts; years[yr].b+=B.pts; years[yr].c+=C.pts;
    rows.push({date:d,a:A.pts,b:B.pts,c:C.pts,diff_BA:B.pts-A.pts,diff_CB:C.pts-B.pts});
  }

  const LINE="=".repeat(95);
  const SEP ="-".repeat(83);

  // ── GRAND SUMMARY ───────────────────────────────────────────────────────────
  console.log("\n"+LINE);
  console.log("  5-YEAR BACKTEST — LOCK50-INTRABAR vs LOCK50-CANDLE vs TRAIL-CANDLE");
  console.log("  Strategy A = LOCK50-INTRABAR  (current live, wick-stops)");
  console.log("  Strategy B = LOCK50-CANDLE    (proposed: SL only on candle close)");
  console.log("  Strategy C = TRAIL-CANDLE     (existing shadow, trailDefault)");
  console.log(LINE);
  console.log(`  ${"Strategy".padEnd(22)} ${"Total Pts".padStart(10)} ${"Total Rs".padStart(14)} ${"Avg Trades/Day".padStart(16)}`);
  console.log("  "+SEP);
  console.log(`  ${"A LOCK50-INTRABAR".padEnd(22)} ${pt(totA).padStart(10)} ${rs(totA).padStart(14)} ${(trdA/daysTotal).toFixed(2).padStart(16)}`);
  console.log(`  ${"B LOCK50-CANDLE".padEnd(22)} ${pt(totB).padStart(10)} ${rs(totB).padStart(14)} ${(trdB/daysTotal).toFixed(2).padStart(16)}`);
  console.log(`  ${"C TRAIL-CANDLE".padEnd(22)} ${pt(totC).padStart(10)} ${rs(totC).padStart(14)} ${(trdC/daysTotal).toFixed(2).padStart(16)}`);
  console.log("  "+SEP);
  console.log(`  B vs A (candle-close improvement): ${rs(totB-totA)}  | B beats A on ${winsAB}/${daysTotal} days`);
  console.log(`  C vs B (trail vs lock50 candle):   ${rs(totC-totB)}  | C beats B on ${winsCB}/${daysTotal} days`);
  console.log(LINE);

  // ── PER YEAR ─────────────────────────────────────────────────────────────────
  console.log("\n  YEAR-BY-YEAR BREAKDOWN");
  console.log(`  ${"Year".padEnd(6)} ${"A (Intrabar)".padStart(14)} ${"B (CandleSL)".padStart(14)} ${"C (TRAIL)".padStart(14)} ${"B-A".padStart(10)} ${"C-B".padStart(10)}`);
  console.log("  "+SEP);
  for(const yr of Object.keys(years).sort()){
    const y=years[yr];
    console.log(`  ${yr.padEnd(6)} ${rs(y.a).padStart(14)} ${rs(y.b).padStart(14)} ${rs(y.c).padStart(14)} ${rs(y.b-y.a).padStart(10)} ${rs(y.c-y.b).padStart(10)}`);
  }

  // ── TOP 15 days where CANDLE-SL fixes the most ───────────────────────────────
  const improved=[...rows].filter(r=>r.diff_BA>50).sort((a,b)=>b.diff_BA-a.diff_BA).slice(0,15);
  console.log("\n"+LINE);
  console.log("  TOP 15 DAYS — LOCK50-CANDLE MOST IMPROVED vs INTRABAR");
  console.log(`  ${"Date".padEnd(12)} ${"A Intrabar".padStart(12)} ${"B CandleSL".padStart(12)} ${"Improvement".padStart(13)} ${"C TRAIL".padStart(12)}`);
  console.log("  "+SEP);
  for(const r of improved){
    console.log(`  ${r.date.padEnd(12)} ${rs(r.a).padStart(12)} ${rs(r.b).padStart(12)} ${rs(r.diff_BA).padStart(13)} ${rs(r.c).padStart(12)}`);
  }

  // ── TOP 15 days where CANDLE-SL HURTS vs intrabar ─────────────────────────
  const hurt=[...rows].filter(r=>r.diff_BA<-50).sort((a,b)=>a.diff_BA-b.diff_BA).slice(0,15);
  console.log("\n"+LINE);
  console.log("  TOP 15 DAYS — LOCK50-CANDLE WORSE than INTRABAR (cost of holding through wicks)");
  console.log(`  ${"Date".padEnd(12)} ${"A Intrabar".padStart(12)} ${"B CandleSL".padStart(12)} ${"Difference".padStart(13)} ${"C TRAIL".padStart(12)}`);
  console.log("  "+SEP);
  for(const r of hurt){
    console.log(`  ${r.date.padEnd(12)} ${rs(r.a).padStart(12)} ${rs(r.b).padStart(12)} ${rs(r.diff_BA).padStart(13)} ${rs(r.c).padStart(12)}`);
  }

  console.log("\n"+LINE+"\n");
})();

/**
 * backtest-market-types.ts
 * Jan 1 2026 → May 11 2026
 * Classify each day as: TRENDING | REVERSAL | CHOPPY
 * Compare A=LOCK50-INTRABAR  B=LOCK50-CANDLE  C=TRAIL
 *
 * Market type classification (using 15-min OHLC):
 *  TRENDING  : directional efficiency |close-open|/(high-low) >= 0.50
 *  REVERSAL  : first-half trend ≠ second-half trend, AND range > 150 pts
 *  CHOPPY    : everything else (low DE, no clean trend)
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

function simDay(cs: Candle[], tfn: TrailFn, useWick: boolean): number {
  let s=fresh(), prev:Candle|null=null, pts=0, dayLoss=0;
  for (const cur of cs) {
    if (!prev) { prev=cur; continue; }
    const ist=new Date(cur.date.toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
    const h=ist.getHours(), m=ist.getMinutes();
    const eod=h>15||(h===15&&m>=15);
    const bH=Math.max(prev.open,prev.close), bL=Math.min(prev.open,prev.close);
    if (dayLoss<=-CAP) { prev=cur; continue; }
    if (s.inTrade) {
      if (s.isC1) {
        s.isC1=false;
        const p=s.dir==="CE"?cur.close-s.entry:s.entry-cur.close;
        if (p<-C1) { pts-=C1; dayLoss-=C1; s=fresh(); prev=cur; continue; }
      }
      const slHit = useWick
        ? (s.dir==="CE" ? cur.low<=s.sl  : cur.high>=s.sl)
        : (s.dir==="CE" ? cur.close<=s.sl : cur.close>=s.sl);
      if (slHit) {
        const slPts=s.dir==="CE"?s.sl-s.entry:s.entry-s.sl;
        pts+=slPts; dayLoss+=slPts;
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
        pts+=p;
        s=fresh();
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
      } else if(cur.close<bL-BUF) {
        const sl2=cur.close+BASE_SL;
        s={...fresh(),dir:"PE",entry:cur.close,sl:sl2,refHigh:cur.low,
           inTrade:true,firstDone:true,isC1:true,reUsed:false,peakProfit:0};
      }
    }
    prev=cur;
  }
  return pts;
}

/** Classify a day's candles into TRENDING / REVERSAL / CHOPPY */
function classifyDay(cs: Candle[]): "TRENDING"|"REVERSAL"|"CHOPPY" {
  if (cs.length < 4) return "CHOPPY";

  // Aggregate daily OHLC
  const dayOpen  = cs[0].open;
  const dayClose = cs[cs.length-1].close;
  const dayHigh  = Math.max(...cs.map(c=>c.high));
  const dayLow   = Math.min(...cs.map(c=>c.low));
  const range    = dayHigh - dayLow;

  if (range < 50) return "CHOPPY"; // too flat

  const de = Math.abs(dayClose - dayOpen) / range; // directional efficiency 0-1

  // TRENDING: moves cleanly one way
  if (de >= 0.50) return "TRENDING";

  // REVERSAL: first-half direction vs second-half direction
  const mid = Math.floor(cs.length / 2);
  const firstHalfDir  = cs[mid].close   - cs[0].open;     // positive = up first half
  const secondHalfDir = cs[cs.length-1].close - cs[mid].close; // positive = up second half

  // Strong reversal: first and second halves go opposite directions, each > 80 pts
  const firstAbs  = Math.abs(firstHalfDir);
  const secondAbs = Math.abs(secondHalfDir);
  if (firstHalfDir * secondHalfDir < 0 && firstAbs > 80 && secondAbs > 80) {
    return "REVERSAL";
  }

  return "CHOPPY";
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
const pad=(s:string,n:number)=>s.padStart(n);

(async()=>{
  console.log("\nFetching BANKNIFTY 15min: 2026-01-01 → 2026-05-11...");
  const all = await fetchCandles("2026-01-01","2026-05-11");
  console.log(`Got ${all.length} candles\n`);

  const days = groupByDay(all);

  // Accumulators per market type
  const acc: Record<string,{daysCount:number;A:number;B:number;C:number}> = {
    TRENDING: {daysCount:0,A:0,B:0,C:0},
    REVERSAL: {daysCount:0,A:0,B:0,C:0},
    CHOPPY:   {daysCount:0,A:0,B:0,C:0},
  };

  // Per-day detail rows grouped by type
  const rows: {date:string;type:string;A:number;B:number;C:number}[] = [];

  for(const[date,cs] of [...days.entries()].sort()){
    if(cs.length<3) continue;
    const A = simDay(cs, trailLock50, true);   // LOCK50 intrabar (old)
    const B = simDay(cs, trailLock50, false);  // LOCK50 candle-close (new/current)
    const C = simDay(cs, trailDefault, false); // TRAIL
    const type = classifyDay(cs);
    acc[type].daysCount++;
    acc[type].A += A;
    acc[type].B += B;
    acc[type].C += C;
    rows.push({date,type,A,B,C});
  }

  const LINE="=".repeat(82);
  const SEP ="-".repeat(82);

  // ─── Per-day table for each market type ───────────────────────────────────
  for (const mtype of ["TRENDING","REVERSAL","CHOPPY"] as const) {
    const typeRows = rows.filter(r=>r.type===mtype);
    console.log(LINE);
    console.log(`  ${mtype} DAYS (${typeRows.length} days)`);
    console.log(`  ${"Date".padEnd(12)} ${"A Intrabar".padStart(12)} ${"B CandleSL".padStart(12)} ${"C TRAIL".padStart(10)} ${"B-A".padStart(10)}  Winner`);
    console.log("  "+SEP.slice(2));
    for(const r of typeRows){
      const bMinusA=r.B-r.A;
      const winner=r.A>=r.B&&r.A>=r.C?"A":r.B>=r.C?"B":"C";
      console.log(
        `  ${r.date.padEnd(12)}`+
        `${pad(rs(r.A),12)}`+
        `${pad(rs(r.B),12)}`+
        `${pad(rs(r.C),10)}`+
        `${pad((bMinusA>=0?"+":"")+"\u20b9"+Math.abs(Math.round(bMinusA*QTY*0.5)).toLocaleString("en-IN"),10)}`+
        `  ${winner}\u2605`
      );
    }
    const t=acc[mtype];
    const bMinusA=t.B-t.A;
    console.log("  "+SEP.slice(2));
    console.log(
      `  ${"SUBTOTAL".padEnd(12)}`+
      `${pad(rs(t.A),12)}`+
      `${pad(rs(t.B),12)}`+
      `${pad(rs(t.C),10)}`+
      `${pad((bMinusA>=0?"+":"")+"\u20b9"+Math.abs(Math.round(bMinusA*QTY*0.5)).toLocaleString("en-IN"),10)}`
    );
  }

  // ─── Grand summary by market type ─────────────────────────────────────────
  console.log("\n"+LINE);
  console.log("  SUMMARY BY MARKET TYPE (Jan–May 2026)");
  console.log(`  ${"Type".padEnd(12)} ${"Days".padStart(5)} ${"A Intrabar".padStart(14)} ${"B CandleSL".padStart(14)} ${"C TRAIL".padStart(12)} ${"B-A".padStart(12)}`);
  console.log("  "+SEP.slice(2));
  let grandA=0,grandB=0,grandC=0;
  for(const [t,v] of Object.entries(acc)){
    const bMinusA=v.B-v.A;
    const sign=(x:number)=>x>=0?"+":"-";
    console.log(
      `  ${t.padEnd(12)}`+
      `${String(v.daysCount).padStart(5)}`+
      `${pad(rs(v.A),14)}`+
      `${pad(rs(v.B),14)}`+
      `${pad(rs(v.C),12)}`+
      `${pad((bMinusA>=0?"+":"-")+"\u20b9"+Math.abs(Math.round(bMinusA*QTY*0.5)).toLocaleString("en-IN"),12)}`
    );
    grandA+=v.A; grandB+=v.B; grandC+=v.C;
  }
  console.log("  "+SEP.slice(2));
  const gBminA=grandB-grandA;
  console.log(
    `  ${"GRAND TOTAL".padEnd(12)}`+
    `${String(rows.length).padStart(5)}`+
    `${pad(rs(grandA),14)}`+
    `${pad(rs(grandB),14)}`+
    `${pad(rs(grandC),12)}`+
    `${pad((gBminA>=0?"+":"-")+"\u20b9"+Math.abs(Math.round(gBminA*QTY*0.5)).toLocaleString("en-IN"),12)}`
  );

  // ─── Market type win-rate analysis ────────────────────────────────────────
  console.log("\n"+LINE);
  console.log("  WIN RATE ANALYSIS: How often B(new) > A(old) within each market type");
  console.log("  "+SEP.slice(2));
  for (const mtype of ["TRENDING","REVERSAL","CHOPPY"] as const) {
    const typeRows = rows.filter(r=>r.type===mtype);
    const bWins   = typeRows.filter(r=>r.B>r.A).length;
    const cWins   = typeRows.filter(r=>r.C>r.B).length;
    const bPct    = typeRows.length ? Math.round(bWins/typeRows.length*100) : 0;
    console.log(`  ${mtype.padEnd(10)}: B>A on ${bWins}/${typeRows.length} days (${bPct}%) | C>B on ${cWins}/${typeRows.length} days`);
  }
  console.log(LINE+"\n");
})();
